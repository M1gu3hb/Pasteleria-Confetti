set local lock_timeout = '5s';
alter table public.ventas add column if not exists intencion_datos jsonb;
CREATE OR REPLACE FUNCTION public.crear_venta_directa_tx(p_cabecera jsonb, p_detalle jsonb, p_metodo_pago text, p_monto_efectivo numeric, p_monto_tarjeta numeric, p_monto_transferencia numeric, p_cambio numeric, p_corte_caja_id uuid, p_sucursal_id uuid, p_sucursal_nombre text, p_usuario_id text, p_usuario_nombre text, p_idempotency_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_suc   uuid;
  v_es_admin     boolean;
  v_corte_estado text;
  v_corte_suc    uuid;
  v_ef  numeric; v_ta numeric; v_tr numeric; v_camb numeric;
  v_total numeric; v_subtotal numeric; v_suma_desg numeric; v_suma_det numeric;
  v_folio text; v_venta_id uuid; v_exist uuid;
  v_intencion jsonb; v_guardada jsonb;
  v_det jsonb; v_det_ids uuid[] := '{}'; v_new_det uuid;
begin
  if p_corte_caja_id is null then raise exception 'SIN_CAJA'; end if;
  if p_sucursal_id is null then raise exception 'SIN_SUCURSAL'; end if;

  -- Normaliza a centavos (round EXACTO sobre numeric) + sin negativos.
  v_ef   := round(coalesce(p_monto_efectivo,0), 2);
  v_ta   := round(coalesce(p_monto_tarjeta,0), 2);
  v_tr   := round(coalesce(p_monto_transferencia,0), 2);
  v_camb := round(coalesce(p_cambio,0), 2);
  if v_ef < 0 or v_ta < 0 or v_tr < 0 then raise exception 'DESGLOSE_NEGATIVO'; end if;

  -- Autorización server-side (sesión, no params).
  if auth.uid() is null then raise exception 'SIN_SESION'; end if;
  v_caller_suc := pos_sucursal();
  v_es_admin   := pos_is_admin();
  if not v_es_admin and (v_caller_suc is null or p_sucursal_id is distinct from v_caller_suc) then
    raise exception 'SUCURSAL_AJENA';
  end if;

  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128 then raise exception 'INTENCION_INVALIDA'; end if;
  v_intencion := jsonb_build_object('cabecera',p_cabecera,'detalle',p_detalle,'metodo',p_metodo_pago,
    'efectivo',v_ef,'tarjeta',v_ta,'transferencia',v_tr,'cambio',v_camb,'corte',p_corte_caja_id,'sucursal',p_sucursal_id,'usuario',p_usuario_id);
  perform pg_advisory_xact_lock(hashtextextended('venta-intencion:'||p_idempotency_key,0));
  select id, intencion_datos into v_exist,v_guardada from ventas where idempotency_key=p_idempotency_key;
  if v_exist is not null then
    if (select sucursal_id from ventas where id=v_exist) is distinct from p_sucursal_id
      or (select corte_caja_id from ventas where id=v_exist) is distinct from p_corte_caja_id
      or v_guardada is null or v_guardada is distinct from v_intencion then raise exception 'INTENCION_NO_COINCIDE'; end if;
    return json_build_object('venta_id',v_exist,'folio',(select folio from ventas where id=v_exist),
      'idempotent_hit',true,'detalle_ids',(select json_agg(id order by id) from detalle_venta where venta_id=v_exist),
      'venta',(select row_to_json(v) from ventas v where id=v_exist),'detalles',(select coalesce(json_agg(d order by d.created_at,d.id),'[]'::json) from detalle_venta d where venta_id=v_exist));
  end if;

  -- Corte: existe + abierto + de la sucursal de la venta.
  select estado, sucursal_id into v_corte_estado, v_corte_suc from cortes_caja where id = p_corte_caja_id for update;
  if not found then raise exception 'CORTE_INEXISTENTE'; end if;
  if v_corte_estado <> 'abierto' then raise exception 'CORTE_NO_ABIERTO'; end if;
  if v_corte_suc is distinct from p_sucursal_id then raise exception 'CORTE_SUCURSAL_NO_COINCIDE'; end if;

  -- Totales de la cabecera (redondeados a centavos).
  v_total    := round(coalesce((p_cabecera->>'total')::numeric, 0), 2);
  v_subtotal := round(coalesce((p_cabecera->>'subtotal')::numeric, (p_cabecera->>'total')::numeric, 0), 2);

  -- Doble conteo (a): el desglose por método suma el total (SIN propina), al centavo.
  v_suma_desg := v_ef + v_ta + v_tr;
  if abs(v_suma_desg - v_total) > 0.005 then raise exception 'DESGLOSE_NO_CUADRA'; end if;

  -- Doble conteo (b): la suma de subtotales de detalle cuadra el subtotal de la cabecera.
  select coalesce(sum(round(coalesce((d->>'subtotal')::numeric,0),2)),0) into v_suma_det
    from jsonb_array_elements(coalesce(p_detalle, '[]'::jsonb)) d;
  if abs(v_suma_det - v_subtotal) > 0.005 then raise exception 'DETALLE_NO_CUADRA'; end if;

  -- ===== FIX 0059 -- guards de integridad de LINEA/TOTAL (cierran los huecos de Codex) =====
  -- Con estos 5 + los invariantes de 0049 la cadena queda cerrada:
  --   Sum(desglose) = total = subtotal = Sum(detalle) = Sum(cantidad*precio), todo >= 0 y total > 0.
  --
  -- SIN_DETALLE: una venta directa de mostrador SIEMPRE tiene >=1 línea (bloquea la venta $0 sin detalle).
  if jsonb_array_length(coalesce(p_detalle,'[]'::jsonb)) = 0 then
    raise exception 'SIN_DETALLE';
  end if;
  -- TOTAL_NO_CUADRA (ronda 2): el total debe igualar el subtotal. Propina apagada por 0010 y el front
  -- SIEMPRE manda subtotal=total (crearVentaDirecta: cabecera {subtotal: total, total}). Cierra el hueco
  -- total=100 con subtotal=0. tol 0.005 (centavos).
  if abs(v_total - v_subtotal) > 0.005 then
    raise exception 'TOTAL_NO_CUADRA';
  end if;
  -- LINEA_INVALIDA: ninguna línea con cantidad<=0, precio<0, subtotal<0 o costo<0. Mata la compensación
  -- de negativos (una -X ya no pasa aunque otra +X cuadre la suma). Permite 0 (no <0) para una eventual
  -- cortesía (precio 0) dentro de una venta con total>0.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_detalle,'[]'::jsonb)) d
    where coalesce((d->>'cantidad')::numeric,0) <= 0
       or coalesce((d->>'precio_unitario_snapshot')::numeric,0) < 0
       or coalesce((d->>'subtotal')::numeric,0) < 0
       or coalesce((d->>'costo_unitario_snapshot')::numeric,0) < 0
  ) then
    raise exception 'LINEA_INVALIDA';
  end if;
  -- LINEA_NO_CUADRA (ronda 2): el subtotal de cada línea debe ser cantidad x precio_unitario (a centavos).
  -- Cierra el hueco cantidad 1 / precio 0 / subtotal 100. Cumplen los 5 tipos del front: precio_fijo
  -- (subtotal=precio*cantidad), variable (cantidad=1, precio_unitario=subtotal=precio_total_línea,
  -- POS.jsx:207/210/223), venta libre (1*monto=monto), cortesía (1*0=0). round a 2 en ambos lados absorbe
  -- el float (p.ej. 3x33.33=99.99); tol 0.005.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_detalle,'[]'::jsonb)) d
    where abs( round(coalesce((d->>'subtotal')::numeric,0),2)
             - round(coalesce((d->>'cantidad')::numeric,0) * coalesce((d->>'precio_unitario_snapshot')::numeric,0),2)
         ) > 0.005
  ) then
    raise exception 'LINEA_NO_CUADRA';
  end if;
  -- TOTAL_INVALIDO: una venta pagada es > 0 (verificado: el POS no permite total $0; ver cabecera).
  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;
  -- ===== fin FIX 0059 =====

  -- Folio atómico (solo al crear).
  v_folio := siguiente_folio('venta', p_sucursal_id);

  -- INSERT cabecera (SOLO columnas reales; sin propina/snapshots). Carrera de doble-clic con la
  -- MISMA idempotency_key -> el índice único rechaza la 2a (unique_violation) -> se devuelve la ganadora.
  begin
    insert into ventas(
      folio, tipo_venta, sucursal_id, sucursal_nombre, estado, fecha_apertura, fecha_cierre,
      subtotal, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, cambio,
      usuario_cajero_id, usuario_cajero_nombre, corte_caja_id, idempotency_key, intencion_datos)
    values (
      v_folio, coalesce(p_cabecera->>'tipo_venta','mostrador'), p_sucursal_id, p_sucursal_nombre, 'pagada', now(), now(),
      v_subtotal, v_total, p_metodo_pago, v_ef, v_ta, v_tr, v_camb,
      p_usuario_id, p_usuario_nombre, p_corte_caja_id, p_idempotency_key, v_intencion)
    returning id into v_venta_id;
  end;

  -- INSERT de cada línea (SOLO columnas reales). Si una falla, TODA la tx revierte.
  for v_det in select * from jsonb_array_elements(coalesce(p_detalle, '[]'::jsonb)) loop
    insert into detalle_venta(
      venta_id, producto_id, producto_nombre, cantidad,
      precio_unitario_snapshot, costo_unitario_snapshot, subtotal, notas_producto, estado_preparacion)
    values (
      v_venta_id,
      (v_det->>'producto_id')::uuid,
      v_det->>'producto_nombre',
      (v_det->>'cantidad')::numeric,
      (v_det->>'precio_unitario_snapshot')::numeric,
      (v_det->>'costo_unitario_snapshot')::numeric,
      round(coalesce((v_det->>'subtotal')::numeric,0),2),
      v_det->>'notas_producto',
      coalesce(v_det->>'estado_preparacion','pendiente'))
    returning id into v_new_det;
    v_det_ids := array_append(v_det_ids, v_new_det);
  end loop;

  return json_build_object('venta_id', v_venta_id, 'folio', v_folio,
    'idempotent_hit', false, 'detalle_ids', to_json(v_det_ids),
    'venta',(select row_to_json(v) from ventas v where id=v_venta_id),
    'detalles',(select coalesce(json_agg(d order by d.created_at,d.id),'[]'::json) from detalle_venta d where venta_id=v_venta_id));
end $function$
;


create or replace function public.resumen_periodo_pos(p_desde timestamptz,p_hasta timestamptz,p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'SIN_SESION'; end if;
 if p_desde is null or p_hasta is null or p_desde>p_hasta then raise exception 'RANGO_INVALIDO'; end if;
 if not public.pos_is_admin() and (p_sucursal is null or p_sucursal is distinct from public.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 return (select jsonb_build_object('ingresos',coalesce(sum(v.total),0),'nVentas',count(*),'utilidad',0,
 'gastos',coalesce((select sum(g.monto) from public.gastos_operativos g where (p_sucursal is null or g.sucursal_id=p_sucursal)
  and g.fecha >= (p_desde at time zone 'America/Mexico_City')::date and g.fecha <= (p_hasta at time zone 'America/Mexico_City')::date),0))
 from public.ventas v where v.estado='pagada' and v.fecha_cierre>=p_desde and v.fecha_cierre<=p_hasta and (p_sucursal is null or v.sucursal_id=p_sucursal));
end $$;
revoke all on function public.resumen_periodo_pos(timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.resumen_periodo_pos(timestamptz,timestamptz,uuid) to authenticated;

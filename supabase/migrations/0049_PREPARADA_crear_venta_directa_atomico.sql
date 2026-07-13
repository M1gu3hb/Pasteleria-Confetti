-- ============================================================================
-- 0049_PREPARADA_crear_venta_directa_atomico.sql
-- FASE II-B.2 (blindaje MNY-I-13, R2) — venta directa de mostrador ATÓMICA.
--
-- ⚠️ PREPARADA — NO APLICADA. DINERO: requiere la FIRMA de Miguel. No la aplica esta
--    sesión. Aditiva/retro-compatible. Orden de firma al final.
--
-- QUÉ REEMPLAZA: el INSERT directo de la venta directa de mostrador —
--   POS.jsx:282 (crea la venta ya estado='pagada' con desglose + corte) + POS.jsx:363
--   (inserta cada línea de detalle_venta). A diferencia de R1 (UPDATE de un ticket
--   existente), esto CREA venta + detalle en UNA transacción (si una línea falla, TODO
--   revierte → no queda venta sin detalle ni al revés).
--
-- PRINCIPIO (CLAUDE.md): la matemática vive en el FRONTEND (total/subtotal/desglose ya
--   calculados en POS). La RPC RECIBE los montos y solo persiste + valida atómicamente.
--   NO reimplementa precios.
--
-- SIN PROPINA (apagada por 0010; ver 0048). Byte-idéntico al efecto actual: se persisten
--   SOLO las columnas reales de la whitelist del adaptador:
--     ventas: folio, tipo_venta, sucursal_id/nombre, estado, fecha_apertura/cierre,
--             subtotal, total, metodo_pago, monto_efectivo/tarjeta/transferencia, cambio,
--             usuario_cajero_id/nombre, corte_caja_id (+ idempotency_key, nueva).
--       (se DESCARTAN propina_*/total_cobrado_con_propina/costo_total_snapshot/
--        utilidad_bruta_snapshot/margen_snapshot — la whitelist ya los descartaba.)
--     detalle_venta: venta_id, producto_id, producto_nombre, cantidad,
--             precio_unitario_snapshot, costo_unitario_snapshot, subtotal, notas_producto,
--             estado_preparacion. (se DESCARTAN los *_snapshot de costo/variable/área.)
--
-- GUARDS (espejan cobrar_venta_tx / registrar_pago_pedido_tx):
--   * round a centavos de desglose/cambio; sin buckets negativos (DESGLOSE_NEGATIVO).
--   * SIN_SESION (auth.uid()); deriva pos_sucursal()/pos_is_admin().
--   * SUCURSAL_AJENA: not admin and p_sucursal_id <> pos_sucursal().
--   * Corte: existe + 'abierto' + = p_sucursal_id (CORTE_INEXISTENTE/CORTE_NO_ABIERTO/
--     CORTE_SUCURSAL_NO_COINCIDE). La venta nace con corte_caja_id (CANDADO 1).
--   * Doble conteo (2 invariantes, tol > 0.005, SIN propina):
--       (a) Σ(desglose) = cabecera.total;  (b) Σ(detalle.subtotal) = cabecera.subtotal.
--       Fallan → DESGLOSE_NO_CUADRA / DETALLE_NO_CUADRA.
--   * Idempotencia (doble-clic/reintento): columna aditiva ventas.idempotency_key + índice
--     único parcial; si ya existe una venta con esa clave → se devuelve (idempotent_hit=true)
--     SIN crear otra ni tocar inventario (el frontend salta el descuento en un hit).
--
-- CANDADO 2 (día operativo): fecha_apertura/fecha_cierre=now() definen a qué corte/día cae.
-- Folio ATÓMICO: siguiente_folio('venta', p_sucursal_id) (no se reinventa el generador).
-- Devuelve detalle_ids en orden de inserción para que el frontend re-ligue el descuento de
--   inventario (DescuentoInventarioVenta.detalle_venta_id) sin cambiar ese comportamiento.
--
-- EVIDENCIA (arnés Postgres LOCAL aislado, NUNCA producción, residuo 0): válida, idempotente,
--   concurrencia (misma clave → 1 venta) y adversariales. Ver FASE_II_B2_CREAR_VENTA_DIRECTA.md.
--
-- >>> Orden de firma: 0042 → 0044 → 0045 → 0046 → 0047 → 0048 → 0049 → (R3…R11) →
--     revoke DML → frontend. NO mergear a migracion/supabase hasta la firma.
-- ============================================================================

begin;

-- (1) Idempotencia en ventas (aditivo: columna nullable + índice parcial global).
--     La venta directa no cuelga de un pedido → clave global (randomUUID por intento).
alter table public.ventas add column if not exists idempotency_key text;
create unique index if not exists ux_ventas_idempotency_key
  on public.ventas (idempotency_key) where idempotency_key is not null;

-- (2) Venta directa ATÓMICA (cabecera + detalle) + idempotente.
create or replace function public.crear_venta_directa_tx(
  p_cabecera            jsonb,   -- { subtotal, total, tipo_venta }
  p_detalle             jsonb,   -- [ { producto_id, producto_nombre, cantidad, precio_unitario_snapshot, costo_unitario_snapshot, subtotal, notas_producto, estado_preparacion }, ... ]
  p_metodo_pago         text,
  p_monto_efectivo      numeric,
  p_monto_tarjeta       numeric,
  p_monto_transferencia numeric,
  p_cambio              numeric,
  p_corte_caja_id       uuid,
  p_sucursal_id         uuid,
  p_sucursal_nombre     text,
  p_usuario_id          text,
  p_usuario_nombre      text,
  p_idempotency_key     text
) returns json
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_caller_suc   uuid;
  v_es_admin     boolean;
  v_corte_estado text;
  v_corte_suc    uuid;
  v_ef  numeric; v_ta numeric; v_tr numeric; v_camb numeric;
  v_total numeric; v_subtotal numeric; v_suma_desg numeric; v_suma_det numeric;
  v_folio text; v_venta_id uuid; v_exist uuid;
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

  -- Idempotencia (ANTES de crear): si ya existe la venta con esta clave → devuélvela.
  if p_idempotency_key is not null then
    select id into v_exist from ventas where idempotency_key = p_idempotency_key limit 1;
    if v_exist is not null then
      return json_build_object(
        'venta_id', v_exist,
        'folio', (select folio from ventas where id = v_exist),
        'idempotent_hit', true,
        'detalle_ids', coalesce((select json_agg(id order by id) from detalle_venta where venta_id = v_exist), '[]'::json));
    end if;
  end if;

  -- Corte: existe + abierto + de la sucursal de la venta.
  select estado, sucursal_id into v_corte_estado, v_corte_suc from cortes_caja where id = p_corte_caja_id;
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

  -- Folio atómico (solo al crear).
  v_folio := siguiente_folio('venta', p_sucursal_id);

  -- INSERT cabecera (SOLO columnas reales; sin propina/snapshots). Si dos llamadas
  -- concurrentes con la MISMA idempotency_key corren la carrera (ambas pasan el SELECT de
  -- arriba antes de que ninguna committee), el índice único rechaza la 2ª con
  -- unique_violation → se recupera la venta ganadora y se devuelve como hit (idempotencia
  -- robusta bajo concurrencia; nunca dos ventas). El folio consumido en esa carrera queda
  -- como hueco (aceptable, igual criterio que 0046).
  begin
    insert into ventas(
      folio, tipo_venta, sucursal_id, sucursal_nombre, estado, fecha_apertura, fecha_cierre,
      subtotal, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, cambio,
      usuario_cajero_id, usuario_cajero_nombre, corte_caja_id, idempotency_key)
    values (
      v_folio, coalesce(p_cabecera->>'tipo_venta','mostrador'), p_sucursal_id, p_sucursal_nombre, 'pagada', now(), now(),
      v_subtotal, v_total, p_metodo_pago, v_ef, v_ta, v_tr, v_camb,
      p_usuario_id, p_usuario_nombre, p_corte_caja_id, p_idempotency_key)
    returning id into v_venta_id;
  exception when unique_violation then
    select id into v_venta_id from ventas where idempotency_key = p_idempotency_key limit 1;
    return json_build_object('venta_id', v_venta_id,
      'folio', (select folio from ventas where id = v_venta_id),
      'idempotent_hit', true,
      'detalle_ids', coalesce((select json_agg(id order by id) from detalle_venta where venta_id = v_venta_id), '[]'::json));
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
    'idempotent_hit', false, 'detalle_ids', to_json(v_det_ids));
end $$;

-- Permisos (como las otras RPC de dinero): revocar de PUBLIC/anon, otorgar SOLO a authenticated.
revoke execute on function public.crear_venta_directa_tx(jsonb,jsonb,text,numeric,numeric,numeric,numeric,uuid,uuid,text,text,text,text) from public;
revoke execute on function public.crear_venta_directa_tx(jsonb,jsonb,text,numeric,numeric,numeric,numeric,uuid,uuid,text,text,text,text) from anon;
grant  execute on function public.crear_venta_directa_tx(jsonb,jsonb,text,numeric,numeric,numeric,numeric,uuid,uuid,text,text,text,text) to authenticated;

commit;

-- ROLLBACK MANUAL:
--   drop function if exists public.crear_venta_directa_tx(jsonb,jsonb,text,numeric,numeric,numeric,numeric,uuid,uuid,text,text,text,text);
--   drop index if exists public.ux_ventas_idempotency_key;
--   -- (la columna ventas.idempotency_key se puede conservar; es aditiva/inerte.)
--
-- ORDEN DE DESPLIEGUE: aplicar ANTES o junto con el push del frontend que llama
-- crear_venta_directa_tx (POS.jsx). El resto de las escrituras de venta directas siguen
-- como DML directo hasta su sub-fase; el revoke del DML directo es la migración FINAL.

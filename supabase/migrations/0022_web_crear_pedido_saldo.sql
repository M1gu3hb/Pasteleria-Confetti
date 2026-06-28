-- FASE 3 #1 — SALDO WEB = 0 (corrige I1/WI1).
-- Problema: la RPC crear_pedido_web (0019/0020/0021) inserta total_final pero NO setea
-- saldo_pendiente, que toma su default de tabla (0). Resultado: TODO pedido web (pastel
-- Y catálogo) nacía "pagado" (saldo_pendiente=0) aunque total_final>0 →
--   (a) el POS NO podía cobrar anticipo (RegistrarPagoDialog: saldoActual=0 bloquea
--       cualquier monto con "El monto excede el saldo pendiente ($0.00)"), y
--   (b) "Entregado" quedaba habilitado sin cobrar (tieneSaldo=false).
-- Confirmado EN VIVO en Fase 2 (BD + DOM): PP-B-0001 pastel total=$420/saldo=$0 y
-- PP-B-0002 catálogo total=$300/saldo=$0; anticipo bloqueado; "Entregado" libre.
-- El POS (NuevoPedidoPastel.jsx) SÍ inicializa saldo_pendiente = max(0, total_final -
-- a_cuenta) al crear → asimetría POS vs Web. Esta migración la cierra.
--
-- FIX: el INSERT setea, server-side y desde el MISMO total_final que ya inserta,
--   total_abonado = 0, a_cuenta = 0, saldo_pendiente = greatest(0, total_final).
-- Web pública = pedido tentativo SIN cobro en línea → a_cuenta/total_abonado = 0 al
-- nacer; el saldo correcto es el total. NO se lee saldo_pendiente del payload (sigue
-- fuera de la whitelist) → se calcula como CONSTANTE server-side desde total_final, así
-- que NO es inyectable (mismo criterio que origen/estado/creado_por_nombre).
--
-- create-or-replace: cuerpo idéntico al de 0021 (candados origen/estado/tipo_pedido,
-- whitelist, requeridos + sucursal activa, folio vía trigger 0017, sello
-- creado_por_nombre='Web Confetti') + total_final cacheado en v_total_final y las 3
-- columnas de saldo. Preserva los grants anon-only de 0020 (reafirmados al final).
--
-- NOTA DE BACKFILL: en staging transaccional=0 (limpio) y producción aún sin cutover
-- (sin pedidos web reales), así que NO hay filas viejas con saldo_pendiente=0 que
-- recomputar. Si en el futuro existieran, el recompute one-shot sería:
--   update pedidos set saldo_pendiente = greatest(0, total_final - total_abonado)
--   where origen='web' and saldo_pendiente = 0 and total_final > total_abonado
--     and estado not in ('entregado','cancelado','pagado');

create or replace function crear_pedido_web(payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sucursal_id uuid;
  v_origen text := coalesce(nullif(payload->>'origen', ''), 'web');
  v_estado text := coalesce(nullif(payload->>'estado', ''), 'pendiente');
  v_tipo   text := coalesce(nullif(payload->>'tipo_pedido', ''), 'pastel_personalizado');
  v_total_final numeric := coalesce(nullif(payload->>'total_final', '')::numeric, 0);
  v_folio  text;
begin
  if v_origen <> 'web' then
    raise exception 'origen invalido (%): la web solo crea pedidos con origen=web', v_origen;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'estado invalido (%): la web solo crea pedidos con estado=pendiente', v_estado;
  end if;
  if v_tipo not in ('pastel_personalizado', 'productos_catalogo') then
    raise exception 'tipo_pedido invalido (%): debe ser pastel_personalizado o productos_catalogo', v_tipo;
  end if;

  if coalesce(btrim(payload->>'cliente_nombre'), '') = '' then
    raise exception 'cliente_nombre es requerido';
  end if;
  if coalesce(btrim(payload->>'cliente_telefono'), '') = '' then
    raise exception 'cliente_telefono es requerido';
  end if;
  if coalesce(btrim(payload->>'fecha_entrega'), '') = '' then
    raise exception 'fecha_entrega es requerida';
  end if;
  if coalesce(btrim(payload->>'sucursal_id'), '') = '' then
    raise exception 'sucursal_id es requerido';
  end if;

  v_sucursal_id := (payload->>'sucursal_id')::uuid;

  if not exists (select 1 from sucursales where id = v_sucursal_id and activa) then
    raise exception 'sucursal_id % inexistente o inactiva', v_sucursal_id;
  end if;

  insert into pedidos (
    origen, estado, tipo_pedido,
    sucursal_id, sucursal_nombre,
    cliente_nombre, cliente_telefono, cliente_email, cliente_direccion,
    requiere_entrega, fecha_entrega, hora_entrega,
    kilos, personas_estimadas,
    concepto, decorado, rellenos, leyenda_pastel,
    incluye_base, precio_base, incluye_oblea, precio_oblea,
    incluye_muneca, precio_muneca, incluye_velas, precio_velas,
    precio_kilo_usado, subtotal_pastel, subtotal_extras,
    total_calculado, total_final,
    total_abonado, a_cuenta, saldo_pendiente,
    imagen_referencia_url, notas_generales,
    creado_por_nombre
  ) values (
    'web', 'pendiente', v_tipo,
    v_sucursal_id, nullif(payload->>'sucursal_nombre', ''),
    btrim(payload->>'cliente_nombre'), btrim(payload->>'cliente_telefono'),
    nullif(payload->>'cliente_email', ''), nullif(payload->>'cliente_direccion', ''),
    coalesce((nullif(payload->>'requiere_entrega', ''))::boolean, false),
    (payload->>'fecha_entrega')::date, nullif(payload->>'hora_entrega', ''),
    coalesce(nullif(payload->>'kilos', '')::numeric, 0),
    nullif(payload->>'personas_estimadas', '')::numeric,
    nullif(payload->>'concepto', ''), nullif(payload->>'decorado', ''),
    nullif(payload->>'rellenos', ''), nullif(payload->>'leyenda_pastel', ''),
    coalesce((nullif(payload->>'incluye_base',  ''))::boolean, false), coalesce(nullif(payload->>'precio_base',  '')::numeric, 0),
    coalesce((nullif(payload->>'incluye_oblea', ''))::boolean, false), coalesce(nullif(payload->>'precio_oblea', '')::numeric, 0),
    coalesce((nullif(payload->>'incluye_muneca',''))::boolean, false), coalesce(nullif(payload->>'precio_muneca','')::numeric, 0),
    coalesce((nullif(payload->>'incluye_velas', ''))::boolean, false), coalesce(nullif(payload->>'precio_velas', '')::numeric, 0),
    nullif(payload->>'precio_kilo_usado', '')::numeric,
    coalesce(nullif(payload->>'subtotal_pastel', '')::numeric, 0),
    coalesce(nullif(payload->>'subtotal_extras', '')::numeric, 0),
    coalesce(nullif(payload->>'total_calculado', '')::numeric, 0),
    v_total_final,
    0, 0, greatest(0, v_total_final),   -- FASE 3 #1: saldo correcto al nacer (server-side, NO del payload)
    nullif(payload->>'imagen_referencia_url', ''), nullif(payload->>'notas_generales', ''),
    'Web Confetti'   -- SELLO server-side (constante, NO del payload → no inyectable)
  )
  returning folio into v_folio;

  return v_folio;
end;
$$;

-- Reafirma el grant anon-only (idempotente; create-or-replace ya lo preserva de 0020).
revoke execute on function crear_pedido_web(jsonb) from public;
revoke execute on function crear_pedido_web(jsonb) from authenticated;
grant  execute on function crear_pedido_web(jsonb) to anon;

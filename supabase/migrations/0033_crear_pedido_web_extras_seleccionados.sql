-- 0033 — crear_pedido_web: guardar extras_seleccionados (CAMBIOS_V2 · Fase 01)
-- ADITIVO/compatible: la web vieja NO manda 'extras_seleccionados' → queda NULL
-- y el comportamiento es idéntico al actual. La web nueva (tras deploy) lo manda
-- como array y se persiste en la columna jsonb agregada en 0032.
-- Resto del cuerpo IDÉNTICO a 0022 (no se cambia ninguna validación ni columna).
create or replace function public.crear_pedido_web(payload jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    creado_por_nombre,
    extras_seleccionados
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
    0, 0, greatest(0, v_total_final),
    nullif(payload->>'imagen_referencia_url', ''), nullif(payload->>'notas_generales', ''),
    'Web Confetti',
    case when jsonb_typeof(payload->'extras_seleccionados') = 'array'
         then payload->'extras_seleccionados' else null end
  )
  returning folio into v_folio;

  return v_folio;
end;
$function$;

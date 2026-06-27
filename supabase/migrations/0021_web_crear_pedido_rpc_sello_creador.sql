-- WEB-2 / Fidelidad: la RPC crear_pedido_web SELLA creado_por_nombre='Web Confetti'.
-- En Base44 el pedido web nacía con creado_por_nombre="Web Confetti" — el POS (Abel)
-- lo usa para distinguir los pedidos que entraron por la web. La whitelist de 0019
-- lo descartaba (las filas web quedaban con creado_por_nombre=null) → pérdida de una
-- señal operativa que el dueño usa. Se sella como CONSTANTE server-side en el INSERT
-- (igual que origen='web'/estado='pendiente'): NO se lee del payload, así no es
-- inyectable. `create or replace` PRESERVA los grants de 0020 (sigue anon-only:
-- authenticated/public sin EXECUTE); se reafirman al final por idempotencia.
-- El cuerpo es idéntico al vigente (candados origen/estado/tipo_pedido, whitelist,
-- requeridos + sucursal activa, folio vía trigger 0017) + la columna creado_por_nombre.

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
    coalesce(nullif(payload->>'total_final', '')::numeric, 0),
    nullif(payload->>'imagen_referencia_url', ''), nullif(payload->>'notas_generales', ''),
    'Web Confetti'   -- SELLO server-side (constante, NO del payload → no inyectable)
  )
  returning folio into v_folio;

  return v_folio;
end;
$$;

-- Reafirma el grant deseado (idempotente): solo anon ejecuta. authenticated quedó
-- revocado en 0020 y create-or-replace lo preserva; se reafirma para que la migración
-- sea autosuficiente en un replay desde cero.
revoke execute on function crear_pedido_web(jsonb) from public;
revoke execute on function crear_pedido_web(jsonb) from authenticated;
grant  execute on function crear_pedido_web(jsonb) to anon;

-- WEB-2 / Folio en pantalla Gracias — RPC de creación de pedido web.
-- Problema (consecuencia de 0017, ver DECISIONS #20/#22): la web pública (anon)
-- hace INSERT directo en `pedidos`, el trigger 0017 le pone el folio, pero anon NO
-- tiene SELECT en `pedidos` (correcto por aislamiento) → no puede leer de vuelta el
-- folio para mostrarlo en la pantalla "Gracias" (`insert().select()` → 42501).
--
-- Solución (DECISIÓN DE MIGUEL, opción 1): una RPC SECURITY DEFINER que inserta el
-- pedido Y DEVUELVE el folio en una sola llamada. Reproduce lo que hacía el puente
-- `crearPedidoPOS` de Base44 (crear + devolver folio), pero sin api_key: la web pasa
-- de `insert` a `rpc('crear_pedido_web', { payload })`. anon NUNCA lee `pedidos` directo.
--
-- Candados (idénticos al WITH CHECK de la policy `anon_insert_pedidos`):
--   * fuerza origen='web' y estado='pendiente' (rechaza cualquier otro valor).
--   * whitelist EXPLÍCITA de columnas desde el payload → ignora lo que no exista en la
--     tabla (p. ej. `devolver_base`) y los campos POS-only (folio, financieros, fechas
--     de ciclo, creado_por_*). No hay forma de inyectar columnas vía el payload.
--   * valida requeridos del formulario Base44: cliente_nombre, cliente_telefono,
--     fecha_entrega, sucursal_id (+ sucursal existente y activa = regla web irrompible).
-- Folio: UN solo generador. Inserta con folio NULL → el trigger 0017 lo asigna
--   (`PP-<prefijo>-####`) en su propio contexto DEFINER. No se duplica lógica de folio.
-- FORCE RLS está OFF y el owner es postgres → la función (DEFINER) es la única
--   superficie de escritura nueva; anon recibe EXECUTE, nada de SELECT extra.

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
  -- ── Candados idénticos a la RLS anon (rechaza, no "corrige" en silencio) ──
  if v_origen <> 'web' then
    raise exception 'origen invalido (%): la web solo crea pedidos con origen=web', v_origen;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'estado invalido (%): la web solo crea pedidos con estado=pendiente', v_estado;
  end if;
  -- tipo_pedido acotado a sus valores válidos (rechazo explícito, no "corrección";
  -- el CHECK de la tabla lo cubre, pero el candado da un error claro y consistente).
  if v_tipo not in ('pastel_personalizado', 'productos_catalogo') then
    raise exception 'tipo_pedido invalido (%): debe ser pastel_personalizado o productos_catalogo', v_tipo;
  end if;

  -- ── Requeridos (fidelidad del formulario Base44) ──
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

  -- Sucursal debe existir y estar activa (regla irrompible web #2; la web ya lo valida
  -- en cliente — aquí es la defensa en backend, igual que el resto de candados).
  if not exists (select 1 from sucursales where id = v_sucursal_id and activa) then
    raise exception 'sucursal_id % inexistente o inactiva', v_sucursal_id;
  end if;

  -- ── INSERT con whitelist; folio NULL ⇒ lo asigna el trigger 0017 ──
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
    imagen_referencia_url, notas_generales
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
    nullif(payload->>'imagen_referencia_url', ''), nullif(payload->>'notas_generales', '')
  )
  returning folio into v_folio;

  return v_folio;
end;
$$;

-- Única superficie de escritura nueva: solo anon ejecuta; sin SELECT extra sobre pedidos.
revoke execute on function crear_pedido_web(jsonb) from public;
grant  execute on function crear_pedido_web(jsonb) to anon;

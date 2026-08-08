-- 0055 — Verificación de PIN server-side, sólo para service_role (ADITIVO).
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-01.
--
-- Sustituye el uso de `login_pos` desde el cliente. Diferencias clave:
--   * login_pos es EXECUTE para anon y DEVUELVE el correo derivado del UUID
--     (`<id>@pos.confetti.local`), que es justo la pieza que hace posible el
--     ataque directo a /auth/v1/token. Aquí el correo NO sale nunca al cliente:
--     lo consume la Edge Function para generateLink y se descarta.
--   * Sólo service_role puede ejecutarla.
--   * Devuelve además un handle OPACO (sha256 del id) para el rate limit.
--
-- login_pos NO se toca todavía: sigue viva para la etapa compatible. Se revoca
-- en el cutover, tras MIGUEL_OK_AUTH_TABLETS.
--
-- Rollback: DROP FUNCTION public.rl_pin_verificar(uuid,text), public.rl_pin_handle(uuid),
--           app_private.pin_verificar(uuid,text), app_private.pin_handle(uuid);

create or replace function app_private.pin_verificar(p_user_id uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = app_private, public, pg_catalog, extensions as $$
declare u record;
begin
  -- Comparación bcrypt idéntica a la de login_pos (mismo pin_hash, sin cambios
  -- de PIN). El filtro por id es obligatorio: no se permite "adivinar usuario".
  select id, nombre, rol, sucursal_id, sucursal_nombre, activo, pin_hash
    into u
    from public.usuarios_pos
   where id = p_user_id and activo = true and pin_hash is not null
   limit 1;

  if not found then
    -- Coste constante aproximado para no filtrar existencia por tiempo.
    perform extensions.crypt(coalesce(p_pin,''), extensions.gen_salt('bf', 8));
    return jsonb_build_object('ok', false);
  end if;

  if extensions.crypt(p_pin, u.pin_hash) <> u.pin_hash then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'handle', encode(extensions.digest('v2:handle:'||u.id::text, 'sha256'), 'hex'),
    'email', lower(u.id::text)||'@pos.confetti.local',
    'nombre', u.nombre,
    'rol', u.rol,
    'sucursal_id', u.sucursal_id,
    'sucursal_nombre', u.sucursal_nombre
  );
end $$;

/** Handle opaco sin validar PIN — para el precheck del rate limit. */
create or replace function app_private.pin_handle(p_user_id uuid)
returns text language sql immutable
set search_path = pg_catalog, extensions as $$
  select encode(extensions.digest('v2:handle:'||coalesce(p_user_id::text,''), 'sha256'), 'hex')
$$;

create or replace function public.rl_pin_verificar(p_user_id uuid, p_pin text)
returns jsonb language sql security definer
set search_path = public, app_private, pg_catalog as $$
  select app_private.pin_verificar(p_user_id, p_pin);
$$;

create or replace function public.rl_pin_handle(p_user_id uuid)
returns text language sql security definer
set search_path = public, app_private, pg_catalog as $$
  select app_private.pin_handle(p_user_id);
$$;

revoke all on function app_private.pin_verificar(uuid,text) from public;
revoke all on function app_private.pin_handle(uuid) from public;
revoke all on function public.rl_pin_verificar(uuid,text) from public, anon, authenticated;
revoke all on function public.rl_pin_handle(uuid)         from public, anon, authenticated;
grant execute on function public.rl_pin_verificar(uuid,text) to service_role;
grant execute on function public.rl_pin_handle(uuid)         to service_role;

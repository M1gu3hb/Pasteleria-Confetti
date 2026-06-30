-- 0037 — Rol "pastelero" (CAMBIOS_V2 · Fase 06)
-- ADITIVO y seguro en BD viva:
--   * Nuevo helper pos_is_pastelero() (análogo a pos_is_admin()).
--   * Nueva política SELECT en `pedidos` para el pastelero (lee TODAS las
--     sucursales). Es permisiva → se OR-ea con la política existente; no cambia
--     el acceso de dueño/admin/cajero.
--   * crear_usuario_pos acepta también 'pastelero' (cambio compatible: dueño/admin
--     siguen igual). El pastelero NO va a pos_is_admin → NO ve dinero
--     (cortes_caja/abonos/ventas siguen bloqueados para él).

-- 1) Helper: ¿el usuario actual es pastelero?
create or replace function public.pos_is_pastelero()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select rol = 'pastelero' from usuarios_pos where auth_user_id = auth.uid() limit 1), false)
$function$;

-- 2) Política SELECT en pedidos para el pastelero (todas las sucursales).
--    Solo lectura: no toca INSERT/UPDATE/DELETE (esos siguen bajo pos_scope_pedidos).
drop policy if exists pos_pastelero_select_pedidos on public.pedidos;
create policy pos_pastelero_select_pedidos
  on public.pedidos
  for select
  to authenticated
  using (public.pos_is_pastelero());

-- 3) crear_usuario_pos acepta 'pastelero' (resto IDÉNTICO a 0030).
create or replace function public.crear_usuario_pos(
  p_nombre text, p_rol text, p_pin text,
  p_sucursal_id uuid default null::uuid, p_sucursal_nombre text default null::text,
  p_color text default null::text, p_telefono text default null::text, p_correo text default null::text,
  p_permisos_extra jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $function$
declare
  v_id    uuid := gen_random_uuid();
  v_auth  uuid := gen_random_uuid();
  v_email text := lower(v_id::text) || '@pos.confetti.local';
  v_pin   text := nullif(trim(coalesce(p_pin, '')), '');
  v_rol   text := case when p_rol = 'dueno' then 'dueño' else p_rol end;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.usuarios_pos where auth_user_id = auth.uid() and rol = 'dueño'
  ) then
    raise exception 'Solo el dueño puede crear usuarios';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if v_pin is null or v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos numéricos';
  end if;
  if v_rol not in ('dueño','administrador','pastelero') then
    raise exception 'Rol inválido: usa dueño, administrador o pastelero';
  end if;

  insert into public.usuarios_pos(
    id, nombre, rol, pin_hash, auth_user_id, activo, color, telefono, correo,
    sucursal_id, sucursal_nombre, permisos_extra
  ) values (
    v_id, trim(p_nombre), v_rol, extensions.crypt(v_pin, extensions.gen_salt('bf')), v_auth, true,
    nullif(p_color,''), nullif(p_telefono,''), nullif(p_correo,''),
    p_sucursal_id, nullif(p_sucursal_nombre,''), coalesce(p_permisos_extra, '{}'::jsonb)
  );

  perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, v_id);
  return v_id;
end;
$function$;

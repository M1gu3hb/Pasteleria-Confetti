-- 0030 — RPC para crear usuarios POS con PIN funcional (auth.users + pin_hash).
-- BUG: el alta de usuario mandaba `pin` en texto plano; el adaptador (whitelist usuarios_pos)
-- NO incluye `pin` (solo `pin_hash`) → se descartaba → usuario con pin_hash NULL y sin cuenta
-- auth → login_pos fallaba ("el PIN no existe").
--
-- Solución (intégrate al modelo existente, NO lo cambies):
--   usuarios_pos.pin_hash = extensions.crypt(pin, gen_salt('bf'));
--   cuenta auth.users (email = lower(usuarios_pos.id)::text||'@pos.confetti.local',
--   encrypted_password = crypt('POS-'||pin, ...)) + auth.identities — MISMO patrón que 0016.
-- El dueño abre sesión global (signInWithPassword email/'POS-'+pin); el administrador entra por
-- login_pos (con pin_hash basta) pero se le crea la cuenta auth igual, por uniformidad.
--
-- SECURITY DEFINER (owner postgres) → puede escribir en el esquema auth (como 0016).
-- Guard: si HAY sesión, debe ser DUEÑO (pos_is_admin con rol='dueño'); si NO hay sesión
-- (llamada de backend service-role, p. ej. una reparación de datos), se permite. anon NO puede.

-- ── Helper PRIVADO: crea la cuenta auth.users + identity (réplica de 0016) ───────────────────
create or replace function public._pos_provision_auth(
  p_auth_id uuid, p_email text, p_pin text, p_rol text, p_pos_id uuid
) returns void
language plpgsql security definer
set search_path to 'public','extensions','auth'
as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    p_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt('POS-' || p_pin, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', p_rol, 'pos_user_id', p_pos_id::text), now(), now(),
    '', '', '', ''  -- token-cols en '' (NULL → signInWithPassword da 500 en GoTrue)
  );
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_auth_id, 'email', p_auth_id::text,
    jsonb_build_object('sub', p_auth_id::text, 'email', p_email), now(), now(), now()
  );
end;
$$;
revoke all on function public._pos_provision_auth(uuid,text,text,text,uuid) from public, anon, authenticated;

-- ── crear_usuario_pos: alta completa (usuarios_pos + pin_hash + auth) ─────────────────────────
create or replace function public.crear_usuario_pos(
  p_nombre text, p_rol text, p_pin text,
  p_sucursal_id uuid default null, p_sucursal_nombre text default null,
  p_color text default null, p_telefono text default null, p_correo text default null,
  p_permisos_extra jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer
set search_path to 'public','extensions','auth'
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_auth  uuid := gen_random_uuid();
  v_email text := lower(v_id::text) || '@pos.confetti.local';
  v_pin   text := nullif(trim(coalesce(p_pin, '')), '');
  v_rol   text := case when p_rol = 'dueno' then 'dueño' else p_rol end;  -- normaliza a la forma de BD
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
  if v_rol not in ('dueño','administrador') then
    raise exception 'Rol inválido: usa dueño o administrador';
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
$$;
revoke all on function public.crear_usuario_pos(text,text,text,uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.crear_usuario_pos(text,text,text,uuid,text,text,text,text,jsonb) to authenticated;

-- ── actualizar_pin_usuario: cambia el PIN (recalcula pin_hash + password auth) ───────────────
-- Si el usuario NO tenía cuenta auth (auth_user_id NULL), la crea y la enlaza (repara usuarios
-- ya creados con el bug). NO borra ni recrea la fila de usuarios_pos.
create or replace function public.actualizar_pin_usuario(p_user_id uuid, p_pin text)
returns void
language plpgsql security definer
set search_path to 'public','extensions','auth'
as $$
declare
  v_pin   text := nullif(trim(coalesce(p_pin, '')), '');
  v_email text := lower(p_user_id::text) || '@pos.confetti.local';
  v_auth  uuid;
  v_rol   text;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.usuarios_pos where auth_user_id = auth.uid() and rol = 'dueño'
  ) then
    raise exception 'Solo el dueño puede cambiar PINs';
  end if;
  if v_pin is null or v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos numéricos';
  end if;

  select auth_user_id, rol into v_auth, v_rol from public.usuarios_pos where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  update public.usuarios_pos
    set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf'))
  where id = p_user_id;

  if v_auth is null then
    v_auth := gen_random_uuid();
    perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, p_user_id);
    update public.usuarios_pos set auth_user_id = v_auth where id = p_user_id;
  elsif exists (select 1 from auth.users where id = v_auth) then
    update auth.users
      set encrypted_password = extensions.crypt('POS-' || v_pin, extensions.gen_salt('bf')),
          updated_at = now()
    where id = v_auth;
  else
    perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, p_user_id);
  end if;
end;
$$;
revoke all on function public.actualizar_pin_usuario(uuid,text) from public, anon;
grant execute on function public.actualizar_pin_usuario(uuid,text) to authenticated;

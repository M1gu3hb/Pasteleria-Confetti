-- Fase 4 (wiring) — Cuentas TERMINAL (Opción A). Una por sucursal:
--   * auth.users  (email terminal-<sucursalid>@pos.confetti.local, password fijo
--     embebido — coincide con VITE_TERMINAL_PASSWORD del cliente).
--   * auth.identities (provider email, mismo patrón que los operadores).
--   * usuarios_pos rol 'caja', pin_hash NULL, auth_user_id enlazado.
-- El empleado de la terminal opera SOBRE esta sesión (pos_is_admin=false →
-- RLS la confina a su sucursal). El administrador se queda sobre ella (mismo
-- alcance); el dueño abre su propia sesión global.
-- Idempotente (no duplica si ya existen). Excluye las terminales de usuarios_login.

do $$
declare
  s record;
  v_email text;
  v_uid   uuid;
  v_pwd   text := 'POS-TERMINAL-CONFETTI';   -- = VITE_TERMINAL_PASSWORD
begin
  for s in select id, nombre, folio_prefijo from sucursales where activa = true loop
    v_email := 'terminal-' || lower(s.id::text) || '@pos.confetti.local';

    select id into v_uid from auth.users where email = v_email limit 1;

    if v_uid is null then
      v_uid := gen_random_uuid();

      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        -- GoTrue escanea estos a string NO-nullable: si quedan NULL, el login
        -- por password devuelve 500. Insertarlos como '' (igual que los operadores).
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_email, extensions.crypt(v_pwd, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('rol', 'caja', 'es_terminal', true, 'sucursal_id', s.id::text),
        now(), now(),
        '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, provider, provider_id, identity_data,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid, 'email', v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', v_email),
        now(), now(), now()
      );
    end if;

    if not exists (select 1 from usuarios_pos where auth_user_id = v_uid) then
      insert into usuarios_pos (nombre, rol, pin_hash, auth_user_id, activo, sucursal_id, sucursal_nombre)
      values ('Terminal ' || s.nombre, 'caja', null, v_uid, true, s.id, s.nombre);
    end if;
  end loop;
end $$;

-- usuarios_login: ahora excluye cuentas sin pin_hash (las terminales no son
-- operadores seleccionables). Mismo set de columnas que antes.
create or replace view usuarios_login with (security_invoker = false) as
  select id, nombre, rol, sucursal_id, sucursal_nombre, color, activo
  from usuarios_pos
  where activo = true and pin_hash is not null;
grant select on usuarios_login to anon, authenticated;

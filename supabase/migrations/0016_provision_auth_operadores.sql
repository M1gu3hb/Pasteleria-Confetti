-- Fase 4 (gate) — Reproducibilidad de auth.users para los 33 OPERADORES.
-- Los auth.users de operadores se habían creado ad-hoc (no en migración), así que
-- una DB fresca/cutover NO los reproducía. Esta migración los provisiona de forma
-- IDEMPOTENTE a partir del PIN ya sembrado en 0006 (mismo repo privado): por cada
-- operador SIN auth_user_id, crea auth.users (email `<usuarios_pos.id>@pos.confetti.local`,
-- password `POS-<pin>`) + identity y setea pin_hash. Mismo patrón que 0015, con
-- token-columns en '' (si quedan NULL, signInWithPassword da 500 en GoTrue).
--
-- NO toca filas con auth_user_id ya asignado → en staging es NO-OP (los 33 ya existen).
-- En DB fresca (tras 0006/0013) provisiona los 33. Las cuentas terminal (0015) y
-- cualquier TEST_* no están en la lista y además ya traen auth_user_id → intactas.
--
-- Para CUTOVER con datos reales (Fase 6): re-sembrar este patrón con los PINs reales
-- del export, o llamar la misma lógica por operador. Los PINs de abajo son los de 0006.

do $$
declare
  o      jsonb;
  v_pid  uuid;
  v_uid  uuid;
  v_email text;
  ops jsonb := '[
    {"n":"OBSERVADOR_3","p":"9003"},{"n":"OBSERVADOR_2","p":"9002"},{"n":"OBSERVADOR_1","p":"9001"},
    {"n":"EMP_SANG_5","p":"4105"},{"n":"EMP_SANG_4","p":"4104"},{"n":"ADMIN_SANG_3","p":"4003"},
    {"n":"EMP_TOPI_5","p":"3105"},{"n":"EMP_TOPI_4","p":"3104"},{"n":"ADMIN_TOPI_3","p":"3003"},
    {"n":"EMP_XOCHI_5","p":"2105"},{"n":"EMP_XOCHI_4","p":"2104"},{"n":"ADMIN_XOCHI_3","p":"2003"},
    {"n":"DUENO_3","p":"1236"},{"n":"DUENO_2","p":"1235"},{"n":"DUENO_1","p":"1234"},
    {"n":"EMP_SANG_3","p":"4103"},{"n":"EMP_SANG_2","p":"4102"},{"n":"EMP_SANG_1","p":"4101"},
    {"n":"ADMIN_SANG_2","p":"4002"},{"n":"ADMIN_SANG_1","p":"4001"},
    {"n":"EMP_TOPI_3","p":"3103"},{"n":"EMP_TOPI_2","p":"3102"},{"n":"EMP_TOPI_1","p":"3101"},
    {"n":"ADMIN_TOPI_2","p":"3002"},{"n":"ADMIN_TOPI_1","p":"3001"},
    {"n":"EMP_XOCHI_3","p":"2103"},{"n":"EMP_XOCHI_2","p":"2102"},{"n":"EMP_XOCHI_1","p":"2101"},
    {"n":"ADMIN_XOCHI_2","p":"2002"},{"n":"ADMIN_XOCHI_1","p":"2001"},
    {"n":"ADMIN_3","p":"1236"},{"n":"ADMIN_2","p":"1235"},{"n":"ADMIN_1","p":"1234"}
  ]'::jsonb;
begin
  for o in select * from jsonb_array_elements(ops) loop
    -- operador que aún NO tiene auth provisionado
    select id into v_pid
    from usuarios_pos
    where nombre = o->>'n' and auth_user_id is null
    limit 1;

    if v_pid is null then
      continue;  -- ya provisionado (staging) o no existe en esta DB
    end if;

    v_uid := gen_random_uuid();
    v_email := lower(v_pid::text) || '@pos.confetti.local';

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt('POS-' || (o->>'p'), extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('pos_user_id', v_pid::text), now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, 'email', v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email), now(), now(), now()
    );

    update usuarios_pos
      set pin_hash = extensions.crypt(o->>'p', extensions.gen_salt('bf')),
          auth_user_id = v_uid
    where id = v_pid;
  end loop;
end $$;

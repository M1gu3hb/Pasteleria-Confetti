-- 0054 — Rate limit del PIN: precheck / fallo / éxito separados (FORWARD-ONLY).
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-01.
--
-- CORRIGE DOS FALLOS REALES DE 0053 (0053 NO se edita; se deja de usar):
--
-- (1) BLOQUEO PERPETUO. `pin_rate_intentar` incrementaba ANTES de validar el
--     PIN. Con fallos=5 y el cooldown vencido, el siguiente intento subía a 6,
--     volvía a cumplir el umbral (>=5) y re-armaba 30 s: un PIN CORRECTO nunca
--     llegaba a validarse. Rompía la UX del personal.
--     Ahora `pin_precheck` NO cuenta; el contador sólo sube en
--     `pin_registrar_fallo`, es decir, después de saber que el PIN estuvo mal.
--
-- (2) BUCKET MANIPULABLE. `p_dispositivo` venía del cuerpo de la petición: un
--     atacante lo cambiaba y estrenaba contador. Se ELIMINA de la clave. La
--     clave v2 es identidad de terminal resuelta server-side (sub del JWT ya
--     verificado) + handle opaco. La IP la extrae la Edge Function de las
--     cabeceras de plataforma, nunca del JSON del cliente.
--
-- UMBRALES (UX sin cambios): 5º fallo -> 30 s; 10º en ventana -> 5 min; éxito
-- reinicia; ventana de 15 min sin actividad reinicia sola; nunca permanente.
--
-- ACCESO: app_private no lo expone PostgREST, así que hay tres wrappers en
-- `public` con EXECUTE sólo para service_role.
--
-- VERIFICADO EN PRODUCCIÓN (transacción revertida salvo donde se indica):
--   [1] precheck inicial permitido           [2] tras 4 fallos permitido
--   [3] 5º fallo -> espera 30 s y precheck bloqueado
--   [4] vencido el cooldown -> PIN correcto PERMITIDO con fallos aún en 5
--       (éste es exactamente el bug de 0053, ahora corregido)
--   [5] éxito reinicia -> 0 filas          [6] 10 fallos -> espera 300 s
--   [7] ventana vencida -> fallos vuelve a 1
--   [8] otro handle en la misma terminal no queda afectado
--   Concurrencia: 2 conexiones x 50 -> 100 exactos en bucket principal y de IP.
--   Acceso: anon y authenticated -> permission denied (42501) por REST y
--           has_function_privilege=false en las tres funciones.
--
-- Rollback: DROP FUNCTION public.rl_pin_precheck(text,text,text),
--           public.rl_pin_fallo(text,text,text), public.rl_pin_exito(text,text),
--           app_private.pin_precheck(text,text,text),
--           app_private.pin_registrar_fallo(text,text,text),
--           app_private.pin_registrar_exito(text,text);

create or replace function app_private.pin_precheck(
  p_terminal text, p_handle text, p_ip text default ''
) returns jsonb
language plpgsql security definer stable
set search_path = app_private, pg_catalog, extensions as $$
declare v_espera integer := 0; v_e2 integer := 0;
begin
  select coalesce(ceil(extract(epoch from (bloqueado_hasta - now())))::int, 0)
    into v_espera from app_private.pin_intentos
   where clave = app_private._clave('v2:principal:'||coalesce(p_terminal,'')||'|'||coalesce(p_handle,''));
  if coalesce(p_ip,'') <> '' then
    select coalesce(ceil(extract(epoch from (bloqueado_hasta - now())))::int, 0)
      into v_e2 from app_private.pin_intentos
     where clave = app_private._clave('v2:ip:'||p_ip);
  end if;
  v_espera := greatest(coalesce(v_espera,0), coalesce(v_e2,0), 0);
  if v_espera > 0 then
    return jsonb_build_object('permitido', false, 'espera_segundos', v_espera);
  end if;
  return jsonb_build_object('permitido', true, 'espera_segundos', 0);
end $$;

create or replace function app_private.pin_registrar_fallo(
  p_terminal text, p_handle text, p_ip text default ''
) returns jsonb
language plpgsql security definer
set search_path = app_private, pg_catalog, extensions as $$
declare k text; k_ip text; v_bloq timestamptz; v_bloq_ip timestamptz; v_espera integer;
begin
  k := app_private._clave('v2:principal:'||coalesce(p_terminal,'')||'|'||coalesce(p_handle,''));
  insert into app_private.pin_intentos (clave, ambito, ventana_inicio, fallos, actualizado_en)
  values (k, 'principal', now(), 1, now())
  on conflict (clave) do update set
    ventana_inicio = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                          then now() else app_private.pin_intentos.ventana_inicio end,
    fallos = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                  then 1 else app_private.pin_intentos.fallos + 1 end,
    bloqueado_hasta = case
      when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes' then null
      when app_private.pin_intentos.fallos + 1 >= 10 then now() + interval '5 minutes'
      when app_private.pin_intentos.fallos + 1 >= 5  then now() + interval '30 seconds'
      else null end,
    actualizado_en = now()
  returning bloqueado_hasta into v_bloq;

  if coalesce(p_ip,'') <> '' then
    k_ip := app_private._clave('v2:ip:'||p_ip);
    insert into app_private.pin_intentos (clave, ambito, ventana_inicio, fallos, actualizado_en)
    values (k_ip, 'ip', now(), 1, now())
    on conflict (clave) do update set
      ventana_inicio = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                            then now() else app_private.pin_intentos.ventana_inicio end,
      fallos = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                    then 1 else app_private.pin_intentos.fallos + 1 end,
      bloqueado_hasta = case
        when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes' then null
        when app_private.pin_intentos.fallos + 1 >= 30 then now() + interval '5 minutes'
        else null end,
      actualizado_en = now()
    returning bloqueado_hasta into v_bloq_ip;
  end if;

  v_espera := greatest(
    coalesce(ceil(extract(epoch from (v_bloq    - now())))::int, 0),
    coalesce(ceil(extract(epoch from (v_bloq_ip - now())))::int, 0), 0);
  return jsonb_build_object('permitido', v_espera = 0, 'espera_segundos', v_espera);
end $$;

create or replace function app_private.pin_registrar_exito(p_terminal text, p_handle text)
returns void language sql security definer
set search_path = app_private, pg_catalog, extensions as $$
  delete from app_private.pin_intentos
   where clave = app_private._clave('v2:principal:'||coalesce(p_terminal,'')||'|'||coalesce(p_handle,''));
$$;

revoke all on function app_private.pin_precheck(text,text,text) from public;
revoke all on function app_private.pin_registrar_fallo(text,text,text) from public;
revoke all on function app_private.pin_registrar_exito(text,text) from public;

create or replace function public.rl_pin_precheck(p_terminal text, p_handle text, p_ip text default '')
returns jsonb language sql security definer set search_path = public, app_private, pg_catalog as $$
  select app_private.pin_precheck(p_terminal, p_handle, p_ip);
$$;
create or replace function public.rl_pin_fallo(p_terminal text, p_handle text, p_ip text default '')
returns jsonb language sql security definer set search_path = public, app_private, pg_catalog as $$
  select app_private.pin_registrar_fallo(p_terminal, p_handle, p_ip);
$$;
create or replace function public.rl_pin_exito(p_terminal text, p_handle text)
returns void language sql security definer set search_path = public, app_private, pg_catalog as $$
  select app_private.pin_registrar_exito(p_terminal, p_handle);
$$;

revoke all on function public.rl_pin_precheck(text,text,text) from public, anon, authenticated;
revoke all on function public.rl_pin_fallo(text,text,text)   from public, anon, authenticated;
revoke all on function public.rl_pin_exito(text,text)        from public, anon, authenticated;
grant execute on function public.rl_pin_precheck(text,text,text) to service_role;
grant execute on function public.rl_pin_fallo(text,text,text)   to service_role;
grant execute on function public.rl_pin_exito(text,text)        to service_role;

-- 0053 queda en la base pero su pin_rate_intentar YA NO SE USA (tenía el bug).
revoke all on function app_private.pin_rate_intentar(text,text,text,text) from service_role;

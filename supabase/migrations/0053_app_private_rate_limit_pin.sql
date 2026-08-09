-- 0053 — Rate limit persistente y atómico para el PIN (ADITIVO, sin cablear).
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-01.
--
-- ESTRICTAMENTE ADITIVO: crea un esquema privado nuevo. NO toca login_pos, ni
-- Auth, ni RLS, ni ninguna tabla existente. Nada lo llama todavía.
--
-- POR QUÉ EN ESQUEMA PROPIO: `app_private` no está entre los esquemas expuestos
-- por PostgREST (sólo public y graphql_public), así que NO es alcanzable por
-- /rest/v1. Verificado: anon y authenticated no tienen ni USAGE del esquema.
--
-- PRIVACIDAD: nunca guarda PIN, correo, nombre ni sucursal. La clave es un
-- SHA-256 de los componentes. Verificado: 0 filas con identidad legible.
--
-- UMBRALES: principal 5 fallos -> 30 s ; 10 fallos en 15 min -> 5 min.
--           ip 30 fallos en 15 min -> 5 min (señal secundaria, más laxa, para
--           no castigar a una sucursal entera detrás de un NAT compartido).
--           Éxito reinicia el contador principal. Nunca hay bloqueo permanente:
--           el tope es 5 min y la ventana se reinicia sola a los 15 min.
--
-- Rollback: DROP SCHEMA app_private CASCADE;

create schema if not exists app_private;
revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;
grant usage on schema app_private to service_role;

create table if not exists app_private.pin_intentos (
  clave            text        primary key,
  ambito           text        not null,
  ventana_inicio   timestamptz not null default now(),
  fallos           integer     not null default 0,
  bloqueado_hasta  timestamptz,
  actualizado_en   timestamptz not null default now()
);
create index if not exists idx_pin_intentos_limpieza
  on app_private.pin_intentos (actualizado_en);
alter table app_private.pin_intentos enable row level security;
revoke all on app_private.pin_intentos from public, anon, authenticated;
grant select, insert, update, delete on app_private.pin_intentos to service_role;

create or replace function app_private._clave(p_partes text)
returns text language sql immutable set search_path = pg_catalog, extensions as $$
  select encode(extensions.digest(p_partes, 'sha256'), 'hex')
$$;

create or replace function app_private.pin_rate_intentar(
  p_terminal text, p_handle text, p_dispositivo text default '', p_ip text default ''
) returns jsonb
language plpgsql security definer set search_path = app_private, pg_catalog, extensions as $$
declare k_principal text; k_ip text; v_bloq timestamptz; v_bloq_ip timestamptz; v_espera integer;
begin
  k_principal := app_private._clave('v1:principal:' || coalesce(p_terminal,'') || '|' ||
                                    coalesce(p_handle,'') || '|' || coalesce(p_dispositivo,''));
  insert into app_private.pin_intentos (clave, ambito, ventana_inicio, fallos, actualizado_en)
  values (k_principal, 'principal', now(), 1, now())
  on conflict (clave) do update set
    ventana_inicio = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                          then now() else app_private.pin_intentos.ventana_inicio end,
    fallos         = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                          then 1 else app_private.pin_intentos.fallos + 1 end,
    bloqueado_hasta = case
      when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes' then null
      when app_private.pin_intentos.fallos + 1 >= 10 then now() + interval '5 minutes'
      when app_private.pin_intentos.fallos + 1 >= 5  then now() + interval '30 seconds'
      else app_private.pin_intentos.bloqueado_hasta end,
    actualizado_en = now()
  returning bloqueado_hasta into v_bloq;

  if coalesce(p_ip,'') <> '' then
    k_ip := app_private._clave('v1:ip:' || p_ip);
    insert into app_private.pin_intentos (clave, ambito, ventana_inicio, fallos, actualizado_en)
    values (k_ip, 'ip', now(), 1, now())
    on conflict (clave) do update set
      ventana_inicio = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                            then now() else app_private.pin_intentos.ventana_inicio end,
      fallos         = case when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes'
                            then 1 else app_private.pin_intentos.fallos + 1 end,
      bloqueado_hasta = case
        when app_private.pin_intentos.ventana_inicio < now() - interval '15 minutes' then null
        when app_private.pin_intentos.fallos + 1 >= 30 then now() + interval '5 minutes'
        else app_private.pin_intentos.bloqueado_hasta end,
      actualizado_en = now()
    returning bloqueado_hasta into v_bloq_ip;
  end if;

  v_espera := greatest(
    coalesce(ceil(extract(epoch from (v_bloq    - now())))::int, 0),
    coalesce(ceil(extract(epoch from (v_bloq_ip - now())))::int, 0));
  if v_espera > 0 then
    return jsonb_build_object('permitido', false, 'espera_segundos', v_espera);
  end if;
  return jsonb_build_object('permitido', true, 'espera_segundos', 0);
end $$;

create or replace function app_private.pin_rate_exito(
  p_terminal text, p_handle text, p_dispositivo text default ''
) returns void
language sql security definer set search_path = app_private, pg_catalog, extensions as $$
  delete from app_private.pin_intentos
  where clave = app_private._clave('v1:principal:' || coalesce(p_terminal,'') || '|' ||
                                   coalesce(p_handle,'') || '|' || coalesce(p_dispositivo,''));
$$;

create or replace function app_private.pin_rate_limpiar()
returns integer language sql security definer set search_path = app_private, pg_catalog as $$
  with borradas as (
    delete from app_private.pin_intentos where actualizado_en < now() - interval '24 hours' returning 1
  ) select count(*)::int from borradas;
$$;

revoke all on function app_private._clave(text) from public;
revoke all on function app_private.pin_rate_intentar(text,text,text,text) from public;
revoke all on function app_private.pin_rate_exito(text,text,text) from public;
revoke all on function app_private.pin_rate_limpiar() from public;
grant execute on function app_private.pin_rate_intentar(text,text,text,text) to service_role;
grant execute on function app_private.pin_rate_exito(text,text,text) to service_role;
grant execute on function app_private.pin_rate_limpiar() to service_role;

-- Isolated non-business fixture; no API schema exposure or grants.
create schema confetti_validacion_autoridad_20261002; revoke all on schema confetti_validacion_autoridad_20261002 from public,anon,authenticated;
create table confetti_validacion_autoridad_20261002.usuarios_pos(id uuid primary key,activo boolean,rol text);
revoke all on confetti_validacion_autoridad_20261002.usuarios_pos from public,anon,authenticated;
alter table confetti_validacion_autoridad_20261002.usuarios_pos enable row level security;
create function confetti_validacion_autoridad_20261002.guard_ultimo_dueno() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'INSERT' and OLD.activo and OLD.rol='dueño' and (TG_OP='DELETE' or not NEW.activo or NEW.rol<>'dueño') then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:duenos',0));
  if not exists(select 1 from confetti_validacion_autoridad_20261002.usuarios_pos where activo and rol='dueño' and id<>OLD.id) then raise exception 'ULTIMO_DUENO: conserva al menos un dueño activo'; end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
create trigger trg_guard_ultimo_dueno before update or delete on confetti_validacion_autoridad_20261002.usuarios_pos for each row execute function confetti_validacion_autoridad_20261002.guard_ultimo_dueno();
insert into confetti_validacion_autoridad_20261002.usuarios_pos values('00000000-0000-4000-8000-000000000001',true,'dueño'),('00000000-0000-4000-8000-000000000002',true,'dueño');

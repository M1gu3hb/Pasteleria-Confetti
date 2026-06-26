-- tipsEnabled() es ACTIVO por default si propinas_activas es undefined. El config
-- real de Confetti tiene propinas desactivadas. Migrar el campo (false) para que
-- tipsEnabled=false y los flujos de propina queden apagados (PropinaDialog inalcanzable).
alter table configuracion_negocio add column if not exists propinas_activas boolean default false;
alter table configuracion_negocio add column if not exists propina_porcentajes_sugeridos text;
update configuracion_negocio set propinas_activas = false where propinas_activas is distinct from false;
update configuracion_negocio set propina_porcentajes_sugeridos = '5,10,15,20' where propina_porcentajes_sugeridos is null;

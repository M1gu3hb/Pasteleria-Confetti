-- sonidos_activos se lee en Caja.jsx (PedidoWebBeep) con default-on. Real=true
-- (== default, sin divergencia), pero se agrega para que la columna exista explícita.
alter table configuracion_negocio add column if not exists sonidos_activos boolean default true;
update configuracion_negocio set sonidos_activos = true where sonidos_activos is null;

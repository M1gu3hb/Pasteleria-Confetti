-- 0038 — Permitir rol 'pastelero' en el CHECK de usuarios_pos (CAMBIOS_V2 · Fase 06)
-- ADITIVO: amplía los valores permitidos (las filas existentes siguen válidas;
-- ningún rol previo se quita). El front en vivo no inserta 'pastelero', así que
-- no cambia su comportamiento. Necesario para que crear_usuario_pos pueda crear
-- pasteleros (el RPC ya los acepta en 0037, pero el CHECK los rechazaba).
alter table public.usuarios_pos drop constraint if exists usuarios_pos_rol_check;
alter table public.usuarios_pos add constraint usuarios_pos_rol_check
  check (rol = any (array['administrador','caja','dueño','mesero','cocina','barra','pastelero']));

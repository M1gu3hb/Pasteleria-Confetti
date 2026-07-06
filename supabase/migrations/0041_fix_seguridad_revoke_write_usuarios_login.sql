-- 0041 — FIX SEGURIDAD (CRÍTICO): quitar escritura sobre la vista usuarios_login
-- ---------------------------------------------------------------------------
-- Hallazgo (auditoría 2026-07-01): la vista public.usuarios_login se creó con
-- security_invoker=false (corre como su dueño, postgres) y los roles anon y
-- authenticated tenían GRANT ALL. Como la vista es auto-actualizable sobre
-- usuarios_pos, cualquiera con la anon key pública (embebida en el bundle web)
-- o con una sesión de terminal podía INSERT/UPDATE/DELETE en usuarios_pos
-- SALTÁNDOSE la RLS: p. ej. crearse un usuario rol='dueño' o borrar a todos.
--
-- Evidencia: como anon, `insert into usuarios_login(nombre,rol) values(...,'dueño')`
-- devolvía id (probado en transacción con rollback, sin residuo).
--
-- Fix: la vista SOLO debe servir para leer la lista de login. Se revoca toda
-- escritura de anon y authenticated; se conserva SELECT (contrato de lectura).
-- El alta/edición de usuarios sigue por los RPC SECURITY DEFINER
-- (crear_usuario_pos / actualizar_pin_usuario), que NO dependen de esta vista.
-- Cambio aditivo/seguro: no toca datos, no toca la vista ni su SELECT.

revoke insert, update, delete, truncate, references, trigger
  on public.usuarios_login from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.usuarios_login from authenticated;

-- (SELECT se mantiene para ambos roles: la vista es solo lectura.)

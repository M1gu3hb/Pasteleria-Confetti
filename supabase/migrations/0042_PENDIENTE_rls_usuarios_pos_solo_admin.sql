-- 0042 — PENDIENTE (requiere firma de Miguel: cambio de RLS) — NO APLICADA
-- ---------------------------------------------------------------------------
-- Hallazgo (auditoría 2026-07-01): la policy pos_all_usuarios_pos es
--   FOR ALL USING (true) WITH CHECK (true)  (rol: authenticated)
-- Es decir, CUALQUIER sesión authenticated (incluida la cuenta TERMINAL de
-- sucursal, cuyo password va embebido en el bundle: VITE_TERMINAL_PASSWORD)
-- puede LEER y ESCRIBIR toda la tabla usuarios_pos, incluyendo:
--   * pin_hash (bcrypt) de TODOS los usuarios, incl. el dueño.
--     PINs de 4 dígitos => 10^4 candidatos => crackeo bcrypt trivial offline.
--   * cambiar su propio rol a 'dueño' / activar-desactivar / cambiar sucursal.
-- Vector: con la sesión terminal (o el password embebido) se llama a
--   GET /rest/v1/usuarios_pos?select=*  y se filtran los hashes -> escalada.
--
-- Verificación de que restringir a admin NO rompe el front (auditoría):
--   * Únicos lectores de usuarios_pos: Configuracion.jsx y UsuarioPOSDialog.jsx,
--     ambos bajo ver_configuracion = SOLO dueño (permissions.js). El dueño abre
--     sesión propia con pos_is_admin()=true.
--   * Altas/edición: RPC crear_usuario_pos / actualizar_pin_usuario, ambos
--     SECURITY DEFINER => no dependen de esta policy.
--   * TerminalContext / ConfigurarTerminal / ModalPinAdmin: NO leen la tabla
--     (usan el RPC login_pos, que es SECURITY DEFINER).
--   * Web: 0 referencias a usuarios_pos.
--
-- Efecto: solo el dueño (admin) puede ver/escribir usuarios_pos vía API. Las
-- sesiones terminal/empleado/administrador pierden el acceso directo (que hoy
-- es un agujero, no una función usada).
--
-- >>> NO APLICAR sin la firma de Miguel (regla dura: la RLS la firma Miguel).
--     Aplicar con: supabase migration / apply_migration tras su OK.

alter policy pos_all_usuarios_pos on public.usuarios_pos
  using (pos_is_admin())
  with check (pos_is_admin());

-- Rollback (volver al estado actual):
--   alter policy pos_all_usuarios_pos on public.usuarios_pos
--     using (true) with check (true);

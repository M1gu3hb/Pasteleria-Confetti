-- =====================================================================
-- 0061 — restaurar el rol de DUEÑO y el logo de los tickets
-- ---------------------------------------------------------------------
-- Dos correcciones de DATOS (no de código). Ninguna de las dos la causó la
-- auditoría: se documentan aquí con su evidencia para que quede el rastro.
--
-- ── A) EL DUEÑO SE QUEDÓ SIN ROL DE DUEÑO ────────────────────────────
-- SÍNTOMA: desapareció la pestaña Configuración, el cambio entre sucursales y
--   el panel de dueño; el PIN 1234 entra como "administrador".
-- POR QUÉ: el menú se arma con `ver_configuracion: [ROLES.OWNER]` (sólo dueño,
--   así desde el import inicial `9a281f3`), y el cambio de sucursal y el panel
--   de dueño se activan con `adminRole === 'dueno'`.
-- QUÉ PASÓ (timestamps reales):
--   2026-08-08 16:04:50  ADMIN_1234 (rol 'dueño') inicia sesión.
--   2026-08-08 16:06:36  se crea el usuario "Abel" con rol 'administrador' y
--                        PIN 1234, junto con su cuenta auth (mismo instante).
--   en algún momento     ADMIN_1234 queda activo=false y su PIN deja de ser 1234.
--   RESULTADO: hoy el PIN 1234 resuelve a "Abel" = administrador, y el único
--   'dueño' que existe está DESACTIVADO. Por eso desaparecieron esas secciones.
--   (Comprobado: `pin_hash = crypt('1234', pin_hash)` sólo da true en "Abel".)
-- NO FUE LA AUDITORÍA: la primera migración de ese día (0056) se aplicó a las
--   16:43:00, 37 minutos después, y NINGUNA migración 0050–0060 escribe en
--   usuarios_pos (0050 sólo crea índices; 0055 sólo hace SELECT).
-- ARREGLO: devolver a "Abel" el rol de dueño. Se usa la forma con tilde
--   ('dueño'), que es la que guarda la base y la que normalizan
--   TerminalContext / permissions / Sidebar a 'dueno'.
--   Se deja su sucursal_id como está: para el dueño la app ignora ese campo
--   (`sucursalEfectiva` usa la sucursal que elige en pantalla), y para la RLS
--   `pos_is_admin()` ya devuelve true con 'dueño'.
--
-- ── B) EL "LOGO" DE LOS TICKETS ERA UNA FOTO DE CELULAR ───────────────
-- SÍNTOMA: los tickets de pastel salen con una foto en vez del logo.
-- POR QUÉ: `TicketPastelConfetti` usa `logo_ticket_url || logo_url`, y
--   logo_ticket_url apuntaba a
--   /uploads/1783902454473_j5kl40of2k.jpeg  →  JPEG 5712×4284, 3.2 MB, EXIF de
--   iPhone 15 Pro Max, tomada el 2026-07-01 16:03 y subida el 2026-07-13.
--   Es la foto de una gelatina en el mostrador, no un logo. Es de UN MES ANTES
--   de esta auditoría.
-- ARREGLO: apuntar logo_ticket_url al logo real, el mismo de `logo_url`
--   (/uploads/rehost/logo/f4168a82-…png, PNG 1254×1254 con transparencia).
--   NO se borra el archivo de la foto: sólo se deja de apuntar a él, así que
--   es reversible con el valor que queda anotado abajo.
--
-- REVERSIÓN (valores exactos anteriores):
--   update public.usuarios_pos set rol = 'administrador'
--    where id = '5c6bb5ec-a761-4228-b52a-739e92daf450';
--   update public.configuracion_negocio set logo_ticket_url =
--     'https://ivqcxdpqxwjxfohiswqb.supabase.co/storage/v1/object/public/uploads/1783902454473_j5kl40of2k.jpeg';
-- =====================================================================

-- A) Abel vuelve a ser dueño.
update public.usuarios_pos
   set rol = 'dueño'
 where id = '5c6bb5ec-a761-4228-b52a-739e92daf450'
   and rol = 'administrador';

-- B) El ticket vuelve a usar el logo real.
update public.configuracion_negocio
   set logo_ticket_url = logo_url
 where logo_ticket_url =
   'https://ivqcxdpqxwjxfohiswqb.supabase.co/storage/v1/object/public/uploads/1783902454473_j5kl40of2k.jpeg'
   and coalesce(logo_url, '') <> '';

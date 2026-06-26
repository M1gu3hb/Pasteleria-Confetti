/**
 * ensureDefaultAdmin.js
 * ----------------------
 * Garantiza que SIEMPRE exista al menos un usuario administrador para que
 * el login por PIN funcione en plantillas vacías.
 *
 * Reglas (no negociables):
 *   - Si ya existe CUALQUIER UsuarioPOS (activo o inactivo) → NO crea nada.
 *   - Si NO existe ninguno → crea ADMIN con PIN 1234, rol administrador, activo.
 *   - Idempotente: protege contra dobles ejecuciones mediante flag in-memory.
 *
 * Esto NO toca usuarios existentes, NO sobrescribe PINs, NO duplica admins.
 */

import { base44 } from '@/api/base44Client';

const DEFAULT_ADMIN = {
  nombre: 'ADMIN',
  rol: 'administrador',
  pin: '1234',
  activo: true,
  notas: 'Administrador inicial creado automáticamente. Por seguridad, cambia el PIN.',
};

// Flag de proceso: evita race conditions cuando el login se monta varias
// veces (StrictMode, hot reload, navegación rápida).
let inFlight = null;

export async function ensureDefaultAdmin() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Listamos TODOS los usuarios (activos + inactivos). Si hay siquiera
      // uno, asumimos que el admin ya fue creado/configurado y salimos.
      const all = await base44.entities.UsuarioPOS.list('-created_date', 5);
      if (Array.isArray(all) && all.length > 0) {
        return { created: false, reason: 'users_exist' };
      }
      const created = await base44.entities.UsuarioPOS.create(DEFAULT_ADMIN);
      return { created: true, user: created };
    } catch (e) {
      // Falla silenciosa: nunca queremos romper el login si por algún
      // motivo no se pudo crear. El usuario verá "Sin usuarios activos".
      console.warn('[ensureDefaultAdmin] no se pudo crear admin default:', e?.message || e);
      return { created: false, reason: 'error', error: e };
    } finally {
      // Liberamos en el próximo tick para que ejecuciones inmediatas
      // dentro del mismo microtask se beneficien del cache.
      setTimeout(() => { inFlight = null; }, 1000);
    }
  })();

  return inFlight;
}

/**
 * Detecta si el admin sigue usando el PIN default 1234 para mostrar el banner
 * "Por seguridad, cambia el PIN del administrador inicial."
 *
 * Acepta el array de usuarios ya cargado para no hacer otra query.
 */
export function isUsingDefaultAdminPin(usuarios) {
  if (!Array.isArray(usuarios)) return false;
  return usuarios.some(u =>
    u?.rol === 'administrador' &&
    u?.activo !== false &&
    u?.pin === '1234'
  );
}
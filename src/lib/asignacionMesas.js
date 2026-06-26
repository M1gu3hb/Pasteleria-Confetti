// Helpers para el módulo de asignación de mesas a meseros.
// Reglas clave:
// - Si config.asignacion_mesas_activa = true, cada mesa es de su mesero_asignado.
// - Si false, todos los meseros ven todas las mesas y la mesa muestra atendido_por.
// - silenciar_notificaciones_admin: admin no escucha audio/voz.

import { ROLES } from './constants';

// Paleta estable (visible sobre fondo claro).
const COLOR_POOL = [
  '#1E5FCF', // azul
  '#16A34A', // verde
  '#E63946', // rojo
  '#9B5DE5', // morado
  '#E68A33', // naranja
  '#0EA5B7', // turquesa
  '#D946AB', // magenta
  '#B45309', // ámbar oscuro
  '#3F6212', // oliva
  '#7C3AED', // violeta
  '#0369A1', // azul marino
  '#BE185D', // fucsia
];

/**
 * Hash determinístico de string a entero positivo.
 */
function hashStr(s) {
  const str = String(s || '');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Color HEX estable para un usuario: usa user.color si existe; si no,
 * deriva uno de la paleta según id+nombre. No cambia entre cargas.
 */
export function colorParaUsuario(user) {
  if (!user) return '#64748b';
  if (typeof user.color === 'string' && user.color.startsWith('#')) return user.color;
  const key = (user.id || '') + '|' + (user.nombre || '');
  const idx = hashStr(key) % COLOR_POOL.length;
  return COLOR_POOL[idx];
}

/**
 * Lee del config si la asignación está activa.
 */
export function asignacionActiva(config) {
  return config?.asignacion_mesas_activa === true;
}

/**
 * Lee del config si las notificaciones del admin deben silenciarse.
 * Default: true (silenciado).
 */
export function adminSilenciado(config) {
  return config?.silenciar_notificaciones_admin !== false;
}

/**
 * ¿Este usuario debe escuchar audio/voz?
 * - Admin: depende de silenciar_notificaciones_admin.
 * - Otros roles: siempre sí.
 */
export function debeEscucharAudio(posUser, config) {
  if (!posUser) return false;
  if (posUser.rol === ROLES.ADMIN) return !adminSilenciado(config);
  return true;
}

/**
 * Filtra el array de mesas según el rol y la configuración.
 *
 * - Admin: ve TODO.
 * - Mesero con asignación activa: solo sus mesas asignadas.
 * - Mesero sin asignación: ve todas.
 * - Otros roles: array vacío (los demás no usan esta función).
 */
export function filtrarMesasParaUsuario(mesas, posUser, config) {
  const arr = Array.isArray(mesas) ? mesas : [];
  if (!posUser) return arr;
  if (posUser.rol === ROLES.ADMIN) return arr;
  if (posUser.rol !== ROLES.WAITER) return arr;
  if (!asignacionActiva(config)) return arr;
  const myId = posUser.id;
  return arr.filter(m => m?.mesero_asignado_id && m.mesero_asignado_id === myId);
}

/**
 * Filtra solicitudes QR para el panel del mesero según el ruteo y rol.
 *
 * - Admin: ve TODAS.
 * - Mesero con asignación activa: solo solicitudes cuyo mesero_destino_id sea él
 *   o sin destino (sin asignar).
 * - Mesero sin asignación: ve todas (cola general).
 */
export function filtrarSolicitudesParaUsuario(solicitudes, posUser, config) {
  const arr = Array.isArray(solicitudes) ? solicitudes : [];
  if (!posUser) return arr;
  if (posUser.rol === ROLES.ADMIN) return arr;
  if (posUser.rol !== ROLES.WAITER) return [];
  if (!asignacionActiva(config)) return arr;
  return arr.filter(s =>
    !s?.mesero_destino_id || s.mesero_destino_id === posUser.id
  );
}

/**
 * ¿La voz puede decir el nombre del mesero?
 * Solo si la asignación está activa Y la solicitud tiene destino claro.
 */
export function debeUsarNombreEnVoz(config, solicitud) {
  if (!asignacionActiva(config)) return false;
  if (!solicitud) return true; // genérico con asignación activa también puede usar nombre
  return !!solicitud.mesero_destino_id;
}

/**
 * Texto visual del responsable actual de una mesa según modo.
 */
export function responsableTexto(mesa, config) {
  if (!mesa) return '';
  if (asignacionActiva(config)) {
    return mesa.mesero_asignado_nombre
      ? `Mesero: ${mesa.mesero_asignado_nombre}`
      : 'Sin mesero asignado';
  }
  if (mesa.atendido_por_nombre) return `Atiende: ${mesa.atendido_por_nombre}`;
  return '';
}

/**
 * Color del responsable actual (para banda visual).
 */
export function responsableColor(mesa, config) {
  if (!mesa) return null;
  if (asignacionActiva(config)) return mesa.mesero_asignado_color || null;
  return mesa.atendido_por_color || null;
}

/**
 * Devuelve el id/nombre del mesero responsable de una mesa según el modo:
 * - Asignación activa: mesero_asignado_*
 * - Sin asignación: atendido_por_*
 * Si no hay, devuelve null.
 */
export function resolverMeseroResponsable(mesa, config) {
  if (!mesa) return null;
  if (asignacionActiva(config)) {
    if (!mesa.mesero_asignado_id) return null;
    return {
      id: mesa.mesero_asignado_id,
      nombre: mesa.mesero_asignado_nombre || '',
      color: mesa.mesero_asignado_color || null,
    };
  }
  if (!mesa.atendido_por_id) return null;
  return {
    id: mesa.atendido_por_id,
    nombre: mesa.atendido_por_nombre || '',
    color: mesa.atendido_por_color || null,
  };
}

/**
 * Limpia solicitudes QR de días anteriores (estado terminal o no).
 * - Borra solicitudes cuyo fecha_creacion sea anterior al inicio del día operativo de hoy.
 * - Respeta hora_inicio_dia_operativo de config si existe; si no, usa medianoche local.
 * - No toca ventas, mesas, pedidos ni cortes.
 * Devuelve { borradas: number }
 */
export async function cleanupOldSolicitudes(base44, config) {
  try {
    const horaIni = (config?.hora_inicio_dia_operativo || '00:00').split(':');
    const hh = parseInt(horaIni[0]) || 0;
    const mm = parseInt(horaIni[1]) || 0;
    const ahora = new Date();
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(hh, mm, 0, 0);
    // Si la hora de inicio de hoy es futura (ej. 06:00 y son las 02:00),
    // el día operativo actual empezó ayer a esa hora.
    if (inicioHoy.getTime() > ahora.getTime()) {
      inicioHoy.setDate(inicioHoy.getDate() - 1);
    }
    const cutoff = inicioHoy.toISOString();
    // Pedimos lote acotado (las viejas suelen ser pocas; protegemos memoria).
    const todas = await base44.entities.SolicitudQR.list('-created_date', 500).catch(() => []);
    const viejas = (Array.isArray(todas) ? todas : []).filter(s => {
      const f = s?.fecha_creacion || s?.created_date;
      return f && f < cutoff;
    });
    let borradas = 0;
    for (const s of viejas) {
      try {
        await base44.entities.SolicitudQR.delete(s.id);
        borradas++;
      } catch {}
    }
    return { borradas };
  } catch (err) {
    console.warn('[cleanupOldSolicitudes] falló:', err);
    return { borradas: 0 };
  }
}
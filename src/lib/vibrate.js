/**
 * Helper de vibración móvil — fallback cuando el audio está bloqueado.
 *
 * navigator.vibrate solo funciona en:
 *  - Android Chrome / Firefox / Edge.
 *  - iOS NO lo soporta (Apple lo desactivó). En iOS el fallback queda en visual.
 *
 * NO requiere permisos. NO falla si no está disponible — simplemente no vibra.
 *
 * Patrones predefinidos:
 *  - short:   un buzz corto (200ms)
 *  - double:  dos buzzes (200, pausa, 200)
 *  - alert:   tres buzzes (150, 80, 150, 80, 250) — para alerta urgente
 */

const PATTERNS = {
  short: [200],
  double: [200, 100, 200],
  alert: [150, 80, 150, 80, 250],
};

/**
 * Hace vibrar el dispositivo si está disponible.
 * No lanza errores. Devuelve true si vibró, false si no se pudo.
 */
export function vibrate(pattern = 'short') {
  try {
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.vibrate !== 'function') return false;
    const p = Array.isArray(pattern) ? pattern : (PATTERNS[pattern] || PATTERNS.short);
    return navigator.vibrate(p) === true;
  } catch {
    return false;
  }
}

/**
 * ¿Está disponible la API de vibración?
 * Útil para mostrar UI condicional (ej. "Tu dispositivo vibrará al recibir alertas").
 */
export function isVibrationSupported() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  } catch {
    return false;
  }
}
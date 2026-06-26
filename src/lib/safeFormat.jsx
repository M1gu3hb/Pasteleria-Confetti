import { format as fnsFormat } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formato seguro de fechas. Si el input es inválido o nulo, devuelve fallback.
 * Evita que `format()` de date-fns lance "Invalid Date" y rompa el render.
 */
export function safeFormatDate(input, pattern = "d MMM yyyy, HH:mm", fallback = '—') {
  if (!input) return fallback;
  try {
    const d = input instanceof Date ? input : new Date(input);
    if (!d || isNaN(d.getTime())) return fallback;
    return fnsFormat(d, pattern, { locale: es });
  } catch {
    return fallback;
  }
}

/** Convierte input a número de forma segura. */
export function safeNumber(input, fallback = 0) {
  if (input === null || input === undefined || input === '') return fallback;
  const n = typeof input === 'number' ? input : parseFloat(input);
  return isNaN(n) ? fallback : n;
}

/** toFixed protegido contra undefined/NaN/string. */
export function safeToFixed(input, digits = 2, fallback = '0.00') {
  const n = safeNumber(input, NaN);
  if (isNaN(n)) return fallback;
  return n.toFixed(digits);
}
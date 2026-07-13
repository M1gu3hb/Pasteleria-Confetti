/**
 * Mapa ÚNICO color ↔ sucursal (por nombre). Centraliza la paleta que antes estaba
 * hardcodeada/duplicada en `PedidoPastelCard` (chip de sucursal). La usan tanto la card
 * como los tabs de sucursal del modo pastelero (FASE 1) — una sola fuente de verdad.
 *
 * Coincidencia por NOMBRE (`includes`) igual que la card original (robusto ante
 * variaciones tipo "San Gregorio"/"Gregorio").
 */

const PALETAS = [
  { match: 'Xochimilco', badge: 'bg-blue-50 text-blue-700 border-blue-200',   activo: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-600 hover:text-white' },
  { match: 'Topilejo',   badge: 'bg-green-50 text-green-700 border-green-200', activo: 'bg-green-600 text-white border-green-600 hover:bg-green-600 hover:text-white' },
  { match: 'Gregorio',   badge: 'bg-amber-50 text-amber-700 border-amber-200', activo: 'bg-amber-600 text-white border-amber-600 hover:bg-amber-600 hover:text-white' },
];
const DEFECTO = { badge: 'bg-slate-50 text-slate-600 border-slate-200', activo: 'bg-slate-600 text-white border-slate-600 hover:bg-slate-600 hover:text-white' };

/** Paleta completa (`badge` claro + `activo` sólido) de una sucursal, por su nombre. */
export function paletaSucursal(nombre) {
  const n = nombre || '';
  return PALETAS.find((p) => n.includes(p.match)) || DEFECTO;
}

/** Clases del chip/badge de sucursal (idéntico a lo que ya usaba `PedidoPastelCard`). */
export function badgeSucursal(nombre) {
  return paletaSucursal(nombre).badge;
}

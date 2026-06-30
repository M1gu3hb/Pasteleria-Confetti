// Extras genéricos del pedido de pastel.
// Antes los extras vivían en 4 columnas fijas (incluye_base/oblea/muneca/velas
// + precio_*). Ahora los extras son configurables (N extras) y se guardan como
// una lista JSON en `pedidos.extras_seleccionados` = [{ id, nombre, precio }].
//
// Estas utilidades preservan la RETRO-COMPATIBILIDAD: si un pedido NO trae
// `extras_seleccionados` (pedidos históricos), se reconstruye la lista desde las
// 4 columnas viejas. Así el ticket/detalle/PDF muestran lo mismo que antes.

// IDs de los 4 extras "clásicos" que viven en columnas fijas de `pedidos`.
export const LEGACY_EXTRAS = [
  { id: 'base', nombre: 'Pastel de base', flag: 'incluye_base', precio: 'precio_base' },
  { id: 'oblea', nombre: 'Oblea', flag: 'incluye_oblea', precio: 'precio_oblea' },
  { id: 'muneca', nombre: 'Muñeca', flag: 'incluye_muneca', precio: 'precio_muneca' },
  { id: 'velas', nombre: 'Velas', flag: 'incluye_velas', precio: 'precio_velas' },
];

const LEGACY_IDS = new Set(LEGACY_EXTRAS.map((e) => e.id));

// Devuelve los extras elegidos de un pedido como [{ id, nombre, precio }].
// Fuente preferida: `extras_seleccionados` (jsonb → array, o string JSON).
// Fallback (pedidos viejos / sin lista): las 4 columnas fijas.
export function resolverExtrasPedido(pedido) {
  if (!pedido) return [];
  const lista = parseExtrasSeleccionados(pedido.extras_seleccionados);
  if (lista.length > 0) {
    return lista.map((e) => ({
      id: e.id ?? e.nombre,
      nombre: String(e.nombre ?? e.id ?? '').trim(),
      precio: Number(e.precio) || 0,
    }));
  }
  // Fallback retro-compatible: reconstruir desde columnas fijas.
  return LEGACY_EXTRAS
    .filter((e) => pedido[e.flag] === true)
    .map((e) => ({ id: e.id, nombre: e.nombre, precio: Number(pedido[e.precio]) || 0 }));
}

// Normaliza el campo `extras_seleccionados` (array jsonb o string) a array.
export function parseExtrasSeleccionados(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

export { LEGACY_IDS };

/**
 * Helpers de normalización y detección de duplicados para PRODUCTOS y CATEGORÍAS.
 *
 * Mismo criterio que ingredienteMatcher pero para ProductoTerminado y CategoriaProducto.
 * NO modifica entidades. Solo provee comparación tolerante para evitar duplicados
 * durante importaciones masivas.
 */

export function normalizarNombreProducto(nombre) {
  if (!nombre || typeof nombre !== 'string') return '';
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizarNombreCategoria(nombre) {
  return normalizarNombreProducto(nombre);
}

export function buscarProductoPorNombre(nombre, productos = []) {
  const t = normalizarNombreProducto(nombre);
  if (!t || !Array.isArray(productos)) return null;
  return productos.find((p) => normalizarNombreProducto(p?.nombre) === t) || null;
}

export function buscarCategoriaPorNombre(nombre, categorias = []) {
  const t = normalizarNombreCategoria(nombre);
  if (!t || !Array.isArray(categorias)) return null;
  return categorias.find((c) => normalizarNombreCategoria(c?.nombre) === t) || null;
}

export function construirMapaProductos(productos = []) {
  const map = new Map();
  if (!Array.isArray(productos)) return map;
  for (const p of productos) {
    const k = normalizarNombreProducto(p?.nombre);
    if (k) map.set(k, p);
  }
  return map;
}
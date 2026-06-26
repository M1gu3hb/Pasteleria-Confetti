/**
 * INGREDIENTE MATCHER — Fuente única de normalización y detección de duplicados.
 *
 * Por qué existe:
 *  Antes el sistema podía crear "Pan", "pan", "PAN", " Pan ", "Pán" como
 *  ingredientes distintos. Esto rompía inventario, recetas y costos.
 *  Este helper centraliza la lógica de comparación para que TODOS los flujos
 *  (Compras, Inventario inicial, Autocomplete) usen el mismo criterio.
 *
 * NO toca: schemas, lógica financiera, costos, ventas, caja, cocina, tickets.
 */

/**
 * Normaliza un nombre de ingrediente para comparación:
 *  - quita acentos (NFD)
 *  - trim de espacios
 *  - colapsa espacios dobles
 *  - case-insensitive
 */
export function normalizarNombreIngrediente(nombre) {
  if (!nombre || typeof nombre !== 'string') return '';
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .trim()
    .replace(/\s+/g, ' ')             // colapsar espacios
    .toLowerCase();
}

/**
 * Busca un ingrediente existente cuyo nombre coincida con el nombre dado,
 * usando comparación normalizada. Devuelve el objeto Ingrediente o null.
 *
 * IMPORTANTE: busca en TODOS los ingredientes (activos + inactivos) si la lista
 * los incluye. Quien llama decide si filtrar inactivos o reactivarlos.
 *
 * @param {string} nombre — nombre a buscar (sin normalizar)
 * @param {Array} ingredientes — lista completa de ingredientes
 * @returns {Object|null}
 */
export function buscarIngredientePorNombre(nombre, ingredientes = []) {
  const target = normalizarNombreIngrediente(nombre);
  if (!target) return null;
  if (!Array.isArray(ingredientes)) return null;
  return ingredientes.find(i => normalizarNombreIngrediente(i?.nombre) === target) || null;
}

/**
 * Crea un Map<nombreNormalizado, Ingrediente> a partir de una lista.
 * Lo usan los diálogos de compra/inventario inicial para mantener un
 * estado "en-vuelo" durante el submit y evitar duplicados entre líneas
 * de la misma operación (ej. Línea 1 = "Pan", Línea 2 = "PAN", Línea 3 = "Pán"
 * deben terminar todas en el mismo ingrediente).
 */
export function construirMapaIngredientes(ingredientes = []) {
  const map = new Map();
  if (!Array.isArray(ingredientes)) return map;
  for (const i of ingredientes) {
    const key = normalizarNombreIngrediente(i?.nombre);
    if (key) map.set(key, i);
  }
  return map;
}
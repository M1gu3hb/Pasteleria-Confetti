// Helpers para manejo de categorías de productos.
// Fuente única de verdad: entity `CategoriaProducto`.
// Este módulo solo provee normalización y resolución segura — NUNCA borra,
// NUNCA toca productos, NUNCA toca recetas. Es 100 % "category-only".

/**
 * Normaliza visualmente un nombre: trim + colapsa espacios internos.
 * Conserva acentos y mayúsculas/minúsculas que escriba el admin.
 */
export function normalizeCategoryName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Llave canónica para comparar categorías evitando duplicados:
 *  - minúsculas
 *  - sin acentos
 *  - sin espacios extra
 * "Cafés", "cafes", "  CAFÉS  " → "cafes"
 */
export function categoryKey(name) {
  const n = normalizeCategoryName(name);
  if (!n) return '';
  try {
    return n
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  } catch {
    return n.toLowerCase();
  }
}

/**
 * De una lista de strings (texto separado por coma) → array normalizado
 * sin vacíos y sin duplicados por categoryKey.
 */
export function parseCategoryList(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const raw of text.split(',')) {
    const n = normalizeCategoryName(raw);
    if (!n) continue;
    const k = categoryKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * De un array de CategoriaProducto → texto separado por coma legible.
 */
export function categoriasToText(categorias) {
  const arr = Array.isArray(categorias) ? categorias : [];
  return arr
    .map(c => c?.nombre || '')
    .filter(Boolean)
    .join(', ');
}

/**
 * Busca una CategoriaProducto existente por nombre, tolerante a
 * mayúsculas/minúsculas/acentos/espacios.
 *
 * @returns {object|null} la categoría existente o null
 */
export function findExistingCategoria(nombre, categorias) {
  const k = categoryKey(nombre);
  if (!k) return null;
  const arr = Array.isArray(categorias) ? categorias : [];
  return arr.find(c => categoryKey(c?.nombre) === k) || null;
}

/**
 * Asegura que exista una CategoriaProducto con ese nombre.
 * - Si ya existe (tolerante a casing/espacios/acentos): devuelve la existente
 *   y opcionalmente reactiva si estaba activo=false.
 * - Si no existe: la crea.
 *
 * NUNCA borra ni renombra categorías existentes.
 * NUNCA toca productos ni recetas.
 *
 * @param {*} base44   cliente sdk
 * @param {string} nombre  nombre legible
 * @param {object} opts  { reactivate=true, orden, color }
 * @returns {Promise<object>} la categoría (existente o creada)
 */
export async function ensureCategoriaExists(base44, nombre, opts = {}) {
  const n = normalizeCategoryName(nombre);
  if (!n) throw new Error('El nombre de la categoría no puede estar vacío');

  // 1) Buscar en BD (puede existir aunque esté inactiva)
  const todas = await base44.entities.CategoriaProducto.list().catch(() => []);
  const existente = findExistingCategoria(n, todas);
  if (existente) {
    // Reactivar suavemente si estaba inactiva
    if (existente.activo === false && opts.reactivate !== false) {
      try {
        await base44.entities.CategoriaProducto.update(existente.id, { activo: true });
      } catch {}
      return { ...existente, activo: true };
    }
    return existente;
  }

  // 2) Crear
  const maxOrden = (Array.isArray(todas) ? todas : []).reduce(
    (m, c) => Math.max(m, Number(c?.orden) || 0),
    0
  );
  const payload = {
    nombre: n,
    color: opts.color || '#4A5568',
    orden: Number.isFinite(opts.orden) ? opts.orden : maxOrden + 1,
    activo: true,
  };
  return await base44.entities.CategoriaProducto.create(payload);
}
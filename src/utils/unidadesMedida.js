// =====================================================
// Helpers de UNIDADES DE MEDIDA — fuente única
// =====================================================
// - Lista del admin desde ConfiguracionNegocio.unidades_medida_lista
// - Alias tolerantes (kg/kilogramo/kilo, l/lt/litro, pza/pzas/pieza, etc.)
// - Clasificación: estándar (conversión segura) vs personalizada (requiere equivalencia)
// - Validación de compatibilidad entre unidad capturada y unidad base
// NO toca lógica financiera, NO toca cálculo de costos.

const DEFAULT_UNIDADES_COMPRA = [
  'kg', 'g', 'litro', 'ml', 'pieza', 'caja', 'paquete', 'bolsa', 'unidad',
];

// Unidades base estrictas — NUNCA se amplían (son las que la lógica del POS sabe consumir).
export const UNIDADES_BASE = [
  { value: 'g', label: 'gramos (g)' },
  { value: 'ml', label: 'mililitros (ml)' },
  { value: 'pieza', label: 'pieza' },
];

/**
 * Normaliza una unidad: trim + lowercase + colapsa espacios + quita acentos
 * para comparar alias. Lo usado para identificar la unidad canónica.
 */
export function normalizeUnidad(u) {
  if (typeof u !== 'string') return '';
  const t = u.trim().replace(/\s+/g, ' ').toLowerCase();
  try {
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return t;
  }
}

/**
 * Alias → identificador canónico.
 * Las claves son normalizeUnidad(alias). El valor es la unidad estándar que se usa
 * internamente (kg, g, litro, ml, pieza). Cualquier unidad que NO esté aquí se
 * considera PERSONALIZADA (empaque) y requiere equivalencia explícita.
 */
const ALIAS_MAP = {
  // Masa
  'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'kilogramo': 'kg', 'kilogramos': 'kg',
  'g': 'g', 'gr': 'g', 'gramo': 'g', 'gramos': 'g',
  // Volumen
  'l': 'litro', 'lt': 'litro', 'lts': 'litro', 'litro': 'litro', 'litros': 'litro',
  'ml': 'ml', 'mililitro': 'ml', 'mililitros': 'ml',
  // Conteo
  'pza': 'pieza', 'pzas': 'pieza', 'pz': 'pieza',
  'pieza': 'pieza', 'piezas': 'pieza',
  'unidad': 'pieza', 'unidades': 'pieza', 'und': 'pieza', 'u': 'pieza',
};

/**
 * Devuelve el identificador canónico (kg/g/litro/ml/pieza) o null si la unidad
 * es personalizada / desconocida.
 */
export function canonicalUnidad(u) {
  const k = normalizeUnidad(u);
  return ALIAS_MAP[k] || null;
}

/**
 * Indica si una unidad es ESTÁNDAR (conversión segura sin equivalencia).
 * Las que NO lo son requieren que el usuario indique cuánto trae en unidad base.
 * Nota: 'caja', 'paquete', 'bolsa' también son empaques (requieren equivalencia).
 */
export function esUnidadEstandar(u) {
  return canonicalUnidad(u) !== null;
}

/**
 * Devuelve qué unidad base produce una unidad canónica:
 *   kg/g → 'g'
 *   litro/ml → 'ml'
 *   pieza → 'pieza'
 *   personalizada → null (depende de la equivalencia que ingrese el usuario)
 */
export function unidadBaseDe(u) {
  const canon = canonicalUnidad(u);
  if (canon === 'kg' || canon === 'g') return 'g';
  if (canon === 'litro' || canon === 'ml') return 'ml';
  if (canon === 'pieza') return 'pieza';
  return null;
}

/**
 * Compatibilidad entre unidad capturada y unidad base del ingrediente.
 *
 * Reglas:
 *  - Si la unidad capturada es ESTÁNDAR: tiene que producir la misma unidad base.
 *    Ej: ingrediente en `g` → válido kg/g; inválido litro/ml/pieza.
 *  - Si la unidad capturada es PERSONALIZADA: SIEMPRE válida, pero el caller debe
 *    pedir equivalencia (qtyBase por unidad) y la unidad base la dicta el ingrediente.
 *
 * @returns { compatible: boolean, mensaje: string | null }
 */
export function validarCompatibilidad(unidadCaptura, unidadBase) {
  if (!unidadCaptura || !unidadBase) {
    return { compatible: false, mensaje: 'Falta unidad o unidad base.' };
  }
  const canon = canonicalUnidad(unidadCaptura);
  if (!canon) {
    // Personalizada: la equivalencia la traduce a la base. Compatible siempre.
    return { compatible: true, mensaje: null };
  }
  const baseProducida = unidadBaseDe(unidadCaptura);
  if (baseProducida === unidadBase) {
    return { compatible: true, mensaje: null };
  }
  // Mensaje específico según tipo de ingrediente
  const tipoLegible = unidadBase === 'g'
    ? 'gramos'
    : unidadBase === 'ml'
      ? 'mililitros'
      : 'piezas';
  return {
    compatible: false,
    mensaje: `La unidad seleccionada no coincide con la unidad base del ingrediente. Este ingrediente se maneja en ${tipoLegible}.`,
  };
}

/**
 * Convierte una cantidad capturada a unidad base.
 *
 * @param {number} qty Cantidad capturada
 * @param {string} unidadCaptura kg/g/litro/ml/pieza o personalizada
 * @param {number} equivalencia Para unidades personalizadas: cuánto trae 1 unidad
 *                              expresado en unidad base (p.ej. 1 garrafón = 20000 ml → 20000)
 *                              Para empaques estándar (caja/paquete/bolsa) también se usa.
 * @returns {number} cantidad en unidad base
 */
export function convertirAUnidadBase(qty, unidadCaptura, equivalencia = 1) {
  const cantidad = Number(qty) || 0;
  const canon = canonicalUnidad(unidadCaptura);
  if (canon === 'kg') return cantidad * 1000;       // kg → g
  if (canon === 'g') return cantidad * 1;
  if (canon === 'litro') return cantidad * 1000;    // litro → ml
  if (canon === 'ml') return cantidad * 1;
  if (canon === 'pieza') return cantidad * 1;
  // Personalizada: usar equivalencia
  const eq = Number(equivalencia) || 0;
  return cantidad * eq;
}

/**
 * Parsea texto separado por coma → array único (case-insensitive) y sin vacíos.
 */
export function parseUnidadesList(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const raw of text.split(',')) {
    const n = normalizeUnidad(raw);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    // Conservamos la versión visible original (trim, sin lowercase) — más legible.
    out.push(raw.trim().replace(/\s+/g, ' '));
  }
  return out;
}

/**
 * Devuelve las unidades de compra disponibles, desde config + default.
 * Las del default siempre están disponibles (la conversión depende de ellas).
 * Se dedupe por normalizeUnidad — "Kg", "kg" y "KG" se consideran la misma.
 */
export function getUnidadesCompra(config) {
  const fromConfig = parseUnidadesList(config?.unidades_medida_lista || '');
  const merged = [...fromConfig, ...DEFAULT_UNIDADES_COMPRA];
  const seen = new Set();
  const out = [];
  for (const u of merged) {
    const k = normalizeUnidad(u);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

export { DEFAULT_UNIDADES_COMPRA };
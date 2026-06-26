// =====================================================
// utils/exclusionesUtils.js
// =====================================================
// PASO B — Helpers para procesar ingredientes excluidos ("SIN ingrediente")
// guardados en DetalleVenta.ingredientes_excluidos_snapshot.
//
// Contexto:
//   - Mesero marca "SIN tocino" en un producto.
//   - El snapshot estructurado se persiste en DetalleVenta:
//       ingredientes_excluidos_snapshot (JSON string)
//   - Al cobrar, Caja DEBE:
//       1) NO bloquear el cobro por falta de tocino.
//       2) NO descontar tocino de inventario.
//       3) Descontar el resto de la receta normalmente.
//
// Este módulo es PURO (no toca BD, no toca caché, no lanza).
// Devuelve estructuras seguras incluso si el snapshot es inválido.
// =====================================================

/**
 * Normaliza un texto: minúsculas + sin acentos + trim.
 * Permite hacer match por nombre como fallback cuando el id no coincide
 * (caso muy raro: el ingrediente fue renombrado o re-creado tras enviar el pedido).
 */
function normalize(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Parsea el campo `ingredientes_excluidos_snapshot` de un DetalleVenta
 * y devuelve dos sets defensivos:
 *   - ids:     Set<string>   ingrediente_id excluidos (match primario)
 *   - nombres: Set<string>   nombres normalizados (match fallback)
 *
 * Acepta string JSON, array directo, null, undefined, basura → siempre devuelve sets vacíos.
 *
 * @param {string|Array|null|undefined} raw
 * @returns {{ ids: Set<string>, nombres: Set<string> }}
 */
export function parseIngredientesExcluidos(raw) {
  try {
    if (!raw) return { ids: new Set(), nombres: new Set() };
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const safeArr = Array.isArray(arr) ? arr : [];

    return {
      ids: new Set(
        safeArr
          .map(e => String(e?.ingrediente_id || '').trim())
          .filter(Boolean)
      ),
      nombres: new Set(
        safeArr
          .map(e => normalize(e?.ingrediente_nombre))
          .filter(Boolean)
      ),
    };
  } catch (err) {
    // Snapshot inválido (JSON malformado, etc.) → fallback seguro:
    // no excluir nada, conservar comportamiento anterior.
    console.warn('[exclusionesUtils] ingredientes_excluidos_snapshot inválido:', err?.message || err);
    return { ids: new Set(), nombres: new Set() };
  }
}

/**
 * Decide si una línea de receta (RecetaEscandallo) está excluida según
 * el snapshot de exclusiones del detalle.
 *
 * Match:
 *   - Por ingrediente_id (primario).
 *   - Por nombre normalizado (fallback).
 *
 * @param {object} linea      RecetaEscandallo con ingrediente_id / ingrediente_nombre
 * @param {{ids:Set, nombres:Set}} excluidos
 * @returns {boolean}
 */
export function recetaLineaEstaExcluida(linea, excluidos) {
  if (!linea || !excluidos) return false;
  const id = String(linea?.ingrediente_id || '').trim();
  const nombre = normalize(linea?.ingrediente_nombre);

  return (
    (id && excluidos.ids.has(id)) ||
    (nombre && excluidos.nombres.has(nombre))
  );
}
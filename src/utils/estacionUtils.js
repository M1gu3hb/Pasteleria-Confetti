// Helpers para el manejo de Estaciones de Preparación (F1).
//
// Fuente única: entity `EstacionPreparacion`.
//
// Reglas de oro:
//  - NUNCA borra registros (soft-delete vía activo:false).
//  - NUNCA toca productos, recetas, inventario, ventas, cocina ni pedidos.
//  - Solo normaliza nombres y busca duplicados de forma segura.

/**
 * Trim + colapsa espacios. Conserva acentos y mayúsculas del usuario.
 */
export function normalizeEstacionName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Llave canónica de comparación: minúsculas, sin acentos, sin espacios extra.
 * "Barra", " barra ", "BARRA", "bárra" → "barra"
 */
export function estacionKey(name) {
  const n = normalizeEstacionName(name);
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
 * Busca una estación existente por nombre, tolerante a casing/acentos/espacios.
 */
export function findExistingEstacion(nombre, estaciones) {
  const k = estacionKey(nombre);
  if (!k) return null;
  const arr = Array.isArray(estaciones) ? estaciones : [];
  return arr.find((e) => estacionKey(e?.nombre) === k) || null;
}

/**
 * Nombre constante de la estación "Cocina general" (fallback).
 * No usar en BD como ID — usar `es_general:true` para identificarla.
 */
export const COCINA_GENERAL_NOMBRE = 'Cocina general';
export const COCINA_GENERAL_COLOR = '#4A5568';
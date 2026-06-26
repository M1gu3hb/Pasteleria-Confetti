// =====================================================
// utils/preparacionEstacionUtils.js
// =====================================================
// F3: Resolución Producto → Categoría → EstacionPreparacion.
//
// Reglas críticas:
//  - Si `estaciones_preparacion_activas` !== true, devuelve null (modo legacy).
//  - Nunca lanza excepciones — siempre devuelve un objeto seguro.
//  - Si no hay categoría / no hay estación / no hay Cocina general, cae a un
//    fallback nombrado "Cocina general" con color gris e id vacío. La cocina
//    filtrada lo agrupa como "general".
//  - Solo lee snapshots ya almacenados en CategoriaProducto (F1):
//    estacion_preparacion_id / nombre / color.
//  - NO toca BD ni inventario.
// =====================================================

import { COCINA_GENERAL_NOMBRE, COCINA_GENERAL_COLOR, estacionKey } from '@/utils/estacionUtils';

/**
 * Buscar categoría por id o por nombre normalizado.
 * Devuelve null si no se encuentra.
 */
function findCategoriaForProducto(producto, categorias) {
  const cats = Array.isArray(categorias) ? categorias : [];
  if (!producto) return null;
  // 1) Match por id
  if (producto.categoria_id) {
    const byId = cats.find((c) => c?.id === producto.categoria_id);
    if (byId) return byId;
  }
  // 2) Match por nombre normalizado (productos legacy sin categoria_id)
  if (producto.categoria_nombre) {
    const k = estacionKey(producto.categoria_nombre);
    if (k) {
      const byName = cats.find((c) => estacionKey(c?.nombre) === k);
      if (byName) return byName;
    }
  }
  return null;
}

/**
 * Buscar la estación "Cocina general" entre las estaciones activas.
 * Si no existe, devuelve un objeto sintético con id vacío.
 */
function findCocinaGeneral(estaciones) {
  const arr = Array.isArray(estaciones) ? estaciones : [];
  // Prioridad 1: la marcada con es_general:true
  const general = arr.find((e) => e?.es_general === true && e?.activo !== false);
  if (general) {
    return {
      estacion_preparacion_id: general.id || '',
      estacion_preparacion_nombre: general.nombre || COCINA_GENERAL_NOMBRE,
      estacion_preparacion_color: general.color || COCINA_GENERAL_COLOR,
      _isFallback: false,
    };
  }
  // Prioridad 2: cualquier estación con nombre que coincida
  const byName = arr.find((e) => estacionKey(e?.nombre) === estacionKey(COCINA_GENERAL_NOMBRE));
  if (byName) {
    return {
      estacion_preparacion_id: byName.id || '',
      estacion_preparacion_nombre: byName.nombre || COCINA_GENERAL_NOMBRE,
      estacion_preparacion_color: byName.color || COCINA_GENERAL_COLOR,
      _isFallback: false,
    };
  }
  // Fallback sintético: id vacío indica "sin estación creada"
  return {
    estacion_preparacion_id: '',
    estacion_preparacion_nombre: COCINA_GENERAL_NOMBRE,
    estacion_preparacion_color: COCINA_GENERAL_COLOR,
    _isFallback: true,
  };
}

/**
 * Resuelve la estación para un producto dado.
 *
 * @param {Object} producto      ProductoTerminado (o item de carrito con id/categoria_id/categoria_nombre).
 * @param {Array}  categorias    Lista de CategoriaProducto (todas las activas).
 * @param {Array}  estaciones    Lista de EstacionPreparacion (todas las activas).
 * @param {Object} config        Configuración del negocio.
 *
 * @returns {null | {estacion_preparacion_id, estacion_preparacion_nombre, estacion_preparacion_color, _isFallback}}
 *   null cuando estaciones están apagadas (modo legacy).
 */
export function resolverEstacionParaProducto(producto, categorias, estaciones, config) {
  // Modo legacy: estaciones apagadas → null
  if (!config || config.estaciones_preparacion_activas !== true) return null;

  const estacionesArr = Array.isArray(estaciones) ? estaciones.filter((e) => e?.activo !== false) : [];

  // Si no hay categoría asociable → Cocina general
  const cat = findCategoriaForProducto(producto, categorias);
  if (!cat) return findCocinaGeneral(estacionesArr);

  // Si la categoría tiene estación asignada y existe en activas, usarla.
  const catEstId = cat.estacion_preparacion_id;
  if (catEstId) {
    const est = estacionesArr.find((e) => e?.id === catEstId);
    if (est) {
      return {
        estacion_preparacion_id: est.id,
        estacion_preparacion_nombre: est.nombre || COCINA_GENERAL_NOMBRE,
        estacion_preparacion_color: est.color || COCINA_GENERAL_COLOR,
        _isFallback: false,
      };
    }
    // La estación ya no existe / fue desactivada → caer a Cocina general
    return findCocinaGeneral(estacionesArr);
  }

  // Categoría sin estación → Cocina general
  return findCocinaGeneral(estacionesArr);
}

/**
 * Agrupa items por estación. Devuelve un Map<idEstacion, {info, items}>
 * donde `info` incluye los snapshots y `items` es el array de items
 * tal cual fueron pasados (no se mutan).
 *
 * Clave del Map:
 *  - estacion_preparacion_id si tiene
 *  - 'general' si es fallback Cocina general sin id
 *
 * @param {Array} items   items con shape {id, categoria_id, categoria_nombre, ...}
 * @param {Object} productosMap   Map opcional id → producto fresco (para mejor resolución)
 * @param {Array} categorias
 * @param {Array} estaciones
 * @param {Object} config
 */
export function agruparItemsPorEstacion(items, productosMap, categorias, estaciones, config) {
  const arr = Array.isArray(items) ? items : [];
  const groups = new Map();
  arr.forEach((item) => {
    // Resolver con producto fresco si está disponible
    const productoBase = (productosMap && item?.id && productosMap.get) ? (productosMap.get(item.id) || item) : item;
    const est = resolverEstacionParaProducto(productoBase, categorias, estaciones, config);
    // Modo legacy (estaciones apagadas)
    if (!est) {
      const key = '__legacy__';
      if (!groups.has(key)) groups.set(key, { info: null, items: [] });
      groups.get(key).items.push(item);
      return;
    }
    const key = est.estacion_preparacion_id || 'general';
    if (!groups.has(key)) groups.set(key, { info: est, items: [] });
    groups.get(key).items.push(item);
  });
  return groups;
}
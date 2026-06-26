// =====================================================
// utils/tipoVentaUtils.js
// =====================================================
// 6B — Helpers PURAS para productos variables.
//
// Tres tipos de venta:
//   1. 'precio_fijo'         → flujo clásico (no usa estas funciones).
//   2. 'variable_medida'     → vende por peso/volumen (g/kg/ml/l).
//   3. 'porcion_contenedor'  → vende porciones (shot/copa/vaso) de un contenedor (ml).
//
// Reglas de oro:
// - Nunca devuelve NaN/Infinity. Si la entrada es inválida → 0.
// - Nunca toFixed sobre undefined.
// - Es PURO: no toca BD, no toca caché, no hace fetch.
// - NO se usa todavía en UI: este archivo es base para 1.B en adelante.
// =====================================================

export const TIPO_VENTA = Object.freeze({
  PRECIO_FIJO: 'precio_fijo',
  VARIABLE_MEDIDA: 'variable_medida',
  PORCION_CONTENEDOR: 'porcion_contenedor',
});

export const UNIDADES_VARIABLE = Object.freeze(['g', 'kg', 'ml', 'l']);

// ----- Helpers numéricos defensivos -----

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toPos(v) {
  const n = toNum(v);
  return n > 0 ? n : 0;
}

// ----- Conversiones de unidad -----

/**
 * Convierte una cantidad en la unidad mostrada (g/kg/ml/l) a la unidad BASE
 * del ingrediente (g o ml). Devuelve 0 si la combinación es inválida.
 *
 *   500 g  → 500 (base = g)
 *   1 kg   → 1000 (base = g)
 *   250 ml → 250 (base = ml)
 *   1 l    → 1000 (base = ml)
 *
 * @param {number} cantidad
 * @param {'g'|'kg'|'ml'|'l'} unidadMostrada
 * @returns {number} cantidad en unidad base
 */
export function convertirAUnidadBase(cantidad, unidadMostrada) {
  const n = toPos(cantidad);
  if (n === 0) return 0;
  switch (unidadMostrada) {
    case 'g': return n;
    case 'kg': return n * 1000;
    case 'ml': return n;
    case 'l': return n * 1000;
    default: return 0;
  }
}

/**
 * Devuelve la unidad BASE esperada para una unidad mostrada.
 *   g/kg → 'g'
 *   ml/l → 'ml'
 *   otro → ''
 */
export function unidadBaseDesdeMostrada(unidadMostrada) {
  if (unidadMostrada === 'g' || unidadMostrada === 'kg') return 'g';
  if (unidadMostrada === 'ml' || unidadMostrada === 'l') return 'ml';
  return '';
}

/**
 * Convierte el precio_por_unidad_variable (precio por g o ml) cuando el usuario
 * lo escribe en kg/l, para que internamente quede SIEMPRE por unidad mostrada.
 * No se usa para descuento — solo para mostrar coherente al usuario.
 * Esta función es opcional. La verdad operativa siempre es:
 *   precio = precio_por_unidad_variable * cantidad_variable.
 */
export function precioPorUnidadMostrada(precio) {
  return toPos(precio);
}

// ----- Cálculo de precio de línea (sin tocar BD) -----

/**
 * Precio de línea para un producto VARIABLE POR MEDIDA.
 *
 *   precio_por_unidad_variable * cantidad_variable
 *
 * @returns {number} precio total de la línea (no negativo, no NaN)
 */
export function calcularPrecioVariableMedida({ precio_por_unidad_variable, cantidad_variable }) {
  const p = toPos(precio_por_unidad_variable);
  const c = toPos(cantidad_variable);
  if (p === 0 || c === 0) return 0;
  return Math.round(p * c * 100) / 100;
}

/**
 * Precio de línea para un producto POR PORCIÓN DE CONTENEDOR.
 *
 *   precio_por_porcion * cantidad_porciones
 *
 * @returns {number} precio total de la línea
 */
export function calcularPrecioPorcion({ precio_por_porcion, cantidad_porciones }) {
  const p = toPos(precio_por_porcion);
  const c = toPos(cantidad_porciones);
  if (p === 0 || c === 0) return 0;
  return Math.round(p * c * 100) / 100;
}

// ----- Cantidad base de consumo (lo que descuenta inventario) -----

/**
 * ml por porción efectivo. Usa el explícito; si no hay, lo deriva
 * de capacidad / porciones. Devuelve 0 si no se puede calcular.
 */
export function mlPorPorcionEfectivo({ ml_por_porcion, capacidad_contenedor_ml, porciones_por_contenedor }) {
  const exp = toPos(ml_por_porcion);
  if (exp > 0) return exp;
  const cap = toPos(capacidad_contenedor_ml);
  const por = toPos(porciones_por_contenedor);
  if (cap === 0 || por === 0) return 0;
  return Math.round((cap / por) * 1000) / 1000;
}

/**
 * Cantidad TOTAL en unidad base del ingrediente que esta línea va a descontar.
 *
 * Para variable_medida:    convertirAUnidadBase(cantidad_variable, unidad_variable)
 * Para porcion_contenedor: cantidad_porciones * mlPorPorcionEfectivo(...)
 * Para precio_fijo:        0 (lo usa la receta clásica, no este helper).
 *
 * @param {object} args
 *  - tipo_venta
 *  - cantidad_variable, unidad_variable
 *  - cantidad_porciones, ml_por_porcion, capacidad_contenedor_ml, porciones_por_contenedor
 * @returns {number} cantidad en unidad base (g o ml). Siempre >= 0, nunca NaN.
 */
export function calcularCantidadBaseConsumo(args = {}) {
  const tipo = args?.tipo_venta;
  if (tipo === TIPO_VENTA.VARIABLE_MEDIDA) {
    return convertirAUnidadBase(args?.cantidad_variable, args?.unidad_variable);
  }
  if (tipo === TIPO_VENTA.PORCION_CONTENEDOR) {
    const ml = mlPorPorcionEfectivo({
      ml_por_porcion: args?.ml_por_porcion,
      capacidad_contenedor_ml: args?.capacidad_contenedor_ml,
      porciones_por_contenedor: args?.porciones_por_contenedor,
    });
    const cant = toPos(args?.cantidad_porciones);
    return Math.round(cant * ml * 1000) / 1000;
  }
  return 0;
}

// ----- Costo / utilidad / margen variable -----

/**
 * Calcula costo/utilidad/margen para una línea variable, defensivo ante datos faltantes.
 * Si no hay costo del ingrediente, devuelve 0s (no NaN).
 *
 * @param {object} args
 *  - precio_total_linea
 *  - cantidad_base_consumo  → cantidad en unidad base (g o ml)
 *  - costo_por_unidad_base  → costo unitario del ingrediente base
 * @returns {{costo_linea:number, utilidad_linea:number, margen_linea:number}}
 */
export function calcularCostoVariable({ precio_total_linea, cantidad_base_consumo, costo_por_unidad_base }) {
  const precio = toPos(precio_total_linea);
  const cant = toPos(cantidad_base_consumo);
  const costoUnit = toPos(costo_por_unidad_base);
  const costo = Math.round(cant * costoUnit * 100) / 100;
  const utilidad = Math.round((precio - costo) * 100) / 100;
  const margen = precio > 0 ? Math.round((utilidad / precio) * 10000) / 100 : 0; // %
  return {
    costo_linea: costo,
    utilidad_linea: utilidad,
    margen_linea: margen,
  };
}

// ----- Formateo legible (texto para Cocina / Ticket / UI) -----

/**
 * Texto legible para una línea variable. NUNCA devuelve "NaN" ni "undefined".
 *
 *   variable_medida:    "500 g" / "1.25 kg" / "250 ml"
 *   porcion_contenedor: "4 shots" / "2 copas"
 *   precio_fijo:        "" (no aplica)
 */
export function formatearCantidadVariable(item = {}) {
  const tipo = item?.tipo_venta || item?.tipo_venta_snapshot;
  if (tipo === TIPO_VENTA.VARIABLE_MEDIDA) {
    const cant = toPos(item?.cantidad_variable ?? item?.cantidad_variable_snapshot);
    const u = item?.unidad_variable || item?.unidad_variable_snapshot || '';
    if (cant === 0 || !u) return '';
    // Mostrar enteros sin decimales, decimales con hasta 2.
    const txt = Number.isInteger(cant) ? String(cant) : String(Math.round(cant * 100) / 100);
    return `${txt} ${u}`;
  }
  if (tipo === TIPO_VENTA.PORCION_CONTENEDOR) {
    const c = toPos(item?.cantidad_porciones ?? item?.cantidad_porciones_snapshot);
    const nombre = item?.nombre_porcion || item?.nombre_porcion_snapshot || 'porción';
    if (c === 0) return '';
    if (c === 1) return `1 ${nombre}`;
    // Pluralización simple en español (shot→shots, copa→copas).
    const plural = /[sx]$/i.test(nombre) ? nombre : `${nombre}s`;
    return `${c} ${plural}`;
  }
  return '';
}

// ----- Validaciones para formularios -----

/**
 * Valida que la configuración de un producto VARIABLE sea consistente.
 * Devuelve {ok, errores:[]}. NO lanza.
 */
export function validarProductoVariable(producto = {}) {
  const errores = [];
  const tipo = producto?.tipo_venta;

  if (tipo === TIPO_VENTA.VARIABLE_MEDIDA) {
    if (!producto?.ingrediente_base_id) errores.push('Falta ingrediente base.');
    if (!UNIDADES_VARIABLE.includes(producto?.unidad_variable)) errores.push('Unidad de venta inválida.');
    if (toPos(producto?.precio_por_unidad_variable) === 0) errores.push('Precio por unidad debe ser > 0.');
    const min = toNum(producto?.cantidad_minima_variable);
    const max = toNum(producto?.cantidad_maxima_variable);
    if (min < 0) errores.push('Cantidad mínima no puede ser negativa.');
    if (max < 0) errores.push('Cantidad máxima no puede ser negativa.');
    if (min > 0 && max > 0 && min > max) errores.push('Cantidad mínima no puede ser mayor que la máxima.');
  } else if (tipo === TIPO_VENTA.PORCION_CONTENEDOR) {
    if (!producto?.ingrediente_base_id) errores.push('Falta ingrediente base.');
    if (toPos(producto?.capacidad_contenedor_ml) === 0) errores.push('Capacidad del contenedor debe ser > 0.');
    if (toPos(producto?.porciones_por_contenedor) === 0) errores.push('Porciones por contenedor debe ser > 0.');
    if (toPos(producto?.precio_por_porcion) === 0) errores.push('Precio por porción debe ser > 0.');
    const mlEff = mlPorPorcionEfectivo({
      ml_por_porcion: producto?.ml_por_porcion,
      capacidad_contenedor_ml: producto?.capacidad_contenedor_ml,
      porciones_por_contenedor: producto?.porciones_por_contenedor,
    });
    if (mlEff === 0) errores.push('No se pudo calcular ml por porción.');
  }
  // precio_fijo: no requiere validación adicional aquí.

  return { ok: errores.length === 0, errores };
}

/**
 * Indica si un producto es variable (cualquiera de los dos modos).
 */
export function esProductoVariable(producto = {}) {
  return producto?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
    || producto?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR;
}
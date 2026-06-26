/**
 * Definición de columnas estándar por sección para los exports.
 * Centralizado para mantener consistencia entre CSV/XLSX/Sheets.
 */

const fmtDate = (v) => v ? new Date(v).toISOString().slice(0, 19).replace('T', ' ') : '';
const fmtNum = (v) => (v === null || v === undefined || v === '') ? 0 : Number(v);

export const COLUMNS_CORTES = [
  { key: 'folio', label: 'Folio' },
  { key: 'fecha_inicio', label: 'Fecha apertura', format: fmtDate },
  { key: 'fecha_cierre', label: 'Fecha cierre', format: fmtDate },
  { key: 'usuario_cajero_nombre', label: 'Cajero' },
  { key: 'numero_ventas', label: 'N° ventas', format: fmtNum },
  { key: 'total_general', label: 'Total', format: fmtNum },
  { key: 'total_efectivo', label: 'Efectivo', format: fmtNum },
  { key: 'total_tarjeta', label: 'Tarjeta', format: fmtNum },
  { key: 'total_transferencia', label: 'Transferencia', format: fmtNum },
  { key: 'costo_total_estimado', label: 'Costo estimado', format: fmtNum },
  { key: 'utilidad_bruta_total', label: 'Utilidad bruta', format: fmtNum },
  { key: 'margen_promedio', label: 'Margen %', format: fmtNum },
  { key: 'total_gastos', label: 'Gastos', format: fmtNum },
  { key: 'efectivo_esperado', label: 'Efectivo esperado', format: fmtNum },
  { key: 'efectivo_contado', label: 'Efectivo contado', format: fmtNum },
  { key: 'diferencia_efectivo', label: 'Diferencia', format: fmtNum },
  { key: 'estado', label: 'Estado' },
  { key: 'notas', label: 'Notas' },
];

export const COLUMNS_VENTAS = [
  { key: 'folio', label: 'Folio' },
  { key: 'fecha_apertura', label: 'Fecha', format: fmtDate },
  { key: 'fecha_cierre', label: 'Cobro', format: fmtDate },
  { key: 'tipo_venta', label: 'Tipo' },
  { key: 'mesa_numero', label: 'Mesa' },
  { key: 'personas', label: 'Personas', format: fmtNum },
  { key: 'cliente_nombre', label: 'Cliente' },
  { key: 'usuario_mesero_nombre', label: 'Mesero' },
  { key: 'usuario_cajero_nombre', label: 'Cajero' },
  { key: 'subtotal', label: 'Subtotal', format: fmtNum },
  { key: 'descuentos', label: 'Descuentos', format: fmtNum },
  { key: 'impuestos', label: 'Impuestos', format: fmtNum },
  { key: 'total', label: 'Total', format: fmtNum },
  { key: 'metodo_pago', label: 'Método pago' },
  { key: 'monto_efectivo', label: 'Efectivo', format: fmtNum },
  { key: 'monto_tarjeta', label: 'Tarjeta', format: fmtNum },
  { key: 'monto_transferencia', label: 'Transferencia', format: fmtNum },
  { key: 'costo_total_snapshot', label: 'Costo', format: fmtNum },
  { key: 'utilidad_bruta_snapshot', label: 'Utilidad', format: fmtNum },
  { key: 'margen_snapshot', label: 'Margen %', format: fmtNum },
  { key: 'estado', label: 'Estado' },
];

export const COLUMNS_COMPRAS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'proveedor_nombre', label: 'Proveedor' },
  { key: 'factura_folio', label: 'Factura' },
  { key: 'metodo_pago', label: 'Método pago' },
  { key: 'total_compra', label: 'Total', format: fmtNum },
  { key: 'usuario_nombre', label: 'Registrado por' },
  { key: 'notas', label: 'Notas' },
];

export const COLUMNS_GASTOS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'monto', label: 'Monto', format: fmtNum },
  { key: 'metodo_pago', label: 'Método pago' },
  { key: 'usuario_nombre', label: 'Registrado por' },
  { key: 'notas', label: 'Notas' },
];

/**
 * 6B / 1.I — Detalle granular por línea de venta.
 * Distingue cantidad lógica vs cantidad variable real (g, ml, shots, copas)
 * y muestra el consumo real en unidad base del ingrediente.
 *
 * Compatible con productos precio_fijo (las columnas variables salen vacías)
 * y con productos variables (variable_medida / porcion_contenedor).
 */
const fmtTipoVenta = (v) => {
  if (!v || v === 'precio_fijo') return 'precio_fijo';
  if (v === 'variable_medida') return 'variable_medida';
  if (v === 'porcion_contenedor') return 'porcion_contenedor';
  return String(v);
};
// Para precio_fijo, las columnas "variables" salen vacías (no NaN/undefined).
const fmtVarNum = (v, row) => {
  const tipo = row?.tipo_venta_snapshot || 'precio_fijo';
  if (tipo === 'precio_fijo') return '';
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : '';
};
const fmtVarStr = (v, row) => {
  const tipo = row?.tipo_venta_snapshot || 'precio_fijo';
  if (tipo === 'precio_fijo') return '';
  return v || '';
};
export const COLUMNS_DETALLES_VENTA = [
  { key: 'venta_id', label: 'Venta ID' },
  { key: 'producto_nombre', label: 'Producto' },
  // tipo de venta (precio_fijo / variable_medida / porcion_contenedor)
  { key: 'tipo_venta_snapshot', label: 'Tipo venta', format: (v) => fmtTipoVenta(v) },
  // Cantidad lógica (siempre): para precio_fijo = unidades; para variables = 1
  { key: 'cantidad', label: 'Cantidad lógica', format: fmtNum },
  // Cantidad variable real (g/kg/ml/l) — vacío para precio_fijo
  { key: 'cantidad_variable_snapshot', label: 'Cantidad variable', format: fmtVarNum },
  { key: 'unidad_variable_snapshot', label: 'Unidad variable', format: fmtVarStr },
  // Porciones (shot/copa/vaso) — vacío para precio_fijo
  { key: 'cantidad_porciones_snapshot', label: 'Porciones', format: fmtVarNum },
  { key: 'nombre_porcion_snapshot', label: 'Nombre porción', format: fmtVarStr },
  { key: 'ml_por_porcion_snapshot', label: 'ml por porción', format: fmtVarNum },
  // Consumo real en unidad base del ingrediente (g o ml)
  { key: 'cantidad_base_consumo', label: 'Consumo base (g/ml)', format: fmtVarNum },
  { key: 'ingrediente_base_nombre_snapshot', label: 'Ingrediente base', format: fmtVarStr },
  // Económicos
  { key: 'precio_unitario_snapshot', label: 'Precio unitario', format: fmtNum },
  { key: 'subtotal', label: 'Subtotal', format: fmtNum },
  { key: 'costo_total_linea_snapshot', label: 'Costo línea', format: fmtNum },
  { key: 'utilidad_linea_snapshot', label: 'Utilidad línea', format: fmtNum },
  { key: 'margen_linea_snapshot', label: 'Margen %', format: fmtNum },
  { key: 'notas_producto', label: 'Notas' },
];

export const COLUMNS_MOVIMIENTOS = [
  { key: 'fecha', label: 'Fecha', format: fmtDate },
  { key: 'ingrediente_nombre', label: 'Ingrediente' },
  { key: 'tipo_movimiento', label: 'Tipo' },
  { key: 'cantidad', label: 'Cantidad', format: fmtNum },
  { key: 'unidad_base', label: 'Unidad' },
  { key: 'stock_anterior', label: 'Stock antes', format: fmtNum },
  { key: 'stock_nuevo', label: 'Stock después', format: fmtNum },
  { key: 'costo_unitario_en_momento', label: 'Costo unit.', format: fmtNum },
  { key: 'costo_total_movimiento', label: 'Costo total', format: fmtNum },
  { key: 'motivo', label: 'Motivo' },
  { key: 'usuario_nombre', label: 'Usuario' },
];
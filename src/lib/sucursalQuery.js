/**
 * FASE 2C-VISTAS — Helpers de filtrado por sucursal efectiva.
 *
 * Centraliza la regla: "si hay sucursal activa, filtra por sucursal_id; si es
 * null (dueño en modo global), trae todas las sucursales".
 *
 * Solo aplica a entidades que YA tienen sucursal_id en su schema: Venta y
 * CorteCaja. NO se usa para Compras / Movimientos / Gastos (sin sucursal_id).
 *
 * No toca lógica de escritura ni de caja. Solo construye filtros de lectura.
 */

/**
 * Devuelve el id de sucursal efectiva, o null si el dueño está en modo global.
 */
export function sucursalIdDe(sucursalEfectiva) {
  return sucursalEfectiva?.sucursal_id || null;
}

/**
 * Etiqueta legible de la sucursal activa para el indicador de cabecera.
 * - Con sucursal: el nombre.
 * - Sin sucursal (dueño global): "Todas las sucursales".
 */
export function etiquetaSucursal(sucursalEfectiva) {
  return sucursalEfectiva?.sucursal_nombre || 'Todas las sucursales';
}
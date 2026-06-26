// =====================================================
// Cálculo defensivo de totales de venta — fuente única
// =====================================================
// HOTFIX 6A: en algunos casos (rate-limit 429, refetch desordenado,
// venta cargada de BD sin recálculo) la entidad `Venta` queda con
// subtotal/total = 0 aunque sí existan DetalleVenta con subtotales > 0.
//
// Estas helpers permiten:
//  - calcular subtotal/total desde detalles SIEMPRE que sea posible
//  - usar venta.subtotal/total como respaldo solo si los detalles fallan
//  - obtener un "total efectivo" coherente para precuenta, caja y tickets
//
// No modifica precios, ni costos, ni inventario. Solo agrega tolerancia
// de lectura para evitar mostrar $0.00 cuando claramente hay consumo.
// =====================================================

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Suma defensiva de `subtotal` de un array de DetalleVenta.
 * Acepta también items del carrito (precio_venta * cantidad).
 */
export function sumarSubtotalDetalles(detalles) {
  if (!Array.isArray(detalles)) return 0;
  return detalles.reduce((acc, d) => {
    if (!d) return acc;
    // 1) Si ya viene subtotal calculado, úsalo.
    if (d.subtotal !== undefined && d.subtotal !== null) {
      return acc + num(d.subtotal);
    }
    // 2) Si no, calcular desde precio_unitario_snapshot * cantidad
    if (d.precio_unitario_snapshot !== undefined) {
      return acc + num(d.precio_unitario_snapshot) * num(d.cantidad);
    }
    // 3) Compat con items de carrito (precio_venta * cantidad)
    if (d.precio_venta !== undefined) {
      return acc + num(d.precio_venta) * num(d.cantidad);
    }
    return acc;
  }, 0);
}

/**
 * Devuelve el subtotal "real" de una venta.
 * Prioridad:
 *   1) Subtotal calculado desde detalles (si > 0)
 *   2) venta.subtotal
 *   3) venta.total (legacy: algunas ventas viejas solo tenían `total`)
 */
export function getVentaSubtotal(venta, detalles) {
  const desdeDetalles = sumarSubtotalDetalles(detalles);
  if (desdeDetalles > 0) return desdeDetalles;
  if (num(venta?.subtotal) > 0) return num(venta?.subtotal);
  if (num(venta?.total) > 0) return num(venta?.total);
  return 0;
}

/**
 * Devuelve el total de la venta SIN propina (la propina nunca infla `total`).
 * Igual que `getVentaSubtotal` por ahora — separados para semántica.
 */
export function getVentaTotal(venta, detalles) {
  return getVentaSubtotal(venta, detalles);
}

/**
 * ¿La venta tiene consumo real?
 * True si hay al menos un detalle con subtotal > 0
 * o si venta.subtotal/total > 0.
 */
export function ventaTieneConsumo(venta, detalles) {
  return getVentaSubtotal(venta, detalles) > 0;
}
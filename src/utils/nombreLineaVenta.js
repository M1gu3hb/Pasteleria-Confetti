// Helper compartido para el NOMBRE que se persiste/muestra de una línea de
// "venta libre" (FASE 3). Una venta libre es una línea de `detalle_venta` con
// `producto_id null` (mismo patrón que el anticipo de pedidos, ver
// registrarPagoPedido.js) que representa dinero sin producto de catálogo.
//
// Regla de negocio (definida en el MD de la fase):
//  - PERSISTIDO en `producto_nombre`: el nombre que puso el usuario, o el
//    default NOMBRE_VENTA_LIBRE ("Venta libre") si no puso. NUNCA null/"".
//  - TICKET: si es venta libre SIN nombre propio (producto_id null y
//    producto_nombre === "Venta libre"), mostrar "Extra". Si tiene nombre
//    propio, ese nombre.
//  - CORTE / HISTORIAL: mostrar `producto_nombre` tal cual (o sea "Venta libre"
//    o el nombre) — NO usan este fallback.
//
// El guard `producto_id == null` (con ==) cubre null y undefined. No colisiona
// con:
//  - Anticipos: producto_id null pero nombre "Anticipo pedido <folio>" ≠ "Venta libre".
//  - Ítems de catálogo web (parseProductosDesdeNotas): tienen nombre propio ≠ "Venta libre".

export const NOMBRE_VENTA_LIBRE = 'Venta libre';

// Texto a MOSTRAR en el ticket para una línea de detalle.
// Venta libre sin nombre propio → "Extra"; cualquier otra línea → su producto_nombre.
export function nombreLineaTicket(detalle) {
  const d = detalle || {};
  const sinProducto = d.producto_id == null; // null o undefined
  if (sinProducto && d.producto_nombre === NOMBRE_VENTA_LIBRE) return 'Extra';
  return d.producto_nombre || '';
}

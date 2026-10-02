const MENSAJES = {
  MONTO_EXCEDE_SALDO: 'El saldo cambió o el importe excede lo pendiente. Cierra y vuelve a abrir el pedido para ver el saldo actual; este intento no se cobró.',
  CORTE_NO_ABIERTO: 'La caja de este intento ya está cerrada. Actualiza Caja y registra el cobro en el corte abierto.',
  CORTE_CERRADO: 'Este corte está cerrado. La corrección requiere un movimiento contable documentado.',
  CORTE_ATRASADO: 'Cierra el corte del día anterior y abre la caja de hoy para continuar.',
  CONCILIAR_ANTICIPO_HISTORICO: 'El anticipo histórico está reconocido, pero falta su método de pago original. Solicita la conciliación antes de devolverlo; no se registró una devolución.',
  CONCILIAR_DEVOLUCION: 'Los métodos del historial requieren conciliación antes de devolver dinero; no se registró una devolución.',
  CONCILIAR_PAGO_CANCELADO: 'Este pedido tiene un pago cuya venta fue cancelada. El dueño puede revisar su evidencia en el Dashboard antes de cobrar, devolver o entregar. No se registró dinero.',
  PEDIDO_NO_COBRABLE: 'Este pedido está cancelado o entregado. Actualiza el pedido antes de continuar.',
  DESGLOSE_NO_CUADRA: 'Los importes por método deben sumar exactamente el pago.',
  INTENCION_NO_COINCIDE: 'Este intento corresponde a otra venta. Recupera la operación pendiente antes de iniciar otro cobro.',
  INTENCION_DISTINTA: 'El contenido de este intento cambió. Recupera la operación pendiente antes de continuar.',
};
export function mensajeOperacion(error) {
  const texto = error?.message || 'No se pudo confirmar la operación. Reintenta para recuperar el mismo intento.';
  return Object.entries(MENSAJES).find(([codigo]) => texto.includes(codigo))?.[1] || texto;
}

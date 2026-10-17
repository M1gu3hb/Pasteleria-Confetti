// Etiquetas de lectura: no cambian pagos, estado ni fecha real de entrega.
export function situacionPedido(pedido, hoy) {
  if (pedido.estado === 'cancelado') return { texto: 'Cancelado', tono: 'neutro' };
  const bruto = pedido.saldo_pendiente ?? pedido.resta;
  const saldo = bruto === null || bruto === undefined || bruto === '' ? NaN : Number(bruto);
  if (!Number.isFinite(saldo)) return { texto: 'Revisar saldo', tono: 'alerta' };
  const pasada = !!pedido.fecha_entrega && pedido.fecha_entrega < hoy;
  if (saldo > 0.005) return { texto: pasada ? 'Fecha pasada · saldo pendiente' : 'Saldo pendiente', tono: pasada ? 'alerta' : 'pendiente' };
  if (!pedido.fecha_entrega) return { texto: 'Pagado · sin fecha', tono: 'pendiente' };
  if (pedido.fecha_entrega > hoy) return { texto: 'Pagado · entrega próxima', tono: 'pagado' };
  if (pedido.fecha_entrega === hoy) return { texto: 'Pagado · entrega hoy', tono: 'pagado' };
  return { texto: 'Pagado · fecha pasada', tono: 'pagado' };
}

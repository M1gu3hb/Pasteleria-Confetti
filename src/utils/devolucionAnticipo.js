import { operacionPedido } from '@/utils/registrarPagoPedido';

export async function registrarDevolucionAnticipo({ pedido, motivo, cajaAbierta, posUser, sucursalEfectiva: _sucursalEfectiva = null }) {
  if (!pedido?.id) throw new Error('PEDIDO_INVALIDO');
  if (!cajaAbierta?.id) throw new Error('SIN_CAJA');
  if (!(motivo || '').trim()) throw new Error('MOTIVO_REQUERIDO');
  return operacionPedido(`devolucion:${pedido.sucursal_id}:${pedido.id}`, {
    accion: 'devolucion', pedido_id: pedido.id, sucursal_id: pedido.sucursal_id,
    corte_id: cajaAbierta.id, motivo: motivo.trim(), monto: 0,
    usuario_id: posUser?.id || null, usuario_nombre: posUser?.nombre || null,
  });
}

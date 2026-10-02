import { mensajeOperacion } from '@/utils/errorOperacion';
import { supabase, ensureSession } from '@/api/supabaseClient';
import { ejecutarIntencion, leerIntencion } from '@/utils/intencionPersistente';

export async function recuperarOperacionPedido(slot) {
  const pendiente = leerIntencion(slot);
  if (!pendiente) throw new Error('No hay un intento pendiente en este dispositivo.');
  return operacionPedido(slot, pendiente);
}

export async function operacionPedido(slot, solicitud) {
  await ensureSession();
  return ejecutarIntencion(slot, solicitud, async (p_intencion) => {
    const { data, error } = await supabase.rpc('operacion_pedido_tx', { p_intencion });
    if (error) {
      /** @type {Error & {definitivo?: boolean}} */
      const fallo = new Error(mensajeOperacion(error));
      fallo.definitivo = ['P0001','23514','23505','22P02','42501'].includes(error.code);
      throw fallo;
    }
    if (!data?.pedido?.id) throw new Error('Respuesta incompleta. Reintenta para confirmar la misma operación.');
    return data;
  });
}

export async function registrarPagoPedido({ pedido, monto, pago, cajaAbierta, posUser, sucursalEfectiva: _sucursalEfectiva = null, notas = '' }) {
  if (!pedido?.id || !cajaAbierta?.id) throw new Error('Abre caja antes de registrar el pago.');
  return operacionPedido(`pago:${pedido.sucursal_id}:${pedido.id}`, {
    accion: 'pago', pedido_id: pedido.id, sucursal_id: pedido.sucursal_id,
    corte_id: cajaAbierta.id, monto: Number(monto), pago, notas,
    usuario_id: posUser?.id || null, usuario_nombre: posUser?.nombre || null,
  });
}

export async function crearPedidoConAnticipo({ pedido, monto, pago, cajaAbierta, posUser }) {
  return operacionPedido(`crear-pedido:${pedido.sucursal_id}`, {
    accion: 'crear', pedido, sucursal_id: pedido.sucursal_id,
    corte_id: cajaAbierta?.id || null, monto: Number(monto) || 0, pago,
    usuario_id: posUser?.id || null, usuario_nombre: posUser?.nombre || null,
    notas: 'Anticipo al crear el pedido',
  });
}

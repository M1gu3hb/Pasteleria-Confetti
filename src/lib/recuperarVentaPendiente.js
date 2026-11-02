import { claveIntencion, ejecutarIntencion } from './intencionOperacion';
import { leerIntencion } from '@/utils/intencionPersistente';

/** Retry only the durable original request, never the current draft/payment. */
export async function recuperarVentaPendiente(sucursalId, usuarioId) {
  const scope=claveIntencion('venta',sucursalId,usuarioId);
  const intent=leerIntencion(scope),p=intent?.parametros;
  if(!intent || intent.rpc!=='crear_venta_directa_tx' || typeof intent.clave!=='string' || !intent.clave ||
    p?.p_sucursal_id!==sucursalId || p?.p_usuario_id!==usuarioId || !Array.isArray(p?.p_detalle) || !p.p_detalle.length) {
    throw new Error('No se pudo verificar el cobro pendiente. Conserva este dispositivo y revisa la operación antes de cobrar de nuevo.');
  }
  const {data}=await ejecutarIntencion(scope,intent.rpc,p,'p_idempotency_key');
  return {venta:data.venta,detalles:data.detalles};
}

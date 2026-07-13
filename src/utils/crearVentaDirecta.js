import { supabase, ensureSession } from '@/api/supabaseClient';

/**
 * crearVentaDirecta — venta directa de mostrador (DINERO), atómica + idempotente.
 *
 * FASE II-B.2 (blindaje MNY-I-13, R2): reemplaza el INSERT directo de la venta de
 * mostrador (`base44.entities.Venta.create` + N `DetalleVenta.create` en POS.jsx) por
 * la RPC `crear_venta_directa_tx` (SECURITY DEFINER): crea la cabecera + todas las líneas
 * en UNA transacción (si una línea falla, TODO revierte), con guards de
 * sesión/sucursal/corte/desglose e idempotencia por clave (un reintento no duplica la venta).
 *
 * La MATEMÁTICA vive en el frontend (total/subtotal/desglose ya calculados); la RPC solo
 * persiste + valida. Byte-idéntico al efecto actual: persiste SOLO las columnas reales de
 * la whitelist (propina y snapshots ya se descartaban). SIN propina (apagada por 0010).
 *
 * @param {object} args
 * @param {{subtotal:number,total:number,tipo_venta?:string}} args.cabecera
 * @param {Array<object>} args.detalle  líneas (columnas reales; las extra se ignoran server-side)
 * @param {{metodo_pago:string,monto_efectivo:number,monto_tarjeta:number,monto_transferencia:number,cambio?:number}} args.pago
 * @param {string} args.corteCajaId
 * @param {{sucursal_id:string,sucursal_nombre?:string}} args.sucursal
 * @param {object} args.posUser
 * @param {string} [args.idempotencyKey] clave estable por intento (dedup de reintentos)
 * @returns {Promise<{ ventaId:string, folio:string, idempotentHit:boolean, detalleIds:string[] }>}
 * @throws Error('SIN_CAJA'|'SIN_SUCURSAL'|'SUCURSAL_AJENA'|'CORTE_*'|'DESGLOSE_*'|'DETALLE_NO_CUADRA'|...)
 */
export async function crearVentaDirecta({ cabecera, detalle, pago, corteCajaId, sucursal, posUser, idempotencyKey } = {}) {
  if (!corteCajaId) throw new Error('SIN_CAJA');
  if (!sucursal?.sucursal_id) throw new Error('SIN_SUCURSAL');
  if (!Array.isArray(detalle) || detalle.length === 0) throw new Error('DETALLE_VACIO');

  await ensureSession(); // sesión terminal (authenticated) lista antes del RPC
  const { data, error } = await supabase.rpc('crear_venta_directa_tx', {
    p_cabecera: cabecera,
    p_detalle: detalle,
    p_metodo_pago: pago.metodo_pago,
    p_monto_efectivo: pago.monto_efectivo,
    p_monto_tarjeta: pago.monto_tarjeta,
    p_monto_transferencia: pago.monto_transferencia,
    p_cambio: pago.cambio ?? 0,
    p_corte_caja_id: corteCajaId,
    p_sucursal_id: sucursal.sucursal_id,
    p_sucursal_nombre: sucursal.sucursal_nombre || '',
    p_usuario_id: posUser?.id ?? null,
    p_usuario_nombre: posUser?.nombre ?? null,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message || 'No se pudo registrar la venta.');

  return {
    ventaId: data?.venta_id,
    folio: data?.folio,
    idempotentHit: !!data?.idempotent_hit,
    detalleIds: Array.isArray(data?.detalle_ids) ? data.detalle_ids : [],
  };
}

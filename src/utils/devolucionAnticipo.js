import { base44 } from '@/api/base44Client';

/**
 * registrarDevolucionAnticipo — Fase 3 #4 (DINERO)
 *
 * Devuelve el anticipo de un pedido al cancelarlo como 'devolucion'. Espejo de la
 * venta-devolución: el dinero SALE del corte ABIERTO actual, UNA vez, sin tocar
 * el/los corte(s) viejo(s) donde entró el anticipo (candado 9 — snapshots
 * inmutables). Exige caja abierta (candado: no se registra devolución sin corte).
 *
 * MECANISMO (decisión propia — ver reporte 02_fase3-4):
 * El resumen del corte calcula `efectivo_esperado = totalEfectivo + abonosEfectivo`,
 * donde `abonosEfectivo` es la SUMA CRUDA de `monto_efectivo` de los abonos del
 * corte (acepta negativos). En cambio el desglose de VENTAS ignora `total<=0` y
 * clampa cada método a `>=0`, así que una venta negativa NO restaría nada y además
 * descuadraría `total_general` vs los métodos. Por eso la devolución se registra
 * como UN abono COMPENSATORIO negativo en el corte abierto, con el desglose por
 * método del anticipo en negativo:
 *   - efectivo_esperado baja exactamente el EFECTIVO devuelto (igual que una
 *     venta-devolución reduce el efectivo una vez).
 *   - la card "Pagos de pedidos de pastel" refleja la salida por método.
 *   - los corte(s) viejo(s) NO se tocan.
 *
 * Nota de consistencia con el doble conteo: una venta-devolución reduce el efectivo
 * UNA vez; este abono negativo también. No se duplica la resta (el quirk del doble
 * conteo aplica al INGRESO de abonos del día, no a esta salida).
 *
 * @param {object} args
 * @param {object} args.pedido            pedido a devolver (debe tener abonos)
 * @param {string} args.motivo            motivo obligatorio
 * @param {object} args.cajaAbierta       corte abierto (requerido)
 * @param {object} args.posUser           usuario POS (sello)
 * @param {object} [args.sucursalEfectiva] sucursal del terminal (fallback)
 * @returns {Promise<{montoDevuelto:number, devEfectivo:number, devTarjeta:number, devTransferencia:number}>}
 * @throws Error('SIN_CAJA' | 'MOTIVO_REQUERIDO' | 'PEDIDO_INVALIDO')
 */
export async function registrarDevolucionAnticipo({ pedido, motivo, cajaAbierta, posUser, sucursalEfectiva }) {
  if (!pedido?.id) throw new Error('PEDIDO_INVALIDO');
  if (!cajaAbierta?.id) throw new Error('SIN_CAJA');
  const motivoLimpio = (motivo || '').trim();
  if (!motivoLimpio) throw new Error('MOTIVO_REQUERIDO');

  const ahora = new Date().toISOString();
  const selloPedido = {
    estado: 'cancelado',
    tipo_cancelacion: 'devolucion',
    motivo_cancelacion: motivoLimpio,
    fecha_cancelacion: ahora,
    cancelado_por_id: posUser?.id || '',
    cancelado_por_nombre: posUser?.nombre || '',
  };

  // Desglose por método del anticipo ya cobrado. Solo abonos POSITIVOS (excluye
  // una posible devolución previa con monto<0). El backfill de la migración 0025
  // garantiza que cada abono trae su desglose por método.
  const abonos = await base44.entities.Abono.filter({ pedido_id: pedido.id });
  const positivos = (Array.isArray(abonos) ? abonos : []).filter(a => (Number(a?.monto) || 0) > 0);
  const devEfectivo = positivos.reduce((s, a) => s + (Number(a?.monto_efectivo) || 0), 0);
  const devTarjeta = positivos.reduce((s, a) => s + (Number(a?.monto_tarjeta) || 0), 0);
  const devTransferencia = positivos.reduce((s, a) => s + (Number(a?.monto_transferencia) || 0), 0);
  const montoDevuelto = Number((devEfectivo + devTarjeta + devTransferencia).toFixed(2));

  // Sin anticipo real → no hay dinero que mover: cancela limpio con tipo devolucion.
  if (montoDevuelto <= 0) {
    await base44.entities.PedidoPastel.update(pedido.id, { ...selloPedido, monto_devuelto: 0 });
    return { montoDevuelto: 0, devEfectivo: 0, devTarjeta: 0, devTransferencia: 0 };
  }

  const metodosUsados = [
    devEfectivo > 0 ? 'efectivo' : null,
    devTarjeta > 0 ? 'tarjeta' : null,
    devTransferencia > 0 ? 'transferencia' : null,
  ].filter(Boolean);
  const metodoPago = metodosUsados.length > 1 ? 'mixto' : metodosUsados[0];

  // Abono COMPENSATORIO negativo en el corte ABIERTO (la salida de dinero).
  await base44.entities.Abono.create({
    pedido_id: pedido.id,
    sucursal_id: pedido.sucursal_id || sucursalEfectiva?.sucursal_id,
    sucursal_nombre: pedido.sucursal_nombre || sucursalEfectiva?.sucursal_nombre,
    monto: -montoDevuelto,
    metodo_pago: metodoPago,
    monto_efectivo: -devEfectivo,
    monto_tarjeta: -devTarjeta,
    monto_transferencia: -devTransferencia,
    afecta_caja: true,
    corte_caja_id: cajaAbierta.id,
    registrado_por_id: posUser?.id,
    registrado_por_nombre: posUser?.nombre,
    fecha_abono: ahora,
    notas: `Devolución de anticipo — ${motivoLimpio}`,
  });

  // Sella el pedido como cancelado/devolución con el monto devuelto.
  await base44.entities.PedidoPastel.update(pedido.id, { ...selloPedido, monto_devuelto: montoDevuelto });

  return { montoDevuelto, devEfectivo, devTarjeta, devTransferencia };
}

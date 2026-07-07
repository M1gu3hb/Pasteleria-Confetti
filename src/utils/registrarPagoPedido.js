import { base44 } from '@/api/base44Client';
import { generarFolioVenta } from '@/utils/pedidoPastelUtils';

/**
 * registrarPagoPedido — lógica ÚNICA de cobro de un pedido de pastel (DINERO).
 *
 * Extraída 1:1 de RegistrarPagoDialog para reusarla SIN divergir en:
 *   - RegistrarPagoDialog (abono desde el detalle del pedido)
 *   - NuevoPedidoPastel   (anticipo al CREAR el pedido)
 *
 * Registra el pago como dinero REAL del corte, EXACTAMENTE igual que cualquier
 * cobro de pedido:
 *   1) crea un Abono con el desglose por método (de construirPago),
 *   2) crea una Venta PARALELA contable + su DetalleVenta → entra al corte del día,
 *      al dashboard, al PDF y a los métodos de pago (el anticipo cuenta por su
 *      venta paralela, como los demás pagos: NO se duplica ni rompe el candado
 *      del efectivo esperado),
 *   3) recomputa total_abonado/saldo_pendiente/estado del pedido desde TODOS sus
 *      abonos (autoritativo, sin doble conteo).
 *
 * Exige caja abierta (cajaAbierta.id): el llamador ya lo garantiza.
 *
 * @returns {Promise<{ totalAbonado:number, saldoPendiente:number, nuevoEstado:string, ventaError:(string|null) }>}
 *   ventaError = null si la venta paralela se creó bien; string si falló (el
 *   Abono y la actualización del pedido igual se aplican — no se pierde el pago).
 */
export async function registrarPagoPedido({ pedido, monto, pago, cajaAbierta, posUser, sucursalEfectiva, notas = '', skipBackfill = false }) {
  const m = Number(monto) || 0;

  // 0) BACKFILL (auto-sanador, MONEY-NEUTRAL) — pedidos viejos / web tienen
  // total_abonado escrito al crear SIN un abono de respaldo. Como el recompute
  // (paso 3) fija total_abonado = SUMA de abonos, sin esto el anticipo histórico
  // se PERDERÍA al registrar un pago y el saldo se inflaría. Antes de nada, si
  // total_abonado > suma(abonos), creamos UN abono de reconciliación por el gap
  // que NO entra a ningún corte:
  //   - corte_caja_id=null → Caja filtra por corte_caja_id=cajaAbierta.id → no entra
  //   - afecta_caja=false + monto POSITIVO → efectivoEsperado solo cuenta abonos <0
  //   - no crea venta → invisible para el dashboard
  // Es solo el respaldo contable del anticipo ya recibido (no altera cortes).
  //
  // skipBackfill=true lo APAGA. Se usa al CREAR un pedido con anticipo
  // (NuevoPedidoPastel): ese pedido nace con total_abonado=a_cuenta pero SIN
  // abonos todavía; el gap sería a_cuenta y el backfill lo DUPLICARÍA (backfill
  // a_cuenta + abono real a_cuenta = 2×). Ahí NO hay anticipo histórico sin
  // respaldo: el abono real se está creando justo ahora. El backfill solo aplica
  // a pedidos legacy que ya traían total_abonado sin abono (pago desde el detalle).
  if (!skipBackfill) {
    const abonosPrevios = await base44.entities.Abono.filter({ pedido_id: pedido.id });
    const sumaPrevios = (Array.isArray(abonosPrevios) ? abonosPrevios : [])
      .reduce((s, a) => s + (Number(a?.monto) || 0), 0);
    const gap = Number(((Number(pedido.total_abonado) || 0) - sumaPrevios).toFixed(2));
    if (gap > 0.01) {
      await base44.entities.Abono.create({
        pedido_id: pedido.id, sucursal_id: pedido.sucursal_id, sucursal_nombre: pedido.sucursal_nombre,
        monto: gap, metodo_pago: 'efectivo',
        monto_efectivo: gap, monto_tarjeta: 0, monto_transferencia: 0,
        afecta_caja: false, corte_caja_id: null,
        registrado_por_nombre: 'Reconciliación anticipo',
        fecha_abono: pedido.created_at || pedido.created_date || new Date().toISOString(),
        notas: 'Backfill: anticipo del pedido sin abono de respaldo (no afecta corte).',
      });
    }
  }

  // 1) Abono con desglose por método (mismo split que la venta paralela).
  await base44.entities.Abono.create({
    pedido_id: pedido.id, sucursal_id: pedido.sucursal_id, sucursal_nombre: pedido.sucursal_nombre,
    monto: m, metodo_pago: pago.metodo_pago, afecta_caja: true,
    monto_efectivo: pago.monto_efectivo,
    monto_tarjeta: pago.monto_tarjeta,
    monto_transferencia: pago.monto_transferencia,
    corte_caja_id: cajaAbierta?.id || null,
    registrado_por_id: posUser?.id, registrado_por_nombre: posUser?.nombre,
    fecha_abono: new Date().toISOString(), notas,
  });

  // 2) Venta paralela contable (entra al corte/dashboard/PDF/métodos).
  let ventaError = null;
  const sucId = sucursalEfectiva?.sucursal_id || pedido.sucursal_id;
  const sucNombre = sucursalEfectiva?.sucursal_nombre || pedido.sucursal_nombre;
  if (!sucId) {
    console.error('[registrarPagoPedido] sucursal_id vacío - imposible crear venta paralela');
    ventaError = 'sucursal no identificada';
  } else {
    try {
      let prefijo = sucursalEfectiva?.folio_prefijo;
      if (!prefijo) {
        const suc = await base44.entities.Sucursal.filter({ id: sucId }, null, 1);
        prefijo = Array.isArray(suc) && suc[0]?.folio_prefijo ? suc[0].folio_prefijo : 'X';
      }
      const folioVenta = await generarFolioVenta(sucId, prefijo);
      const ventaCreada = await base44.entities.Venta.create({
        folio: folioVenta,
        tipo_venta: 'mostrador',
        sucursal_id: sucId,
        sucursal_nombre: sucNombre,
        cliente_nombre: pedido.cliente_nombre,
        estado: 'pagada',
        metodo_pago: pago.metodo_pago,
        total: m,
        subtotal: m,
        monto_efectivo: pago.monto_efectivo,
        monto_tarjeta: pago.monto_tarjeta,
        monto_transferencia: pago.monto_transferencia,
        total_cobrado_con_propina: m,
        notas: `Pago de pedido ${pedido.folio} - ${pedido.cliente_nombre || 'sin nombre'}`,
        corte_caja_id: cajaAbierta.id,
        fecha_cierre: new Date().toISOString(),
        usuario_cajero_id: posUser?.id,
        usuario_cajero_nombre: posUser?.nombre,
      });
      if (ventaCreada?.id) {
        await base44.entities.DetalleVenta.create({
          venta_id: ventaCreada.id,
          producto_id: null,
          producto_nombre: `Anticipo pedido ${pedido.folio}`,
          cantidad: 1,
          precio_unitario_snapshot: m,
          subtotal: m,
          costo_unitario_snapshot: 0,
          tipo_venta_snapshot: 'precio_fijo',
          estado_preparacion: 'entregado',
        });
      }
    } catch (errVenta) {
      // El abono ya quedó guardado. Si la venta paralela falla, avisamos (el
      // caller decide el toast) pero NO revertimos el abono ni el pedido.
      console.error('[registrarPagoPedido] venta paralela:', errVenta);
      ventaError = errVenta?.message || 'desconocido';
    }
  }

  // 3) Recompute del pedido desde TODOS los abonos (sin doble conteo).
  const abonos = await base44.entities.Abono.filter({ pedido_id: pedido.id });
  const totalAbonado = (Array.isArray(abonos) ? abonos : []).reduce((s, a) => s + (Number(a?.monto) || 0), 0);
  const saldoPendiente = Math.max(0, (Number(pedido.total_final) || 0) - totalAbonado);
  const estadoActual = pedido.estado;
  let nuevoEstado = estadoActual;
  if (saldoPendiente <= 0) nuevoEstado = 'pagado';
  else if (totalAbonado > 0 && !['entregado', 'cancelado', 'pagado'].includes(estadoActual)) nuevoEstado = 'con_anticipo';
  await base44.entities.PedidoPastel.update(pedido.id, {
    total_abonado: totalAbonado,
    saldo_pendiente: saldoPendiente,
    estado: nuevoEstado,
    ...((estadoActual === 'pendiente' || estadoActual === 'confirmado') ? { fecha_anticipo: new Date().toISOString() } : {}),
    ...(saldoPendiente <= 0 ? { fecha_pago_completo: new Date().toISOString() } : {}),
  });

  return { totalAbonado, saldoPendiente, nuevoEstado, ventaError };
}

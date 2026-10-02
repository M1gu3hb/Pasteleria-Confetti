import { base44 } from '@/api/base44Client';

// A failed detail query is not an empty receipt. Read current sale and the
// complete ledger, then verify their monetary relationship before printing.
export async function cargarTicketVenta(id) {
  const venta = await base44.entities.Venta.get(id);
  if (!venta || venta.id !== id) throw new Error('No se pudo recuperar esta venta.');
  const detalles = await base44.entities.DetalleVenta.filterAll({ venta_id: id });
  if (!Array.isArray(detalles) || detalles.some(d => d.venta_id !== id)) {
    throw new Error('Los productos del ticket están incompletos. Reintenta.');
  }
  if (venta.estado === 'pagada') {
    const subtotal = detalles.reduce((s, d) => s + Number(d.subtotal), 0);
    if (!Number.isFinite(subtotal) || !Number.isFinite(Number(venta.subtotal)) ||
        Math.abs(subtotal - Number(venta.subtotal)) > 0.005 ||
        (Number(venta.total) > 0 && detalles.length === 0)) {
      throw new Error('Los productos no coinciden con la venta. No se imprimió un ticket incompleto.');
    }
  }
  let mesa = null;
  if (venta.mesa_id) mesa = (await base44.entities.Mesa.list()).find(x => x.id === venta.mesa_id) || null;
  return { venta, detalles, mesa };
}

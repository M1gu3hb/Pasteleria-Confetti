import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

/**
 * obtenerEntregasDelCorte — Fase 3 #6
 *
 * Lista las ENTREGAS de pastel/pedido del rango de un corte y de su sucursal.
 * Es INFORMATIVO: pagar y entregar son momentos distintos; cuando un pedido se
 * ENTREGA (estado='entregado' + fecha_entrega_real) debe aparecer en el corte
 * como una línea, SIN sumar a totales ni a efectivo_esperado.
 *
 * Candados: respeta la sucursal del corte (candado 7/sucursal) y el rango del
 * día operativo del corte (candado 2 — usa la apertura/cierre del corte, que ya
 * está fijada a la frontera del día). No mueve dinero.
 *
 * @param {object} args
 * @param {string} [args.sucursalId] sucursal del corte (si falta, no filtra)
 * @param {string|number|Date} args.desde apertura del corte
 * @param {string|number|Date} [args.hasta] cierre del corte (o ahora si abierto)
 * @returns {Promise<Array<{folio:string, nombre:string, hora:string, fechaMs:number}>>}
 */
export async function obtenerEntregasDelCorte({ sucursalId, desde, hasta }) {
  const desdeMs = desde ? new Date(desde).getTime() : 0;
  const hastaMs = hasta ? new Date(hasta).getTime() : Date.now();

  const pedidos = await base44.entities.PedidoPastel
    .filter({ estado: 'entregado' }, '-fecha_entrega_real', 500)
    .catch(() => []);
  const arr = Array.isArray(pedidos) ? pedidos : [];

  const mismaSucursal = (p) => !sucursalId || !p?.sucursal_id || p.sucursal_id === sucursalId;

  return arr
    .filter((p) => {
      if (!mismaSucursal(p)) return false;
      const ref = p?.fecha_entrega_real;
      if (!ref) return false;
      const t = new Date(ref).getTime();
      return Number.isFinite(t) && t >= desdeMs && t <= hastaMs;
    })
    .map((p) => ({
      folio: p?.folio || '—',
      // Nombre interno: el del cliente (ej. "Lucía"); fallback a concepto.
      nombre: p?.cliente_nombre || p?.concepto || 'Pastel',
      hora: p?.fecha_entrega_real ? format(new Date(p.fecha_entrega_real), 'HH:mm') : '—',
      fechaMs: p?.fecha_entrega_real ? new Date(p.fecha_entrega_real).getTime() : 0,
    }))
    .sort((a, b) => a.fechaMs - b.fechaMs);
}

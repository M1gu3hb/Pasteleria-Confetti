import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear,
} from 'date-fns';

/**
 * REGISTROS — Agregación de ventas por período DEL LADO DE LA BASE.
 *
 * Causa raíz que resuelve: antes Registros cargaba ~1000 ventas (las más
 * recientes por created_date) y sumaba en el navegador. Con 11,000+ ventas,
 * cualquier período fuera de esa ventana salía en $0 aunque la base SÍ tuviera
 * ventas. Aquí consultamos por rango de `fecha_cierre` (server-side), paginando
 * y acumulando, para reflejar TODAS las ventas del período.
 *
 * - Excluye ventas con estado 'cancelada'.
 * - Sucursal específica → filtra por sucursal_id. Vista general (sucId null) →
 *   las 3 sucursales (sin filtro de sucursal), igual que el Dashboard.
 *
 * NO toca creación de ventas/cortes ni sus campos. Solo lectura.
 */

const PAGE = 1000;

/** Calcula el rango {fromIso, toIso} según el período y, si aplica, custom. */
export function rangoDesdePeriodo(periodo, desdeStr, hastaStr) {
  const now = new Date();
  let from, to;
  if (periodo === 'today') { from = startOfDay(now); to = endOfDay(now); }
  else if (periodo === '7d') { from = startOfDay(subDays(now, 6)); to = endOfDay(now); }
  else if (periodo === '30d') { from = startOfDay(subDays(now, 29)); to = endOfDay(now); }
  else if (periodo === 'mes') { from = startOfMonth(now); to = endOfMonth(now); }
  else if (periodo === 'year') { from = startOfYear(now); to = endOfDay(now); }
  else { // custom
    from = startOfDay(desdeStr ? new Date(desdeStr) : now);
    to = endOfDay(hastaStr ? new Date(hastaStr) : now);
  }
  return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
}

/**
 * Suma server-side de ventas de un rango, paginando hasta agotar.
 * Devuelve { ingresos, nVentas, utilidad }.
 */
async function agregarVentas(fromIso, toIso, sucId) {
  let skip = 0, ingresos = 0, nVentas = 0, utilidad = 0, guard = 0;
  const baseQuery = {
    fecha_cierre: { $gte: fromIso, $lte: toIso },
    estado: { $ne: 'cancelada' },
  };
  if (sucId) baseQuery.sucursal_id = sucId;
  // Guard de 60 páginas = hasta 60.000 ventas por período. Suficiente y seguro.
  while (guard < 60) {
    guard++;
    const page = await base44.entities.Venta.filter(baseQuery, '-fecha_cierre', PAGE, skip);
    const arr = Array.isArray(page) ? page : [];
    for (const v of arr) {
      ingresos += Number(v?.total) || 0;
      utilidad += Number(v?.utilidad_bruta_snapshot) || 0;
    }
    nVentas += arr.length;
    if (arr.length < PAGE) break;
    skip += PAGE;
  }
  return { ingresos, nVentas, utilidad };
}

/**
 * Hook: agrega ventas/compras/gastos del período seleccionado.
 * - Ventas: server-side por rango de fecha_cierre (el fix central).
 * - Compras/Gastos: se siguen sumando desde las listas ya cargadas en la
 *   página (no tienen sucursal_id y su volumen es bajo) → se pasan por props.
 */
export function useResumenPeriodo({ periodo, desde, hasta, sucId, compras = [], gastos = [] }) {
  const { fromIso, toIso, from, to } = rangoDesdePeriodo(periodo, desde, hasta);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['resumen_periodo_ventas', periodo, fromIso, toIso, sucId || 'all'],
    queryFn: () => agregarVentas(fromIso, toIso, sucId),
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });

  const ventasAgg = data || { ingresos: 0, nVentas: 0, utilidad: 0 };

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
  };
  const comprasArr = Array.isArray(compras) ? compras : [];
  const gastosArr = Array.isArray(gastos) ? gastos : [];
  const comprasTotal = comprasArr.filter(c => inRange(c?.fecha || c?.created_date))
    .reduce((s, c) => s + (Number(c?.total_compra) || 0), 0);
  const gastosTotal = gastosArr.filter(g => inRange(g?.fecha || g?.created_date))
    .reduce((s, g) => s + (Number(g?.monto) || 0), 0);

  const ingresos = ventasAgg.ingresos;
  const nVentas = ventasAgg.nVentas;
  const utilidad = ventasAgg.utilidad;
  const ticketPromedio = nVentas > 0 ? ingresos / nVentas : 0;
  const margen = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
  const neto = ingresos - comprasTotal - gastosTotal;

  return {
    from, to,
    totals: { ingresos, nVentas, utilidad, compras: comprasTotal, gastos: gastosTotal, ticketPromedio },
    margen,
    neto,
    cargando: isLoading,
    refrescando: isFetching && !isLoading,
  };
}
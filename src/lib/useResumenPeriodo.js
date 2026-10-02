import { useQuery } from '@tanstack/react-query';
import { supabase, ensureSession } from '@/api/supabaseClient';
import { fechaCDMX } from '@/utils/pedidoPastelUtils';

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


/** Calcula el rango {fromIso, toIso} según el período y, si aplica, custom. */
export function rangoDesdePeriodo(periodo, desdeStr, hastaStr, ahora = new Date()) {
  const hoy = fechaCDMX(0, ahora);
  const offset = (n) => fechaCDMX(n, ahora);
  let inicio, fin;
  if (periodo === 'today') { inicio = hoy; fin = hoy; }
  else if (periodo === '7d') { inicio = offset(-6); fin = hoy; }
  else if (periodo === '30d') { inicio = offset(-29); fin = hoy; }
  else if (periodo === 'mes') {
    inicio = `${hoy.slice(0, 7)}-01`;
    fin = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10);
  } else if (periodo === 'year') { inicio = `${hoy.slice(0, 4)}-01-01`; fin = hoy; }
  else { inicio = desdeStr || hoy; fin = hastaStr || hoy; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || inicio > fin) throw new Error('Rango de fechas inválido');
  const from = new Date(`${inicio}T00:00:00-06:00`);
  const to = new Date(`${fin}T23:59:59.999-06:00`);
  return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
}

/**
 * Suma server-side de ventas de un rango, paginando hasta agotar.
 * Devuelve { ingresos, nVentas, utilidad }.
 */
async function agregarVentas(fromIso, toIso, sucId) {
  await ensureSession();
  const { data, error } = await supabase.rpc('resumen_periodo_pos', {
    p_desde: fromIso, p_hasta: toIso, p_sucursal: sucId || null,
  });
  if (error) throw new Error(error.message);
  if (!data || !Number.isFinite(Number(data.ingresos)) || !Number.isFinite(Number(data.nVentas))) throw new Error('Resumen incompleto');
  return data;
}

/**
 * Hook: agrega ventas/compras/gastos del período seleccionado.
 * - Ventas: server-side por rango de fecha_cierre (el fix central).
 * - Compras/Gastos: se siguen sumando desde las listas ya cargadas en la
 *   página (no tienen sucursal_id y su volumen es bajo) → se pasan por props.
 */
export function useResumenPeriodo({ periodo, desde, hasta, sucId, compras = [], gastos = [] }) {
  let rango, errorRango;
  try { rango = rangoDesdePeriodo(periodo, desde, hasta); }
  catch (e) { errorRango = e; rango = rangoDesdePeriodo('today'); }
  const { fromIso, toIso, from, to } = rango;

  const { data, isLoading, isFetching, error: errorConsulta, refetch, isPlaceholderData } = useQuery({
    queryKey: ['resumen_periodo_ventas', periodo, fromIso, toIso, sucId || 'all'],
    queryFn: () => agregarVentas(fromIso, toIso, sucId),
    enabled: !errorRango,
    staleTime: 30000,
  });
  const error = errorRango || errorConsulta;

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
  const gastosTotalLocal = gastosArr.filter(g => inRange(g?.fecha || g?.created_date))
    .reduce((s, g) => s + (Number(g?.monto) || 0), 0);

  const ingresos = ventasAgg.ingresos;
  const nVentas = ventasAgg.nVentas;
  const utilidad = ventasAgg.utilidad;
  const ticketPromedio = nVentas > 0 ? ingresos / nVentas : 0;
  const margen = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
  const gastosTotal = data?.gastos ?? gastosTotalLocal;
  const neto = ingresos - comprasTotal - gastosTotal;

  return {
    from, to,
    totals: { ingresos, nVentas, utilidad, compras: comprasTotal, gastos: gastosTotal, ticketPromedio },
    margen,
    neto,
    error,
    cargando: isLoading || !!error || isPlaceholderData,
    reintentar: refetch,
    refrescando: isFetching && !isLoading,
  };
}

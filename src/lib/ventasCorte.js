// =====================================================================
// ventasCorte — ventas que pertenecen al corte ABIERTO, acotadas y completas.
// ---------------------------------------------------------------------
// POR QUÉ EXISTE (incidente 2026-07-30 → 2026-08-08):
//   El resumen del corte se calculaba sobre `Venta.filter({estado:'pagada'})`,
//   una consulta SIN límite, SIN orden y SIN filtro por corte. PostgREST corta
//   la respuesta en 1,000 filas (`content-range: 0-999/1290`) y, al no haber
//   ORDER BY, devolvía las 1,000 MÁS ANTIGUAS. Cuando Xochimilco superó las
//   1,000 ventas pagadas (2026-07-30 01:08), las ventas del día dejaron de
//   venir en la respuesta: el resumen daba 0 y el cierre guardaba 0.
//   10 cortes quedaron en cero (79,530 no reflejados) hasta el recálculo 0057.
//
// CÓMO LO EVITA:
//   * Filtra en PostgreSQL por el corte, no en el cliente.
//   * El conjunto queda acotado a las ventas de UN corte (máximo histórico
//     observado: 122), no a todo el histórico de la sucursal.
//   * Pagina explícitamente: si alguna vez un corte superara el tope de filas,
//     se siguen pidiendo páginas hasta agotarlo. La truncación deja de ser
//     posible por construcción, no por suerte.
//
// CONTRATO: devuelve exactamente el mismo tipo de filas que antes (ventas
// 'pagada'), de modo que la lógica de reparto venta↔corte de Caja.jsx
// (CANDADO 1) no cambia ni una línea: sólo recibe los datos correctos.
// =====================================================================
import { supabase, ensureSession } from '@/api/supabaseClient';

// Columnas que consumen el resumen y el desglose por método de pago.
const COLS = [
  'id', 'folio', 'estado', 'total', 'sucursal_id', 'corte_caja_id',
  'fecha_cierre', 'created_at', 'metodo_pago',
  'monto_efectivo', 'monto_tarjeta', 'monto_transferencia',
].join(',');

const PAGINA = 1000;

/**
 * Ventas del corte abierto. Replica EXACTAMENTE el criterio de aceptación del
 * resumen (Caja.jsx):
 *   (a) corte_caja_id === corte.id                                  ó
 *   (b) sin corte_caja_id, pagada tras la apertura y misma sucursal
 *       (fallback de "ventas en tránsito").
 * El filtro fino se sigue haciendo en el memo; aquí sólo se acota el universo
 * para que no pueda truncarse.
 */
export async function fetchVentasDelCorte(corte) {
  if (!corte?.id) return [];
  await ensureSession();

  const aperturaIso = corte.fecha_apertura || corte.fecha_inicio || corte.created_date;
  const sucId = corte.sucursal_id || null;

  // (a) OR (b) resuelto en PostgREST.
  const condiciones = [`corte_caja_id.eq.${corte.id}`];
  if (aperturaIso && sucId) {
    condiciones.push(
      `and(corte_caja_id.is.null,fecha_cierre.gte.${aperturaIso},sucursal_id.eq.${sucId})`
    );
  } else if (aperturaIso) {
    condiciones.push(`and(corte_caja_id.is.null,fecha_cierre.gte.${aperturaIso})`);
  }

  // any[]: la lista de columnas se construye en runtime, así que supabase-js no
  // puede inferir la forma de la fila. El adaptador anterior también devolvía
  // objetos sin tipar, así que el contrato para los consumidores no cambia.
  /** @type {any[]} */
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('ventas')
      .select(COLS)
      .eq('estado', 'pagada')
      .or(condiciones.join(','))
      .order('fecha_cierre', { ascending: true, nullsFirst: false })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`[ventas_corte] ${error.message}`);
    const page = Array.isArray(data) ? data : [];
    filas.push(...page);
    // Si la página no vino llena, ya no hay más.
    if (page.length < PAGINA) break;
  }

  // El adaptador exponía created_date como alias; se conserva por si algún
  // consumidor lo usa.
  for (const r of filas) {
    if (r && typeof r === 'object' && 'created_at' in r && !('created_date' in r)) {
      r.created_date = r.created_at;
    }
  }
  return filas;
}

/**
 * Cuenta, EN EL SERVIDOR, las ventas pagadas ligadas al corte.
 * Red de seguridad del cierre: si el servidor dice que hay ventas pero el
 * resumen del cliente calculó 0, algo falló al cargar y NO se debe guardar el
 * corte. Es la comprobación que faltaba en el incidente de 2026-07-30.
 */
export async function contarVentasDelCorte(corteId) {
  if (!corteId) return 0;
  await ensureSession();
  const { count, error } = await supabase
    .from('ventas')
    .select('id', { count: 'exact', head: true })
    .eq('corte_caja_id', corteId)
    .eq('estado', 'pagada');
  if (error) throw new Error(`[ventas_corte_count] ${error.message}`);
  return count || 0;
}

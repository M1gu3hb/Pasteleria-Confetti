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

  const aperturaCruda = corte.fecha_apertura || corte.fecha_inicio || corte.created_date;
  const sucId = corte.sucursal_id || null;

  // Postgres devuelve '2026-08-08 14:48:38.678+00' — con ESPACIO y '+', que en
  // una query string son ambiguos (el '+' se decodifica como espacio). Se
  // normaliza a ISO ('...T14:48:38.678Z') para que el filtro viaje sin
  // ambigüedad. Si la fecha no fuera parseable se omite el fallback en vez de
  // mandar un filtro roto.
  let aperturaIso = null;
  if (aperturaCruda) {
    const t = new Date(aperturaCruda).getTime();
    if (Number.isFinite(t)) aperturaIso = new Date(t).toISOString();
  }

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
  // La condición de parada se apoya en el TOTAL que reporta el servidor
  // (`count: 'exact'`), no en "la página vino a medias". Parar por página
  // incompleta sólo sería correcto mientras el tope de filas del servidor sea
  // >= PAGINA; si algún día bajara, truncaríamos en silencio otra vez — que es
  // justo el fallo que este módulo existe para eliminar.
  let total = null;
  let desde = 0;
  for (;;) {
    const { data, error, count } = await supabase
      .from('ventas')
      .select(COLS, { count: 'exact' })
      .eq('estado', 'pagada')
      .or(condiciones.join(','))
      .order('fecha_cierre', { ascending: true, nullsFirst: false })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`[ventas_corte] ${error.message}`);
    // OJO: `Number(count) || 0` sería una trampa. Si el count no llegara
    // (cabecera content-range ausente por un proxy), total valdría 0 y el corte
    // de abajo pararía tras la PRIMERA página: truncación silenciosa otra vez,
    // que es justo lo que este módulo existe para impedir. Si no hay count
    // fiable se deja en null y se pagina hasta que una página venga corta.
    if (total === null && Number.isFinite(Number(count))) total = Number(count);
    const page = Array.isArray(data) ? data : [];
    filas.push(...page);
    // Página vacía: el servidor ya no tiene más (evita bucle infinito).
    // Es TAMBIÉN la única condición de parada cuando no hay count fiable:
    // parar en "página corta" sería incorrecto si el tope del servidor fuese
    // menor que PAGINA (con tope 500 truncaría a 500). Cuesta una petición de
    // más y a cambio no puede truncar nunca.
    if (page.length === 0) break;
    // Avanzar por lo REALMENTE recibido, no por PAGINA: si el servidor devuelve
    // menos filas de las pedidas (su tope es menor), saltar de PAGINA en PAGINA
    // dejaría huecos y volveríamos a perder ventas.
    desde += page.length;
    // Ya reunimos todo lo que el servidor dice que existe.
    if (total !== null && filas.length >= total) break;
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
  // `count || 0` sería fallar ABIERTO: un count ausente (sin cabecera
  // content-range) se volvería 0 y el cierre no distinguiría "este corte no
  // tiene ventas" de "no pude verificar" — exactamente el agujero por el que
  // se escribieron los ceros. Devolvemos null y el caller aborta el cierre.
  return Number.isFinite(Number(count)) ? Number(count) : null;
}

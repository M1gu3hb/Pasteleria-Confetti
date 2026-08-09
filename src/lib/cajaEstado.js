// =====================================================================
// cajaEstado — fuente única de verdad del estado de caja por sucursal.
// ---------------------------------------------------------------------
// SUSTITUYE al patrón anterior (CorteCaja.list('-created_date', 50) con
// select('*') + filtro en cliente + refetchInterval por observador).
//
// POR QUÉ CAMBIA:
//   `useCajaAbierta` y `useCorteAtrasado` compartían queryKey pero cada uno
//   registraba su PROPIO temporizador de 8 s, y hay 6 puntos de montaje. React
//   Query crea un timer por OBSERVADOR, así que el intervalo efectivo caía a
//   ~2 s. Medido: 584,029 consultas y 4,137 s de CPU de base desde el 26-jun.
//
// CÓMO QUEDA:
//   - Filtro en PostgreSQL (sucursal + estado), no en el cliente.
//   - Sólo las columnas que consumen los call-sites, no select('*').
//   - limit 1 en vez de 50 filas.
//   - UN SOLO temporizador por sucursal, a nivel de módulo y con refcount,
//     independientemente de cuántos componentes monten los hooks.
//   - Refresco inmediato al volver al foco, recuperar red y al abrir/cerrar
//     caja (las invalidaciones existentes siguen funcionando: se conserva el
//     queryKey ['cortes_caja_estado', sucId], que hace prefix-match con los
//     invalidateQueries de Caja.jsx).
//
// POR QUÉ NO REALTIME (todavía):
//   La publicación `supabase_realtime` está VACÍA en este proyecto: ninguna
//   tabla emite eventos. Habilitarla es DDL en producción + infraestructura
//   nueva que no se puede validar en navegador desde aquí. Se deja preparado
//   en `suscribirRealtimeCaja()` (abajo), desactivado, para encenderlo cuando
//   Miguel autorice el ALTER PUBLICATION y se pueda probar en tablet.
//
// SEGURIDAD DEL DINERO (no cambia):
//   El frontend NUNCA autoriza una venta por caché. `crear_venta_directa_tx`
//   revalida el corte de forma atómica en Postgres y lanza CORTE_INEXISTENTE /
//   CORTE_NO_ABIERTO / CORTE_SUCURSAL_NO_COINCIDE. Por eso un intervalo de
//   respaldo más largo es seguro: el peor caso es que la UI tarde en enterarse,
//   no que se registre una venta con la caja cerrada.
// =====================================================================
import { supabase, ensureSession } from '@/api/supabaseClient';

// Columnas realmente consumidas por los call-sites (verificado por grep):
//   cajaAbierta.{id, folio, sucursal_id, sucursal_nombre, fecha_apertura,
//                fecha_inicio, created_date, usuario_apertura_nombre}
//   + estado y tipo_corte para la lógica de filtrado/compatibilidad.
const COLS_ABIERTA =
  'id,folio,estado,tipo_corte,sucursal_id,sucursal_nombre,fecha_apertura,fecha_inicio,created_at,usuario_apertura_nombre';

// Sólo lo que necesita `fondoEsperado` — MÁS `sucursal_id`.
// `sucursal_id` NO es decorativo aquí: useCajaAbierta descarta el placeholder y
// la memoria de sesión cuando la fila no es de la sucursal activa, y esa
// comprobación se hace sobre ESTE campo. Sin él, `undefined === '<uuid>'` era
// siempre false: el placeholder no se aplicaba nunca y la memoria del último
// cierre quedaba muerta, de modo que en cualquier ventana en la que la consulta
// no hubiera resuelto todavía `fondoEsperado` valía 0 — y ese número se graba
// en `fondo_esperado_apertura` / `diferencia_apertura` al abrir caja.
const COLS_CIERRE = 'id,estado,tipo_corte,sucursal_id,dinero_dejado_en_caja,created_at';

// El temporizador de respaldo y la invalidación viven en `cajaRefresco.js`
// (sin dependencia de Supabase, para poder verificarlos en Node).

// El adaptador expone created_date como alias de created_at; los consumidores
// (p. ej. useCorteAtrasado) lo usan. Se conserva idéntico.
function decorar(row) {
  if (row && typeof row === 'object' && 'created_at' in row) {
    if (!('created_date' in row)) row.created_date = row.created_at;
    if (!('updated_date' in row)) row.updated_date = row.created_at;
  }
  return row;
}

/**
 * Caja abierta de la sucursal: el corte 'abierto' de tipo cierre_diario más
 * reciente. Compatibilidad conservada: registros viejos sin tipo_corte cuentan
 * como cierre_diario (`tipo_corte.is.null`).
 * Devuelve el registro o null. Usa idx_cortes_sucursal_estado_created.
 */
export async function fetchCajaAbierta(sucursalId) {
  if (!sucursalId) return null;
  await ensureSession();
  const { data, error } = await supabase
    .from('cortes_caja')
    .select(COLS_ABIERTA)
    .eq('sucursal_id', sucursalId)
    .eq('estado', 'abierto')
    .or('tipo_corte.eq.cierre_diario,tipo_corte.is.null')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(`[cortes_caja] ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  return row ? decorar(row) : null;
}

/**
 * Último cierre de la sucursal — sólo para `fondoEsperado`.
 * Consulta separada y pequeña; cambia rara vez (al cerrar caja), y ese momento
 * ya invalida el caché.
 */
export async function fetchUltimoCierre(sucursalId) {
  if (!sucursalId) return null;
  await ensureSession();
  const { data, error } = await supabase
    .from('cortes_caja')
    .select(COLS_CIERRE)
    .eq('sucursal_id', sucursalId)
    .eq('estado', 'cerrado')
    .or('tipo_corte.eq.cierre_diario,tipo_corte.is.null')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(`[cortes_caja] ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  return row ? decorar(row) : null;
}

/**
 * PREPARADO, DESACTIVADO. Encender sólo cuando:
 *   1. Miguel autorice `alter publication supabase_realtime add table cortes_caja;`
 *   2. Se valide en tablet que el canal se mantiene estable con el WebView.
 * Mientras tanto el respaldo por intervalo es la vía de actualización.
 */
export function suscribirRealtimeCaja(sucursalId, queryClient) {
  const canal = supabase
    .channel(`caja-${sucursalId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cortes_caja', filter: `sucursal_id=eq.${sucursalId}` },
      () => queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado', sucursalId] })
    )
    .subscribe();
  return () => { try { supabase.removeChannel(canal); } catch { /* noop */ } };
}

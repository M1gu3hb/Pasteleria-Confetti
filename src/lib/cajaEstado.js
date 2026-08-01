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

// Sólo lo que necesita `fondoEsperado`.
const COLS_CIERRE = 'id,estado,tipo_corte,dinero_dejado_en_caja,created_at';

// Intervalo de respaldo. No es la vía principal de actualización: abrir/cerrar
// caja invalida al instante, y volver al foco refresca. 30 s acota la ventana
// en la que otra tablet podría no verse reflejada.
export const INTERVALO_RESPALDO_MS = 30_000;

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

// ── Refresco centralizado: UN temporizador por sucursal ──────────────────
// Con refcount: monten los componentes que monten, sólo existe un intervalo y
// un juego de listeners por sucursal. Esto es lo que elimina el efecto
// "N observadores = N timers" que provocaba el polling de ~2 s.
const registros = new Map(); // sucursalId -> { refs, timer, onFocus, onOnline }

export function registrarRefrescoCaja(sucursalId, queryClient) {
  if (!sucursalId || !queryClient) return () => {};

  let reg = registros.get(sucursalId);
  if (!reg) {
    const invalidar = () => {
      queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado', sucursalId] });
    };
    // Al volver del background / recuperar red: refresco inmediato.
    const onFocus = () => { if (document.visibilityState === 'visible') invalidar(); };
    const onOnline = () => invalidar();

    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onOnline);

    reg = {
      refs: 0,
      timer: setInterval(invalidar, INTERVALO_RESPALDO_MS),
      onFocus,
      onOnline,
    };
    registros.set(sucursalId, reg);
  }

  reg.refs += 1;

  return () => {
    const r = registros.get(sucursalId);
    if (!r) return;
    r.refs -= 1;
    if (r.refs <= 0) {
      clearInterval(r.timer);
      document.removeEventListener('visibilitychange', r.onFocus);
      window.removeEventListener('online', r.onOnline);
      registros.delete(sucursalId);
    }
  };
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

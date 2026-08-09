// =====================================================================
// cajaRefresco — UN solo temporizador de respaldo por sucursal.
// ---------------------------------------------------------------------
// Separado de `cajaEstado.js` a propósito: aquí NO se importa Supabase, así
// que la lógica de refcount/temporizador es verificable en Node sin navegador
// (ver scripts/fase1_caja_refresco_verify.mjs).
//
// PROBLEMA QUE RESUELVE:
//   React Query crea un temporizador por OBSERVADOR. Con `refetchInterval` en
//   los hooks y 6 puntos de montaje, el intervalo efectivo caía a ~2 s. Aquí el
//   intervalo vive a nivel de MÓDULO y con refcount: monten los componentes que
//   monten, hay exactamente un intervalo y un juego de listeners por sucursal.
//
// INVALIDACIÓN EXACTA (corrección 2026-08-01):
//   `invalidateQueries({ queryKey })` hace PREFIX match. Sin `exact: true`, la
//   clave ['cortes_caja_estado', suc] también alcanzaba a
//   ['cortes_caja_estado', suc, 'ultimo_cierre'], de modo que el temporizador
//   disparaba DOS consultas por sucursal en vez de una.
//   El respaldo periódico sólo debe refrescar la CAJA ABIERTA: el último cierre
//   únicamente cambia al cerrar caja, y esa mutación invalida por prefijo
//   (sin `exact`) desde Caja.jsx, alcanzando ambas. Ver `invalidarCajaQueries`.
// =====================================================================

// Intervalo de respaldo. No es la vía principal de actualización: abrir/cerrar
// caja invalida al instante y volver al foco refresca.
export const INTERVALO_RESPALDO_MS = 30_000;

export const KEY_CAJA_ABIERTA = (sucursalId) => ['cortes_caja_estado', sucursalId];
export const KEY_ULTIMO_CIERRE = (sucursalId) => ['cortes_caja_estado', sucursalId, 'ultimo_cierre'];

/**
 * Invalida SÓLO la caja abierta (coincidencia exacta).
 * Lo usan el temporizador de respaldo, `visibilitychange` y `online`.
 */
export function invalidarSoloCajaAbierta(queryClient, sucursalId) {
  return queryClient.invalidateQueries({
    queryKey: KEY_CAJA_ABIERTA(sucursalId),
    exact: true,
  });
}

/**
 * Invalida caja abierta Y último cierre. Para las mutaciones reales de
 * abrir/cerrar caja, donde `fondoEsperado` sí puede cambiar.
 * (Prefijo, sin `exact`: es lo que ya hace Caja.jsx con ['cortes_caja_estado'].)
 */
export function invalidarCajaCompleta(queryClient, sucursalId) {
  return queryClient.invalidateQueries({
    queryKey: KEY_CAJA_ABIERTA(sucursalId),
  });
}

// sucursalId -> { refs, timer, onFocus, onOnline }
const registros = new Map();

/**
 * Registra un consumidor del refresco de caja para una sucursal.
 * Devuelve la función de baja. El intervalo y los listeners se crean con el
 * primer consumidor y se destruyen con el último.
 *
 * `deps` permite inyectar temporizadores/entorno en las pruebas.
 */
export function registrarRefrescoCaja(sucursalId, queryClient, deps = {}) {
  if (!sucursalId || !queryClient) return () => {};

  // OJO CON LOS NATIVOS. `setInterval`/`clearInterval` son métodos de `window`
  // y Chrome exige que su receptor SEA `window` (WebIDL). Guardarlos tal cual y
  // llamarlos luego como propiedad de un objeto —`r.clearIntervalFn(r.timer)`,
  // abajo— los invoca con `this = r`, un objeto normal, y el navegador lanza
  // `TypeError: Illegal invocation`. Como eso ocurría dentro de la LIMPIEZA de
  // un useEffect, React desmontaba la aplicación entera: PANTALLA EN BLANCO.
  // Sólo se disparaba al cambiar de sucursal efectiva (entrar como dueño o
  // pastelero, que no tienen sucursal), que es cuando cambia la dependencia del
  // efecto y React ejecuta la limpieza.
  // Se envuelven en flechas: así el receptor deja de importar. Se conserva la
  // inyección por `deps` para las pruebas.
  const {
    setIntervalFn = (fn, ms) => setInterval(fn, ms),
    clearIntervalFn = (id) => clearInterval(id),
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    intervaloMs = INTERVALO_RESPALDO_MS,
  } = deps;

  let reg = registros.get(sucursalId);
  if (!reg) {
    // SÓLO la caja abierta: el temporizador no debe traer el último cierre.
    const invalidar = () => invalidarSoloCajaAbierta(queryClient, sucursalId);

    const onFocus = () => {
      if (!doc || doc.visibilityState === 'visible') invalidar();
    };
    const onOnline = () => invalidar();

    doc?.addEventListener?.('visibilitychange', onFocus);
    win?.addEventListener?.('online', onOnline);

    reg = {
      refs: 0,
      timer: setIntervalFn(invalidar, intervaloMs),
      onFocus,
      onOnline,
      doc,
      win,
      clearIntervalFn,
    };
    registros.set(sucursalId, reg);
  }

  reg.refs += 1;

  return () => {
    const r = registros.get(sucursalId);
    if (!r) return;
    r.refs -= 1;
    if (r.refs <= 0) {
      r.clearIntervalFn(r.timer);
      r.doc?.removeEventListener?.('visibilitychange', r.onFocus);
      r.win?.removeEventListener?.('online', r.onOnline);
      registros.delete(sucursalId);
    }
  };
}

/** Sólo para pruebas / diagnóstico: cuántos registros activos hay. */
export function _registrosActivos() {
  return new Map([...registros].map(([k, v]) => [k, v.refs]));
}

import { ConfettiScanner, isNativeApp } from './confettiScannerPlugin';

/**
 * Puente JS del lector nativo (plugin ConfettiScanner, APK 1.3.0+).
 *
 * La web llega por Vercel y puede correr sobre un APK SIN este plugin (1.1.x/1.2.x): en ese caso
 * todo degrada a {disponible:false, motivo:'apk_anterior'} y la ruta web de siempre sigue igual.
 * En el navegador nunca se llama al plugin.
 *
 * Protocolo: el nativo consume las teclas del lector VINCULADO y emite 'lectura' (lotes de teclas
 * con tiempos del evento original) y 'estado' (vínculo, conexión, ambigüedad). La validez del código
 * la decide el parser JS común (barcodeFrame) en scannerCapture.
 */
export const SCANNER_PROTOCOL = 1;
const UNIMPLEMENTED = /not implemented|unimplemented|no such method|not available|is not a function/i;

const motivoError = (e) => {
  const code = e && e.code;
  const msg = String((e && e.message) || e || '');
  if (code === 'UNIMPLEMENTED' || UNIMPLEMENTED.test(msg)) return 'apk_anterior';
  if (code === 'PROTOCOLO') return 'protocolo';
  return 'error';
};

/** @param {{plugin?:any,isNative?:()=>boolean,onBatch?:(b:any)=>void,onState?:(s:any)=>void}} [opts] */
export function createNativeScannerBridge({ plugin = ConfettiScanner, isNative = isNativeApp, onBatch, onState } = {}) {
  let state = { disponible: false, motivo: 'iniciando' };
  let handles = [];
  let starting = null;
  // The JS generation/timing can change while iniciar() is in flight (e.g. the POS registers right
  // after start). Always remember the latest values and send them once the plugin is ready;
  // otherwise every native read would carry an old generation and be discarded as stale.
  let latestGen = 0, latestMaxGap = 250;
  const setState = (next) => { state = next; onState?.(state); };
  const fromNative = (s) => ({ ...(s && typeof s === 'object' ? s : {}), disponible: true, motivo: '' });
  const exigir = () => {
    if (!state.disponible) throw new Error('Esta app instalada no incluye el lector nativo. Instala Confetti POS 1.3.0 o posterior.');
  };
  const traducir = (e) => {
    const m = String((e && e.message) || '');
    return new Error(m || 'El lector nativo no respondió. Inténtalo de nuevo.');
  };
  const call = async (method, args) => {
    exigir();
    try { const s = await plugin[method](args || {}); setState(fromNative(s)); return state; }
    catch (e) { throw Object.assign(traducir(e), { code: e && e.code }); }
  };
  return {
    get state() { return state; },
    start(gen, maxGap) {
      if (starting) return starting;
      latestGen = gen; latestMaxGap = maxGap;
      starting = (async () => {
        if (!isNative()) { setState({ disponible: false, motivo: 'navegador' }); return state; }
        try {
          handles.push(await plugin.addListener('lectura', (b) => onBatch?.(b)));
          handles.push(await plugin.addListener('estado', (s) => setState(fromNative(s))));
          const sentGen = latestGen, sentMaxGap = latestMaxGap;
          const s = await plugin.iniciar({ protocolo: SCANNER_PROTOCOL, gen: sentGen, maxGap: sentMaxGap });
          setState(fromNative(s));
          if (latestMaxGap !== sentMaxGap) await plugin.configurar({ maxGap: latestMaxGap }).then((x) => setState(fromNative(x)));
          if (latestGen !== sentGen) await plugin.invalidar({ gen: latestGen });
        } catch (e) {
          for (const h of handles) { try { await h?.remove?.(); } catch { /* ya no existe */ } }
          handles = [];
          setState({ disponible: false, motivo: motivoError(e), detalle: String((e && e.message) || '') });
        }
        return state;
      })();
      return starting;
    },
    invalidate(gen) { latestGen = gen; if (state.disponible) Promise.resolve().then(() => plugin.invalidar({ gen })).catch(() => {}); },
    configure(maxGap) { latestMaxGap = maxGap; if (state.disponible) Promise.resolve().then(() => plugin.configurar({ maxGap })).then((s) => setState(fromNative(s))).catch(() => {}); },
    refresh() { return state.disponible ? call('estado') : Promise.resolve(state); },
    startPairing(segundos = 180) { return call('iniciarVinculacion', { segundos }); },
    cancelPairing() { return state.disponible ? call('cancelarVinculacion') : Promise.resolve(state); },
    bind(d) {
      return call('vincular', { descriptor: d?.descriptor || '', vendorId: d?.vendorId, productId: d?.productId, nombre: d?.nombre || '' });
    },
    unbind() { return call('desvincular'); },
    dispose() { for (const h of handles) { try { h?.remove?.(); } catch { /* ignore */ } } handles = []; },
  };
}

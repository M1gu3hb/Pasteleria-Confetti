import { createBarcodeFrame } from './barcodeFrame';

export const PAIRING_READS = 3;

const FIN = {
  tiempo: 'La lectura no terminó con Enter (o se interrumpió). El lector debe enviar Enter al final.',
  desconexion: 'El lector se desconectó durante la lectura.',
  limite: 'Lectura demasiado larga sin Enter.',
  pausa: 'La aplicación se pausó durante la lectura.',
  vinculacion: 'Lectura interrumpida.',
  invalidado: 'Lectura interrumpida.',
};

/** Same physical device in this connection (deviceId changes when it is re-plugged). */
export const sameDevice = (a, b) => !!a && !!b && a.id === b.id && a.vendorId === b.vendorId &&
  a.productId === b.productId && a.nombre === b.nombre && a.descriptor === b.descriptor;

/**
 * Explicit pairing step (Configuración → Escáner → Vincular lector).
 *
 * The person scans the SAME printed code three times; the device that produced three consecutive
 * valid reads is the reader. Typing speed alone never decides it. Each read goes through the same
 * parser rules as a sale (barcodeFrame, native mode). It never looks up or writes products.
 * Ambiguous identity (another identical device connected) or a device without USB identity is
 * reported and never offered for binding.
 * @param {{getSettings:()=>any,onChange?:(snapshot:any)=>void}} opts
 */
export function createPairingSession({ getSettings, onChange }) {
  const frames = new Map();
  let readings = [], candidate = null, streak = 0, lastCode = null, seq = 0, current = null, lastReason = '';
  const problemOf = (d, iguales) => {
    if (!d) return '';
    if (d.vendorId === 0 && d.productId === 0) return 'identidad';
    if (Number(iguales) > 1) return 'ambiguo';
    return '';
  };
  const snapshot = () => {
    const last = readings.at(-1) || null;
    const problem = last ? problemOf(last.device, last.iguales) : '';
    return {
      readings: readings.slice(-10), candidate, streak, code: lastCode, problem,
      ready: streak >= PAIRING_READS && !problem && !!candidate,
    };
  };
  const record = (entry) => {
    const r = { ...entry, n: ++seq, device: current?.device || null, iguales: current?.iguales ?? 0 };
    readings.push(r);
    if (readings.length > 50) readings = readings.slice(-50);
    if (!r.ok) { streak = 0; lastCode = null; candidate = r.device; return; }
    const continues = streak > 0 && sameDevice(candidate, r.device) && r.code === lastCode;
    streak = continues ? streak + 1 : 1;
    candidate = r.device;
    lastCode = r.code;
  };
  const frameFor = (device) => {
    const key = device ? `${device.id}|${device.vendorId}|${device.productId}|${device.nombre}|${device.descriptor}` : 'sin-dispositivo';
    let f = frames.get(key);
    if (!f) {
      f = createBarcodeFrame({
        getContext: () => ({ branch: null, contextKey: 'vinculacion', enabled: true }),
        isModalOpen: () => false,
        getSettings: () => ({ ...getSettings(), enabled: true }),
        onScan: () => {},
        onDraft: () => {}, onReading: () => {}, onStatus: () => {},
        onEvent: (e) => {
          if (e.type === 'interrupted' && e.reason) lastReason = e.reason;
          if (e.type === 'complete') record({ ok: true, code: e.code, maxGap: e.maxGap });
          if (e.type === 'invalid') record({ ok: false, code: e.code, reason: e.reason || lastReason || 'Lectura incompleta.' });
        },
      });
      frames.set(key, f);
    }
    return f;
  };
  return {
    get snapshot() { return snapshot(); },
    handle(batch) {
      if (!batch || batch.origen !== 'vinculacion') return;
      const device = batch.dispositivo && typeof batch.dispositivo === 'object' ? batch.dispositivo : null;
      current = { device, iguales: batch.iguales };
      lastReason = '';
      const f = frameFor(device);
      const keys = Array.isArray(batch.teclas) ? batch.teclas.filter(k => k && typeof k.k === 'string' && Number.isFinite(Number(k.t))) : [];
      for (const k of keys) {
        f.handle({ key: k.k, repeat: (Number(k.r) || 0) > 0, ctrlKey: !!k.ctrl, altKey: !!k.alt, metaKey: !!k.meta, isComposing: false, isTrusted: true, preventDefault() {}, stopPropagation() {} }, { native: true }, Number(k.t));
      }
      if (batch.fin !== 'enter') {
        const chars = keys.filter(k => k.k.length === 1).map(k => k.k).join('');
        if (chars || f.active) record({ ok: false, code: chars, reason: FIN[batch.fin] || 'Lectura interrumpida.' });
        f.reset();
      }
      current = null;
      onChange?.(snapshot());
    },
  };
}

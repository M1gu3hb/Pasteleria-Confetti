// Web Audio API generated sounds for notifications
// No external files needed.

let _ctx = null;
let _unlocked = false;

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return null; }
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
};

// Desbloquea el audio en el primer gesto del usuario (requerimiento de navegadores móviles).
// Llamar `unlockAudio()` desde un handler de click/touch/keydown.
export const unlockAudio = () => {
  try {
    const ctx = getCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Tono inaudible muy corto para "armar" el contexto.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.01);
    _unlocked = true;
    return true;
  } catch { return false; }
};

export const isAudioUnlocked = () => _unlocked;

// Auto-instala listeners globales una sola vez por sesión, así cualquier interacción
// en cualquier parte de la app desbloquea el audio.
if (typeof window !== 'undefined' && !window.__mh_audio_listeners_installed) {
  window.__mh_audio_listeners_installed = true;
  const handler = () => {
    unlockAudio();
    window.removeEventListener('click', handler);
    window.removeEventListener('touchstart', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('click', handler, { passive: true });
  window.addEventListener('touchstart', handler, { passive: true });
  window.addEventListener('keydown', handler);
}

const playTone = (freq, duration, type = 'sine', volume = 0.5, delay = 0) => {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  } catch { /* no-op */ }
};

const isEnabled = () => {
  try {
    // Soporta clave nueva y antigua para compatibilidad
    const v = localStorage.getItem('mh_sounds_enabled') ?? localStorage.getItem('azecafe_sounds_enabled');
    return v !== 'false';
  } catch { return true; }
};

const getVolume = () => {
  try {
    const raw = localStorage.getItem('mh_sounds_volume') ?? localStorage.getItem('azecafe_sounds_volume');
    const v = parseFloat(raw);
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  } catch { return 0.7; }
};

export const setSoundsEnabled = (enabled) => {
  try { localStorage.setItem('mh_sounds_enabled', enabled ? 'true' : 'false'); } catch {}
};
export const setSoundsVolume = (vol) => {
  try { localStorage.setItem('mh_sounds_volume', String(vol)); } catch {}
};
export const areSoundsEnabled = () => isEnabled();

// Sonido para nuevo pedido en cocina (campana doble — alerta clara)
export const playNewOrder = () => {
  try {
    if (!isEnabled()) return;
    const v = getVolume();
    playTone(880, 0.18, 'sine', 0.4 * v, 0);
    playTone(1320, 0.22, 'sine', 0.45 * v, 0.18);
    playTone(880, 0.15, 'sine', 0.3 * v, 0.42);
  } catch {}
};

// Sonido para pedido listo (campana ascendente — éxito)
export const playReady = () => {
  try {
    if (!isEnabled()) return;
    const v = getVolume();
    playTone(660, 0.12, 'sine', 0.35 * v, 0);
    playTone(880, 0.14, 'sine', 0.4 * v, 0.13);
    playTone(1175, 0.28, 'sine', 0.45 * v, 0.28);
  } catch {}
};

// Test sound
export const playTest = () => {
  try {
    const v = getVolume();
    playTone(880, 0.2, 'sine', 0.5 * v, 0);
    playTone(1175, 0.25, 'sine', 0.5 * v, 0.2);
  } catch {}
};
// Voz/audio local para alertas del mesero y cocina.
// Usa SOLO Web Speech API (speechSynthesis) — local del navegador.
// No usa APIs externas ni IA. No gasta créditos.
//
// ⚠️ LIMITACIÓN TÉCNICA — iOS / Safari / móviles
// -----------------------------------------------
// La voz depende 100% del motor del sistema (Web Speech API). Por diseño
// del navegador puede no sonar cuando:
//   • La app/pestaña está en SEGUNDO PLANO.
//   • La pantalla está BLOQUEADA.
//   • iOS Safari pausó audio por política de ahorro de batería.
//   • El usuario aún NO interactuó con la pantalla (iOS exige un tap previo
//     para habilitar audio — por eso existe el botón "Activar sonido").
//
// En PANTALLA ACTIVA (cocina o mesero con la pantalla visible y desbloqueada)
// la voz funciona normalmente. No se puede saltar esta limitación sin usar
// APIs externas / push nativo, y esta app NO usa integraciones externas ni
// gasta créditos en voz.
//
// Hay DOS configuraciones independientes:
// - mh_mesero_alert_config: preferencias del mesero (modo, decir_nombre, volumen).
// - mh_cocina_voz_config: preferencias de cocina (voz ON/OFF, volumen, lang).
//
// SELECCIÓN INTELIGENTE DE VOZ EN ESPAÑOL
// ----------------------------------------
// Las voces disponibles dependen del SO/navegador. Para que TODOS los
// dispositivos suenen lo más natural posible:
//  1) Detectamos voces con speechSynthesis.getVoices().
//  2) Aplicamos prioridad: es-MX > es-419 > es-US (latino) > es-ES > cualquier es-*.
//  3) Preferimos voces locales del sistema (localService: true) — suelen ser
//     más claras y no dependen de red.
//  4) Cacheamos la voz elegida por idioma en localStorage (mh_voice_picked).
//  5) El usuario puede sobreescribir manualmente con `setPreferredVoice(name)`.
//  6) Si nada coincide, fallback a la voz por defecto del navegador.

const KEY_MESERO = 'mh_mesero_alert_config';
const KEY_COCINA = 'mh_cocina_voz_config';
const KEY_VOICE_CACHE = 'mh_voice_picked';      // { [lang]: voiceName }
const KEY_VOICE_MANUAL = 'mh_voice_manual';     // voiceName elegido a mano (override)

const DEFAULT_MESERO = {
  modo: 'sonido_voz',     // silencio | sonido | voz | sonido_voz
  decir_nombre: true,
  volumen: 0.9,
  lang: 'es-MX',
};

const DEFAULT_COCINA = {
  voz_activa: true,   // si false, cocina solo recibe sonido/visual sin lectura larga
  volumen: 0.9,
  lang: 'es-MX',
};

// === Mesero ===
export function getAlertConfig() {
  try {
    const raw = localStorage.getItem(KEY_MESERO);
    if (!raw) return { ...DEFAULT_MESERO };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_MESERO, ...(parsed || {}) };
  } catch { return { ...DEFAULT_MESERO }; }
}
export function setAlertConfig(partial) {
  try {
    const cur = getAlertConfig();
    const next = { ...cur, ...(partial || {}) };
    localStorage.setItem(KEY_MESERO, JSON.stringify(next));
    return next;
  } catch { return getAlertConfig(); }
}

// === Cocina ===
export function getCocinaVozConfig() {
  try {
    const raw = localStorage.getItem(KEY_COCINA);
    if (!raw) return { ...DEFAULT_COCINA };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_COCINA, ...(parsed || {}) };
  } catch { return { ...DEFAULT_COCINA }; }
}
export function setCocinaVozConfig(partial) {
  try {
    const cur = getCocinaVozConfig();
    const next = { ...cur, ...(partial || {}) };
    localStorage.setItem(KEY_COCINA, JSON.stringify(next));
    return next;
  } catch { return getCocinaVozConfig(); }
}

export function isVoiceSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// =====================================================
// SELECCIÓN INTELIGENTE DE VOZ
// =====================================================

function readVoiceCache() {
  try {
    const raw = localStorage.getItem(KEY_VOICE_CACHE);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}
function writeVoiceCache(map) {
  try { localStorage.setItem(KEY_VOICE_CACHE, JSON.stringify(map || {})); } catch {}
}

/** Voz elegida manualmente por el usuario (override). */
export function getPreferredVoiceName() {
  try { return localStorage.getItem(KEY_VOICE_MANUAL) || ''; } catch { return ''; }
}
/** Fija manualmente la voz por nombre. Pasa '' para volver a auto. */
export function setPreferredVoice(name) {
  try {
    if (name) localStorage.setItem(KEY_VOICE_MANUAL, name);
    else localStorage.removeItem(KEY_VOICE_MANUAL);
  } catch {}
}

/** Lista plana de voces disponibles. Vacío si aún no cargaron. */
export function listVoices() {
  if (!isVoiceSupported()) return [];
  try { return window.speechSynthesis.getVoices() || []; } catch { return []; }
}

/**
 * Asegura que las voces estén cargadas (algunos navegadores las cargan async).
 * Espera hasta 1.5s. Devuelve la lista (puede ser vacía).
 */
export function ensureVoicesLoaded(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!isVoiceSupported()) return resolve([]);
    let voices = listVoices();
    if (voices.length) return resolve(voices);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(listVoices());
    };
    try {
      window.speechSynthesis.onvoiceschanged = () => finish();
    } catch {}
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Puntaje para ordenar voces por preferencia.
 * Mayor = mejor.
 *
 * Prioridad pedida:
 *   1. es-MX
 *   2. es-419
 *   3. es-US (si es voz en español, latina)
 *   4. es-ES
 *   5. cualquier otra es-*
 *   6. fallback (cualquiera)
 *
 * Bonificaciones adicionales:
 *   + voz local del sistema (localService: true)
 *   + nombres conocidos por calidad (Google/Microsoft/Apple natural)
 *   – penalización a nombres que suelen ser robóticos viejos
 */
function scoreVoice(voice, targetLang = 'es-MX') {
  if (!voice) return -Infinity;
  const lang = (voice.lang || '').toLowerCase();
  const name = (voice.name || '').toLowerCase();
  let score = 0;

  // Match exacto del idioma pedido
  if (lang === targetLang.toLowerCase()) score += 200;

  // Prioridad por familia es-*
  if (lang === 'es-mx') score += 150;
  else if (lang === 'es-419' || lang.startsWith('es-419')) score += 130;
  else if (lang === 'es-us') score += 110;
  else if (lang === 'es-es') score += 90;
  else if (lang.startsWith('es')) score += 70;

  // Voz local del sistema → más confiable y clara
  if (voice.localService) score += 40;

  // Default del sistema
  if (voice.default) score += 10;

  // Heurística de calidad por nombre (no es perfecto pero ayuda mucho)
  const buenas = [
    'google', 'microsoft', 'apple', 'natural', 'neural',
    'paulina', 'jorge', 'monica', 'mónica', 'helena', 'sabina',
    'diego', 'lucia', 'lucía', 'mateo', 'enrique',
  ];
  if (buenas.some(k => name.includes(k))) score += 25;

  const malas = ['espeak', 'pico', 'festival'];
  if (malas.some(k => name.includes(k))) score -= 30;

  return score;
}

/**
 * Devuelve la mejor voz disponible para el idioma destino.
 * Si el usuario fijó manualmente una voz por nombre, esa gana.
 */
export function pickBestVoice(targetLang = 'es-MX') {
  if (!isVoiceSupported()) return null;
  const voices = listVoices();
  if (!voices.length) return null;

  const manualName = getPreferredVoiceName();
  if (manualName) {
    const manual = voices.find(v => v.name === manualName);
    if (manual) return manual;
  }

  const sorted = [...voices].sort((a, b) => scoreVoice(b, targetLang) - scoreVoice(a, targetLang));
  return sorted[0] || null;
}

/**
 * Igual que pickBestVoice pero cachea la elección por idioma para no recalcular
 * en cada utterance (más rápido y consistente).
 */
export function getBestVoice(targetLang = 'es-MX') {
  if (!isVoiceSupported()) return null;
  const voices = listVoices();
  if (!voices.length) return null;

  const manualName = getPreferredVoiceName();
  if (manualName) {
    const manual = voices.find(v => v.name === manualName);
    if (manual) return manual;
  }

  const cache = readVoiceCache();
  const cachedName = cache[targetLang];
  if (cachedName) {
    const found = voices.find(v => v.name === cachedName);
    if (found) return found;
  }
  const best = pickBestVoice(targetLang);
  if (best) {
    cache[targetLang] = best.name;
    writeVoiceCache(cache);
  }
  return best;
}

/** Limpia el cache y recalcula. Útil tras instalar/cambiar voces del sistema. */
export function recalcBestVoice(targetLang = 'es-MX') {
  writeVoiceCache({});
  return getBestVoice(targetLang);
}

/** Info legible de la voz actualmente seleccionada (para UI). */
export function getCurrentVoiceInfo(targetLang = 'es-MX') {
  const v = getBestVoice(targetLang);
  if (!v) return { available: false };
  return {
    available: true,
    name: v.name,
    lang: v.lang,
    local: !!v.localService,
    manual: !!getPreferredVoiceName(),
  };
}

// Precarga las voces al cargar el módulo (no bloqueante).
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  ensureVoicesLoaded().catch(() => {});
}

// =====================================================
// COLA DE VOZ — para que TODAS las frases se lean en orden
// =====================================================
//
// Antes hacíamos window.speechSynthesis.cancel() en cada speak(), por lo que
// si llegaban varias frases casi simultáneas (varias comandas a cocina), sólo
// se escuchaba la última. Ahora encolamos y reproducimos secuencialmente
// usando `utter.onend` / `onerror`.
//
// Reglas:
//  - Cada llamada a speak() agrega un item a la cola.
//  - Si la cola estaba vacía, arranca el reproductor.
//  - Si una frase falla u termina, automáticamente arranca la siguiente.
//  - Anti-duplicado: si la misma frase está pendiente en los próximos 4s,
//    no se encola dos veces (evita lecturas duplicadas por refresh/polling).

const voiceQueue = [];
let isSpeaking = false;

function processVoiceQueue() {
  if (isSpeaking) return;
  const next = voiceQueue.shift();
  if (!next) return;
  isSpeaking = true;
  try {
    const utter = new window.SpeechSynthesisUtterance(next.text);
    utter.lang = next.lang;
    utter.volume = next.volume;
    utter.rate = 1;
    utter.pitch = 1;
    if (next.voice) {
      try { utter.voice = next.voice; } catch {}
      if (next.voice.lang) utter.lang = next.voice.lang;
    }
    const advance = () => {
      isSpeaking = false;
      // Pequeño respiro entre frases para que se distingan
      setTimeout(processVoiceQueue, 220);
    };
    utter.onend = advance;
    utter.onerror = advance;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.warn('[voiceAlert] processVoiceQueue:', err);
    isSpeaking = false;
    setTimeout(processVoiceQueue, 220);
  }
}

/** Limpia la cola pendiente y detiene la voz en curso (uso muy raro). */
export function clearVoiceQueue() {
  voiceQueue.length = 0;
  try { window.speechSynthesis.cancel(); } catch {}
  isSpeaking = false;
}

// =====================================================
// SPEAK — encola y usa la mejor voz disponible
// =====================================================

/**
 * Habla un texto. Si `cocina = true`, usa la config de cocina (independiente del modo del mesero).
 * Usa una cola interna: si ya está hablando, espera a que termine.
 */
export function speak(text, opts = {}) {
  if (!text || !isVoiceSupported()) return;
  try {
    const isCocina = !!opts.cocina;
    const cfg = isCocina ? getCocinaVozConfig() : getAlertConfig();
    if (isCocina && !cfg.voz_activa) return;
    if (!isCocina && (cfg.modo === 'silencio' || cfg.modo === 'sonido')) return;

    const lang = opts.lang || cfg.lang || 'es-MX';
    const volume = Number.isFinite(cfg.volumen) ? cfg.volumen : 0.9;
    const voice = getBestVoice(lang);

    // Anti-duplicado básico: si la misma frase ya está pendiente, no la repetimos.
    const yaEnCola = voiceQueue.some(q => q.text === text);
    if (yaEnCola) return;

    voiceQueue.push({ text, lang, volume, voice });
    processVoiceQueue();
  } catch (err) {
    console.warn('[voiceAlert] speak fallo:', err);
  }
}

/**
 * Frase para anunciar una solicitud QR.
 */
export function frasePorSolicitud(tipo, mesaNumero, nombreMesero) {
  const verbos = {
    ordenar: 'quiere ordenar',
    cuenta: 'solicita la cuenta',
    ayuda: 'requiere ayuda',
  };
  const v = verbos[tipo] || 'requiere atención';
  const mesa = `Mesa ${mesaNumero || ''}`.trim();
  if (nombreMesero) return `${nombreMesero}, ${mesa} ${v}.`;
  return `${mesa} ${v}.`;
}

/**
 * Frase para anunciar al mesero que un pedido está listo.
 *
 * F3.2: ahora soporta nombre de estación de preparación. Si la estación viene,
 * se dice "recoger en <estación>" en vez de "recoger en cocina".
 * Si no viene estación, fallback a "cocina" para no romper apps sin estaciones.
 *
 * @param {number|string} mesaNumero    Número de mesa.
 * @param {string} [nombreMesero]       Nombre opcional del mesero (si decir_nombre activo).
 * @param {string} [estacionNombre]     Nombre de la estación (Postres, Barra...).
 */
export function fraseListoCocina(mesaNumero, nombreMesero, estacionNombre) {
  const mesa = `mesa ${mesaNumero || ''}`.trim();
  const destino = (estacionNombre || '').trim() || 'cocina';
  if (nombreMesero) return `${nombreMesero}, pedido de ${mesa} listo, recoger en ${destino}.`;
  return `Pedido de ${mesa} listo, recoger en ${destino}.`;
}

/**
 * Frase descriptiva para cocina cuando llega un pedido nuevo.
 *
 * 🔴 HOTFIX BANDERA ROJA: ahora menciona ALERGIAS y CELEBRACIÓN cuando vienen
 * en el pedido. Las alergias son información de seguridad — siempre se anuncian
 * PRIMERO. La celebración va después. Si no hay, no se dice nada (no aparece
 * "undefined" ni "null").
 *
 * Reglas:
 *  - notas_alergias: se limita a 80 caracteres para no leer textos enormes.
 *  - celebracion / tipoCelebracion: solo se mencionan si celebracion=true.
 *  - Si notas_alergias es null/undefined/'' → no se anuncia alergia.
 *  - Anti-duplicado en speak() evita que se repita en bucle.
 *
 * @param {number|string} mesaNumero
 * @param {Array} items                array [{producto_nombre, cantidad, notas}]
 * @param {string} notaGeneral         nota global del pedido
 * @param {Object} [extras]            { notas_alergias, celebracion, tipo_celebracion }
 */
export function fraseNuevoPedidoCocina(mesaNumero, items, notaGeneral, extras) {
  const safeItems = Array.isArray(items) ? items : [];
  const mesaStr = mesaNumero ? `mesa ${mesaNumero}` : 'mostrador';
  const partes = safeItems
    .filter(i => i && i.producto_nombre)
    .slice(0, 8) // máximo 8 productos
    .map(i => {
      const cant = Number(i.cantidad) > 1 ? `${i.cantidad} ` : '';
      const nota = (i.notas || '').trim();
      if (!nota) return `${cant}${i.producto_nombre}`.trim();
      return `${cant}${i.producto_nombre}, ${nota}`.trim();
    });
  const cuerpo = partes.length > 0 ? partes.join(', ') : 'pedido nuevo';
  const ng = (notaGeneral || '').trim();
  const colaNota = ng ? ` Nota general: ${ng}.` : '';

  // ALERGIAS — prioridad alta, hasta 80 chars para no leer textos enormes.
  let prefijoAlerta = '';
  const aler = (extras?.notas_alergias || '').trim();
  if (aler) {
    const resumen = aler.length > 80 ? aler.slice(0, 80) + '…' : aler;
    prefijoAlerta = `Atención, alergia: ${resumen}. `;
  }

  // CELEBRACIÓN — solo si celebracion=true.
  let colaCelebra = '';
  if (extras?.celebracion === true) {
    const tipo = (extras?.tipo_celebracion || '').trim();
    colaCelebra = tipo ? ` Celebración: ${tipo}.` : ' Celebración especial.';
  }

  return `${prefijoAlerta}Nuevo pedido ${mesaStr}: ${cuerpo}.${colaNota}${colaCelebra}`;
}

export function testVoice(nombre) {
  if (!isVoiceSupported()) return false;
  speak(nombre ? `Hola ${nombre}, esta es una prueba de voz.` : 'Esta es una prueba de voz.');
  return true;
}

export function testVoiceCocina() {
  if (!isVoiceSupported()) return false;
  speak('Voz de cocina activa. Esta es una prueba.', { cocina: true });
  return true;
}
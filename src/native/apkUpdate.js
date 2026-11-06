import { ConfettiApp, isNativeApp } from './confettiAppPlugin';

/**
 * Aviso "Actualización pendiente" del APK (sólo dentro de la app instalada, nunca en navegador).
 *
 * Fuente: public/apk/actualizacion.json, servido por el mismo alias que carga el APK. Mientras
 * `publicada` no sea true (APK firmado con la llave de Miguel y subido), no aparece nada. Datos
 * inválidos o incompletos = sin aviso (falla cerrada): nunca se anuncia algo que no se puede instalar.
 *
 * Versión instalada: APK 1.3.0+ la informa ConfettiApp.info(). Un APK sin ese plugin es 1.1.1 o
 * anterior (1.2.0 nunca se distribuyó): se toma versionCode 3.
 */
export const MANIFIESTO_URL = '/apk/actualizacion.json';
export const VERSION_SIN_ACTUALIZADOR = Object.freeze({ versionCode: 3, versionName: '1.1.1 o anterior', actualizadorNativo: false });

// Hosts que el APK abre DENTRO de la app (capacitor.config.ts: server.url + allowNavigation). En
// APK < 1.3.0 un enlace a ellos no descarga nada (Capacitor no tiene gestor de descargas): el APK
// debe estar en un host que Android abra en el navegador. scripts/apk_update_verify.mjs comprueba
// que esta lista sigue igual que la configuración.
export const HOSTS_DENTRO_DE_LA_APP = Object.freeze([
  'pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app',
  '*.vercel.app',
  'ivqcxdpqxwjxfohiswqb.supabase.co',
  '*.supabase.co',
]);

const UNIMPLEMENTED = /not implemented|unimplemented|no such method|not available|is not a function/i;

/** Réplica de com.getcapacitor.util.HostMask.Simple (mayúsculas indistintas, '*' por etiqueta). */
export function coincideHost(mask, host) {
  if (typeof mask !== 'string' || typeof host !== 'string' || !host) return false;
  // String.split de Java descarta las cadenas vacías finales ("host." == "host").
  const partes = s => { const p = s.split('.'); while (p.length > 1 && p[p.length - 1] === '') p.pop(); return p.reverse(); };
  const m = partes(mask), h = partes(host);
  if (m.length > 1 && h.length !== m.length) return false;
  for (let i = 0; i < Math.min(m.length, h.length); i++) {
    if (m[i] !== '*' && m[i].toUpperCase() !== h[i].toUpperCase()) return false;
  }
  return true;
}

/** true si Android abrirá la URL en el navegador del sistema (no dentro del POS). */
export function abreFueraDeLaApp(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== 'https:' || !u.hostname) return false;
  return !HOSTS_DENTRO_DE_LA_APP.some(mask => coincideHost(mask, u.hostname));
}

const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !!u.hostname; } catch { return false; } };

export function validarManifiesto(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.esquema !== 1 || raw.publicada !== true) return null;
  const { versionCode, versionName, apk, sha256, cambios, pagina, fecha } = raw;
  if (!Number.isInteger(versionCode) || versionCode <= 0) return null;
  if (typeof versionName !== 'string' || !versionName.trim() || versionName.length > 30) return null;
  if (typeof apk !== 'string' || !httpsUrl(apk)) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) return null;
  if (!Array.isArray(cambios) || !cambios.length || cambios.length > 8 || cambios.some(c => typeof c !== 'string' || !c.trim() || c.length > 200)) return null;
  if (pagina != null && (typeof pagina !== 'string' || !httpsUrl(pagina))) return null;
  return { versionCode, versionName: versionName.trim(), apk, sha256: sha256.toLowerCase(), cambios: cambios.map(c => c.trim()), pagina: pagina || null, fecha: typeof fecha === 'string' ? fecha : '' };
}

export function hayActualizacion(manifiesto, instalada) {
  return !!manifiesto && !!instalada && Number.isInteger(instalada.versionCode) && manifiesto.versionCode > instalada.versionCode;
}

/** null en navegador o si la versión no se puede saber con certeza (sin aviso). */
export async function leerVersionInstalada({ plugin = ConfettiApp, isNative = isNativeApp } = {}) {
  if (!isNative()) return null;
  try {
    const i = await plugin.info();
    if (!i || !Number.isInteger(i.versionCode) || i.versionCode <= 0) return null;
    return { versionCode: i.versionCode, versionName: String(i.versionName || ''), actualizadorNativo: i.actualizadorNativo === true };
  } catch (e) {
    const code = e && e.code, msg = String((e && e.message) || e || '');
    return code === 'UNIMPLEMENTED' || UNIMPLEMENTED.test(msg) ? { ...VERSION_SIN_ACTUALIZADOR } : null;
  }
}

export async function leerManifiesto(fetchImpl = (...a) => globalThis.fetch(...a)) {
  const r = await fetchImpl(`${MANIFIESTO_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r || !r.ok) return null;
  let data;
  try { data = await r.json(); } catch { return null; }
  return validarManifiesto(data);
}

/** APK 1.3.0+: descarga verificada (huella, paquete, versión y firma) y apertura del instalador. */
export function instalarConPlugin(manifiesto, plugin = ConfettiApp) {
  return plugin.descargarEInstalar({ url: manifiesto.apk, sha256: manifiesto.sha256, versionCode: manifiesto.versionCode });
}

export function abrirEnNavegador(url, plugin = ConfettiApp) {
  return plugin.abrirEnNavegador({ url });
}

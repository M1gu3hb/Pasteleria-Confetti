// Local to this installation/origin. Never stored in shared business settings.
export const SCANNER_KEY = 'confetti_scanner_v1';
export const SCANNER_EVENT = 'confetti-scanner-settings';
// Preserve the existing unprefixed reader until the operator explicitly changes it.
export const SCANNER_EXISTING = Object.freeze({version:1,enabled:true,profile:'compatible',maxGap:250});
export const SCANNER_RECOMMENDED = Object.freeze({...SCANNER_EXISTING,profile:'f9'});

/** @param {any} value */
export function validateScannerConfig(value) {
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' ||
      !['f9','compatible'].includes(value.profile) || typeof value.maxGap !== 'number' ||
      !Number.isInteger(value.maxGap) || value.maxGap < 50 || value.maxGap > 1000) {
    throw new Error('Revisa el perfil y el tiempo entre teclas (50 a 1000 ms, entero).');
  }
  return {version:1,enabled:value.enabled,profile:value.profile,maxGap:value.maxGap};
}
export function readScannerSettings() {
  try {
    const raw=localStorage.getItem(SCANNER_KEY);
    return {config:raw ? validateScannerConfig(JSON.parse(raw)) : {...SCANNER_EXISTING}, error:'', existing:!raw};
  } catch {
    return {config:{...SCANNER_RECOMMENDED,enabled:false},error:'No se pudo leer la configuración local. El lector está desactivado: restaura y guarda la recomendada.',existing:false};
  }
}
/** Throws if storage is unavailable: never claim a setting survived a restart. */
export function saveScannerConfig(value) {
  const config=validateScannerConfig(value);
  try {localStorage.setItem(SCANNER_KEY,JSON.stringify(config));}
  catch {throw new Error('No se pudo guardar en este dispositivo. Revisa el almacenamiento de la app e inténtalo de nuevo.');}
  window.dispatchEvent(new Event(SCANNER_EVENT));
  return config;
}
export function subscribeScannerConfig(fn) {
  const storage=e=>{if(e.key===SCANNER_KEY||e.key===null)fn();};
  window.addEventListener(SCANNER_EVENT,fn);window.addEventListener('storage',storage);
  return ()=>{window.removeEventListener(SCANNER_EVENT,fn);window.removeEventListener('storage',storage);};
}

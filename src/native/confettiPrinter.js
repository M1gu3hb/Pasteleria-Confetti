import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Puente JS del plugin nativo de impresión ESC/POS (Fase 3).
 *
 * Es el "tubo" hacia la impresora: conectar (USB/TCP), mandar bytes crudos,
 * imprimir una imagen raster (576 pts), cortar y patear el cajón. NO tiene
 * lógica de ticket (eso vive en los componentes de siempre; la Fase 4 la
 * conectará por un dispatcher).
 *
 * 🔒 Seguridad de alcance: cada función exige `Capacitor.isNativePlatform()`.
 * En el NAVEGADOR (lo que usa Abel) NO hace nada: lanza un error claro y NO
 * toca `src/lib/print.js` ni el flujo de impresión actual. Este módulo aún no
 * lo importa nadie, así que tampoco entra al bundle web hasta la Fase 4.
 */

// registerPlugin solo crea un proxy; NO ejecuta nada al importar.
const Native = registerPlugin('ConfettiPrinter');

/** ¿Estamos dentro del APK (no en el navegador)? */
export function esNativo() {
  return Capacitor.isNativePlatform();
}

function exigirNativo() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('La impresión nativa solo está disponible dentro del APK (Confetti POS).');
  }
}

/** Conecta la primera impresora USB conectada (permiso USB persistente por manifest). */
export async function conectarUSB() {
  exigirNativo();
  return Native.conectarUSB();
}

/** Conecta por red (Ethernet) a `ip`, puerto 9100 por defecto. */
export async function conectarTCP(ip, puerto = 9100) {
  exigirNativo();
  return Native.conectarTCP({ ip, puerto });
}

/** Envía bytes ESC/POS crudos. Acepta Uint8Array o array de números. */
export async function enviarBytes(bytes) {
  exigirNativo();
  return Native.enviarBytes({ bytesBase64: bytesABase64(bytes) });
}

/**
 * Imprime una imagen raster a 576 pts. `imagen` puede ser un data URI
 * (data:image/png;base64,....) o el base64 pelón de un PNG/JPEG.
 * La Fase 4 le pasará el ticket ya renderizado tal cual (mismo diseño).
 */
export async function imprimirImagenRaster(imagen) {
  exigirNativo();
  return Native.imprimirImagenRaster({ imagenBase64: imagen });
}

/** Corta el papel. */
export async function cortar() {
  exigirNativo();
  return Native.cortar();
}

/** Patada de cajón por la impresora (comando ESC/POS; por si a futuro hay RJ11). */
export async function abrirCajonPorImpresora() {
  exigirNativo();
  return Native.abrirCajonPorImpresora();
}

/**
 * Abre el cajón por un DISPARADOR USB-SERIAL (dispositivo aparte, no la
 * impresora). `bytes` opcional (Uint8Array/array); si se omite, el nativo manda
 * la patada ESC/POS por defecto. `baudRate` por defecto 9600.
 */
export async function abrirCajonUsbSerial(bytes, baudRate = 9600) {
  exigirNativo();
  const bytesBase64 = bytes ? bytesABase64(bytes) : undefined;
  return Native.abrirCajonUsbSerial({ bytesBase64, baudRate });
}

/** Cierra la conexión activa. */
export async function desconectar() {
  exigirNativo();
  return Native.desconectar();
}

/** Uint8Array / array de bytes -> base64 (el puente nativo recibe base64). */
function bytesABase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

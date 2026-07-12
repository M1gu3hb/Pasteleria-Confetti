import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import {
  conectarUSB,
  conectarTCP,
  imprimirImagenRaster,
  enviarBytes,
  cortar,
  desconectar,
} from '@/native/confettiPrinter';
import { getPrinterConfig } from '@/native/printerConfig';

/**
 * Dispatcher NATIVO de impresión (Fase 4).
 *
 * Solo corre DENTRO del APK: `src/lib/print.js` lo invoca detrás de
 * `Capacitor.isNativePlatform()`, así que el NAVEGADOR nunca llega aquí y su
 * flujo (window.print / iframe) queda idéntico.
 *
 * REGLA DE ORO: no rediseña ningún ticket. Reusa el MISMO nodo del ticket que
 * ya está en el DOM (el que print.js imprimiría) y:
 *   - modo IMAGEN (default): lo renderiza tal cual a 576px con html2canvas y lo
 *     manda como raster ESC/POS (se ve idéntico, incluye logo).
 *   - modo TEXTO (opción, Fase 6): ESC/POS plano básico (fallback funcional).
 * Antes de imprimir asegura la conexión (USB/TCP) según la config local.
 */

const TICKET_SELECTOR = '[data-thermal-ticket]';
const FALLBACK_SELECTOR = '.ticket-printable';
const RASTER_WIDTH = 576; // 80mm imprimible = 576 puntos

export async function imprimirTicketNativo({ title, node: nodoDado, anchoImpresora } = {}) {
  if (!Capacitor.isNativePlatform()) return; // doble candado: nunca en navegador
  const cfg = getPrinterConfig();
  try {
    // `node` explícito (botón de prueba en Config) o el ticket del DOM.
    const node = nodoDado || localizarTicket();
    if (!node) throw new Error('No se encontró el ticket en pantalla para imprimir.');
    if (cfg.modo === 'texto') {
      await imprimirComoTexto(node, cfg);
    } else {
      // Honra el ancho 58/80 (config.ancho_impresora) igual que el corte térmico.
      await imprimirComoImagen(node, anchoImpresora, cfg);
    }
  } catch (err) {
    // Error VISIBLE (no falla callado). El plugin ya devuelve mensajes claros.
    const msg = (err && err.message) ? err.message : 'No se pudo imprimir.';
    toast.error('Impresora: ' + msg);
    throw err;
  }
}

// Mismo criterio que print.js: [data-thermal-ticket] → .ticket-printable, el último.
function localizarTicket() {
  let nodes = document.querySelectorAll(TICKET_SELECTOR);
  if (!nodes.length) nodes = document.querySelectorAll(FALLBACK_SELECTOR);
  return nodes.length ? nodes[nodes.length - 1] : null;
}

export async function asegurarConexionImpresora(cfg) {
  if (cfg.conexion === 'tcp') {
    if (!cfg.ip) throw new Error('Falta la IP de la impresora (Configuración → Impresora).');
    await conectarTCP(cfg.ip, cfg.puerto || 9100);
  } else {
    // FIX B: usa la impresora USB ELEGIDA (vendorId/productId de la config local); si no hay
    // elección, el nativo cae a la primera impresora USB (byte-idéntico).
    await conectarUSB({ vendorId: cfg.usbVendorId, productId: cfg.usbProductId });
  }
}

// FIX A (fuga de conexión): desconexión que NUNCA lanza. No debe bloquear el flujo; además el nativo
// también cierra la conexión previa al reconectar (defensa en dos capas).
async function desconectarSeguro() {
  try { await desconectar(); } catch { /* el próximo connect limpia igual en el nativo */ }
}

/**
 * FIX A: ejecuta `accion` con la impresora conectada y SIEMPRE la desconecta al terminar (finally).
 * Patrón conectar → imprimir → desconectar por operación: N impresiones seguidas no acumulan
 * conexiones, y si la impresora se reinicia, la siguiente operación reconecta sola.
 * Se exporta para que el cajón (kick por impresora) use el MISMO ciclo de vida.
 */
export async function conImpresora(cfg, accion) {
  await asegurarConexionImpresora(cfg);
  try {
    return await accion();
  } finally {
    await desconectarSeguro();
  }
}

// 58mm → 384 puntos; cualquier otro (80mm default) → 576. Un solo lugar para que
// venta/pastel y el corte usen EXACTAMENTE la misma regla de ancho (58/80).
function anchoRaster(anchoImpresora) {
  return Number(anchoImpresora) === 58 ? 384 : RASTER_WIDTH;
}

async function imprimirComoImagen(node, anchoImpresora, cfg) {
  // Render FUERA de la conexión (html2canvas es CPU); solo la I/O va dentro de conImpresora
  // (conectar → imprimir → cortar → desconectar). FIX A: no deja la conexión colgada.
  const pngBase64 = await renderTicketA576(node, anchoRaster(anchoImpresora));
  await conImpresora(cfg, async () => {
    await imprimirImagenRaster(pngBase64);
    await cortar();
  });
}

/**
 * Renderiza el nodo del ticket a un PNG de 576px de ancho, FONDO BLANCO y texto
 * oscuro (para que el térmico lo umbralice a negro nítido). Clona el nodo en un
 * contenedor fuera de pantalla para NO alterar la UI viva. Se exporta para que
 * el harness de muestras use EXACTAMENTE este mismo render (fidelidad).
 */
export async function renderTicketA576(sourceNode, anchoDestino = RASTER_WIDTH) {
  const html2canvas = (await import('html2canvas')).default;
  const holder = document.createElement('div');
  // Holder ancho: deja que el nodo tome su ANCHO DE DISEÑO (maxWidth del ticket)
  // sin reflow, tal como se ve en pantalla.
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;background:#ffffff;padding:0;margin:0;';
  const clone = sourceNode.cloneNode(true);
  clone.style.margin = '0';
  clone.style.background = '#ffffff';
  clone.style.color = '#000000';
  // Logo desde Supabase Storage (cross-origin): forzar CORS en las imágenes.
  clone.querySelectorAll('img').forEach((img) => { img.crossOrigin = 'anonymous'; });
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    // Captura el nodo a su ancho de diseño y lo ESCALA a `anchoDestino` px exactos
    // (576=80mm por defecto, 384=58mm). Sin reflow → conserva el diseño idéntico
    // al preview y evita artefactos de bordes de html2canvas.
    const anchoDiseno = clone.offsetWidth || 320;
    const escala = anchoDestino / anchoDiseno;
    const canvas = await html2canvas(clone, {
      backgroundColor: '#ffffff',
      useCORS: true,
      scale: escala,
    });
    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(holder);
  }
}

/**
 * Imprime el CORTE de caja en TÉRMICO (ESC/POS) reusando el nodo ya renderizado
 * (CorteTicketTermico, mismos datos que el PDF). Solo dentro del APK; errores
 * visibles con toast. `anchoImpresora` = '58' | '80' (de config.ancho_impresora):
 * 58 → 384px, cualquier otro → 576px (80mm default).
 */
export async function imprimirCorteTermico(node, anchoImpresora) {
  if (!Capacitor.isNativePlatform()) return;
  const cfg = getPrinterConfig();
  try {
    if (!node) throw new Error('No se encontró el corte para imprimir.');
    const png = await renderTicketA576(node, anchoRaster(anchoImpresora));
    await conImpresora(cfg, async () => {
      await imprimirImagenRaster(png);
      await cortar();
    });
  } catch (err) {
    const msg = (err && err.message) ? err.message : 'No se pudo imprimir el corte.';
    toast.error('Corte térmico: ' + msg);
    throw err;
  }
}

/**
 * Modo TEXTO ESC/POS BÁSICO (fallback plano; NO es un rediseño). Extrae el
 * texto visible del ticket y lo manda con un reset + corte. El default es
 * IMAGEN; esto es solo la opción seleccionable (la UI llega en la Fase 6).
 */
async function imprimirComoTexto(node, cfg) {
  const texto = (node.innerText || node.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const enc = new TextEncoder();
  const init = [0x1B, 0x40]; // ESC @ (reset)
  const cuerpo = Array.from(enc.encode(texto + '\n\n\n'));
  // FIX A: conectar → enviar → cortar → desconectar (no deja la conexión colgada).
  await conImpresora(cfg, async () => {
    await enviarBytes(new Uint8Array([...init, ...cuerpo]));
    await cortar();
  });
}

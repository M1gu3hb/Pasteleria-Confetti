import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import {
  conectarUSB,
  conectarTCP,
  imprimirImagenRaster,
  enviarBytes,
  cortar,
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

export async function imprimirTicketNativo({ title } = {}) {
  if (!Capacitor.isNativePlatform()) return; // doble candado: nunca en navegador
  const cfg = getPrinterConfig();
  try {
    const node = localizarTicket();
    if (!node) throw new Error('No se encontró el ticket en pantalla para imprimir.');
    await asegurarConexionImpresora(cfg);
    if (cfg.modo === 'texto') {
      await imprimirComoTexto(node);
    } else {
      await imprimirComoImagen(node);
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
    await conectarUSB();
  }
}

async function imprimirComoImagen(node) {
  const pngBase64 = await renderTicketA576(node);
  await imprimirImagenRaster(pngBase64);
  await cortar();
}

/**
 * Renderiza el nodo del ticket a un PNG de 576px de ancho, FONDO BLANCO y texto
 * oscuro (para que el térmico lo umbralice a negro nítido). Clona el nodo en un
 * contenedor fuera de pantalla para NO alterar la UI viva. Se exporta para que
 * el harness de muestras use EXACTAMENTE este mismo render (fidelidad).
 */
export async function renderTicketA576(sourceNode) {
  const html2canvas = (await import('html2canvas')).default;
  const holder = document.createElement('div');
  // Holder de 400px: deja que el ticket tome su ANCHO DE DISEÑO (maxWidth 320 /
  // max-w-sm 384) sin reflow, tal como se ve en pantalla.
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;background:#ffffff;padding:0;margin:0;';
  const clone = sourceNode.cloneNode(true);
  clone.style.margin = '0';
  clone.style.background = '#ffffff';
  clone.style.color = '#000000';
  // Logo desde Supabase Storage (cross-origin): forzar CORS en las imágenes.
  clone.querySelectorAll('img').forEach((img) => { img.crossOrigin = 'anonymous'; });
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    // Captura el ticket a su ancho de diseño y lo ESCALA a 576px exactos (80mm).
    // Sin reflow → conserva el diseño idéntico al preview y evita los artefactos
    // de bordes de html2canvas. `scale` = supersampling directo (nítido).
    const anchoDiseno = clone.offsetWidth || 320;
    const escala = RASTER_WIDTH / anchoDiseno;
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
 * Modo TEXTO ESC/POS BÁSICO (fallback plano; NO es un rediseño). Extrae el
 * texto visible del ticket y lo manda con un reset + corte. El default es
 * IMAGEN; esto es solo la opción seleccionable (la UI llega en la Fase 6).
 */
async function imprimirComoTexto(node) {
  const texto = (node.innerText || node.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const enc = new TextEncoder();
  const init = [0x1B, 0x40]; // ESC @ (reset)
  const cuerpo = Array.from(enc.encode(texto + '\n\n\n'));
  await enviarBytes(new Uint8Array([...init, ...cuerpo]));
  await cortar();
}

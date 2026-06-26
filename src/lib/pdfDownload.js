import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * HOTFIX PDF CARTA — Generador único de PDFs carta para corte de caja
 * y reportes financieros por periodo. NO se usa para tickets térmicos.
 *
 * Mejoras vs. versión previa:
 *  1. Formato real LETTER (215.9 × 279.4 mm), no A4.
 *  2. Paginación INTELIGENTE por elementos imprimibles (filas <tr> y bloques
 *     marcados con .avoid-break / .page-break-avoid). Ya NO corta filas a la
 *     mitad: si una fila no cabe en la página actual, pasa íntegra a la
 *     siguiente página.
 *  3. Fallback de paginación por píxeles (legacy) cuando no encontramos
 *     elementos imprimibles claros — para no romper documentos antiguos.
 *  4. Soporta preview, descarga e impresión usando EL MISMO blob PDF, así
 *     el usuario nunca ve un preview diferente al PDF descargado.
 *
 * Ancho útil de contenido: 195mm (carta 215.9mm − 10mm margen × 2).
 * Tipografía y márgenes definidos en los componentes (CorteTicket / PeriodoPDF).
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================
const LETTER = { width: 215.9, height: 279.4 }; // mm
const MARGIN_MM = 10;
const SCALE = 2; // html2canvas: mayor = más nítido pero más pesado.

// ============================================================
// PAGINACIÓN INTELIGENTE
// ============================================================
/**
 * Toma un nodo HTML grande y devuelve "bloques imprimibles" en orden, donde
 * cada bloque es un sub-nodo que NO debe partirse entre páginas:
 *   - filas de tabla <tr>
 *   - bloques con .avoid-break / .page-break-avoid
 *   - secciones que el componente marca como "atómicas"
 *   - el resto del contenido se trata como bloques de párrafo/div.
 *
 * Estrategia: renderizamos el nodo completo a un solo canvas con
 * html2canvas, luego usamos getBoundingClientRect() de cada elemento
 * imprimible para saber a qué Y del canvas corresponde y dónde cortar
 * sin partir filas.
 */
async function renderFullCanvas(node) {
  return await html2canvas(node, {
    scale: SCALE,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: node.scrollWidth,
  });
}

/**
 * Devuelve los puntos Y (en pixeles del canvas) donde es SEGURO cortar páginas
 * para el nodo dado. Estos puntos son los "espacios entre bloques imprimibles"
 * y nunca caen dentro de un <tr> o de un .avoid-break.
 */
function calcularCortesSeguros(node, canvasHeight, scale) {
  const rectRoot = node.getBoundingClientRect();
  const elementos = node.querySelectorAll(
    'tr, .avoid-break, .page-break-avoid, h1, h2, h3, .pdf-block'
  );
  const cortes = []; // pares { top, bottom } en px del canvas
  elementos.forEach((el) => {
    const r = el.getBoundingClientRect();
    const top = Math.max(0, (r.top - rectRoot.top) * scale);
    const bottom = Math.max(0, (r.bottom - rectRoot.top) * scale);
    if (bottom > top) cortes.push({ top, bottom });
  });
  // Ordenamos por top ascendente
  cortes.sort((a, b) => a.top - b.top);
  return cortes;
}

/**
 * Dado el alto del canvas y la lista de bloques imprimibles + el alto utilizable
 * por página en pixeles del canvas, devuelve un array de offsets Y a los que
 * empieza cada página. El último offset incluye el final del canvas.
 */
function calcularInicioDePaginas(canvasHeight, bloques, pageHeightPx) {
  if (!bloques || bloques.length === 0) {
    // Fallback: paginar ciegamente por altura.
    const inicios = [];
    for (let y = 0; y < canvasHeight; y += pageHeightPx) inicios.push(y);
    return inicios;
  }
  const inicios = [0];
  let pageStart = 0;
  while (pageStart < canvasHeight) {
    const pageEnd = pageStart + pageHeightPx;
    if (pageEnd >= canvasHeight) break;
    // Buscar el último bloque que ENTRA completo antes de pageEnd.
    // El corte debe quedar entre bloques: en el .bottom del último que cabe.
    let bestCut = pageEnd;
    let foundFit = false;
    for (let i = 0; i < bloques.length; i++) {
      const b = bloques[i];
      if (b.bottom <= pageStart) continue; // ya quedó en pág. anterior
      if (b.top >= pageEnd) break;          // ya fuera de esta página
      if (b.bottom <= pageEnd) {
        bestCut = b.bottom;
        foundFit = true;
      } else {
        // Este bloque NO cabe completo: cortamos justo antes (b.top).
        // Solo si b.top > pageStart (al menos algo cabe antes del bloque grande).
        if (b.top > pageStart) {
          bestCut = b.top;
        }
        break;
      }
    }
    // Caso degenerado: ningún bloque cabe en la página (un solo bloque ENORME).
    // En ese caso cortamos al pageEnd (mejor que loop infinito).
    if (!foundFit && bestCut === pageEnd) {
      // bestCut ya es pageEnd → seguimos
    }
    // Avance: siguiente página arranca en bestCut.
    if (bestCut <= pageStart) {
      // No hubo avance; forzar avance mínimo de 1px para no entrar en loop.
      bestCut = pageStart + Math.max(1, pageHeightPx);
    }
    inicios.push(bestCut);
    pageStart = bestCut;
  }
  return inicios;
}

// ============================================================
// PDF BLOB
// ============================================================
/**
 * Genera un Blob PDF a partir de un nodo HTML, paginándolo correctamente
 * en formato CARTA (LETTER) vertical, SIN cortar filas de tablas ni bloques
 * marcados como .avoid-break.
 */
export async function generatePDFBlobFromNode(node, { scale = SCALE } = {}) {
  if (!node) throw new Error('Nodo no encontrado para generar PDF');

  const canvas = await renderFullCanvas(node);
  const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();   // 215.9
  const pageHeight = pdf.internal.pageSize.getHeight(); // 279.4
  const usableW = pageWidth - MARGIN_MM * 2;
  const usableH = pageHeight - MARGIN_MM * 2;

  const imgW = usableW;
  // px/mm en horizontal: usamos esto también para vertical (canvas es 1:1).
  const pxPerMm = canvas.width / imgW;
  const pageHeightPx = usableH * pxPerMm;

  if (canvas.height <= pageHeightPx) {
    // Cabe en una sola página
    const imgH = (canvas.height * imgW) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM, imgW, imgH, undefined, 'FAST');
    return pdf.output('blob');
  }

  // Multi-página: cortes seguros entre bloques imprimibles.
  const bloques = calcularCortesSeguros(node, canvas.height, scale);
  const inicios = calcularInicioDePaginas(canvas.height, bloques, pageHeightPx);
  inicios.push(canvas.height); // sentinela final

  for (let i = 0; i < inicios.length - 1; i++) {
    const yStart = inicios[i];
    const yEnd = Math.min(inicios[i + 1], canvas.height);
    const sliceHeight = yEnd - yStart;
    if (sliceHeight <= 0) continue;

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, yStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const sliceImgH = sliceHeight / pxPerMm;
    if (i > 0) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM, imgW, sliceImgH, undefined, 'FAST');
  }

  return pdf.output('blob');
}

// ============================================================
// HELPERS
// ============================================================
/** Descarga un Blob como archivo */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/** Sanitiza string para nombre de archivo */
export function safeFileName(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Imprime un Blob PDF usando un iframe offscreen visible. Esto evita imprimir
 * el POS completo o un modal vacío: imprimimos EXACTAMENTE el PDF generado,
 * el mismo que se descarga.
 *
 * Si el navegador/Electron no permite imprimir directamente desde el iframe,
 * abre el PDF en pestaña nueva como fallback para que el usuario use Ctrl+P.
 */
export function printPDFBlob(blob, title = 'Documento') {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = String(title || 'Documento');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '215.9mm';
  iframe.style.minHeight = '279.4mm';
  iframe.style.border = '0';
  iframe.style.visibility = 'visible';
  iframe.style.background = 'white';
  iframe.src = url;

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch (e) { /* ya removido */ }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  iframe.onload = () => {
    // Esperar un tick más para que el visor PDF nativo termine de pintar.
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        // Diferimos cleanup para que el diálogo de impresión no se cancele.
        setTimeout(cleanup, 3000);
      } catch (err) {
        console.warn('[printPDFBlob] iframe.print falló, abriendo en pestaña:', err);
        try {
          window.open(url, '_blank');
        } catch (e2) {
          console.error('[printPDFBlob] window.open también falló:', e2);
        }
        cleanup();
      }
    }, 300);
  };

  iframe.onerror = () => {
    console.error('[printPDFBlob] iframe load error');
    try { window.open(url, '_blank'); } catch (e) { /* noop */ }
    cleanup();
  };

  document.body.appendChild(iframe);
}

/**
 * Pipeline simple: genera y descarga el PDF de un nodo.
 * Devuelve el Blob por si quieres reutilizarlo (ej. para imprimir).
 */
export async function downloadNodeAsPDF(node, filename) {
  const blob = await generatePDFBlobFromNode(node);
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  return blob;
}

/**
 * Genera el PDF y lo imprime — mismo documento que se descargaría.
 * Útil para botones "Imprimir" en CorteViewer / Registros.
 */
export async function printNodeAsPDF(node, title = 'Documento') {
  const blob = await generatePDFBlobFromNode(node);
  printPDFBlob(blob, title);
  return blob;
}
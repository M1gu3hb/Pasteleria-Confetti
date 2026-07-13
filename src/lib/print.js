/**
 * Helper único de impresión para el POS.
 *
 * HOTFIX TÉRMICO 58MM:
 * - Tickets (Caja post-cobro, Ventas reimpresión, Mesero precuenta) se imprimen
 *   como TÉRMICO 58MM REAL vía iframe offscreen visible. NO carta. NO 80mm.
 *   NO canvas/PDF. Solo HTML + CSS @page 58mm auto que la impresora térmica
 *   sabe interpretar perfectamente.
 * - El PDF de corte de caja sigue funcionando con su flujo carta legacy
 *   (modo 'letter' usa window.print() con CSS @page A4 del index.css).
 *   NO se toca el corte de caja.
 *
 * Iframe técnico:
 *   - Offscreen (-10000px) pero con tamaño REAL (58mm × 100mm visible).
 *   - NUNCA width:0 / height:0 / visibility:hidden — eso rompe el render
 *     en Android Chrome y produce impresión vacía o de 5 páginas.
 *
 * Firma estable: printDocument({ mode, title }).
 *   - mode='ticket' | 'thermal' | cualquier otro → térmico 58mm.
 *   - mode='letter' → fallback A4 legacy (solo corte de caja).
 */

import { Capacitor } from '@capacitor/core';

// Selectores del contenido imprimible para tickets.
// Preferimos [data-thermal-ticket] (atributo de PreCuentaTicket) para evitar
// capturar accidentalmente el CorteTicket (PDF de corte de caja, otro flujo).
const TICKET_SELECTOR = '[data-thermal-ticket]';
const FALLBACK_SELECTOR = '.ticket-printable';

// CSS de impresión TÉRMICA 58MM dentro del iframe.
// - @page 58mm auto: la impresora térmica recibe ancho 58mm y altura variable.
// - body width 58mm: ancho total del papel.
// - .ticket-printable width 48mm centrado: ancho imprimible real (~384 dots).
//   Si tu impresora corta a 50mm, ajusta CONTENT_WIDTH a 50mm.
// - Tipografía monoespaciada compacta, 10px, line-height 1.25.
// - Logo limitado a 28mm × 16mm: nunca causa página extra ni se corta.
// Ancho del papel térmico (mm). 58 (default) u 80. Lo fija ConfigProvider desde
// config.ancho_impresora vía setPaperWidth(). El contenido imprimible va un poco
// más angosto que el papel (márgenes del cabezal): 58→48mm, 80→72mm.
let PAPER_WIDTH_MM = 58;
let CONTENT_WIDTH_MM = 48;

export function setPaperWidth(mm) {
  const n = Number(mm);
  if (n === 80) { PAPER_WIDTH_MM = 80; CONTENT_WIDTH_MM = 72; }
  else { PAPER_WIDTH_MM = 58; CONTENT_WIDTH_MM = 48; }
}
export function getPaperWidth() { return PAPER_WIDTH_MM; }

function buildThermalCSS() {
  const paper = `${PAPER_WIDTH_MM}mm`;
  const content = `${CONTENT_WIDTH_MM}mm`;
  return `
    @page { size: ${paper} auto; margin: 0; }
    html, body {
      width: ${paper} !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.25;
    }
    * { box-sizing: border-box; }
    .ticket-printable {
      width: ${content} !important;
      max-width: ${content} !important;
      margin: 0 auto !important;
      padding: 2mm 0 !important;
      color: #000 !important;
      background: #fff !important;
      font-size: 10px !important;
      line-height: 1.25 !important;
    }
    /* Logo: limitado a tamaño compatible con 58mm. Nunca página extra. */
    .ticket-printable img {
      max-width: 28mm !important;
      max-height: 16mm !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
      margin: 0 auto 2mm auto !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    /* Encabezados compactos para térmico: 11-12px máximo. */
    .ticket-printable h1 { font-size: 12px !important; letter-spacing: 0.5px; margin: 0 !important; }
    .ticket-printable h2, .ticket-printable h3 { font-size: 11px !important; margin: 0 !important; }
    .ticket-printable p { margin: 0 !important; }
    /* Evitar saltos raros en bloques clave del recibo */
    .ticket-printable > div { page-break-inside: avoid; }
  `;
}

// Espera a que las imágenes (logo) terminen de cargar o fallen. Failsafe 1.5s.
function waitImages(doc) {
  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let pending = imgs.length;
    const done = () => { pending -= 1; if (pending <= 0) resolve(); };
    imgs.forEach((img) => {
      if (img.complete) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
    setTimeout(resolve, 1500);
  });
}

// FASE 2 (feedback de impresión): devuelve una PROMESA que se resuelve cuando el
// print del iframe ya se disparó (o cuando no hay nada que imprimir), y rechaza si
// preparar el iframe o `win.print()` falla. Así el spinner del botón refleja el
// estado real. La lógica de render del navegador queda IDÉNTICA (solo se envuelve
// en la promesa): mismo iframe offscreen, mismo CSS, mismo resultado impreso.
function printTicketViaIframe(title) {
  return new Promise((resolve, reject) => {
    // 1) Localizar el ticket en el DOM. Si no hay nada, resolver limpio (nada que
    //    imprimir no es un error).
    let nodes = document.querySelectorAll(TICKET_SELECTOR);
    if (nodes.length === 0) nodes = document.querySelectorAll(FALLBACK_SELECTOR);
    const source = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    if (!source) {
      console.warn('[print] No se encontró contenido imprimible.');
      resolve();
      return;
    }

    // 2) Iframe OFFSCREEN VISIBLE — con tamaño real para que Chrome Android
    //    renderice correctamente. NO width:0/height:0/visibility:hidden.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '0';
    iframe.style.width = `${PAPER_WIDTH_MM}mm`;
    iframe.style.minHeight = '100mm';
    iframe.style.border = '0';
    iframe.style.visibility = 'visible';
    iframe.style.background = 'white';
    document.body.appendChild(iframe);

    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch (e) { /* ya removido */ }
    };

    // 3) HTML completo del ticket dentro del iframe (solo el ticket, no el POS)
    const safeTitle = String(title || 'Ticket').replace(/[<>]/g, '');
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${PAPER_WIDTH_MM}mm" />
  <title>${safeTitle}</title>
  <style>${buildThermalCSS()}</style>
</head>
<body>${source.outerHTML}</body>
</html>`;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // 4) Esperar logo/imágenes y disparar print SOLO del iframe.
      waitImages(doc).then(() => {
        let printErr = null;
        try {
          const win = iframe.contentWindow;
          win.focus();
          win.print();
        } catch (err) {
          printErr = err;
          console.error('[print] Falló iframe.print():', err);
        }
        // Diferimos cleanup para que la cola de impresión termine.
        setTimeout(cleanup, 1500);
        // El print ya se entregó al navegador/SO (o falló). Resolvemos/rechazamos
        // aquí: el diálogo/servicio de impresión del SO toma el relevo.
        if (printErr) reject(printErr); else resolve();
      });
    } catch (err) {
      console.error('[print] Falló preparar iframe:', err);
      cleanup();
      reject(err);
    }
  });
}

function printLetterFallback(mode, title) {
  // Legacy: imprime la página completa con data-print-mode aplicado.
  // SOLO se usa para el PDF de corte de caja (mode === 'letter'),
  // que NO es un ticket sino un documento carta de varias secciones
  // donde el CSS de @page A4 ya está configurado en index.css.
  //
  // FASE 2: devuelve una PROMESA que se resuelve cuando `afterprint` dispara (o por el
  // failsafe de 1.5s). Comportamiento de impresión IDÉNTICO; solo se envuelve.
  // FASE C (v1.1.1): ahora RECHAZA si `window.print()` lanza (antes se registraba en
  // consola pero la promesa RESOLVÍA como éxito → feedback falso). Réplica del patrón de
  // la rama térmica. Sin fallo, resuelve normal por afterprint/failsafe. CSS @page sin tocar.
  return new Promise((resolve, reject) => {
    const html = document.documentElement;
    const prevMode = html.getAttribute('data-print-mode');
    const prevTitle = document.title;

    html.setAttribute('data-print-mode', mode);
    document.title = title;

    let settled = false;
    let printErr = null;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (prevMode) html.setAttribute('data-print-mode', prevMode);
      else html.removeAttribute('data-print-mode');
      document.title = prevTitle;
      window.removeEventListener('afterprint', cleanup);
      if (printErr) reject(printErr); else resolve();
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      try { window.print(); } catch (err) { printErr = err; console.error('[print] window.print:', err); }
      setTimeout(cleanup, 1500);
    }, 80);
  });
}

// FASE 2: `printDocument` ahora DEVUELVE una promesa en las TRES ramas, para que
// quien imprime (el botón) pueda mostrar un spinner que dure TODO el tiempo real
// de impresión y reciba el error si falla. Los llamadores que no la esperan
// (fire-and-forget) siguen funcionando igual: ignoran la promesa devuelta.
export function printDocument({ mode = 'ticket', title = 'Documento', widthMm } = {}) {
  // 'letter' = PDF de corte de caja (legacy, página completa con CSS A4)
  if (mode === 'letter') {
    return printLetterFallback(mode, title);
  }
  // Override puntual de ancho (opcional). Normalmente el ancho lo mantiene
  // ConfigProvider vía setPaperWidth(config.ancho_impresora).
  if (widthMm != null) setPaperWidth(widthMm);

  // RAMA NATIVA (SOLO dentro del APK Confetti POS) — Fase 4: imprime por el
  // plugin ESC/POS reusando el MISMO ticket del DOM como imagen (mismo diseño),
  // o texto plano según la config local. Es ADITIVA: en el NAVEGADOR
  // isNativePlatform() = false, así que NUNCA entra aquí y la rama de abajo
  // queda IDÉNTICA a como estaba (el flujo de Abel no cambia).
  if (Capacitor.isNativePlatform()) {
    // Ancho de papel actual (58/80), sincronizado por ConfigProvider desde
    // config.ancho_impresora vía setPaperWidth. Respeta también el widthMm de
    // arriba (botones de prueba). El dispatcher lo usa para el raster (58→384).
    const anchoImpresora = getPaperWidth();
    // RETORNA la promesa nativa: se resuelve cuando la impresión ESC/POS
    // realmente terminó (imagen + corte), o RECHAZA con el error del plugin.
    // `imprimirTicketNativo` ya muestra el toast del error y RE-LANZA, así que
    // NO tragamos el error aquí (nada de `.catch` que lo silencie): el spinner
    // del botón termina en el estado real y el fallo se propaga.
    return import('@/native/printTicket')
      .then((m) => m.imprimirTicketNativo({ title, anchoImpresora }));
  }

  // Cualquier otro modo (incluido 'thermal' y 'ticket') imprime térmico
  // (58/80mm según config) vía iframe offscreen visible.
  return printTicketViaIframe(title);
}
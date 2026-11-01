import { Capacitor, registerPlugin } from '@capacitor/core';
import { downloadBlob } from './pdfDownload';
import { imprimirRasterTermico } from '@/native/printTicket';
import { getPaperWidth, printDocument } from './print';
import { barcodeRuns, createLabelPNG } from './barcodeLabels';
const Native = registerPlugin('ConfettiFiles');
function blobBase64(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(blob);
  });
}
export async function exportBarcodeFile(blob, filename) {
  if (!Capacitor.isNativePlatform()) { downloadBlob(blob,filename); return; }
  try { await Native.guardarArchivo({ nombre: filename, mime: blob.type, datos: await blobBase64(blob) }); }
  catch (error) {
    if (/not implemented|unimplemented|not available/i.test(String(error))) throw new Error('Esta versión de la app permite ver e imprimir etiquetas, pero necesita actualizarse para guardar archivos. Puedes descargarlos desde el POS en Chrome o computadora.');
    throw error;
  }
}
/** Receipt transport and paper configuration; graphics are required to preserve bars. */
export async function printBarcodeLabel(product) {
  const paper = getPaperWidth();
  if (Capacitor.isNativePlatform()) {
    return imprimirRasterTermico(async () => {
      const blob = await createLabelPNG(product, paper === 58 ? 384 : 576);
      return 'data:image/png;base64,' + await blobBase64(blob);
    });
  }
  const bars = barcodeRuns(product.codigo_barras);
  const usable = paper === 58 ? 48 : 72;
  if ((bars.width + 24) * 0.2 > usable) throw new Error('Código demasiado largo para esta impresora. Usa el PDF en papel carta.');
  // Same thermal iframe/CSS as sale receipts. SVG avoids the receipt logo's
  // 28mm image limit and preserves sharp vector bars and white quiet margins.
  const node = document.createElement('div');
  node.className = 'ticket-printable';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox',`0 0 ${bars.width + 24} 95`);
  svg.setAttribute('style','width:100%;height:auto;display:block;background:white');
  const white = document.createElementNS(ns,'rect');white.setAttribute('width',String(bars.width+24));white.setAttribute('height','95');white.setAttribute('fill','white');svg.appendChild(white);
  for (const run of bars.runs) {
    const rect=document.createElementNS(ns,'rect');
    for (const [key,value] of Object.entries({x:run.x+12,y:4,width:run.width,height:62,fill:'black'})) rect.setAttribute(key,String(value));
    svg.appendChild(rect);
  }
  const code=document.createElementNS(ns,'text');code.setAttribute('x',String((bars.width+24)/2));code.setAttribute('y','85');code.setAttribute('text-anchor','middle');code.setAttribute('font-family','monospace');code.setAttribute('font-size','11');code.textContent=product.codigo_barras;svg.appendChild(code);
  node.appendChild(svg);
  const name=document.createElement('p');name.textContent=product.nombre;name.style.cssText='text-align:center;overflow-wrap:anywhere';node.appendChild(name);
  return printDocument({mode:'thermal',title:`Código-${product.codigo_barras}`,node});
}

import { Capacitor, registerPlugin } from '@capacitor/core';
import { downloadBlob } from './pdfDownload';
import { getPrinterConfig } from '@/native/printerConfig';
import { encolarImpresion } from '@/native/colaImpresion';
import { conImpresora } from '@/native/printTicket';
import { imprimirImagenRaster, enviarBytes, cortar } from '@/native/confettiPrinter';
import { bytesAvancePapel } from '@/native/avancePapel';
import { getPaperWidth } from './print';
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
/** Labels must always print as graphics even when receipt mode is text. */
export async function printBarcodeLabel(product) {
  if (!Capacitor.isNativePlatform() && (barcodeRuns(product.codigo_barras).width + 24) * 0.2 > 90) throw new Error('El código es demasiado largo para esta etiqueta. Usa una etiqueta más ancha al imprimir la imagen PNG.');
  const blob = await createLabelPNG(product, Capacitor.isNativePlatform() ? (getPaperWidth() === 58 ? 384 : 576) : 0);
  const data = await blobBase64(blob);
  if (Capacitor.isNativePlatform()) {
    const cfg = getPrinterConfig();
    await encolarImpresion(()=>conImpresora(cfg, async()=>{
      await imprimirImagenRaster('data:image/png;base64,'+data);
      await enviarBytes(bytesAvancePapel(cfg.avanceAntesCorteDots));await cortar();
    }));
    return;
  }
  const frame = document.createElement('iframe');frame.title='Etiqueta de producto';frame.style.cssText='position:fixed;width:215.9mm;height:279.4mm;left:-9999px';document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove();throw new Error('No se pudo abrir la impresión.'); }
  doc.open();doc.write('<!doctype html><html><head><title>Etiqueta Confetti</title><style>@page{margin:10mm}img{width:90mm;max-width:100%;height:auto}</style></head><body><img alt="Etiqueta" src="data:image/png;base64,'+data+'"></body></html>');doc.close();
  const img = doc.querySelector('img');if (img && !img.complete) await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
  frame.contentWindow?.focus();frame.contentWindow?.print();setTimeout(()=>frame.remove(),60000);
}

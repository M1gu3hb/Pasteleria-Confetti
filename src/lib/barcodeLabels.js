import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { validBarcode } from './barcodeCore';

export function barcodePattern(code) {
  if (!validBarcode(code)) throw new Error('Código inválido para imprimir.');
  /** @type {{encodings?: {data:string}[]}} */
  const result = {};
  JsBarcode(result, code, { format: 'CODE128', displayValue: false, margin: 0 });
  return (result.encodings || []).map(item => item.data).join('');
}
export function barcodeRuns(code) {
  const pattern = barcodePattern(code), runs = [];
  for (let i = 0; i < pattern.length;) {
    if (pattern[i] !== '1') { i++; continue; }
    let end = i + 1; while (pattern[end] === '1') end++;
    runs.push({ x: i, width: end - i }); i = end;
  }
  return { width: pattern.length, runs };
}
export function validateLabelQuantities(entries) {
  if(!Array.isArray(entries)||!entries.length) throw new Error('Selecciona al menos un producto.');
  let total=0;
  for(const {copies} of entries) {
    if(typeof copies!=='number'&&typeof copies!=='string')throw new Error('Elige de 1 a 100 copias por producto.');
    const n=Number(copies);
    if(!Number.isInteger(n)||n<1||n>100) throw new Error('Elige de 1 a 100 copias por producto.');
    total+=n;
  }
  if(total>1200) throw new Error('Selecciona entre 1 y 1200 etiquetas.');
  return total;
}
export function createLabelsPDF(entries) {
  validateLabelQuantities(entries);
  const labels = [];
  for (const { product, copies } of entries) {
    const n = Number(copies);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Elige de 1 a 100 copias por producto.');
    if (!product?.codigo_barras) throw new Error(`Falta código: ${product?.nombre || 'producto'}.`);
    const bars = barcodeRuns(product.codigo_barras);
    if ((bars.width + 20) * 0.2 > 84) throw new Error(`El código de ${product.nombre} es demasiado largo para esta etiqueta. Usa uno más corto.`);
    for (let i = 0; i < n; i++) labels.push({ product, bars });
  }
  if (!labels.length || labels.length > 1200) throw new Error('Selecciona entre 1 y 1200 etiquetas.');
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
  labels.forEach(({ product, bars }, i) => {
    if (i && i % 12 === 0) pdf.addPage();
    const slot = i % 12, x = 12 + (slot % 2) * 98, y = 10 + Math.floor(slot / 2) * 43;
    pdf.setDrawColor(220); pdf.rect(x, y, 92, 40);
    pdf.setFontSize(10);pdf.setTextColor(0);
    const name = pdf.splitTextToSize(product.nombre, 84).slice(0, 2);
    pdf.text(name, x + 46, y + 6, { align: 'center' });
    const module = Math.min(0.38, 84 / (bars.width + 20));
    const start = x + (92 - bars.width * module) / 2;
    pdf.setFillColor('#000000');
    bars.runs.forEach(run => pdf.rect(start + run.x * module, y + 14, run.width * module, 14, 'F'));
    pdf.setFont('courier','normal');pdf.setFontSize(9);pdf.text(product.codigo_barras, x + 46, y + 33, { align: 'center' });pdf.setFont('helvetica','normal');
  });
  pdf.setProperties({ title: 'Etiquetas Confetti' });
  return pdf;
}
export async function createLabelPNG(product, targetWidth = 0) {
  const bars = barcodeRuns(product.codigo_barras);
  const width = targetWidth || Math.max(1000, (bars.width + 40) * 4);
  const module = targetWidth ? Math.floor(width / (bars.width + 24)) : 4;
  if (module < 2) throw new Error('Código demasiado largo para esta impresora. Usa el PDF en papel carta.');
  const height = Math.round(width * 0.36);
  const canvas = document.createElement('canvas');canvas.width = width;canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.fillStyle = '#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle = '#000';
  const start = Math.floor((width - bars.width * module)/2);
  bars.runs.forEach(run => ctx.fillRect(start + run.x * module, Math.round(height*.08), run.width * module, Math.round(height*.5)));
  ctx.textAlign = 'center';ctx.font = `${Math.max(12,Math.round(width*.028))}px monospace`;ctx.fillText(product.codigo_barras,width/2,height*.7,width-24);
  ctx.font = `bold ${Math.max(13,Math.round(width*.03))}px Arial`;ctx.fillText(product.nombre,width/2,height*.88,width-24);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error('No se pudo crear PNG.')),'image/png'));
}

// =====================================================================
// BANCO DE PRUEBAS DE IMPRESIÓN — probar la cadena ESC/POS SIN impresora.
// ---------------------------------------------------------------------
// POR QUÉ EXISTE:
//   El APK existe para poder mandar directo a la impresora térmica. Esa es su
//   razón de ser, no un extra. Pero Abel es el CLIENTE: no se le puede pedir
//   que imprima para validarnos, y Miguel no tiene la Easytime delante. Todo lo
//   que se pueda demostrar sin hardware, se demuestra aquí.
//
// QUÉ HACE, de punta a punta:
//   1. BINARIZA una imagen RGBA con la MISMA regla que DantSu 3.4.0
//      (verificada en el bytecode, no en su documentación).
//   2. La TROCEA en bandas y construye el flujo de bytes EXACTO que saldría al
//      cable: ESC @ · N × (GS v 0 + datos) · ESC J n · GS V 1.
//   3. DECODIFICA ese flujo de vuelta a píxeles, como haría la impresora.
//   4. COMPARA píxel a píxel contra la binarización original. Si no son
//      idénticos, algo se pierde por el camino.
//   5. REPORTA: bandas, altura en puntos y mm, bytes por banda, offsets
//      ABSOLUTOS del ESC J y del corte, y cuánto contenido quedaría por debajo
//      de la cuchilla para un hueco cabezal→cuchilla dado.
//   6. Emite PNGs de la RECONSTRUCCIÓN para poder mirarlos con los ojos.
//
// ALCANCE HONESTO — lo que este banco NO puede probar:
//   · El firmware real de la Easytime y su buffer físico.
//   · La distancia real cabezal→cuchilla de ESA impresora.
//   · Si el desbordamiento de julio era por TAMAÑO de comando o por RITMO:
//     el banco mide el flujo LÓGICO; el ritmo depende del transporte (ver la
//     sección TEMPORAL más abajo, que sí calcula ambos perfiles).
//   Todo lo demás —que la imagen viaja entera, que el corte va después de todo
//   el contenido, y cuánto papel se avanza— sí queda demostrado aquí.
//
// Uso:
//   node scripts/impresion_banco.mjs              # suite + tabla
//   node scripts/impresion_banco.mjs --png <dir>  # además vuelca PNGs
// =====================================================================
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// La bateria SOLO corre cuando este archivo se invoca DIRECTAMENTE. Otras suites
// lo IMPORTAN para reusar construirFlujo/decodificarFlujo (p.ej.
// ticket_pastel_base_limpia_verify.mjs): al importarlo no debe imprimir nada ni,
// sobre todo, llamar a process.exit() — eso mataria a la suite que lo importa.
const ES_PRINCIPAL = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};

// ── Constantes del flujo real ───────────────────────────────────────────
export const RESET = [0x1b, 0x40];        // ESC @
export const GSV0  = [0x1d, 0x76, 0x30, 0x00];
export const CUT   = [0x1d, 0x56, 0x01];  // GS V 1 (corte parcial)
export const BAND_HEIGHT_DOTS = 255;      // ConfettiPrinterPlugin.java:64
export const DPI = 203;
export const MM_POR_PUNTO = 25.4 / DPI;   // 0.12512 mm

// =====================================================================
// 1. BINARIZACIÓN — copia literal de EscPosPrinterCommands.bitmapToBytes
//    con gradient=false (que es como lo llama el plugin, línea 292).
//
//    Bytecode (offsets 182-220):
//        if (r < 160 || g < 160 || b < 160)  -> bit 1 (NEGRO)
//
//    Tres cosas que un replicador ingenuo se salta y aquí NO:
//      · el umbral es POR CANAL y con OR, no sobre la luminancia: el píxel
//        (255,255,159) es NEGRO;
//      · el canal ALFA se ignora por completo (getPixel devuelve ARGB y sólo
//        se usan los bits 0-23): un píxel transparente sale NEGRO;
//      · MSB = píxel más a la IZQUIERDA (1 << (7-k)), relleno derecho BLANCO.
// =====================================================================
export function esNegro(r, g, b) {
  return r < 160 || g < 160 || b < 160;
}

/** RGBA plano (4 bytes por píxel) -> matriz de 0/1 [alto][ancho]. */
export function binarizar(rgba, w, h) {
  const bits = [];
  for (let y = 0; y < h; y++) {
    const fila = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      fila[x] = esNegro(rgba[i], rgba[i + 1], rgba[i + 2]) ? 1 : 0;  // alfa ignorado
    }
    bits.push(fila);
  }
  return bits;
}

// =====================================================================
// 2. UNA BANDA -> bytes GS v 0.  initGSv0Command del bytecode:
//      xH = bytesByLine / 256 ; xL = bytesByLine - xH*256
//      yH = h / 256           ; yL = h - yH*256
// =====================================================================
export function bytesPorLinea(w) { return Math.ceil(w / 8); }

export function encodeBanda(bits, w, y0, h) {
  const bpl = bytesPorLinea(w);
  const out = new Uint8Array(8 + bpl * h);
  out[0] = GSV0[0]; out[1] = GSV0[1]; out[2] = GSV0[2]; out[3] = GSV0[3];
  out[4] = bpl & 0xff;  out[5] = (bpl >> 8) & 0xff;
  out[6] = h & 0xff;    out[7] = (h >> 8) & 0xff;
  let p = 8;
  for (let y = y0; y < y0 + h; y++) {
    const fila = bits[y];
    for (let xb = 0; xb < bpl; xb++) {
      let byte = 0;
      for (let k = 0; k < 8; k++) {
        const x = xb * 8 + k;
        if (x < w && fila[x]) byte |= 1 << (7 - k);   // relleno derecho = 0 (blanco)
      }
      out[p++] = byte;
    }
  }
  return out;
}

// =====================================================================
// 3. FLUJO COMPLETO, en el orden REAL de ejecutarYcortarSiempre():
//      raster (por bandas)  ->  ESC J n (avance)  ->  GS V 1 (corte)
// =====================================================================
export function bytesAvance(dots) {
  const n0 = Number(dots);
  if (!Number.isFinite(n0) || n0 <= 0) return [];
  let r = Math.min(Math.floor(n0), 1275);
  const b = [];
  while (r > 0) { const n = Math.min(255, r); b.push(0x1b, 0x4a, n); r -= n; }
  return b;
}

export function construirFlujo(bits, w, h, { banda = BAND_HEIGHT_DOTS, avanceDots = 150 } = {}) {
  const partes = [Uint8Array.from(RESET)];
  const bandas = [];
  for (let y = 0; y < h; y += banda) {
    const bh = Math.min(banda, h - y);
    const b = encodeBanda(bits, w, y, bh);
    bandas.push({ filas: bh, bytes: b.length });
    partes.push(b);
  }
  const av = bytesAvance(avanceDots);
  if (av.length) partes.push(Uint8Array.from(av));
  partes.push(Uint8Array.from(CUT));
  const total = partes.reduce((a, p) => a + p.length, 0);
  const flujo = new Uint8Array(total);
  let off = 0;
  for (const p of partes) { flujo.set(p, off); off += p.length; }
  return { flujo, bandas };
}

// =====================================================================
// 4. DECODIFICADOR — lo que "vería" la impresora. Devuelve offsets ABSOLUTOS
//    para poder afirmar DÓNDE cae cada comando respecto al contenido.
// =====================================================================
export function decodificarFlujo(bytes) {
  let i = 0;
  const filas = [];
  const offsets = { reset: -1, bandas: [], avances: [], corte: -1 };
  let bpl = null, avanceDots = 0;
  const eq = (off, pat) => pat.every((b, k) => bytes[off + k] === b);

  while (i < bytes.length) {
    if (eq(i, RESET))            { offsets.reset = i; i += 2; continue; }
    if (eq(i, CUT))              { offsets.corte = i; i += 3; continue; }
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x4a) {
      offsets.avances.push({ offset: i, dots: bytes[i + 2] });
      avanceDots += bytes[i + 2];
      i += 3; continue;
    }
    if (eq(i, GSV0)) {
      const wb = bytes[i + 4] | (bytes[i + 5] << 8);
      const h  = bytes[i + 6] | (bytes[i + 7] << 8);
      if (bpl === null) bpl = wb;
      if (wb !== bpl) throw new Error(`ancho de banda inconsistente: ${wb} != ${bpl}`);
      const cuerpo = i + 8, size = wb * h;
      if (cuerpo + size > bytes.length) throw new Error('raster truncado');
      for (let ry = 0; ry < h; ry++) {
        const fila = new Uint8Array(wb * 8);
        for (let xb = 0; xb < wb; xb++) {
          const v = bytes[cuerpo + ry * wb + xb];
          for (let k = 0; k < 8; k++) if (v & (1 << (7 - k))) fila[xb * 8 + k] = 1;
        }
        filas.push(fila);
      }
      offsets.bandas.push({ offset: i, filas: h, bytes: 8 + size });
      i = cuerpo + size; continue;
    }
    throw new Error(`comando desconocido en offset ${i}: ${[...bytes.slice(i, i + 8)].map((b) => b.toString(16)).join(' ')}`);
  }

  const ultimaBanda = offsets.bandas.length ? offsets.bandas[offsets.bandas.length - 1].offset : -1;
  return {
    filas, offsets, avanceDots, bytesPorLinea: bpl,
    corteEsUltimo: offsets.corte === bytes.length - 3,
    avanceTrasUltimaBanda: offsets.avances.length > 0 &&
      offsets.avances.every((a) => a.offset > ultimaBanda && a.offset < offsets.corte),
  };
}

// =====================================================================
// 5. COMPARACIÓN PÍXEL A PÍXEL
// =====================================================================
export function compararPixeles(orig, w, h, dec) {
  let distintos = 0, primero = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = orig[y][x], b = dec[y] ? dec[y][x] : 0;
      if (a !== b) { distintos++; if (!primero) primero = { x, y, esperado: a, recibido: b }; }
    }
  }
  return { distintos, primero, filasDecodificadas: dec.length };
}

// =====================================================================
// 6. PNG mínimo (para mirar la reconstrucción con los ojos)
// =====================================================================
function crc32(buf) {
  let c, tabla = crc32.t;
  if (!tabla) {
    tabla = crc32.t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabla[n] = c >>> 0; }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(tipo, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
export function escribirPNG(ruta, bits, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8 bits, escala de grises
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;                       // filtro None
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (bits[y] && bits[y][x]) ? 0 : 255;
  }
  writeFileSync(ruta, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

// =====================================================================
// 7. PERFIL TEMPORAL — la pregunta del USB.
//    DeviceConnection.send(int t)  -> Thread.sleep(t + data.length/16)
//    UsbConnection.send(int t)     -> OVERRIDE que IGNORA t y no hace flush
//    Por eso el mismo ticket tiene un perfil temporal radicalmente distinto
//    según el transporte, con los MISMOS bytes.
// =====================================================================
export function perfilTemporal(bandas, avanceBytes) {
  const tcp = bandas.reduce((a, b) => a + (0 + Math.floor(b.bytes / 16)), 0)
            + (avanceBytes ? Math.floor(avanceBytes / 16) : 0)
            + (100 + Math.floor(3 / 16));           // cutPaper hace send(100)
  return { tcpMs: tcp, usbMs: 0 };
}

// =====================================================================
// GENERADORES DE IMAGEN DE PRUEBA
// =====================================================================
function rgbaDePatron(w, h, fn) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = fn(x, y);
    const i = (y * w + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a === undefined ? 255 : a;
  }
  return rgba;
}
// Patrón con huella por fila: si una banda se pierde o se desordena, se nota.
const patronTicket = (x, y) => {
  if (y % 64 === 0) return [0, 0, 0];                       // regla horizontal
  if (x < 8 || x > 0) { /* continua abajo */ }
  const marca = (y >> 3) & 0xff;
  if (x < 16) return ((marca >> (x % 8)) & 1) ? [0, 0, 0] : [255, 255, 255];
  if ((x + y) % 17 === 0) return [0, 0, 0];
  return [255, 255, 255];
};

// =====================================================================
// SUITE
// =====================================================================
if (ES_PRINCIPAL) {
console.log('=== BANCO DE IMPRESIÓN — codec y framing ===\n');

// A. La regla de binarización, con los casos que un replicador ingenuo falla
check('binarización: (255,255,159) es NEGRO (umbral POR CANAL con OR)', esNegro(255, 255, 159) === true);
check('binarización: (160,160,160) es BLANCO (el umbral es estricto)', esNegro(160, 160, 160) === false);
check('binarización: (159,255,255) es NEGRO', esNegro(159, 255, 255) === true);
check('binarización: un píxel transparente sale NEGRO (el alfa se IGNORA)',
  binarizar(Uint8Array.from([0, 0, 0, 0]), 1, 1)[0][0] === 1);
check('binarización: blanco opaco sale BLANCO',
  binarizar(Uint8Array.from([255, 255, 255, 255]), 1, 1)[0][0] === 0);

// B. Cabecera GS v 0
check('bytesPorLinea(576) = 72 (80 mm)', bytesPorLinea(576) === 72);
check('bytesPorLinea(384) = 48 (58 mm)', bytesPorLinea(384) === 48);
check('bytesPorLinea(577) = 73 (redondea hacia arriba)', bytesPorLinea(577) === 73);
{
  const bits = binarizar(rgbaDePatron(576, 255, patronTicket), 576, 255);
  const b = encodeBanda(bits, 576, 0, 255);
  check('cabecera de banda 576×255: 1D 76 30 00 48 00 FF 00',
    b[0] === 0x1d && b[1] === 0x76 && b[2] === 0x30 && b[3] === 0x00 &&
    b[4] === 0x48 && b[5] === 0x00 && b[6] === 0xff && b[7] === 0x00);
  check('tamaño de banda = 8 + 72*255', b.length === 8 + 72 * 255);
}
{
  // Altura > 255 en UNA banda: yH deja de ser 0. Caso que el troceo evita, pero
  // la fórmula tiene que ser correcta igualmente.
  const bits = binarizar(rgbaDePatron(8, 300, () => [0, 0, 0]), 8, 300);
  const b = encodeBanda(bits, 8, 0, 300);
  check('cabecera con h=300: yL=0x2C yH=0x01', b[6] === 0x2c && b[7] === 0x01);
}

// C. Ida y vuelta con comparación PÍXEL A PÍXEL, en los dos anchos y varias alturas
const CASOS = [];
for (const [nombre, w] of [['80 mm (576 px)', 576], ['58 mm (384 px)', 384]]) {
  for (const [etiqueta, h] of [
    ['bajo (1 banda)', 200],
    ['justo en el borde (255)', 255],
    ['borde + 1 (256)', 256],
    ['pastel típico', 1031],
    ['muy alto', 3000],
  ]) {
    const rgba = rgbaDePatron(w, h, patronTicket);
    const orig = binarizar(rgba, w, h);
    const { flujo, bandas } = construirFlujo(orig, w, h, { avanceDots: 150 });
    const dec = decodificarFlujo(flujo);
    const cmp = compararPixeles(orig, w, h, dec.filas);
    CASOS.push({ nombre, etiqueta, w, h, flujo, bandas, dec, cmp });

    check(`${nombre} · ${etiqueta}: reconstrucción IDÉNTICA píxel a píxel`,
      cmp.distintos === 0 && dec.filas.length === h,
      cmp.distintos ? `(${cmp.distintos} distintos, 1º en ${JSON.stringify(cmp.primero)})` : '');
    check(`${nombre} · ${etiqueta}: el avance va DESPUÉS de la última banda y ANTES del corte`,
      dec.avanceTrasUltimaBanda === true);
    check(`${nombre} · ${etiqueta}: el corte es el ÚLTIMO comando del flujo`,
      dec.corteEsUltimo === true);
  }
}

// D. Sin avance configurado, el flujo vuelve a ser EXACTAMENTE el de antes
{
  const w = 576, h = 600;
  const orig = binarizar(rgbaDePatron(w, h, patronTicket), w, h);
  const sin = construirFlujo(orig, w, h, { avanceDots: 0 });
  const dec = decodificarFlujo(sin.flujo);
  check('con avance 0 no se manda ningún ESC J (comportamiento previo intacto)',
    dec.avances === undefined ? dec.offsets.avances.length === 0 : true);
  check('con avance 0 el corte sigue siendo el último comando', dec.corteEsUltimo === true);
}

// E. Un flujo con una banda perdida TIENE que detectarse (si no, el banco no sirve)
{
  const w = 576, h = 800;
  const orig = binarizar(rgbaDePatron(w, h, patronTicket), w, h);
  const { flujo } = construirFlujo(orig, w, h, { avanceDots: 150 });
  const dec = decodificarFlujo(flujo);
  // quitamos la última banda del decodificado, como si se hubiera truncado
  const mutilado = dec.filas.slice(0, dec.filas.length - 255);
  const cmp = compararPixeles(orig, w, h, mutilado);
  check('CONTROL: si falta una banda, la comparación lo DETECTA', cmp.distintos > 0,
    `(${cmp.distintos} píxeles distintos)`);
}

// =====================================================================
// TABLA
// =====================================================================
console.log('\n=== TABLA POR CASO ===');
console.log('ancho          | caso                  | alto px | mm    | bandas | bytes  | ESC J @ | corte @ | idéntico');
console.log('---------------|-----------------------|---------|-------|--------|--------|---------|---------|---------');
for (const c of CASOS) {
  const mm = (c.h * MM_POR_PUNTO).toFixed(1);
  const escj = c.dec.offsets.avances[0] ? c.dec.offsets.avances[0].offset : '—';
  console.log(
    `${c.nombre.padEnd(14)} | ${c.etiqueta.padEnd(21)} | ${String(c.h).padStart(7)} | ${mm.padStart(5)} | ` +
    `${String(c.bandas.length).padStart(6)} | ${String(c.flujo.length).padStart(6)} | ` +
    `${String(escj).padStart(7)} | ${String(c.dec.offsets.corte).padStart(7)} | ` +
    `${c.cmp.distintos === 0 ? 'SÍ' : 'NO'}`);
}

// =====================================================================
// CUÁNTO CONTENIDO QUEDA POR DEBAJO DE LA CUCHILLA
// =====================================================================
console.log('\n=== CONTENIDO QUE QUEDARÍA BAJO LA CUCHILLA (según el hueco real cabezal→cuchilla) ===');
console.log('El hueco de la Easytime NO se puede medir sin la impresora. Se tabula el rango típico.');
console.log('avance configurado: 150 puntos = 18.8 mm\n');
console.log('hueco real | puntos | contenido perdido con avance 150');
console.log('-----------|--------|---------------------------------');
for (const mm of [8, 10, 12.5, 15, 18.75, 20, 25]) {
  const dots = Math.round(mm / MM_POR_PUNTO);
  const perdido = Math.max(0, dots - 150);
  console.log(`${String(mm).padStart(7)} mm | ${String(dots).padStart(6)} | ` +
    (perdido === 0 ? 'NINGUNO ✔' : `${perdido} puntos = ${(perdido * MM_POR_PUNTO).toFixed(1)} mm ✗`));
}

// =====================================================================
// PERFIL TEMPORAL — USB vs TCP
// =====================================================================
console.log('\n=== PERFIL TEMPORAL (mismos bytes, transporte distinto) ===');
for (const c of CASOS.filter((x) => x.etiqueta === 'pastel típico')) {
  const p = perfilTemporal(c.bandas, 3);
  console.log(`${c.nombre} · ${c.etiqueta}: ${c.bandas.length} bandas`);
  console.log(`   TCP  -> ~${p.tcpMs} ms de Thread.sleep repartidos (DeviceConnection.send)`);
  console.log(`   USB  -> ${p.usbMs} ms: UsbConnection.send(int) IGNORA el parámetro y no hace flush`);
}
console.log('   USB es el DEFAULT (printerConfig.conexion = "usb").');

// =====================================================================
// ALTURA MÁXIMA
// =====================================================================
console.log('\n=== ALTURA MÁXIMA QUE SOPORTA EL SISTEMA ===');
console.log('Tope del RENDER: MAX_ALTO_RASTER_PX = 8192 (src/native/printTicket.js:35).');
console.log('  Por encima, renderTicketA576 NO recorta: REDUCE la escala para que quepa,');
console.log('  así que el ticket sale ENTERO pero MÁS PEQUEÑO. A 576 px de ancho eso son');
console.log(`  ${(8192 * MM_POR_PUNTO / 10).toFixed(1)} cm de papel.`);
console.log('Tope del PROTOCOLO: la altura de cada banda cabe en 16 bits (yL/yH) y el troceo');
console.log('  la mantiene en 255, así que el protocolo no impone límite práctico de altura total.');

if (process.argv.includes('--png')) {
  const dir = process.argv[process.argv.indexOf('--png') + 1] || '.';
  mkdirSync(dir, { recursive: true });
  for (const c of CASOS) {
    const base = `${c.w}px_${c.etiqueta.replace(/[^a-z0-9]+/gi, '_')}`;
    escribirPNG(`${dir}/${base}_reconstruido.png`, c.dec.filas, c.w, c.h);
  }
  console.log(`\nPNGs de la reconstrucción escritos en ${dir}`);
}

  console.log(`\n${ok} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}


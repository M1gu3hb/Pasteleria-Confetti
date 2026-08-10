// FASE 4 — Simulador/decodificador ESC/POS para VERIFICAR el troceo en bandas
// (ConfettiPrinterPlugin.java → imprimirImagenRaster). Pure Node, sin dependencias.
//
// ⚠️ ALCANCE REAL (corregido 2026-08-09). Este script reproduce el FRAMING del
// flujo —cabecera GS v 0, troceo en bandas y orden de comandos— y NADA MÁS.
// Lo que NO reproduce, para que nadie lea de más:
//   · la BINARIZACIÓN real de DantSu (`r<160 || g<160 || b<160`, con el alfa
//     ignorado): aquí se usa un patrón sintético, no una imagen;
//   · el escalado a 576 de `escalarAAncho`;
//   · la agrupación en `send()` del transporte.
// Su cabecera decía "Reproduce EXACTAMENTE lo que hace el Java", y eso era
// falso ya antes; se volvió más falso el 2026-08-09, cuando se añadió el
// `ESC J` al flujo y este decodificador empezó a LANZAR con el stream real.
// Ya conoce el `ESC J` y devuelve offsets absolutos.
//
// Reproduce el FRAMING de lo que hace el Java:
//   for (y = 0; y < alto; y += B) banda = rows[y .. y+min(B, alto-y)); printImage(bitmapToBytes(banda,false))
// y luego el JS manda cortar() (GS V). Cada banda es su propio GS v 0 con el MISMO
// formato de cabecera de DantSu 3.4.0 (1D 76 30 00 xL xH yL yH; yL=h%256, yH=h/256),
// verificado contra el javap de bitmapToBytes y el escpos_emulator.py del harness previo.
//
// Un DECODIFICADOR MULTI-BANDA (a diferencia del emulador previo, que solo leía UN
// GS v 0) apila las bandas y reconstruye la imagen completa. Comprueba:
//   1) reconstrucción COMPLETA (mismas dimensiones, mismos píxeles, sin filas
//      perdidas/duplicadas/desordenadas — con huella por fila para el borde de banda),
//   2) el CORTE (GS V) va tras la ÚLTIMA banda y es el último comando,
//   3) el cuerpo raster troceado == el cuerpo del raster MONOLÍTICO (no-regresión:
//      el troceo no cambia un solo píxel, solo parte en comandos),
//   4) alturas de banda válidas (<=256) y conteo de bandas correcto.
// Corre para B ∈ {255,256,257} y varias alturas (pastel ~1031, venta ~827, corte alto, bordes).

const MAGIC = [0x1d, 0x76, 0x30, 0x00];
const RESET = [0x1b, 0x40];
const CUT = [0x1d, 0x56, 0x01];
const ANCHO = 576; // 80mm

// ---------- bitmap sintético con HUELLA por fila (para cazar errores de borde) ----------
// pixelNegro(x,y): los primeros 16 px de cada fila codifican `y` en binario (huella),
// el resto es un patrón pseudo-aleatorio determinista. Así, si una fila se pierde,
// duplica o desordena, la reconstrucción difiere de forma detectable.
function pixelNegro(x, y, w) {
  if (x < 16) return ((y >> x) & 1) === 1;
  return (((x * 31) ^ (y * 17)) & 3) === 0;
}
function huellaDeFila(getPix, y, w) {
  let v = 0;
  for (let x = 0; x < 16; x++) if (getPix(x, y)) v |= (1 << x);
  return v;
}

// ---------- codificador GS v 0 de UNA banda (rows [y0, y0+h)) — formato DantSu ----------
function encodeGSv0(getPix, w, y0, h) {
  const widthBytes = Math.ceil(w / 8);
  const out = [
    ...MAGIC,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    h & 0xff, (h >> 8) & 0xff,
  ];
  for (let ry = 0; ry < h; ry++) {
    const y = y0 + ry;
    for (let xb = 0; xb < widthBytes; xb++) {
      let val = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        if (x < w && getPix(x, y)) val |= 1 << (7 - bit);
      }
      out.push(val);
    }
  }
  return out;
}

// ---------- construir el stream tal como saldría del plugin (RESET + N bandas + CUT) ----------
function streamBandeado(getPix, w, alto, B) {
  const bytes = [...RESET];
  const alturasBanda = [];
  for (let y = 0; y < alto; y += B) {
    const bh = Math.min(B, alto - y);
    alturasBanda.push(bh);
    bytes.push(...encodeGSv0(getPix, w, y, bh));
  }
  bytes.push(...CUT);
  return { bytes, alturasBanda };
}

// ---------- DECODIFICADOR MULTI-BANDA: apila las bandas y reconstruye ----------
function decode(bytes) {
  let i = 0;
  let reset = false, cut = false;
  const filas = []; // cada fila reconstruida como array de 0/1 de ancho W
  let widthBytes = null;
  const alturas = [];
  // Offsets ABSOLUTOS de cada comando, para poder afirmar DÓNDE cae el avance y
  // dónde el corte respecto al contenido (antes sólo se devolvían booleanos).
  const offsets = { reset: -1, bandas: [], avances: [], corte: -1 };
  let avanceDots = 0;
  const eq = (arr, off, pat) => pat.every((b, k) => arr[off + k] === b);
  while (i < bytes.length) {
    if (eq(bytes, i, RESET)) { reset = true; offsets.reset = i; i += 2; continue; }
    if (eq(bytes, i, CUT)) { cut = true; offsets.corte = i; i += 3; continue; }
    // ESC J n — avance de papel ANTES del corte. Añadido al flujo el 2026-08-09
    // (src/native/avancePapel.js). Sin este caso, este decodificador LANZABA
    // "comando desconocido" con el stream REAL de producción: el simulador se
    // quedó obsoleto en el mismo momento en que se arregló el corte.
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x4a) {
      offsets.avances.push({ offset: i, dots: bytes[i + 2] });
      avanceDots += bytes[i + 2];
      i += 3; continue;
    }
    if (eq(bytes, i, MAGIC)) {
      const wb = bytes[i + 4] | (bytes[i + 5] << 8);
      const h = bytes[i + 6] | (bytes[i + 7] << 8);
      if (widthBytes === null) widthBytes = wb;
      if (wb !== widthBytes) throw new Error(`ancho de banda inconsistente: ${wb} != ${widthBytes}`);
      const bodyOff = i + 8;
      const size = wb * h;
      if (bodyOff + size > bytes.length) throw new Error('raster truncado');
      for (let ry = 0; ry < h; ry++) {
        const fila = new Array(wb * 8).fill(0);
        for (let xb = 0; xb < wb; xb++) {
          const val = bytes[bodyOff + ry * wb + xb];
          for (let bit = 0; bit < 8; bit++) if (val & (1 << (7 - bit))) fila[xb * 8 + bit] = 1;
        }
        filas.push(fila);
      }
      alturas.push(h);
      offsets.bandas.push({ offset: i, filas: h, bytes: 8 + size });
      i = bodyOff + size;
      continue;
    }
    throw new Error(`comando desconocido en offset ${i}: ${bytes.slice(i, i + 8).map((b) => b.toString(16)).join(' ')}`);
  }
  const cutIsLast = eq(bytes, bytes.length - 3, CUT);
  // El avance tiene que ir DESPUÉS de la última banda y ANTES del corte. Si no,
  // no sirve de nada: el contenido seguiría por debajo de la cuchilla.
  const ultimaBanda = offsets.bandas.length ? offsets.bandas[offsets.bandas.length - 1].offset : -1;
  const avanceEntreUltimaBandaYCorte =
    offsets.avances.length > 0 &&
    offsets.avances.every((a) => a.offset > ultimaBanda && (offsets.corte < 0 || a.offset < offsets.corte));
  return {
    reset, cut, cutIsLast, filas, alturas, widthBytes,
    offsets, avanceDots, avanceEntreUltimaBandaYCorte,
    avanceMm: avanceDots * 0.125,
  };
}

// ---------- monolítico (comportamiento viejo) para la comparación de no-regresión ----------
function cuerpoMonolitico(getPix, w, alto) {
  const gs = encodeGSv0(getPix, w, 0, alto);
  return gs.slice(8); // solo el cuerpo (sin cabecera), = todas las filas en orden
}

const BANDA_ELEGIDA = 255; // = BAND_HEIGHT_DOTS en ConfettiPrinterPlugin.java

function verificar(nombre, alto, B) {
  const w = ANCHO;
  const getPix = (x, y) => pixelNegro(x, y, w);
  const { bytes } = streamBandeado(getPix, w, alto, B);
  const dec = decode(bytes);
  // CORRECTITUD del algoritmo (independiente del tamaño de banda): reconstrucción
  // completa + corte tras la última banda + no-regresión vs monolítico.
  const errCorrectitud = [];

  // 1) reconstrucción COMPLETA: misma altura, mismos píxeles, huella por fila correcta.
  if (dec.filas.length !== alto) errCorrectitud.push(`alto reconstruido ${dec.filas.length} != ${alto}`);
  let pixMal = 0, huellaMal = 0;
  for (let y = 0; y < Math.min(dec.filas.length, alto); y++) {
    for (let x = 0; x < w; x++) {
      const esperado = getPix(x, y) ? 1 : 0;
      if (dec.filas[y][x] !== esperado) pixMal++;
    }
    let v = 0;
    for (let x = 0; x < 16; x++) if (dec.filas[y][x]) v |= (1 << x);
    if (v !== (y & 0xffff)) huellaMal++;
  }
  if (pixMal) errCorrectitud.push(`${pixMal} pixeles distintos al original`);
  if (huellaMal) errCorrectitud.push(`${huellaMal} filas con huella/orden incorrecto`);

  // 2) corte tras la última banda y como último comando.
  if (!dec.cut) errCorrectitud.push('sin comando de corte (GS V)');
  if (!dec.cutIsLast) errCorrectitud.push('el corte NO es el último comando');
  if (!dec.reset) errCorrectitud.push('sin RESET inicial');

  // 3) no-regresión: cuerpo troceado == cuerpo monolítico (mismos píxeles, solo partido).
  const cuerpoBandas = [];
  for (let y = 0; y < alto; y += B) {
    const bh = Math.min(B, alto - y);
    cuerpoBandas.push(...encodeGSv0(getPix, w, y, bh).slice(8));
  }
  const cuerpoMono = cuerpoMonolitico(getPix, w, alto);
  const cuerpoIgual = cuerpoBandas.length === cuerpoMono.length && cuerpoBandas.every((b, k) => b === cuerpoMono[k]);
  if (!cuerpoIgual) errCorrectitud.push('cuerpo raster troceado != monolitico (no-regresion)');

  const esperadasBandas = Math.ceil(alto / B);
  if (dec.alturas.length !== esperadasBandas) errCorrectitud.push(`bandas ${dec.alturas.length} != ${esperadasBandas}`);
  const sumAlturas = dec.alturas.reduce((s, h) => s + h, 0);
  if (sumAlturas !== alto) errCorrectitud.push(`suma de alturas ${sumAlturas} != ${alto}`);

  // SELECCIÓN de tamaño de banda: cada banda debe ser <=256 filas para caber en el
  // buffer del cabezal (razón del troceo). 257 lo VIOLA → no elegible (aunque el
  // decodificador, sin buffer, igual reconstruya). Ésta es la evidencia de por qué 255/256 sí y 257 no.
  const bandaValida = !dec.alturas.some((h) => h > 256);

  return {
    nombre, alto, B,
    bandas: dec.alturas.length,
    stream_bytes: bytes.length,
    cut: dec.cut, corte_es_ultimo: dec.cutIsLast,
    no_regresion_vs_monolitico: cuerpoIgual,
    reconstruccion_ok: errCorrectitud.length === 0,
    banda_le256: bandaValida,
    errores: errCorrectitud,
  };
}

// ---------- casos ----------
const alturas = [
  ['pastel (~1031)', 1031],
  ['venta (~827)', 827],
  ['pre-cuenta (~900)', 900],
  ['corte dia ocupado (~2400)', 2400],
  ['borde 255', 255], ['borde 256', 256], ['borde 257', 257],
  ['borde 510', 510], ['borde 511', 511], ['borde 512', 512],
  ['minimo 1', 1],
];
const bandas = [255, 256, 257];

const resultados = [];
for (const B of bandas) for (const [nombre, alto] of alturas) resultados.push(verificar(nombre, alto, B));

console.log('FASE 4 — Simulación de troceo en bandas (ESC/POS GS v 0)\n');
for (const r of resultados) {
  const marca = !r.reconstruccion_ok ? 'XX' : (!r.banda_le256 ? '~ ' : 'OK');
  console.log(
    `${marca} B=${r.B} ${r.nombre.padEnd(26)} → ${String(r.bandas).padStart(2)} bandas, ` +
    `${r.stream_bytes} bytes, corte=${r.cut}/ultimo=${r.corte_es_ultimo}, no-regr=${r.no_regresion_vs_monolitico}, banda<=256=${r.banda_le256}` +
    (r.reconstruccion_ok ? '' : `  ✗ ${r.errores.join('; ')}`)
  );
}

// CORRECTITUD del algoritmo: la reconstrucción debe ser completa+corte+no-regresión
// para TODOS los tamaños (el decodificador no tiene buffer → siempre reconstruye).
const reconMalas = resultados.filter((r) => !r.reconstruccion_ok);
// ELECCIÓN: el tamaño elegido (255) debe ser válido (<=256) y correcto en TODOS los casos.
const elegida = resultados.filter((r) => r.B === BANDA_ELEGIDA);
const elegidaOk = elegida.every((r) => r.reconstruccion_ok && r.banda_le256);

console.log(`\nRECONSTRUCCIÓN (algoritmo): ${resultados.length - reconMalas.length}/${resultados.length} completas` +
  (reconMalas.length ? `  — ${reconMalas.length} FALLIDAS` : '  — todas COMPLETAS + con corte'));

console.log('\nElección de tamaño de banda (ticket pastel 1031px + regla <=256):');
for (const B of bandas) {
  const r = resultados.find((x) => x.B === B && x.alto === 1031);
  const maxBanda = B; // altura de las bandas llenas
  const veredicto = r.reconstruccion_ok && !resultados.some((x) => x.B === B && !x.banda_le256)
    ? 'ELEGIBLE' : `DESCARTADA (banda de ${maxBanda} > 256 filas: no cabe en buffer)`;
  console.log(`  B=${B}: ${r.bandas} bandas, reconstrucción ${r.reconstruccion_ok ? 'COMPLETA' : 'FALLA'}, corte ${r.corte_es_ultimo ? 'tras última banda' : 'MAL'} → ${veredicto}`);
}
console.log(`\nBANDA ELEGIDA = ${BANDA_ELEGIDA} (más conservadora: <=256 y sin el borde yL=0 de 256). ` +
  `${elegidaOk ? 'TODOS los casos VERDES.' : 'REVISAR.'}`);

// Verde si: (a) el algoritmo reconstruye completo+corte en todos, y (b) la banda elegida (255) es válida y correcta.
process.exit(reconMalas.length === 0 && elegidaOk ? 0 : 1);

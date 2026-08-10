// =====================================================================
// Verificación del AVANCE DE PAPEL ANTES DEL CORTE.
//
// EL BUG (2026-08-09, confirmado leyendo la librería, no suponiéndolo):
//   `EscPosPrinterCommands.cutPaper()` de DantSu 3.4.0 escribe SÓLO 3 bytes
//   —0x1D 0x56 0x01 (GS V 1)— y hace send(100). NO avanza papel. Verificado
//   con `javap -c` sobre el AAR de la caché de Gradle:
//       17: newarray byte / 21: bipush 29 / 26: bipush 86 / 31: iconst_1
//   El plugin llama `...connect().cutPaper()` y el JS lo invocaba justo tras
//   la última banda del raster. Los últimos milímetros del ticket se quedaban
//   entre el cabezal y la cuchilla -> pegados al ticket siguiente. Es el
//   síntoma reportado: al ticket de PASTEL le faltaba el final (total y
//   entrega a domicilio).
//
// COMPROBADA CONTRA EL CÓDIGO VIEJO: sin src/native/avancePapel.js el bloque
//   (A) no importa; y con el `ejecutarYcortarSiempre` anterior el bloque (B)
//   falla, porque no había ninguna llamada de avance entre el raster y el
//   corte.
//
// Uso:  node scripts/impresion_avance_corte_verify.mjs
// =====================================================================
import { readFileSync } from 'node:fs';

let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── (A) Los bytes, con la función REAL ──────────────────────────────────
const { bytesAvancePapel, dotsAMilimetros, MAX_AVANCE_DOTS } =
  await import('../src/native/avancePapel.js');

check('150 puntos -> un solo ESC J 150',
  eq(bytesAvancePapel(150), [0x1b, 0x4a, 150]));
check('255 puntos -> un solo comando (n cabe en un byte)',
  eq(bytesAvancePapel(255), [0x1b, 0x4a, 255]));
check('256 puntos -> DOS comandos (255 + 1), no un byte desbordado',
  eq(bytesAvancePapel(256), [0x1b, 0x4a, 255, 0x1b, 0x4a, 1]));
check('600 puntos -> 255 + 255 + 90',
  eq(bytesAvancePapel(600), [0x1b, 0x4a, 255, 0x1b, 0x4a, 255, 0x1b, 0x4a, 90]));
check('ningún n supera 255 en un caso grande',
  bytesAvancePapel(1200).filter((_, i) => i % 3 === 2).every((n) => n >= 1 && n <= 255));
check('se respeta el techo de cordura',
  bytesAvancePapel(999999).filter((_, i) => i % 3 === 2).reduce((a, b) => a + b, 0) === MAX_AVANCE_DOTS);

// Valores crudos: 0 y basura NO deben mandar nada (comportamiento de antes).
for (const v of [0, -1, null, undefined, NaN, '', 'abc', {}, []]) {
  check(`con ${JSON.stringify(v) ?? String(v)} no manda nada`, eq(bytesAvancePapel(v), []));
}
check('conversión a milímetros a 203 dpi (150 pts = 18.75 mm)',
  Math.abs(dotsAMilimetros(150) - 18.75) < 1e-9);

// ── (B) El ORDEN en printTicket.js: raster -> avance -> corte ────────────
const pt = readFileSync(new URL('../src/native/printTicket.js', import.meta.url), 'utf8');
const iFn = pt.indexOf('async function ejecutarYcortarSiempre');
const fn = iFn >= 0 ? pt.slice(iFn, iFn + 1400) : '';

check('existe ejecutarYcortarSiempre', iFn >= 0);
const iRaster = fn.indexOf('accionRaster()');
const iAvance = fn.indexOf('avanzarPapelAntesDelCorte()');
const iCorte  = fn.indexOf('cortar()');
check('se llama al avance de papel antes de cortar', iAvance >= 0);
check('el ORDEN es raster -> avance -> corte',
  iRaster >= 0 && iAvance > iRaster && iCorte > iAvance,
  `(raster@${iRaster} avance@${iAvance} corte@${iCorte})`);
check('el corte se sigue intentando aunque falle el avance (garantía FASE 4)',
  /avanzarPapelAntesDelCorte\(\)[\s\S]{0,220}catch[\s\S]{0,220}cortar\(\)/.test(fn));
check('el avance usa la config LOCAL del dispositivo, no un valor fijo',
  /getPrinterConfig\(\)[\s\S]{0,200}avanceAntesCorteDots/.test(pt));
check('printTicket.js importa la función de bytes',
  /from '@\/native\/avancePapel'/.test(pt));

// ── (C) El default está puesto y es > 0 (si no, el bug sigue vivo) ───────
const cfg = readFileSync(new URL('../src/native/printerConfig.js', import.meta.url), 'utf8');
const m = cfg.match(/avanceAntesCorteDots:\s*(\d+)/);
check('printerConfig declara avanceAntesCorteDots', !!m);
check('el default es > 0 (con 0 el bug seguiría vivo)', !!m && Number(m[1]) > 0,
  m ? `(= ${m[1]} puntos = ${(Number(m[1]) * 0.125).toFixed(2)} mm)` : '');
check('el default cubre un hueco cabezal→cuchilla típico de 80 mm (>= 12 mm)',
  !!m && Number(m[1]) * 0.125 >= 12);

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

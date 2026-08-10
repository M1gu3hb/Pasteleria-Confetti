// =====================================================================
// "FAVOR DE REGRESAR LA BASE LIMPIA" — el aviso que pidió Abel.
//
// POR QUÉ NO ESTABA, aunque el texto llevaba meses en el repo:
//   El texto existía en `src/components/pedidos/TicketPedidoPastel.jsx` desde
//   el import de Base44 (commit 9a281f3), pero ESE COMPONENTE NO LO RENDERIZA
//   NADIE. `NuevoPedidoPastel.jsx` lo importa (línea 26) y nunca lo usa: su
//   botón "Imprimir" hace `setVerDetalle(true)`, que abre
//   `PedidoPastelDetalleDialog`, y ése monta `TicketPastelConfetti`.
//   Comprobado: `grep -rn "<TicketPedidoPastel" src/` → 0 resultados, y
//   `git log -S "<TicketPedidoPastel"` → 0 commits (nunca se renderizó en la
//   historia de este repo). El aviso estaba escrito en un componente muerto.
//
// LO QUE ESTA SUITE COMPRUEBA, Y POR QUÉ CADA COSA:
//   1. El aviso está en el componente que SÍ se imprime.
//   2. Va DESPUÉS del bloque de domicilio (Abel pidió "abajo del todo") y
//      DENTRO de `.ticket-printable` (si cae fuera, no se imprime: el helper
//      selecciona ese nodo).
//   3. Estilos EN LÍNEA. El iframe térmico de print.js no carga Tailwind: una
//      clase saldría sin borde y sin centrar. Lo dice la cabecera del propio
//      componente.
//   4. NO se cuelga de `pedido.devolver_base`. Esa columna NO EXISTE en la
//      tabla `pedidos` (verificado en information_schema el 2026-08-09) ni está
//      en la whitelist `COLUMNS.pedidos` del adaptador, así que el valor se
//      descarta al guardar y al releer siempre vuelve `undefined`. Condicionar
//      el aviso a ese campo sería una opción falsa.
//   5. SÓLO pastel: un pedido de catálogo web (flan, gelatina) no viene en una
//      base devolvible.
//   6. NINGÚN OTRO TICKET CAMBIA. Se comprueba por SHA-256 del CONTENIDO
//      (normalizado a LF), que es la única forma de demostrarlo sin ambigüedad.
//   7. El texto se entiende SIN los emojis, y los emojis elegidos son de
//      Unicode 6.0 (2010) — la misma quinta que el 🚚 que ya se imprime.
//
// COMPROBADA CONTRA EL CÓDIGO VIEJO:
//   git show <sha>:src/... > viejo/... && SRC_DIR=viejo node scripts/ticket_pastel_base_limpia_verify.mjs
//   → 7 FAIL con el código anterior a 2026-08-09.
//   Las 5 comprobaciones de "intacto" PASAN a los dos lados A PROPÓSITO: esos
//   archivos no cambiaron, y ése es justo el punto. (Al escribirlas hasheaban
//   los bytes crudos y fallaban contra el árbol viejo por los finales de línea
//   —`git show` emite LF, el árbol tiene CRLF—: un discriminador falso.
//   Corregido hasheando el contenido normalizado.)
//
// Uso:  node scripts/ticket_pastel_base_limpia_verify.mjs
//       SRC_DIR=<dir> node scripts/ticket_pastel_base_limpia_verify.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = process.env.SRC_DIR
  ? resolve(process.cwd(), process.env.SRC_DIR)
  : resolve(AQUI, '..', 'src');

let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

console.log(`Fuente: ${RAIZ}\n`);

const RUTA_TICKET = 'components/pedidos/TicketPastelConfetti.jsx';
const crudo = leer(RUTA_TICKET);
const src = sinComentarios(crudo);

const TEXTO = 'FAVOR DE REGRESAR LA BASE LIMPIA';

// ── 1. Está en el componente que SÍ se imprime ─────────────────────────
check('1. el aviso está en TicketPastelConfetti (el que se imprime de verdad)',
  src.includes(TEXTO));

// El componente muerto sigue existiendo; que nadie lo confunda con éste.
let muerto = '';
try { muerto = leer('components/pedidos/TicketPedidoPastel.jsx'); } catch { /* puede no existir */ }
check('1b. TicketPedidoPastel sigue sin renderizarse en ningún sitio (es código muerto)',
  muerto === '' || !/<TicketPedidoPastel/.test(leer('pages/NuevoPedidoPastel.jsx')));

// ── 2. Posición: después de domicilio, dentro de .ticket-printable ─────
const iDomicilio = src.indexOf('PIDIERON ENTREGA A DOMICILIO');
const iAviso = src.indexOf(TEXTO);
check('2. va DESPUÉS del bloque de entrega a domicilio (abajo del todo)',
  iDomicilio > 0 && iAviso > iDomicilio,
  `(domicilio @${iDomicilio}, aviso @${iAviso})`);

// El wrapper con .ticket-printable abre al principio y cierra al final: el
// aviso tiene que caer ANTES de ese cierre, o el helper de impresión no lo ve.
const iWrapper = src.indexOf('ticket-printable');
const iCierreWrapper = src.lastIndexOf('</div>');
check('3. queda DENTRO de .ticket-printable (si no, no se imprimiría)',
  iWrapper > 0 && iAviso > iWrapper && iAviso < iCierreWrapper,
  `(wrapper @${iWrapper}, cierre @${iCierreWrapper})`);

// Nada de posicionamiento absoluto: los dos bloques se apilan en flujo normal,
// que es lo que garantiza que no se encimen.
check('4. el componente no usa position absolute/fixed (los bloques se apilan)',
  !/position:\s*['"]?(absolute|fixed)/.test(src));

// ── 5. Estilos EN LÍNEA, no Tailwind ───────────────────────────────────
const bloque = src.slice(Math.max(0, iAviso - 700), iAviso + 200);
check('5. el bloque del aviso usa estilos EN LÍNEA (el iframe térmico no carga Tailwind)',
  /style=\{\{[^}]*border[^}]*\}\}/.test(bloque) && /style=\{\{[^}]*textAlign:\s*'center'/.test(bloque));
check('5b. el bloque del aviso NO usa className',
  !/className=/.test(src.slice(iAviso - 400, iAviso + 200)));

// ── 6. Condiciones: incondicional salvo catálogo ───────────────────────
check('6. NO se cuelga de devolver_base (columna inexistente → siempre undefined)',
  !/devolver_base/.test(src));
check('7. sólo pastel personalizado: se excluye el catálogo web',
  /\{!esCatalogo && \(/.test(src) &&
  src.indexOf('{!esCatalogo && (', iDomicilio) > 0 &&
  src.indexOf('{!esCatalogo && (', iDomicilio) < iAviso);

// ── 7. El texto se entiende sin emojis ─────────────────────────────────
// Se quitan TODOS los caracteres fuera del plano básico y los símbolos, y el
// aviso tiene que seguir leyéndose entero.
const lineaAviso = crudo.split(/\r?\n/).find((l) => l.includes(TEXTO)) || '';
const sinEmojis = lineaAviso.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, '').trim();
check('8. el aviso se entiende SIN los emojis (van de adorno, no cargan el significado)',
  sinEmojis.includes(TEXTO), `→ "${sinEmojis}"`);

// Emojis de Unicode 6.0 (2010): los que Android trae desde 4.4. Uno nuevo
// (p.ej. 🧼 U+1F9FC, Unicode 11.0) podría no tener glifo en el WebView viejo
// de la tablet. El 🚚 que ya se imprime desde julio es de la misma quinta.
const EMOJIS_PERMITIDOS = new Set(['\u{1F382}', '\u{1F64F}', '\u{1F69A}']); // 🎂 🙏 🚚
const emojisEnAviso = Array.from(lineaAviso.matchAll(/[\u{1F000}-\u{1FAFF}]/gu)).map((m) => m[0]);
check('9. los emojis del aviso son de Unicode 6.0 (glifo disponible en WebView viejo)',
  emojisEnAviso.length > 0 && emojisEnAviso.every((e) => EMOJIS_PERMITIDOS.has(e)),
  `→ ${emojisEnAviso.map((e) => e + ' U+' + e.codePointAt(0).toString(16).toUpperCase()).join(' ')}`);

// ── 8. NINGÚN OTRO TICKET CAMBIA — por SHA-256 del CONTENIDO ───────────
// Es la única comprobación que demuestra "no toqué nada más" sin ambigüedad.
// Si alguno cambia a propósito, se actualiza el hash Y se explica por qué.
//
// ⚠️ SE HASHEA EL CONTENIDO NORMALIZADO A LF, no los bytes del archivo.
// Con los bytes crudos, esta comprobación fallaba contra el árbol viejo
// extraído con `git show` — que emite LF — mientras el árbol de trabajo tiene
// CRLF. Fallaba por los finales de línea, NO porque los archivos cambiaran:
// un discriminador falso, que además se rompería en cualquier clon con otro
// `core.autocrlf`. Estas 5 comprobaciones PASAN a los dos lados a propósito:
// su trabajo es fallar si alguien toca de verdad otro ticket.
const hashContenido = (ruta) =>
  createHash('sha256')
    .update(readFileSync(join(RAIZ, ruta), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex');

const HASHES = {
  'components/tickets/CorteTicket.jsx':        '39474285498356c506b02428d66b327cf21d17c2310629d11dd387c9e5917f6b',
  'components/tickets/CorteTicketTermico.jsx': 'ce96b89dce405bd3eb51441263bf1b289e00fcd19d315288b6895cd29e2099a9',
  'components/tickets/PreCuentaTicket.jsx':    'adf90ead8361cbc4539f39b47451bf584bae2f007a7a0176114bee737b64b10a',
  'components/tickets/TicketViewerDialog.jsx': '66b3145abeacab0a8d6ce1039b491a412a6cbc49b706ef85e5be102b97365f3c',
  'components/pedidos/TicketPedidoPastel.jsx': '6fd58923b0ad7ad146ad92983a65dfae6039dfb09678599840bba7ea7bc0bb72',
};
for (const [ruta, esperado] of Object.entries(HASHES)) {
  let real = '(no se pudo leer)';
  try { real = hashContenido(ruta); } catch { /* falta */ }
  check(`10. intacto (sha256 del contenido): ${ruta.split('/').pop()}`, real === esperado,
    real === esperado ? '' : `esperado ${esperado.slice(0, 12)}… real ${real.slice(0, 12)}…`);
}

// Y que ninguno de ellos haya heredado el aviso por copia-pega.
for (const ruta of Object.keys(HASHES)) {
  let c = '';
  try { c = readFileSync(join(RAIZ, ruta), 'utf8'); } catch { /* falta */ }
  if (ruta.endsWith('TicketPedidoPastel.jsx')) continue; // éste tiene el texto VIEJO ("DEVOLVER"), a propósito
  check(`11. no se coló el aviso en ${ruta.split('/').pop()}`, !c.includes(TEXTO));
}

// ══════════════════════════════════════════════════════════════════════
// 12. ¿EL BLOQUE NUEVO QUEDA MÁS ALLÁ DE LA CUCHILLA?
//
// La pregunta importa porque el bug que reportó Abel era exactamente ése: el
// final del ticket se quedaba entre el cabezal y la cuchilla. Si el aviso va
// al final, hay que demostrar que no cae en esa zona.
//
// LA RESPUESTA ES GEOMÉTRICA, y se demuestra con los bytes reales.
// `ejecutarYcortarSiempre` (src/native/printTicket.js) emite, en este orden:
//        raster (N bandas)  →  ESC J n (avance)  →  GS V 1 (corte)
// El avance es un SUFIJO DE LONGITUD FIJA que va DESPUÉS de todo el contenido.
// Por tanto la distancia entre la última fila impresa y la cuchilla NO depende
// de lo alto que sea el ticket: alargar el ticket mueve el papel entero, no
// acorta el margen. Añadir el aviso al final no consume margen de corte; el
// aviso pasa a ser "el final", y conserva los mismos 150 puntos de avance.
//
// Se comprueba construyendo el flujo REAL con el banco de impresión
// (scripts/impresion_banco.mjs, 44/44) para dos alturas distintas.
import { construirFlujo, decodificarFlujo, MM_POR_PUNTO } from './impresion_banco.mjs';

const W = 576;                     // 80 mm
const ALTO_SIN = 1031;             // alto típico del ticket de pastel hoy
const ALTO_CON = ALTO_SIN + 86;    // + el bloque nuevo (ver el cálculo abajo)
const AVANCE = 150;                // src/native/printerConfig.js

const bitsDe = (w, h) => {
  // Patrón irrelevante: lo que se mide es la ESTRUCTURA del flujo, no el dibujo.
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bits[y * w + x] = (y % 7 === 0) ? 1 : 0;
  return bits;
};

const medir = (h) => {
  const { flujo } = construirFlujo(bitsDe(W, h), W, h, { avanceDots: AVANCE });
  const d = decodificarFlujo(flujo);
  return {
    h,
    nBandas: d.offsets.bandas.length,
    dotsAvance: d.avanceDots,
    filasReconstruidas: d.filas.length,
    avanceTrasUltimaBanda: d.avanceTrasUltimaBanda,
    corteEsUltimo: d.corteEsUltimo,
  };
};

const sin = medir(ALTO_SIN);
const con = medir(ALTO_CON);

check('12. el ticket con el aviso es MÁS ALTO (si no, no se estaría midiendo nada)',
  con.filasReconstruidas > sin.filasReconstruidas && ALTO_CON > ALTO_SIN,
  `(${sin.filasReconstruidas} filas / ${sin.nBandas} bandas → ${con.filasReconstruidas} filas / ${con.nBandas} bandas)`);
check('13. en los dos casos el avance va TRAS la última banda y ANTES del corte',
  sin.avanceTrasUltimaBanda && con.avanceTrasUltimaBanda && sin.corteEsUltimo && con.corteEsUltimo);
check('14. el margen hasta la cuchilla es EL MISMO con y sin el aviso',
  sin.dotsAvance === con.dotsAvance && sin.dotsAvance === AVANCE,
  `(${sin.dotsAvance} = ${con.dotsAvance} puntos = ${(AVANCE * MM_POR_PUNTO).toFixed(2)} mm)`);

// Cuánto papel de más gasta el bloque. Se calcula desde el CSS del componente,
// no se mide en papel: aquí no hay impresora. 1 mm = 96/25.4 px en el navegador.
const MM_A_PX = 96 / 25.4;
const altoBloquePx =
  8 +                     // margen superior de <Linea/> (colapsado con el anterior)
  1 +                     // borde de <Linea/>
  8 +                     // margen inferior de <Linea/>, colapsa con el marginTop 2mm del div
  2 * 2 +                 // border: 2px arriba y abajo
  2 * (2.5 * MM_A_PX) +   // padding vertical 2.5mm
  14 * 1.25;              // fontSize 14px × lineHeight 1.25
// El ticket se rasteriza escalando su ancho de diseño (max-w-sm = 384px) al
// ancho destino: 576/384 = 1.5 en 80 mm; 384/384 = 1 en 58 mm.
const papel = (escala) => altoBloquePx * escala * MM_POR_PUNTO;
console.log(
  `\nINFO (no es una comprobación): el bloque añade ~${altoBloquePx.toFixed(0)} px de diseño → ` +
  `~${papel(1.5).toFixed(1)} mm de papel a 80 mm y ~${papel(1).toFixed(1)} mm a 58 mm. ` +
  `Calculado desde el CSS, NO medido en papel.`
);

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

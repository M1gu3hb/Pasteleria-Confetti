// =====================================================================
// Verificación de los botones de impresión del CORTE DE CAJA.
//
// DOS DEFECTOS REALES (2026-08-09), encontrados por auditoría y CONFIRMADOS
// por una verificación adversarial independiente:
//
//  1) CorteAutoDownloader — el botón «Listo» estaba anidado dentro de
//     `{!done && ( … {done && <Button…>Listo</Button>} … )}`, o sea dentro de
//     `!done && done`: INALCANZABLE. Por tanto `onDone` NUNCA se llamaba y
//     `autoDownloadCorte` se quedaba puesto en Caja.jsx. Consecuencia
//     SILENCIOSA: al cerrar un SEGUNDO corte sin salir de /caja, el componente
//     no se remontaba, `done` seguía en true, el efecto no descargaba y el
//     botón de rescate tampoco se mostraba → el PDF de ese corte y de todos los
//     siguientes NO se descargaba, sin aviso y sin forma de pedirlo.
//     (El auditor original sólo dijo "onDone nunca se llama"; el refutador
//      demostró que la consecuencia era bastante peor.)
//
//  2) CorteViewerDialog — el botón «Imprimir / PDF» llevaba `disabled={loading}`
//     y `loading` es sólo el `isPending` de la query: vale false DURANTE toda la
//     impresión. Su botón hermano «Descargar» sí tenía `loading || downloading`.
//     Doble toque = dos trabajos de impresión del mismo corte.
//
// LO QUE **NO** SE AFIRMA (refutado, y se deja escrito para que nadie lo
// persiga otra vez):
//   · NO hay corte duplicado en la base. CorteViewerDialog es de sólo lectura.
//   · NO se puede desconectar la impresora ENTRE las bandas del raster: el
//     bucle de bandas vive dentro de UNA sola tarea del
//     `Executors.newSingleThreadExecutor()` del plugin Java.
//
// COMPROBADA CONTRA EL CÓDIGO VIEJO: con los archivos anteriores, 5 FAIL.
//
// Uso:  node scripts/impresion_corte_botones_verify.mjs
// =====================================================================
import { readFileSync } from 'node:fs';

let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};
const leer = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ── (1) CorteAutoDownloader ─────────────────────────────────────────────
const auto = sinComentarios(leer('../src/components/cortes/CorteAutoDownloader.jsx'));

check('AutoDownloader: avisa al padre al terminar la descarga (onDone)',
  /await\s+downloadNodeAsPDF[\s\S]{0,400}onDone\?\.\(\)/.test(auto));

// El «Listo» ya NO puede estar dentro del bloque {!done && …}.
const iNoDone = auto.indexOf('{!done && (');
const iCierreNoDone = iNoDone >= 0 ? auto.indexOf('\n      )}', iNoDone) : -1;
const bloqueNoDone = iNoDone >= 0 && iCierreNoDone > iNoDone ? auto.slice(iNoDone, iCierreNoDone) : '';
check('AutoDownloader: existe el bloque {!done && …}', iNoDone >= 0);
check('AutoDownloader: el botón «Listo» NO está dentro de {!done && …} (era inalcanzable)',
  bloqueNoDone.length > 0 && !/Listo/.test(bloqueNoDone));
// Esta comprobación pasaba TAMBIÉN con el código viejo (el «Listo» anidado
// también casa con `{done && ( … Listo`). Una comprobación que no distingue no
// comprueba nada. Ahora se exige que el `{done && (` que contiene «Listo» esté
// DESPUÉS del cierre del bloque `{!done && …}`, que es lo que lo hace alcanzable.
const iListo = auto.indexOf('Listo');
const iDoneBloque = iListo >= 0 ? auto.lastIndexOf('{done && (', iListo) : -1;
check('AutoDownloader: el «Listo» está FUERA del bloque !done (alcanzable)',
  iListo >= 0 && iDoneBloque > iCierreNoDone && iCierreNoDone > 0,
  `(cierre !done @${iCierreNoDone}, {done && ( @${iDoneBloque})`);

check('AutoDownloader: guarda de reentrada SÍNCRONA (ref, no state)',
  /enCursoRef\s*=\s*useRef\(false\)/.test(auto) &&
  /if\s*\(\s*enCursoRef\.current\s*\)\s*return;/.test(auto));
check('AutoDownloader: la guarda se libera en finally',
  /finally\s*\{[\s\S]{0,200}enCursoRef\.current\s*=\s*false/.test(auto));

// ── (2) CorteViewerDialog ───────────────────────────────────────────────
const dlg = sinComentarios(leer('../src/components/cortes/CorteViewerDialog.jsx'));

check('ViewerDialog: el botón Imprimir se deshabilita también con downloading',
  /onClick=\{handlePrintCashCut\}\s+disabled=\{loading \|\| downloading\}/.test(dlg));
check('ViewerDialog: el botón Imprimir tiene aria-busy',
  /onClick=\{handlePrintCashCut\}[\s\S]{0,120}aria-busy=\{downloading\}/.test(dlg));
check('ViewerDialog: el botón Imprimir muestra spinner mientras imprime',
  /onClick=\{handlePrintCashCut\}[\s\S]{0,320}Loader2[\s\S]{0,120}Imprimiendo/.test(dlg));
check('ViewerDialog: guarda de reentrada síncrona compartida (ocupadoRef)',
  /ocupadoRef\s*=\s*useRef\(false\)/.test(dlg));
check('ViewerDialog: la impresión comprueba la guarda',
  /handlePrintCashCut\s*=\s*async[\s\S]{0,400}if\s*\(\s*ocupadoRef\.current\s*\)\s*return;/.test(dlg));
check('ViewerDialog: la descarga comprueba la MISMA guarda (no se solapan)',
  /handleDownloadCashCutPDF\s*=\s*async[\s\S]{0,200}if\s*\(\s*ocupadoRef\.current\s*\)\s*return;/.test(dlg));
check('ViewerDialog: la guarda se libera en finally',
  /finally\s*\{[\s\S]{0,160}ocupadoRef\.current\s*=\s*false/.test(dlg));

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

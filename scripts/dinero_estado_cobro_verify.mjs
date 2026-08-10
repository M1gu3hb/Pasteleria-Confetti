// =====================================================================
// Estado que sobrevive de un cobro al siguiente — 3 defectos (2026-08-09).
//
// Los tres son el MISMO patrón: estado que debería morir con la operación
// y no muere. Dos cuestan dinero de verdad; el tercero deja la caja muerta.
//
//  (a) NuevoPedidoPastel — DOBLE PEDIDO Y DOBLE COBRO.
//      El botón "Guardar pedido" sólo llevaba `disabled={guardando}`, y
//      `guardando` vuelve a false en el `finally`. Al terminar el guardado el
//      botón quedaba OTRA VEZ activo y seguía diciendo "Guardar pedido".
//      Un segundo toque no entra por la rama de edición (`editId` es null),
//      así que cae al else y CREA OTRO pedido: otro folio, y si había
//      anticipo, OTRO abono con OTRA venta paralela cobrada en el corte del
//      día. Al cliente se le cobra el anticipo dos veces.
//      Comprobado en producción: la base NO lo para — `pedidos` y `abonos`
//      sólo tienen su PK, y `ventas.folio` no es único.
//      Además faltaba la guarda SÍNCRONA: `setGuardando(true)` no se ve hasta
//      el siguiente render, así que un doble toque rápido en tablet entraba
//      dos veces aunque el `disabled` estuviera bien.
//
//  (b) TerminalGate — SPINNER INFINITO, POS MUERTO.
//      `autoLoginRef` no se soltaba nunca. TerminalGate es el `element` de la
//      ruta de layout: no se desmonta, así que el ref era un latch de por
//      vida. Lo dispara el arreglo de la sesión colgada
//      (`Sidebar.handleSalirAdmin:200-206`): si al salir de dueño/pastelero
//      `loginTerminal` falla, hace `logout()` → `posUser` a null → el efecto
//      se vuelve a disparar y muere en `if (autoLoginRef.current) return`.
//      Como `sesionError` está en null, tampoco sale el botón "Reintentar"
//      (el único otro sitio que soltaba el ref). Queda el spinner, y la caja
//      no cobra hasta recargar la página.
//
//  (c) Caja — MÉTODO DE PAGO DEL TICKET ANTERIOR + MIXTO QUE NO SUMA.
//      `abrirVenta` limpiaba los importes pero NO `metodoPago`, que sólo se
//      reponía tras un cobro CORRECTO. Abrir un ticket, elegir "Tarjeta",
//      salirse sin cobrar y abrir el siguiente lo dejaba YA en "Tarjeta":
//      un cobro en efectivo registrado como tarjeta, y un descuadre que
//      aparece en el corte sin explicación. La búsqueda por folio (la puerta
//      de los pedidos web) no limpiaba NADA, ni método ni importes.
//      Y "mixto" es el único método sin reparto automático: se guardaba tal
//      cual, sin comprobar que sumara. Con los campos vacíos la venta se
//      guardaba pagada con efectivo=0 + tarjeta=0 + transferencia=0.
//
// LO QUE ESTA SUITE **NO** AFIRMA:
//   · No comprueba matemática del dinero. La guarda de (c) es SÓLO una
//     guarda: lee lo ya calculado y se niega a guardar un cobro incoherente.
//     Por eso se verifica byte a byte que el reparto automático NO cambió.
//
// COMPROBADA CONTRA EL CÓDIGO VIEJO. Para repetirlo:
//   git -C . show <sha-viejo>:src/pages/NuevoPedidoPastel.jsx > viejo/pages/...
//   SRC_DIR=viejo node scripts/dinero_estado_cobro_verify.mjs
//   → 16 FAIL con el código anterior a 2026-08-09.
//   Las 10 que pasan en AMBOS lados son las de "intacto" y las guardas que no
//   se tocaron: ésas tienen que pasar a los dos lados, ése es su trabajo.
//
// Uso:  node scripts/dinero_estado_cobro_verify.mjs
//       SRC_DIR=<dir> node scripts/dinero_estado_cobro_verify.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
// Las comprobaciones miran CÓDIGO, no comentarios: si no, los comentarios que
// explican el bug harían pasar el test por sí solos.
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

console.log(`Fuente: ${RAIZ}\n`);

// ── (a) NuevoPedidoPastel — doble pedido + doble cobro ──────────────────
const ped = sinComentarios(leer('pages/NuevoPedidoPastel.jsx'));

check('(a) existe la guarda de reentrada como REF (no como estado)',
  /guardandoRef\s*=\s*useRef\(false\)/.test(ped));

check('(a) `guardar` sale inmediatamente si ya está guardando',
  /const guardar = async[\s\S]*?if\s*\(\s*guardandoRef\.current\s*\)\s*return;/.test(ped));

// La guarda tiene que armarse JUSTO antes de entrar al try/finally. Si se
// armara al principio de `guardar`, cualquier validación que devuelve temprano
// la dejaría puesta para siempre y el botón moriría sin haber guardado nada.
check('(a) la guarda se arma pegada al try (ninguna validación puede dejarla puesta)',
  /guardandoRef\.current\s*=\s*true;\s*setGuardando\(true\);\s*try\s*\{/.test(ped));

check('(a) la guarda se suelta en el finally',
  /finally\s*\{[\s\S]{0,160}guardandoRef\.current\s*=\s*false/.test(ped));

// El corazón del arreglo: tras crear el pedido el botón NO se re-arma.
check('(a) el botón se DESARMA tras crear el pedido (no sólo mientras guarda)',
  /disabled=\{guardando \|\| \(!editId && !!pedidoGuardado\?\.id\)\}/.test(ped));

check('(a) y lo DICE: la etiqueta cambia a "Pedido guardado"',
  /pedidoGuardado\?\.id\s*\n?\s*\?\s*'Pedido guardado/.test(ped));

// `limpiar()` (botón "Nuevo pedido") tiene que poder re-armarlo, o el cajero
// no podría capturar dos pedidos seguidos sin recargar.
check('(a) "Nuevo pedido" re-arma el botón (limpiar borra pedidoGuardado)',
  /const limpiar = \(\)[\s\S]{0,200}setPedidoGuardado\(null\)/.test(ped));

// NEGATIVO: el `disabled` a secas es justo el código viejo.
check('(a) ya no queda ningún `disabled={guardando}` a secas en el botón',
  !/onClick=\{guardar\}\s+disabled=\{guardando\}/.test(ped));

// ── (b) TerminalGate — spinner infinito ─────────────────────────────────
const gate = sinComentarios(leer('components/common/TerminalGate.jsx'));

check('(b) el ref se suelta cuando desaparece posUser',
  /if\s*\(\s*!posUser\s*\)\s*autoLoginRef\.current\s*=\s*false;/.test(gate));

check('(b) ese reseteo es un efecto que reacciona a posUser',
  /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\s*!posUser\s*\)\s*autoLoginRef\.current\s*=\s*false;\s*\},\s*\[posUser\]\)/.test(gate));

// Y las guardas reales contra la doble apertura de sesión NO se tocaron.
check('(b) sigue sin reabrir sesión si ya hay usuario',
  /if\s*\(posUser\)\s*return;/.test(gate));
check('(b) sigue habiendo guarda durante el await',
  /if\s*\(autoLoginRef\.current\)\s*return;\s*autoLoginRef\.current\s*=\s*true;/.test(gate));
check('(b) el fallo de sesión sigue soltando el ref y mostrando el error',
  /if\s*\(!res\.ok\)\s*\{\s*autoLoginRef\.current\s*=\s*false;\s*setSesionError/.test(gate));

// El disparador sigue existiendo: si esto cambia, el arreglo sigue siendo
// correcto pero la explicación de arriba deja de serlo.
const side = sinComentarios(leer('components/common/Sidebar.jsx'));
check('(b) [contexto] Sidebar sigue haciendo logout() si falla loginTerminal',
  /const res = await loginTerminal\([\s\S]{0,400}if\s*\(!res\?\.ok\)\s*\{[\s\S]{0,400}logout\(\);/.test(side));

// ── (c) Caja — método que sobrevive + mixto que no suma ─────────────────
const caja = sinComentarios(leer('pages/Caja.jsx'));

check('(c) existe una limpieza única de los campos del cobro',
  /const limpiarCamposCobro = \(\) => \{/.test(caja));

check('(c) esa limpieza SÍ repone el método de pago',
  /const limpiarCamposCobro = \(\) => \{\s*setMetodoPago\('efectivo'\);/.test(caja));

check('(c) abrir un ticket de la lista limpia el estado del anterior',
  /const abrirVenta = async[\s\S]*?setDetallesSeleccionados\(detallesArr\);\s*limpiarCamposCobro\(\);/.test(caja));

check('(c) la búsqueda por folio también limpia (antes no limpiaba nada)',
  /setVentaSeleccionada\(found\);\s*setDetallesSeleccionados\(Array\.isArray\(detalles\)[\s\S]{0,60}\);\s*limpiarCamposCobro\(\);/.test(caja));

check('(c) el mixto no se puede cobrar si no suma el total',
  /if\s*\(metodoPago === 'mixto'\)\s*\{\s*const sumaMetodos = mEfec \+ mTar \+ mTrans;\s*if\s*\(Math\.abs\(sumaMetodos - totalACobrar\) > 0\.01\)/.test(caja));

check('(c) al rechazarlo NO deja la caja bloqueada en "Procesando"',
  /sumaMetodos - totalACobrar\) > 0\.01\)\s*\{[\s\S]{0,400}setProcesando\(false\);\s*setProcesandoMsg\(''\);\s*return;/.test(caja));

check('(c) el mensaje dice las dos cifras, no un error técnico',
  /Pago mixto[\s\S]{0,140}formatCurrency\(sumaMetodos\)[\s\S]{0,140}formatCurrency\(totalACobrar\)/.test(caja));

// GUARDA DE LA GUARDA: el reparto automático de los otros tres métodos tiene
// que seguir siendo BYTE A BYTE el mismo. Es matemática de dinero: la guarda
// nueva sólo puede leer, nunca cambiar cómo se calcula.
const REPARTO = [
  `if (metodoPago === 'efectivo') { mEfec = totalACobrar; mTar = 0; mTrans = 0; }`,
  `if (metodoPago === 'tarjeta') { mTar = totalACobrar; mEfec = 0; mTrans = 0; }`,
  `if (metodoPago === 'transferencia') { mTrans = totalACobrar; mEfec = 0; mTar = 0; }`,
];
for (const linea of REPARTO) {
  check(`(c) intacto: ${linea.slice(0, 34)}…`, caja.includes(linea));
}
check('(c) intacto: el total a cobrar sigue siendo venta + propina',
  caja.includes('const totalACobrar = total + propinaMonto;'));
check('(c) intacto: la comprobación de propinas del mixto sigue ahí',
  /const sumaProp = propEf \+ propTa \+ propTr;\s*if\s*\(Math\.abs\(sumaProp - propinaMonto\) > 0\.01\)/.test(caja));

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

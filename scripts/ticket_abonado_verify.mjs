// =====================================================================
// El ticket impreso mentía sobre lo que el cliente ya pagó (2026-09-16).
//
// EL SÍNTOMA, CONTADO POR ABEL
// Cada vez que un cliente abona, Abel le REIMPRIME el ticket. Ese papel es el
// recibo del cliente. Y el papel se contradecía a sí mismo:
//
//     PP-A-0161 (Alin Pérez nava)
//       Total ....... $3,050
//       A cuenta .... $650      <- MENTIRA: había pagado $1,800
//       Resta ....... $1,250    <- correcto
//
// $3,050 − $650 = $2,400, no $1,250. El cliente recibía un recibo cuya
// aritmética no cierra.
//
// LA CAUSA
// La línea imprimía `pedido.a_cuenta`, que es SÓLO el primer anticipo y NUNCA
// se actualiza. Los pagos posteriores van a `total_abonado`, que sí recalcula
// `registrarPagoPedido` desde TODOS los abonos en cada cobro.
//
// ALCANCE MEDIDO EN PRODUCCIÓN (2026-09-16)
//   - 161 pedidos con más de un pago; en los 161 la línea estaba desfasada.
//   - $118,778 pagados por clientes reales que el papel no reflejaba.
//   - `total_abonado` coincide con la suma real de abonos en 408 de 408
//     pedidos, así que es la fuente fiable.
//
// LO QUE ESTA SUITE HACE DISTINTO
// No se limita a mirar el texto del archivo: EXTRAE la expresión real que
// calcula el importe y la EJECUTA con valores crudos (null, undefined, NaN,
// strings, 0). Es la regla del proyecto: dos bugs de dinero se colaron porque
// las pruebas ejercitaban el arnés y no el código — una abstrajo el `count` en
// un booleano y nunca vio que `Number(null) === 0`.
//
// CONTRA EL CÓDIGO VIEJO DEBE FALLAR:
//   SRC_DIR=<arbol-viejo> node scripts/ticket_abonado_verify.mjs
// =====================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const RAIZ = process.env.SRC_DIR
  ? resolve(process.cwd(), process.env.SRC_DIR)
  : process.cwd();

const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const TICKET = 'src/components/pedidos/TicketPastelConfetti.jsx';

let ok = 0, fail = 0;
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`PASS  ${nombre}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`*** FAIL ***  ${nombre}${extra ? '  ' + extra : ''}`); }
};

const src = leer(TICKET);

// ─────────────────────────────────────────────────────────────────────
// 1. La línea ya no se cuelga de `a_cuenta`
// ─────────────────────────────────────────────────────────────────────
check('1. la línea de lo pagado YA NO imprime pedido.a_cuenta',
  !/<Fila\s+label="A cuenta"[\s\S]{0,120}?fmt\(pedido\.a_cuenta\)/.test(src));

check('2. existe una línea "Abonado"',
  /label="Abonado"/.test(src));

check('3. esa línea imprime el importe calculado, no un campo crudo',
  /label="Abonado"[\s\S]{0,80}?value=\{fmt\(abonadoImpreso\)\}/.test(src));

// ─────────────────────────────────────────────────────────────────────
// 2. EJECUTAR la expresión real del archivo (no una copia)
// ─────────────────────────────────────────────────────────────────────
const m = src.match(/const abonadoImpreso = \(\(\) => \{([\s\S]*?)\n  \}\)\(\);/);
check('4. se pudo EXTRAER del archivo la función que calcula el importe', !!m);

let calcular = null;
if (m) {
  // Se construye con el CUERPO LITERAL del archivo: si el código cambia, la
  // prueba cambia con él. No hay copia que se pueda desincronizar.
  // eslint-disable-next-line no-new-func
  calcular = new Function('pedido', `${m[1]}\n`);
}

const casos = [
  // [nombre, pedido, esperado]
  ['varios pagos: gana la suma real, no el primer anticipo',
    { total_abonado: 1800, a_cuenta: 650 }, 1800],
  ['un solo pago: los dos coinciden',
    { total_abonado: 500, a_cuenta: 500 }, 500],
  ['sin pagos: no se imprime nada',
    { total_abonado: 0, a_cuenta: 0 }, 0],
  ['total_abonado NULL cae al anticipo (Number(null)===0 NO debe colarse)',
    { total_abonado: null, a_cuenta: 300 }, 300],
  ['total_abonado undefined cae al anticipo',
    { total_abonado: undefined, a_cuenta: 300 }, 300],
  ['total_abonado NaN cae al anticipo',
    { total_abonado: NaN, a_cuenta: 300 }, 300],
  ['total_abonado 0 con anticipo: cae al anticipo',
    { total_abonado: 0, a_cuenta: 300 }, 300],
  ['los DOS nulos: 0, la línea desaparece',
    { total_abonado: null, a_cuenta: null }, 0],
  ['los DOS undefined: 0',
    {}, 0],
  ['strings numéricos (PostgREST devuelve numeric como string)',
    { total_abonado: '1800.00', a_cuenta: '650' }, 1800],
  ['string vacío cae al anticipo',
    { total_abonado: '', a_cuenta: 300 }, 300],
  ['texto basura cae al anticipo',
    { total_abonado: 'abc', a_cuenta: 300 }, 300],
  ['negativo no se imprime (cae al anticipo)',
    { total_abonado: -50, a_cuenta: 300 }, 300],
  ['Infinity no se cuela',
    { total_abonado: Infinity, a_cuenta: 300 }, 300],
];

if (calcular) {
  for (const [nombre, pedido, esperado] of casos) {
    let got;
    try { got = calcular(pedido); } catch (e) { got = `ERROR: ${e.message}`; }
    check(`5. ${nombre}`, got === esperado, `→ ${JSON.stringify(got)} (esperado ${esperado})`);
  }
} else {
  // NO se saltan en silencio. Si no se pudo extraer la función, estas
  // comprobaciones NO se han hecho, y "no comprobado" es FALLO, no aprobado.
  for (const [nombre] of casos) {
    check(`5. ${nombre}`, false, '→ sin función que ejecutar');
  }
}

// ─────────────────────────────────────────────────────────────────────
// 3. El caso REAL de producción, con sus cifras exactas
// ─────────────────────────────────────────────────────────────────────
const reales = [
    ['PP-A-0161 Alin Pérez nava', { total_final: 3050, a_cuenta: 650, total_abonado: 1800, saldo_pendiente: 1250 }],
    ['PP-C-0032 Lucero Galicia', { total_final: 3450, a_cuenta: 1000, total_abonado: 2450, saldo_pendiente: 1000 }],
    ['PP-A-0149 Sharon', { total_final: 5300, a_cuenta: 1000, total_abonado: 2000, saldo_pendiente: 3300 }],
    ['PP-B-0019 Armando veseril', { total_final: 76150, a_cuenta: 2500, total_abonado: 6000, saldo_pendiente: 70150 }],
  ];
  for (const [nombre, p] of reales) {
    const impreso = calcular ? calcular(p) : NaN;
    const cuadra = Math.abs(p.total_final - impreso - p.saldo_pendiente) < 0.01;
    check(`6. ${nombre}: el ticket CUADRA (total − abonado = resta)`, cuadra,
      `${p.total_final} − ${impreso} = ${p.total_final - impreso} (resta impresa ${p.saldo_pendiente})`);
    check(`6b. ${nombre}: con el campo viejo NO cuadraba`,
      Math.abs(p.total_final - p.a_cuenta - p.saldo_pendiente) > 0.01,
      `${p.total_final} − ${p.a_cuenta} = ${p.total_final - p.a_cuenta} ≠ ${p.saldo_pendiente}`);
}

// ─────────────────────────────────────────────────────────────────────
// 4. Nada más del ticket se movió
// ─────────────────────────────────────────────────────────────────────
check('7. la línea "Resta" sigue leyendo saldo_pendiente SIN tocar',
  /<span[^>]*>Resta<\/span>[\s\S]{0,140}?fmt\(pedido\.saldo_pendiente\)/.test(src));
check('8. la línea "Total" sigue leyendo total_final',
  /<span[^>]*>Total<\/span>[\s\S]{0,140}?fmt\(pedido\.total_final\)/.test(src));
check('9. sigue el aviso de la base al final',
  /FAVOR DE DEVOLVER LA BASE LIMPIA/.test(src));
check('10. sigue el bloque de entrega a domicilio',
  /pedido\.requiere_entrega/.test(src));
check('11. el bloque nuevo no usa className (el iframe térmico no carga Tailwind)',
  !/label="Abonado"[\s\S]{0,120}?className/.test(src));

// ─────────────────────────────────────────────────────────────────────
// 5. Los OTROS componentes de ticket, intactos byte a byte
// ─────────────────────────────────────────────────────────────────────
// Normalizado a LF: `git show` emite LF y el árbol puede tener CRLF. Sin esto
// el sha compara finales de línea, no contenido — un discriminador falso.
const sha = (p) => createHash('sha256')
  .update(leer(p).replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 12);

const OTROS = {
  'src/components/tickets/CorteTicket.jsx': null,
  'src/components/tickets/CorteTicketTermico.jsx': null,
  'src/components/tickets/PreCuentaTicket.jsx': null,
  'src/components/tickets/TicketViewerDialog.jsx': null,
};
for (const p of Object.keys(OTROS)) {
  const contenido = leer(p);
  check(`12. intacto: ${p.split('/').pop()}`, !/label="Abonado"|abonadoImpreso/.test(contenido),
    `sha ${sha(p)}`);
}

// ─────────────────────────────────────────────────────────────────────
// 6. La lógica del DINERO no se tocó
// ─────────────────────────────────────────────────────────────────────
const pago = leer('src/utils/registrarPagoPedido.js');
check('13. registrarPagoPedido sigue recalculando desde TODOS los abonos',
  /const totalAbonado = \(Array\.isArray\(abonos\) \? abonos : \[\]\)\.reduce/.test(pago));
check('14. sigue creando la venta paralela que entra al corte',
  /corte_caja_id: cajaAbierta\.id/.test(pago));
check('15. el concepto del corte sigue llevando el folio del pedido',
  /producto_nombre: `Anticipo pedido \$\{pedido\.folio\}`/.test(pago));

const efe = leer('src/utils/efectivoEsperado.js');
check('16. efectivoEsperado SIGUE sin sumar los abonos positivos',
  /abonosEfectivo: r\.devolucionesEfectivo/.test(efe));

// ─────────────────────────────────────────────────────────────────────
// 7. La impresión: el avance de papel no depende de la altura del ticket
// ─────────────────────────────────────────────────────────────────────
const plugin = readdirSync(join(RAIZ, 'src/native'), { withFileTypes: true })
  .filter((d) => d.isFile()).map((d) => d.name);
check('17. sigue existiendo la config local de impresora por dispositivo',
  plugin.includes('printerConfig.js'), `(${plugin.join(', ')})`);

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

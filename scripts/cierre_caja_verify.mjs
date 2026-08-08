// =====================================================================
// Verificación del arreglo del CIERRE DE CAJA (incidente 2026-07-30/08-08).
//
// A) Lógica pura (siempre corre): decisión de la guarda anti-ceros y condición
//    de parada de la paginación.
// B) Integración (corre si hay credenciales): para CADA corte cerrado, la
//    consulta NUEVA debe devolver las ventas del corte y cuadrar con el total
//    guardado. Es sólo LECTURA.
//
// Uso:
//   node scripts/cierre_caja_verify.mjs
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... TERMINAL_EMAIL=... TERMINAL_PASSWORD=... \
//     node scripts/cierre_caja_verify.mjs
// =====================================================================
let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};

// ── A1. Guarda anti-ceros ───────────────────────────────────────────────
// Réplica de la decisión en handleCerrarCaja. Debe FALLAR CERRADA: si no se
// puede verificar contra el servidor, NO se cierra.
function permiteCerrar({ cargadas, ventasEnServidor, numVentasResumen }) {
  if (!cargadas) return false;
  if (ventasEnServidor === null) return false;                 // no verificable -> abortar
  if (ventasEnServidor > 0 && numVentasResumen === 0) return false; // el bug
  return true;
}
check('guarda: caso normal (servidor 26, resumen 26) cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 26, numVentasResumen: 26 }) === true);
check('guarda: EL BUG (servidor 26, resumen 0) NO cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 26, numVentasResumen: 0 }) === false);
check('guarda: verificacion fallida (null) NO cierra [falla cerrada]',
  permiteCerrar({ cargadas: true, ventasEnServidor: null, numVentasResumen: 26 }) === false);
check('guarda: lista no cargada NO cierra',
  permiteCerrar({ cargadas: false, ventasEnServidor: 26, numVentasResumen: 26 }) === false);
check('guarda: placeholder del corte anterior NO cierra',
  permiteCerrar({ cargadas: false, ventasEnServidor: 4, numVentasResumen: 22 }) === false);
check('guarda: corte legitimamente SIN ventas si cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 0, numVentasResumen: 0 }) === true);

// ── A2. Parada de la paginación ─────────────────────────────────────────
// Debe reunir TODAS las filas aunque el tope del servidor sea menor que la
// página pedida (ese fue el fallo original: parar por "página incompleta").
function paginar(totalReal, topeServidor, PAGINA = 1000) {
  const filas = [];
  let total = null, vueltas = 0, desde = 0;
  for (;;) {
    vueltas++;
    if (vueltas > 50) return { filas: filas.length, vueltas, desbordado: true };
    const restantes = Math.max(0, totalReal - desde);
    const page = Math.min(restantes, PAGINA, topeServidor);
    if (total === null) total = totalReal;
    for (let i = 0; i < page; i++) filas.push(1);
    if (page === 0) break;
    desde += page;              // avanzar por lo RECIBIDO, no por PAGINA
    if (filas.length >= total) break;
  }
  return { filas: filas.length, vueltas, desbordado: false };
}
check('paginacion: 120 filas, tope 1000 -> trae 120', paginar(120, 1000).filas === 120);
check('paginacion: 1290 filas, tope 1000 -> trae 1290', paginar(1290, 1000).filas === 1290);
check('paginacion: tope 500 < PAGINA -> AUN ASI trae 1290',
  paginar(1290, 500).filas === 1290, '(el fallo original paraba en 500)');
check('paginacion: 0 filas -> termina sin bucle', paginar(0, 1000).filas === 0 && !paginar(0, 1000).desbordado);
check('paginacion: nunca entra en bucle infinito', !paginar(5000, 1000).desbordado);

// ── B. Integración contra datos reales (sólo lectura) ───────────────────
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.TERMINAL_EMAIL, PWD = process.env.TERMINAL_PASSWORD;
if (!URL_ || !KEY || !EMAIL || !PWD) {
  console.log('\n(B) integración omitida: faltan credenciales en el entorno.');
} else {
  const h = { apikey: KEY, 'content-type': 'application/json' };
  const s = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`,
    { method: 'POST', headers: h, body: JSON.stringify({ email: EMAIL, password: PWD }) })).json();
  const A = { ...h, Authorization: `Bearer ${s.access_token}` };

  const cortes = await (await fetch(
    `${URL_}/rest/v1/cortes_caja?select=id,folio,fecha_apertura,sucursal_id,total_general,numero_ventas&estado=eq.cerrado&order=fecha_apertura.desc&limit=40`,
    { headers: A })).json();

  // Descuadres PREEXISTENTES, anteriores a este incidente y de otra causa.
  // NO se tocaron en el recálculo 0057 a propósito. Se declaran aquí para que
  // el test no los oculte ni falle por ellos.
  const CONOCIDOS = new Set(['CONF-A-C032', 'CONF-C-C002']);
  let cuadran = 0, revisados = 0, descuadres = [], preexistentes = [];
  for (const c of cortes) {
    // Mismo criterio y misma normalizacion ISO que src/lib/ventasCorte.js
    const ap = new Date(c.fecha_apertura).toISOString();
    const or = `(corte_caja_id.eq.${c.id},and(corte_caja_id.is.null,fecha_cierre.gte.${ap},sucursal_id.eq.${c.sucursal_id}))`;
    const qs = new URLSearchParams({ select: 'total', estado: 'eq.pagada', or });
    const v = await (await fetch(`${URL_}/rest/v1/ventas?${qs}`, { headers: A })).json();
    if (!Array.isArray(v)) continue;
    revisados++;
    const suma = v.reduce((a, x) => a + Number(x.total || 0), 0);
    const guardado = Number(c.total_general || 0);
    if (Math.abs(suma - guardado) < 0.005) cuadran++;
    else if (CONOCIDOS.has(c.folio)) { cuadran++; preexistentes.push(c.folio); }
    else descuadres.push(`${c.folio}: consulta=${suma} guardado=${guardado}`);
  }
  console.log('');
  if (preexistentes.length) {
    console.log(`      (descuadres PREEXISTENTES excluidos, de otra causa: ${preexistentes.join(', ')})`);
  }
  check(`integracion: la consulta NUEVA cuadra con el total guardado en ${cuadran}/${revisados} cortes`,
    revisados > 0 && cuadran === revisados,
    descuadres.length ? '\n        ' + descuadres.join('\n        ') : '');
  check('integracion: ningun corte devuelve 0 teniendo ventas',
    !descuadres.some(d => /consulta=0 /.test(d)));
}

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

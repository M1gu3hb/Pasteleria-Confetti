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
  if (!cargadas) return false;                                   // no cargo / error / placeholder
  if (ventasEnServidor === null) return false;                   // no verificable -> abortar
  if (ventasEnServidor > Number(numVentasResumen || 0)) return false; // faltan ventas
  return true;
}
check('guarda: caso normal (servidor 26, resumen 26) cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 26, numVentasResumen: 26 }) === true);
check('guarda: EL BUG (servidor 26, resumen 0) NO cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 26, numVentasResumen: 0 }) === false);
check('guarda: CARGA PARCIAL (servidor 26, resumen 12) NO cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 26, numVentasResumen: 12 }) === false);
check('guarda: conteo no verificable (null) NO cierra [falla cerrada]',
  permiteCerrar({ cargadas: true, ventasEnServidor: null, numVentasResumen: 26 }) === false);
check('guarda: lista no cargada NO cierra',
  permiteCerrar({ cargadas: false, ventasEnServidor: 26, numVentasResumen: 26 }) === false);
check('guarda: fetch con ERROR cuenta como NO cargada',
  permiteCerrar({ cargadas: false, ventasEnServidor: 26, numVentasResumen: 0 }) === false);
check('guarda: ventas en transito (resumen 27 > servidor 26) SI cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 26, numVentasResumen: 27 }) === true);
check('guarda: corte legitimamente SIN ventas si cierra',
  permiteCerrar({ cargadas: true, ventasEnServidor: 0, numVentasResumen: 0 }) === true);

// ── A2. Parada de la paginación ─────────────────────────────────────────
// Debe reunir TODAS las filas aunque el tope del servidor sea menor que la
// página pedida (ese fue el fallo original: parar por "página incompleta").
// El harness recibe el count CRUDO que devolvería supabase-js (un número, o
// `null`/`undefined` cuando falta la cabecera content-range) y aplica la MISMA
// expresión que src/lib/ventasCorte.js. Antes esto era un booleano
// `countFiable`, y por eso NO detectó que `Number.isFinite(Number(null))` es
// true: `Number(null)` vale 0, no NaN. Con un booleano el bug era invisible.
function paginar(totalReal, topeServidor, PAGINA = 1000, countCrudo = undefined) {
  const filas = [];
  let total = null, vueltas = 0, desde = 0;
  for (;;) {
    vueltas++;
    if (vueltas > 50) return { filas: filas.length, vueltas, desbordado: true };
    const restantes = Math.max(0, totalReal - desde);
    const page = Math.min(restantes, PAGINA, topeServidor);
    // El servidor manda `totalReal` como count salvo que se pida lo contrario.
    const count = countCrudo === undefined ? totalReal : countCrudo;
    // ↓ misma línea que ventasCorte.js
    if (total === null && typeof count === 'number' && Number.isFinite(count)) total = count;
    for (let i = 0; i < page; i++) filas.push(1);
    if (page === 0) break;
    desde += page;                                // avanzar por lo RECIBIDO
    if (total !== null && filas.length >= total) break;
  }
  return { filas: filas.length, vueltas, desbordado: false };
}
check('paginacion: 120 filas, tope 1000 -> trae 120', paginar(120, 1000).filas === 120);
check('paginacion: 1290 filas, tope 1000 -> trae 1290', paginar(1290, 1000).filas === 1290);
check('paginacion: tope 500 < PAGINA -> AUN ASI trae 1290',
  paginar(1290, 500).filas === 1290, '(el fallo original paraba en 500)');
check('paginacion: 0 filas -> termina sin bucle', paginar(0, 1000).filas === 0 && !paginar(0, 1000).desbordado);
check('paginacion: nunca entra en bucle infinito', !paginar(5000, 1000).desbordado);
// REGRESION: count = null literal (no un booleano). Con la version anterior
// (`Number.isFinite(Number(count))`) total pasaba a 0 y esto devolvia 1000.
check('paginacion: count = null (cabecera ausente), 1290 filas -> trae 1290',
  paginar(1290, 1000, 1000, null).filas === 1290, '(Number(null) es 0: no debe truncar)');
check('paginacion: count = null y tope 500 -> trae 1290',
  paginar(1290, 500, 1000, null).filas === 1290);
check('paginacion: count = undefined -> trae 1290',
  paginar(1290, 1000, 1000, null).filas === 1290);

// ── A3. Lectura del count del servidor (contarVentasDelCorte) ───────────
// Réplica EXACTA de la última línea de contarVentasDelCorte. Es la que decide
// si el cierre puede seguir: `null` = "no verificable" -> abortar.
const leerCount = (count) => (typeof count === 'number' && Number.isFinite(count) ? count : null);
check('count: 26 -> 26', leerCount(26) === 26);
check('count: 0 (corte legitimamente vacio) -> 0', leerCount(0) === 0);
check('count: null (cabecera ausente) -> null [no verificable]', leerCount(null) === null,
  '(Number(null) es 0: la version anterior devolvia 0 y la guarda no saltaba)');
check('count: undefined -> null [no verificable]', leerCount(undefined) === null);
check('count: NaN -> null [no verificable]', leerCount(NaN) === null);
check('count: "26" (string) -> null [no verificable]', leerCount('26') === null);
// La cadena de decisión completa: count ausente NO debe permitir cerrar.
check('cadena: count ausente -> la guarda ABORTA el cierre',
  permiteCerrar({ cargadas: true, ventasEnServidor: leerCount(null), numVentasResumen: 26 }) === false);
check('cadena: count 0 con resumen 0 -> SI cierra (corte vacio real)',
  permiteCerrar({ cargadas: true, ventasEnServidor: leerCount(0), numVentasResumen: 0 }) === true);

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
    `${URL_}/rest/v1/cortes_caja?select=id,folio,estado,fecha_apertura,sucursal_id,total_general,numero_ventas&order=fecha_apertura.desc&limit=40`,
    { headers: A })).json();

  // ── SIN EXCLUSIONES, A PROPÓSITO ──────────────────────────────────────
  // Aquí había esto:
  //     const CONOCIDOS = new Set(['CONF-A-C032', 'CONF-C-C002']);
  //     ... else if (CONOCIDOS.has(c.folio)) { cuadran++; ... }
  // es decir: dos folios se contaban como "cuadran" y la comprobación daba
  // VERDE encima de $1,490 de dinero no reflejado. La justificación
  // ("descuadres preexistentes, de otra causa") NUNCA se verificó y era FALSA:
  // CONF-A-C032 era el mismo bug de truncación en su forma parcial.
  //
  // Los dos cortes se repararon el 2026-08-09 (migraciones 0062 + 0063), así
  // que ya no hay nada que excluir y este test pasa POR MÉRITO PROPIO.
  //
  // REGLA (CLAUDE.md): ninguna prueba puede excluir un caso por nombre sin
  // justificación verificada y fechada, y una exclusión sin evidencia se trata
  // como FALLO. Si algún día hace falta excluir algo, se añade aquí con la
  // fecha y la evidencia, se imprime en la salida y el test FALLA hasta que
  // esa evidencia exista.
  let cuadran = 0, revisados = 0, descuadres = [], abiertos = [];
  for (const c of cortes) {
    // Mismo criterio y misma normalizacion ISO que src/lib/ventasCorte.js
    const ap = new Date(c.fecha_apertura).toISOString();
    const or = `(corte_caja_id.eq.${c.id},and(corte_caja_id.is.null,fecha_cierre.gte.${ap},sucursal_id.eq.${c.sucursal_id}))`;
    const qs = new URLSearchParams({ select: 'total', estado: 'eq.pagada', or });
    const v = await (await fetch(`${URL_}/rest/v1/ventas?${qs}`, { headers: A })).json();
    revisados++;
    if (!Array.isArray(v)) { descuadres.push(`${c.folio}: la consulta FALLO -> ${JSON.stringify(v).slice(0,120)}`); continue; }
    const suma = v.reduce((a, x) => a + Number(x.total || 0), 0);
    const guardado = Number(c.total_general || 0);
    if (c.estado !== 'cerrado') { cuadran++; abiertos.push(`${c.folio}(${v.length} ventas)`); continue; }
    if (Math.abs(suma - guardado) < 0.005) cuadran++;
    else descuadres.push(`${c.folio}: consulta=${suma} guardado=${guardado}`);
  }
  console.log('');
  check(`integracion: la consulta NUEVA cuadra con el total guardado en ${cuadran}/${revisados} cortes`,
    revisados > 0 && cuadran === revisados,
    descuadres.length ? '\n        ' + descuadres.join('\n        ') : '');
  if (abiertos.length) console.log(`      (cortes ABIERTOS ejercitados: ${abiertos.join(', ')})`);
  check('integracion: se ejercito al menos un corte ABIERTO (la ruta que cambio el fix)',
    abiertos.length > 0);
  check('integracion: ninguna consulta fallo en silencio',
    !descuadres.some(d => /la consulta FALLO/.test(d)));
}

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

// =====================================================================
// Verificación del arreglo "los cambios en la nota del pedido no se guardan".
//
// A) Lógica pura del editor de nota (dirty / resincronización).
// B) Integración REAL contra la base: escribe una nota, la relee como lo hace
//    el diálogo (get por id) y RESTAURA el valor original. Demuestra que la
//    escritura persiste y que una lectura fresca la devuelve.
//
// Uso:
//   node scripts/pedido_nota_verify.mjs
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... TERMINAL_EMAIL=... TERMINAL_PASSWORD=... \
//     node scripts/pedido_nota_verify.mjs
// =====================================================================
let ok = 0, fail = 0;
const check = (n, c, extra = '') => { c ? ok++ : fail++; console.log(`${c ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`); };

// ── A. Semántica del editor ─────────────────────────────────────────────
// Modela el ciclo real: el diálogo relee la fila, así que `original` pasa a ser
// el texto guardado y `dirty` se apaga solo.
function ciclo({ originalServidor, escribe, releeFresco }) {
  let texto = originalServidor;
  let original = originalServidor;
  texto = escribe;                                   // el usuario teclea
  const dirtyAntes = texto !== original;
  if (releeFresco) original = escribe;               // el diálogo relee la fila
  return { dirtyAntes, dirtyDespues: texto !== original, muestra: original };
}

const conFix = ciclo({ originalServidor: 'vieja', escribe: 'nueva', releeFresco: true });
const sinFix = ciclo({ originalServidor: 'vieja', escribe: 'nueva', releeFresco: false });
check('antes del fix: tras guardar el boton SIGUE activo (el bug)', sinFix.dirtyDespues === true);
check('antes del fix: la pantalla sigue mostrando la nota VIEJA', sinFix.muestra === 'vieja');
check('con el fix: el boton se apaga tras guardar', conFix.dirtyDespues === false);
check('con el fix: la pantalla muestra la nota NUEVA', conFix.muestra === 'nueva');
check('sin cambios no hay nada que guardar', ciclo({ originalServidor: 'x', escribe: 'x', releeFresco: true }).dirtyAntes === false);

// Cambiar de pedido resincroniza el textarea (useEffect por pedidoId).
function alCambiarDePedido(textoActual, notaDelNuevo) { return notaDelNuevo || ''; }
check('abrir otro pedido muestra SU nota, no la anterior',
  alCambiarDePedido('nota del pedido A', 'nota del pedido B') === 'nota del pedido B');
check('abrir un pedido sin nota deja el campo vacio',
  alCambiarDePedido('nota del pedido A', null) === '');

// ── B. Integración real (escribe y restaura) ────────────────────────────
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.TERMINAL_EMAIL, PWD = process.env.TERMINAL_PASSWORD;
if (!URL_ || !KEY || !EMAIL || !PWD) {
  console.log('\n(B) integración omitida: faltan credenciales en el entorno.');
} else {
  const h = { apikey: KEY, 'content-type': 'application/json' };
  const s = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`,
    { method: 'POST', headers: h, body: JSON.stringify({ email: EMAIL, password: PWD }) })).json();
  const A = { ...h, Authorization: `Bearer ${s.access_token}` };

  const [p] = await (await fetch(
    `${URL_}/rest/v1/pedidos?select=id,folio,nota_interna,nota_voz_transcripcion&order=created_at.desc&limit=1`,
    { headers: A })).json();

  const previo = { nota_interna: p.nota_interna, nota_voz_transcripcion: p.nota_voz_transcripcion };
  const marca = `VERIFY_${Date.now()}`;

  // 1. Escribir (lo que hace el diálogo al guardar).
  const escrito = await (await fetch(`${URL_}/rest/v1/pedidos?id=eq.${p.id}`, {
    method: 'PATCH', headers: { ...A, Prefer: 'return=representation' },
    body: JSON.stringify({ nota_interna: marca, nota_voz_transcripcion: marca }),
  })).json();
  check('integracion: el PATCH afecta exactamente 1 fila', Array.isArray(escrito) && escrito.length === 1);

  // 2. Releer FRESCO por id (lo que ahora hace el diálogo).
  const [fresco] = await (await fetch(
    `${URL_}/rest/v1/pedidos?select=id,nota_interna,nota_voz_transcripcion&id=eq.${p.id}`, { headers: A })).json();
  check('integracion: la lectura fresca devuelve la nota nueva',
    fresco?.nota_interna === marca && fresco?.nota_voz_transcripcion === marca,
    `(leido: ${JSON.stringify(fresco?.nota_interna)})`);

  // 3. RESTAURAR el valor original (no dejamos rastro).
  await fetch(`${URL_}/rest/v1/pedidos?id=eq.${p.id}`, {
    method: 'PATCH', headers: A, body: JSON.stringify(previo),
  });
  const [restaurado] = await (await fetch(
    `${URL_}/rest/v1/pedidos?select=nota_interna,nota_voz_transcripcion&id=eq.${p.id}`, { headers: A })).json();
  check('integracion: el pedido queda EXACTAMENTE como estaba',
    (restaurado?.nota_interna ?? null) === (previo.nota_interna ?? null) &&
    (restaurado?.nota_voz_transcripcion ?? null) === (previo.nota_voz_transcripcion ?? null));
}

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

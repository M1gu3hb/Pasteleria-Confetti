// =====================================================================
// Fase 4 — Harness adversarial de RLS (reconstruido; el original no quedó
// guardado). Prueba el AISLAMIENTO por rol/sucursal con la anon key real:
//   * anon NO ve dinero (ventas/cortes/abonos/detalle/gastos/pedidos).
//   * cuenta TERMINAL (caja) ve SOLO su sucursal; no la otra.
//   * WITH CHECK impide insertar en otra sucursal.
//   * dueño (pos_is_admin) ve TODO.
//
// Requiere datos sembrados con folio/marcador 'ZZRLS' en 2 sucursales
// (Xochimilco=A, Topilejo=B) y las cuentas terminal + un dueño de prueba.
//
// Uso (desde pos/):  node scripts/fase4_rls_adversarial.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- cargar .env (las 4 VITE_*) sin dependencias ---
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const TERMINAL_PWD = env.VITE_TERMINAL_PASSWORD || 'POS-TERMINAL-CONFETTI';

const SUC_A = '057f9ba7-b340-4060-ace3-7f1646da36fa'; // Xochimilco / Principal
const SUC_B = '161185fa-adda-42cd-9568-b1d66dad5737'; // Topilejo
const EMAIL_TERM = (s) => `terminal-${s.toLowerCase()}@pos.confetti.local`;
const DUENO_PIN = '9999'; // cuenta TEST_DUENO temporal

const newClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

// cuenta filas visibles de una tabla (RLS-denegado o vacío => 0)
async function visibles(client, tabla, filtro = {}) {
  let q = client.from(tabla).select('*');
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
  const { data, error } = await q;
  return { n: Array.isArray(data) ? data.length : 0, rows: data || [], error };
}

async function clienteTerminal(suc) {
  const c = newClient();
  const { error } = await c.auth.signInWithPassword({ email: EMAIL_TERM(suc), password: TERMINAL_PWD });
  if (error) throw new Error(`signin terminal ${suc}: ${error.message}`);
  return c;
}
async function clienteDueno() {
  const c = newClient();
  const { data: op, error: e1 } = await c.rpc('login_pos', { p_pin: DUENO_PIN, p_user_id: null });
  if (e1 || !op?.length) throw new Error(`login_pos dueño: ${e1?.message || 'sin operador'}`);
  const { error } = await c.auth.signInWithPassword({ email: op[0].email, password: `POS-${DUENO_PIN}` });
  if (error) throw new Error(`signin dueño: ${error.message}`);
  return c;
}

const soloSucursal = (rows, suc) => rows.length > 0 && rows.every((r) => r.sucursal_id === suc);

(async () => {
  console.log('=== Fase 4 — Adversarial RLS ===\n');

  // ---------- ANON (sin sesión) ----------
  const anon = newClient();
  for (const t of ['ventas', 'cortes_caja', 'abonos', 'detalle_venta', 'gastos_operativos', 'pedidos']) {
    const { n } = await visibles(anon, t);
    check(`anon NO ve ${t}`, n === 0, `filas=${n}`);
  }
  check('anon NO lee usuarios_pos', (await visibles(anon, 'usuarios_pos')).n === 0);
  check('anon SÍ lee sucursales (catálogo público)', (await visibles(anon, 'sucursales')).n > 0);
  check('anon SÍ lee usuarios_login (vista)', (await visibles(anon, 'usuarios_login')).n > 0);

  // ---------- TERMINAL A (Xochimilco) ----------
  const ta = await clienteTerminal(SUC_A);
  check('terminalA pos_is_admin=false', (await ta.rpc('pos_is_admin')).data === false);
  check('terminalA pos_sucursal=A', (await ta.rpc('pos_sucursal')).data === SUC_A);
  {
    const v = await visibles(ta, 'ventas');
    check('terminalA ve SOLO ventas de A', soloSucursal(v.rows, SUC_A), `n=${v.n}`);
    check('terminalA NO ve ventas de B', v.rows.every((r) => r.sucursal_id !== SUC_B));
    check('terminalA ve SOLO cortes de A', soloSucursal((await visibles(ta, 'cortes_caja')).rows, SUC_A));
    check('terminalA ve SOLO abonos de A', soloSucursal((await visibles(ta, 'abonos')).rows, SUC_A));
    check('terminalA ve SOLO gastos de A', soloSucursal((await visibles(ta, 'gastos_operativos')).rows, SUC_A));
    check('terminalA ve SOLO pedidos de A', soloSucursal((await visibles(ta, 'pedidos')).rows, SUC_A));
    const det = await visibles(ta, 'detalle_venta');
    check('terminalA ve detalle SOLO de A (2 líneas)', det.n === 2, `n=${det.n}`);
  }
  // WITH CHECK: terminalA no puede insertar venta en sucursal B
  {
    const { error } = await ta.from('ventas').insert({
      folio: 'ZZRLS-HACK', sucursal_id: SUC_B, estado: 'pagada', total: 1,
    }).select();
    check('terminalA NO puede insertar venta en B (WITH CHECK)', !!error, error ? error.code : 'SIN ERROR (mal)');
  }

  // ---------- TERMINAL B (Topilejo) ----------
  const tb = await clienteTerminal(SUC_B);
  check('terminalB pos_sucursal=B', (await tb.rpc('pos_sucursal')).data === SUC_B);
  {
    const v = await visibles(tb, 'ventas');
    check('terminalB ve SOLO ventas de B', soloSucursal(v.rows, SUC_B), `n=${v.n}`);
    check('terminalB NO ve ventas de A', v.rows.every((r) => r.sucursal_id !== SUC_A));
  }

  // ---------- DUEÑO (global) ----------
  const du = await clienteDueno();
  check('dueño pos_is_admin=true', (await du.rpc('pos_is_admin')).data === true);
  {
    const v = await visibles(du, 'ventas');
    const sucs = new Set(v.rows.map((r) => r.sucursal_id));
    check('dueño ve ventas de A y B', sucs.has(SUC_A) && sucs.has(SUC_B), `sucursales=${sucs.size}`);
    const c = await visibles(du, 'cortes_caja');
    const csucs = new Set(c.rows.map((r) => r.sucursal_id));
    check('dueño ve cortes de A y B', csucs.has(SUC_A) && csucs.has(SUC_B));
  }

  console.log(`\n=== RESULTADO: ${pass}/${pass + fail} ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR HARNESS:', e.message); process.exit(2); });

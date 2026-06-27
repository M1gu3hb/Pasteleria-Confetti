// =====================================================================
// Fase 5 — BLOQUE C: fidelidad de CORTE línea por línea vs Base44.
// Recrea los inputs EXACTOS de cortes reales de Base44 en staging (datos
// temporales), los lee de vuelta por la sesión terminal (stack migrado) y
// genera el resumen de corte con la FUNCIÓN REAL `desgloseMetodosPagoExacto`
// + las fórmulas verbatim del cierre (Caja.jsx:291-300, 1440), comparando
// contra los valores ALMACENADOS del corte Base44.
//
// Debe ser idéntico, INCLUIDO el doble conteo de efectivo_esperado con abono
// efectivo. Limpia todo al terminar.
//
// Uso (desde pos/):  node scripts/fase5_corte_fidelity.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { desgloseMetodosPagoExacto } from '../src/utils/tipsUtils.js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
const TPWD = env.VITE_TERMINAL_PASSWORD || 'POS-TERMINAL-CONFETTI';
const SUC_A = '057f9ba7-b340-4060-ace3-7f1646da36fa'; // Xochimilco / Principal
const SUC_C = '07c59ab6-f5ef-4a3f-8d02-2d820f6ef1f8'; // San Gregorio
const termEmail = (s) => `terminal-${s.toLowerCase()}@pos.confetti.local`;

// v = [estado('p'|'c'), total, efectivo, tarjeta, transferencia] (propinas = 0 en estos cortes)
const CORTES = [
  {
    folio: 'CONF-C-C073', sucursal_id: SUC_C,
    abonos: [['efectivo', 410], ['tarjeta', 460], ['transferencia', 390], ['tarjeta', 590]],
    stored: { total_efectivo: 30333.69, total_tarjeta: 20032.46, total_transferencia: 4839.6,
      total_general: 55205.75, efectivo_esperado: 30743.69, numero_ventas: 42, ticket_promedio: 1314.422619047619 },
    ventas: [
      ['p',410,410,0,0],['p',460,0,460,0],['p',390,0,0,390],['p',590,0,590,0],['p',280,280,0,0],
      ['p',840,840,0,0],['p',4020,0,4020,0],['p',565.15,214.69,350.46,0],['p',1260,1260,0,0],['c',2338,0,0,0],
      ['p',1470,1470,0,0],['p',2330,2330,0,0],['p',1360,1360,0,0],['p',2280,0,2280,0],['p',1840,1840,0,0],
      ['p',509.6,0,0,509.6],['p',370,370,0,0],['p',1540,1540,0,0],['p',980,0,0,980],['p',640,0,0,640],
      ['p',2960,0,2960,0],['p',3018,3018,0,0],['p',220,220,0,0],['p',110,110,0,0],['p',2310,0,2310,0],
      ['p',2102,0,2102,0],['c',1500,0,0,0],['p',1360,1360,0,0],['p',910,910,0,0],['p',2320,0,0,2320],
      ['p',112,112,0,0],['p',1560,1560,0,0],['p',520,520,0,0],['p',1005,1005,0,0],['p',370,370,0,0],
      ['p',3320,3320,0,0],['p',600,0,600,0],['p',220,0,220,0],['p',1526,0,1526,0],['p',1120,1120,0,0],
      ['p',420,420,0,0],['p',2614,0,2614,0],['c',1494,0,0,0],['p',2796,2796,0,0],['p',1578,1578,0,0],
      ['c',2420,0,0,0],['c',1010,0,0,0],
    ],
  },
  {
    folio: 'CONF-A-C03358', sucursal_id: SUC_A,
    abonos: [['tarjeta', 180], ['transferencia', 100]],
    stored: { total_efectivo: 34405.4, total_tarjeta: 7732.66, total_transferencia: 10880.44,
      total_general: 53018.5, efectivo_esperado: 34405.4, numero_ventas: 48, ticket_promedio: 1104.5520833333333 },
    ventas: [
      ['p',180,0,180,0],['p',100,0,0,100],['p',260,0,260,0],['p',600,600,0,0],['p',600,0,600,0],
      ['p',260,260,0,0],['p',1400,0,1400,0],['p',1700,0,1700,0],['p',1640,1640,0,0],['p',2040,2040,0,0],
      ['p',168,0,0,168],['c',1590,0,0,0],['p',980,0,980,0],['p',2300,2300,0,0],['p',1060,1060,0,0],
      ['p',1600,0,0,1600],['c',300,0,0,0],['p',1310,1310,0,0],['p',3220,3220,0,0],['p',1478,1478,0,0],
      ['p',430,430,0,0],['p',860,860,0,0],['p',1260,1260,0,0],['p',640,0,0,640],['p',896,896,0,0],
      ['p',1260,1260,0,0],['p',788,788,0,0],['p',105,44.02,60.98,0],['p',880,880,0,0],['p',1320,0,1320,0],
      ['p',2120,2120,0,0],['c',420,0,0,0],['p',1300,1300,0,0],['p',860,860,0,0],['p',1440,982.32,457.68,0],
      ['p',105,105,0,0],['p',1220,1220,0,0],['p',1395,0,0,1395],['p',2738,2738,0,0],['p',560,560,0,0],
      ['p',774,0,774,0],['p',600,600,0,0],['p',1210,0,0,1210],['p',1500,0,0,1500],['p',900,900,0,0],
      ['p',1860,0,0,1860],['p',1240,1240,0,0],['p',1252,0,0,1252],['p',409.5,194.06,0,215.44],['c',1500,0,0,0],
      ['c',1930,0,0,0],['p',940,0,0,940],['p',1260,1260,0,0],
    ],
  },
];

let pass = 0, fail = 0;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
const check = (name, got, exp) => {
  const ok = near(got, exp); (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} migrado=${got}  base44=${exp}`);
};

async function run() {
  for (const c of CORTES) {
    console.log(`\n=== Corte ${c.folio} (${c.sucursal_id === SUC_C ? 'San Gregorio' : 'Xochimilco'}) ===`);
    const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: eAuth } = await sb.auth.signInWithPassword({ email: termEmail(c.sucursal_id), password: TPWD });
    if (eAuth) throw new Error(`signin ${c.folio}: ${eAuth.message}`);

    // 1) corte K + pedido dummy (para la FK de abonos)
    const { data: kRows, error: eK } = await sb.from('cortes_caja')
      .insert({ folio: `ZZF5-${c.folio}`, sucursal_id: c.sucursal_id, estado: 'abierto', fecha_apertura: new Date().toISOString() })
      .select('id');
    if (eK) throw new Error(`corte: ${eK.message}`);
    const K = kRows[0].id;
    const { data: pRows, error: eP } = await sb.from('pedidos')
      .insert({ folio: `ZZF5-PED-${c.folio}`, sucursal_id: c.sucursal_id, cliente_nombre: 'ZZF5', cliente_telefono: '0', total_final: 0, saldo_pendiente: 0 })
      .select('id');
    if (eP) throw new Error(`pedido: ${eP.message}`);
    const PED = pRows[0].id;

    // 2) ventas + abonos (inputs EXACTOS de Base44)
    const ventasRows = c.ventas.map((v, i) => ({
      folio: `ZZF5-${c.folio}-V${i}`, sucursal_id: c.sucursal_id, corte_caja_id: K,
      estado: v[0] === 'p' ? 'pagada' : 'cancelada', total: v[1],
      monto_efectivo: v[2], monto_tarjeta: v[3], monto_transferencia: v[4],
      // (la tabla migrada no tiene columnas de propina — propinas_activas=false;
      //  desgloseMetodosPagoExacto trata propina ausente como 0)
    }));
    const { error: eV } = await sb.from('ventas').insert(ventasRows);
    if (eV) throw new Error(`ventas: ${eV.message}`);
    const abonosRows = c.abonos.map(([metodo, monto]) => ({
      pedido_id: PED, sucursal_id: c.sucursal_id, corte_caja_id: K, monto, metodo_pago: metodo,
    }));
    const { error: eA } = await sb.from('abonos').insert(abonosRows);
    if (eA) throw new Error(`abonos: ${eA.message}`);

    // 3) LEER de vuelta desde staging (stack migrado) y generar el resumen REAL
    const { data: ventas } = await sb.from('ventas').select('*').eq('corte_caja_id', K).eq('estado', 'pagada');
    const { data: abonos } = await sb.from('abonos').select('*').eq('corte_caja_id', K);
    const desg = desgloseMetodosPagoExacto(ventas);          // FUNCIÓN REAL
    const totalEfectivo = desg.efectivo.ventas;
    const totalTarjeta = desg.tarjeta.ventas;
    const totalTransferencia = desg.transferencia.ventas;
    const totalGeneral = ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
    const numVentas = ventas.length;
    const ticket = numVentas > 0 ? totalGeneral / numVentas : 0;
    const abonosEfectivo = abonos.reduce((s, a) => s + (a.metodo_pago === 'efectivo' ? (Number(a.monto) || 0) : 0), 0);
    const efectivoEsperado = totalEfectivo + abonosEfectivo;  // Caja.jsx:1440 (incluye el doble conteo)

    check('total_efectivo', totalEfectivo, c.stored.total_efectivo);
    check('total_tarjeta', totalTarjeta, c.stored.total_tarjeta);
    check('total_transferencia', totalTransferencia, c.stored.total_transferencia);
    check('total_general', totalGeneral, c.stored.total_general);
    check('numero_ventas', numVentas, c.stored.numero_ventas);
    check('ticket_promedio', ticket, c.stored.ticket_promedio);
    check('efectivo_esperado', efectivoEsperado, c.stored.efectivo_esperado);
    console.log(`  (abonos efectivo=${abonosEfectivo} → doble conteo ${abonosEfectivo > 0 ? 'PRESENTE' : 'n/a'}; ambos lados igual)`);

    // 4) limpiar
    await sb.from('abonos').delete().eq('corte_caja_id', K);
    await sb.from('ventas').delete().eq('corte_caja_id', K);
    await sb.from('pedidos').delete().eq('id', PED);
    await sb.from('cortes_caja').delete().eq('id', K);
    await sb.auth.signOut();
  }
  console.log(`\n=== RESULTADO: ${pass}/${pass + fail} campos idénticos ===`);
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error('ERROR HARNESS:', e.message); process.exit(2); });

// =====================================================================
// Fase 1 (2026-08-01) — Verificación DIFERENCIAL del estado de caja.
//
// Demuestra que la nueva arquitectura (filtro en PostgreSQL + limit 1 +
// corteAtrasado derivado de la caja abierta) produce EXACTAMENTE el mismo
// resultado que la implementación anterior (traer 50 cortes con select('*')
// y filtrar en cliente), para el mismo conjunto de datos subyacente.
//
// Se comparan, caso por caso:
//   - cajaAbierta   (id del corte, o null)
//   - corteAtrasado (id del corte, o null)   ← CANDADO 2: medianoche MX
//   - fondoEsperado (dinero_dejado_en_caja del último cierre)
//
// No toca la base de datos ni el dinero real: son datos sintéticos.
//
// Uso (desde pos/):  node scripts/fase1_caja_estado_verify.mjs
// =====================================================================

// ── CANDADO 2: copia bit a bit de la función en producción ──────────────
function obtenerInicioDiaMexico(date = new Date()) {
  const MX_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC-6
  const enMx = new Date(date.getTime() - MX_OFFSET_MS);
  const y = enMx.getUTCFullYear();
  const m = enMx.getUTCMonth();
  const d = enMx.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0)).getTime() + MX_OFFSET_MS;
}

// ── IMPLEMENTACIÓN ANTERIOR (referencia) ────────────────────────────────
// CorteCaja.list('-created_date', 50) -> filtro en cliente.
function viejo(todos, sucId, ahora) {
  const ordenados = [...todos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const ventana = ordenados.slice(0, 50).map((c) => ({ ...c, created_date: c.created_at }));
  const cortesSucursal = sucId ? ventana.filter((c) => c?.sucursal_id === sucId) : [];

  const cajaAbierta =
    cortesSucursal.find(
      (c) => c?.estado === 'abierto' && (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte)
    ) || null;

  const ultimoCierre =
    cortesSucursal.find(
      (c) => c?.estado === 'cerrado' && (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte)
    ) || null;

  const inicioHoyMX = obtenerInicioDiaMexico(ahora);
  const corteAtrasado = sucId
    ? cortesSucursal.find((c) => {
        if (!c || c.sucursal_id !== sucId) return false;
        if (c.estado !== 'abierto') return false;
        if (c.tipo_corte && c.tipo_corte !== 'cierre_diario') return false;
        const iso = c.fecha_apertura || c.fecha_inicio || c.created_date;
        if (!iso) return false;
        const t = new Date(iso).getTime();
        return Number.isFinite(t) && t < inicioHoyMX;
      }) || null
    : null;

  const fe = Number(ultimoCierre?.dinero_dejado_en_caja);
  return {
    cajaAbierta: cajaAbierta?.id ?? null,
    corteAtrasado: corteAtrasado?.id ?? null,
    fondoEsperado: Number.isFinite(fe) ? fe : 0,
  };
}

// ── IMPLEMENTACIÓN NUEVA ────────────────────────────────────────────────
// Simula el filtro que hace PostgreSQL (WHERE sucursal + estado + tipo_corte,
// ORDER BY created_at DESC, LIMIT 1) y luego la derivación en el hook.
function nuevo(todos, sucId, ahora) {
  const porFecha = (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const compatTipo = (c) => c.tipo_corte === 'cierre_diario' || c.tipo_corte == null;

  const cajaAbierta =
    todos
      .filter((c) => c.sucursal_id === sucId && c.estado === 'abierto' && compatTipo(c))
      .sort(porFecha)
      .map((c) => ({ ...c, created_date: c.created_at }))[0] || null;

  const ultimoCierre =
    todos
      .filter((c) => c.sucursal_id === sucId && c.estado === 'cerrado' && compatTipo(c))
      .sort(porFecha)
      .map((c) => ({ ...c, created_date: c.created_at }))[0] || null;

  // corteAtrasado DERIVADO de cajaAbierta (sin consulta propia).
  const inicioHoyMX = obtenerInicioDiaMexico(ahora);
  let corteAtrasado = null;
  const c = cajaAbierta;
  if (c) {
    const okEstado = !c.estado || c.estado === 'abierto';
    const okTipo = !c.tipo_corte || c.tipo_corte === 'cierre_diario';
    const iso = c.fecha_apertura || c.fecha_inicio || c.created_date;
    if (okEstado && okTipo && iso) {
      const t = new Date(iso).getTime();
      if (Number.isFinite(t) && t < inicioHoyMX) corteAtrasado = c;
    }
  }

  const fe = Number(ultimoCierre?.dinero_dejado_en_caja);
  return {
    cajaAbierta: cajaAbierta?.id ?? null,
    corteAtrasado: corteAtrasado?.id ?? null,
    fondoEsperado: Number.isFinite(fe) ? fe : 0,
  };
}

// ── Casos ───────────────────────────────────────────────────────────────
const SUC_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const SUC_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const AHORA = new Date('2026-08-01T20:00:00Z'); // 14:00 en México
const HOY_MX = '2026-08-01T14:00:00Z';   // hoy, después de medianoche MX
const AYER_MX = '2026-07-31T20:00:00Z';  // ayer en México
// 05:59 UTC del 1-ago = 23:59 del 31-jul en México -> TODAVÍA es "ayer".
const BORDE_AYER = '2026-08-01T05:59:00Z';
// 06:01 UTC del 1-ago = 00:01 del 1-ago en México -> ya es "hoy".
const BORDE_HOY = '2026-08-01T06:01:00Z';

const cierre = (id, suc, fecha, dinero) => ({
  id, sucursal_id: suc, estado: 'cerrado', tipo_corte: 'cierre_diario',
  created_at: fecha, fecha_apertura: fecha, dinero_dejado_en_caja: dinero,
});
const abierto = (id, suc, fecha, tipo = 'cierre_diario') => ({
  id, sucursal_id: suc, estado: 'abierto', tipo_corte: tipo,
  created_at: fecha, fecha_apertura: fecha, dinero_dejado_en_caja: null,
});

const casos = [
  ['caja abierta hoy', [abierto('A1', SUC_A, HOY_MX), cierre('C1', SUC_A, AYER_MX, 500)], SUC_A],
  ['caja abierta AYER (atrasada)', [abierto('A2', SUC_A, AYER_MX), cierre('C2', SUC_A, '2026-07-30T20:00:00Z', 300)], SUC_A],
  ['sin caja abierta', [cierre('C3', SUC_A, AYER_MX, 700)], SUC_A],
  ['borde 23:59 MX de ayer -> atrasada', [abierto('A3', SUC_A, BORDE_AYER)], SUC_A],
  ['borde 00:01 MX de hoy -> NO atrasada', [abierto('A4', SUC_A, BORDE_HOY)], SUC_A],
  ['otra sucursal no interfiere', [abierto('A5', SUC_B, AYER_MX), abierto('A6', SUC_A, HOY_MX), cierre('C4', SUC_B, AYER_MX, 999)], SUC_A],
  ['tipo_corte null = cierre_diario', [{ ...abierto('A7', SUC_A, AYER_MX), tipo_corte: null }], SUC_A],
  ['tipo_corte turno se ignora', [abierto('A8', SUC_A, AYER_MX, 'turno')], SUC_A],
  ['sin sucursal activa', [abierto('A9', SUC_A, HOY_MX)], null],
  ['varios cierres: toma el mas reciente', [cierre('C5', SUC_A, '2026-07-29T20:00:00Z', 100), cierre('C6', SUC_A, AYER_MX, 250), abierto('A10', SUC_A, HOY_MX)], SUC_A],
  ['fondo esperado nulo -> 0', [{ ...cierre('C7', SUC_A, AYER_MX, null) }], SUC_A],
  ['sin datos', [], SUC_A],
];

let ok = 0, fail = 0;
for (const [nombre, datos, suc] of casos) {
  const v = viejo(datos, suc, AHORA);
  const n = nuevo(datos, suc, AHORA);
  const igual = JSON.stringify(v) === JSON.stringify(n);
  igual ? ok++ : fail++;
  console.log(
    `${igual ? 'PASS' : '*** FAIL ***'}  ${nombre.padEnd(36)} ` +
    `caja=${n.cajaAbierta ?? '-'} atrasado=${n.corteAtrasado ?? '-'} fondo=${n.fondoEsperado}` +
    (igual ? '' : `\n        viejo=${JSON.stringify(v)}\n        nuevo=${JSON.stringify(n)}`)
  );
}

// Barrido del borde de medianoche México, minuto a minuto (±90 min).
const base = Date.UTC(2026, 7, 1, 6, 0, 0); // 00:00 MX del 1-ago
let bordeOk = 0, bordeFail = 0;
for (let m = -90; m <= 90; m++) {
  const iso = new Date(base + m * 60_000).toISOString();
  const datos = [abierto('B', SUC_A, iso)];
  const v = viejo(datos, SUC_A, AHORA);
  const n = nuevo(datos, SUC_A, AHORA);
  // Antes de 00:00 MX debe estar atrasado; a partir de 00:00 MX, no.
  const esperado = m < 0 ? 'B' : null;
  (JSON.stringify(v) === JSON.stringify(n) && n.corteAtrasado === esperado)
    ? bordeOk++ : (bordeFail++, console.log(`*** FAIL borde m=${m} ${iso} -> ${n.corteAtrasado}`));
}

console.log(`\ncasos: ${ok} PASS, ${fail} FAIL`);
console.log(`borde medianoche MX (181 minutos): ${bordeOk} PASS, ${bordeFail} FAIL`);
process.exit(fail + bordeFail === 0 ? 0 : 1);

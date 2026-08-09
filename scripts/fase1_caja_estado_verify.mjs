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

// ── C. FUGA ENTRE SUCURSALES (regresión) ────────────────────────────────
// useCajaAbierta usa `placeholderData` y una memoria de sesión (refs). La key
// lleva la sucursal, así que al CAMBIAAR de sucursal —el dueño lo hace sin
// recargar— ambos mecanismos pueden servir la caja de la sucursal ANTERIOR.
// Eso es dinero: `cajaAbierta` de otro corte (un "Cerrar caja" escribiría sobre
// el corte equivocado) y `fondoEsperado` de otra sucursal (se graba en
// fondo_esperado_apertura / diferencia_apertura al abrir).
// Réplica EXACTA de las dos decisiones del hook.
const phFuga = (prev, sucId) => (prev && prev.sucursal_id === sucId ? prev : undefined);
const recordada = (ref, sucId) => (ref?.sucursal_id === sucId ? ref : null);

const cajaA = { id: 'corte-A', sucursal_id: 'suc-A', estado: 'abierto' };
const cierreA = { id: 'cierre-A', sucursal_id: 'suc-A', dinero_dejado_en_caja: 1500 };

let cOk = 0, cFail = 0;
const chk = (n, cond) => { cond ? cOk++ : cFail++; console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}`); };

chk('placeholder: misma sucursal SÍ reutiliza', phFuga(cajaA, 'suc-A') === cajaA);
chk('placeholder: OTRA sucursal NO reutiliza', phFuga(cajaA, 'suc-B') === undefined);
chk('placeholder: prev null NO hereda "cerrada" de otra sucursal', phFuga(null, 'suc-B') === undefined);
chk('placeholder: sin sucursal activa NO reutiliza', phFuga(cajaA, null) === undefined);
chk('ultimo cierre: OTRA sucursal NO reutiliza (fondoEsperado es dinero)',
  phFuga(cierreA, 'suc-B') === undefined);
chk('memoria: la caja recordada de OTRA sucursal NO se sirve', recordada(cajaA, 'suc-B') === null);
chk('memoria: la caja recordada de LA MISMA sucursal sí se sirve', recordada(cajaA, 'suc-A') === cajaA);
chk('memoria: el ultimo cierre recordado de OTRA sucursal NO se sirve', recordada(cierreA, 'suc-B') === null);
// Consecuencia observable: al cambiar de sucursal el estado es 'unknown'
// ("Verificando…"), NUNCA 'open' con el corte ajeno ni 'closed' falso.
const estadoAlCambiar = (() => {
  const ph = phFuga(cajaA, 'suc-B');              // placeholder descartado
  const rec = recordada(cajaA, 'suc-B');          // memoria descartada
  if (ph !== undefined) return 'open-ajena';
  if (rec) return 'open-ajena';
  return 'unknown';
})();
chk('al cambiar de sucursal el estado es "unknown", no la caja ajena',
  estadoAlCambiar === 'unknown');

// ── D. CORTE ATRASADO: no bloquear una sucursal por el corte de otra ─────
const corteAtrasadoDe = (caja, sucId) => {
  if (!caja) return null;
  if (sucId && caja.sucursal_id && caja.sucursal_id !== sucId) return null;
  return caja;
};
chk('corte atrasado: el corte de OTRA sucursal no bloquea',
  corteAtrasadoDe({ ...cajaA }, 'suc-B') === null);
chk('corte atrasado: el corte de LA MISMA sucursal sí cuenta',
  corteAtrasadoDe(cajaA, 'suc-A') === cajaA);

// ── E. Las guardas por sucursal necesitan que la COLUMNA venga ──────────
// Las guardas de arriba comparan `fila.sucursal_id === sucId`. Si la consulta
// no PIDE esa columna, la comparación es `undefined === '<uuid>'`, siempre
// false: el placeholder no se aplica nunca y la memoria de sesión queda muerta,
// así que `fondoEsperado` cae a 0 en cualquier ventana en la que la consulta no
// haya resuelto — y ese 0 se graba en fondo_esperado_apertura /
// diferencia_apertura al abrir caja. Es DINERO, y pasó de verdad:
// COLS_CIERRE no incluía sucursal_id.
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/lib/cajaEstado.js', import.meta.url), 'utf8');
  const cols = (nombre) => {
    const m = src.match(new RegExp(nombre + "\\s*=\\s*\n?\\s*'([^']+)'"));
    return m ? m[1].split(',').map((c) => c.trim()) : [];
  };
  const abierta = cols('COLS_ABIERTA');
  const cierre = cols('COLS_CIERRE');
  let eOk = 0, eFail = 0;
  const chk = (n, cond) => { cond ? eOk++ : eFail++; console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}`); };
  chk('columnas: se pudo leer COLS_ABIERTA', abierta.length > 0);
  chk('columnas: se pudo leer COLS_CIERRE', cierre.length > 0);
  chk('columnas: COLS_ABIERTA pide sucursal_id (lo exige la guarda anti-fuga)',
    abierta.includes('sucursal_id'));
  chk('columnas: COLS_CIERRE pide sucursal_id (si no, fondoEsperado cae a 0)',
    cierre.includes('sucursal_id'));
  chk('columnas: COLS_CIERRE sigue trayendo dinero_dejado_en_caja',
    cierre.includes('dinero_dejado_en_caja'));
  console.log(`columnas necesarias para las guardas: ${eOk} PASS, ${eFail} FAIL`);
  if (eFail) fail += eFail;
}

console.log(`\ncasos: ${ok} PASS, ${fail} FAIL`);
console.log(`borde medianoche MX (181 minutos): ${bordeOk} PASS, ${bordeFail} FAIL`);
console.log(`fuga entre sucursales: ${cOk} PASS, ${cFail} FAIL`);
process.exit(fail + bordeFail + cFail === 0 ? 0 : 1);

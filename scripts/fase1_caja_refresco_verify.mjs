// =====================================================================
// Fase 1 (2026-08-01) — Verificación del refresco centralizado de caja.
//
// Demuestra los tres puntos exigidos en la revisión:
//   1. El temporizador de respaldo refresca SÓLO la caja abierta
//      (no arrastra ['cortes_caja_estado', suc, 'ultimo_cierre']).
//   2. Abrir/cerrar caja refresca AMBAS (ahí sí puede cambiar fondoEsperado).
//   3. Con varios observadores montados existe UN SOLO temporizador por
//      sucursal (y se libera al desmontar el último).
//
// Motivo del punto 1: `invalidateQueries({ queryKey })` hace PREFIX match.
// Sin `exact: true`, el temporizador disparaba DOS consultas por sucursal.
//
// No toca la base de datos ni el dinero real.
//
// Uso (desde pos/):  node scripts/fase1_caja_refresco_verify.mjs
// =====================================================================
import { QueryClient } from '@tanstack/react-query';
import {
  registrarRefrescoCaja,
  invalidarSoloCajaAbierta,
  invalidarCajaCompleta,
  KEY_CAJA_ABIERTA,
  KEY_ULTIMO_CIERRE,
  _registrosActivos,
} from '../src/lib/cajaRefresco.js';

const SUC_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const SUC_B = 'bbbbbbbb-0000-0000-0000-000000000002';

let ok = 0, fail = 0;
const check = (nombre, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${nombre}${extra ? '  ' + extra : ''}`);
};

function nuevoCliente() {
  const qc = new QueryClient();
  qc.setQueryData(KEY_CAJA_ABIERTA(SUC_A), { id: 'caja-A' });
  qc.setQueryData(KEY_ULTIMO_CIERRE(SUC_A), { dinero_dejado_en_caja: 500 });
  qc.setQueryData(KEY_CAJA_ABIERTA(SUC_B), { id: 'caja-B' });
  return qc;
}
const invalidada = (qc, key) => qc.getQueryState(key)?.isInvalidated === true;

// ── 1. Temporizador → SÓLO caja abierta ─────────────────────────────────
{
  const qc = nuevoCliente();
  invalidarSoloCajaAbierta(qc, SUC_A);
  check('timer: invalida caja abierta de su sucursal', invalidada(qc, KEY_CAJA_ABIERTA(SUC_A)));
  check('timer: NO invalida ultimo_cierre', !invalidada(qc, KEY_ULTIMO_CIERRE(SUC_A)));
  check('timer: NO toca otra sucursal', !invalidada(qc, KEY_CAJA_ABIERTA(SUC_B)));
}

// ── 2. Abrir/cerrar caja → AMBAS ────────────────────────────────────────
{
  const qc = nuevoCliente();
  invalidarCajaCompleta(qc, SUC_A);
  check('mutacion: invalida caja abierta', invalidada(qc, KEY_CAJA_ABIERTA(SUC_A)));
  check('mutacion: invalida ultimo_cierre', invalidada(qc, KEY_ULTIMO_CIERRE(SUC_A)));
  check('mutacion: NO toca otra sucursal', !invalidada(qc, KEY_CAJA_ABIERTA(SUC_B)));
}

// Equivalente a lo que hace Caja.jsx: invalidateQueries por prefijo SIN sucursal.
{
  const qc = nuevoCliente();
  qc.invalidateQueries({ queryKey: ['cortes_caja_estado'] });
  check('Caja.jsx (prefijo global): invalida caja abierta', invalidada(qc, KEY_CAJA_ABIERTA(SUC_A)));
  check('Caja.jsx (prefijo global): invalida ultimo_cierre', invalidada(qc, KEY_ULTIMO_CIERRE(SUC_A)));
}

// ── 3. Un solo temporizador por sucursal ────────────────────────────────
{
  const qc = nuevoCliente();
  let creados = 0, limpiados = 0;
  const timers = new Map();
  let seq = 0;
  const deps = {
    setIntervalFn: (fn) => { creados++; const id = ++seq; timers.set(id, fn); return id; },
    clearIntervalFn: (id) => { limpiados++; timers.delete(id); },
    doc: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
    win: { addEventListener() {}, removeEventListener() {} },
  };

  // 6 puntos de montaje (POS, Caja x2, Dashboard, PedidosPastel, NuevoPedido…)
  const bajas = Array.from({ length: 6 }, () => registrarRefrescoCaja(SUC_A, qc, deps));
  check('6 observadores -> 1 solo temporizador', creados === 1, `(creados=${creados})`);
  check('refcount = 6', _registrosActivos().get(SUC_A) === 6);

  // Otra sucursal sí crea el suyo.
  const bajaB = registrarRefrescoCaja(SUC_B, qc, deps);
  check('otra sucursal -> su propio temporizador', creados === 2, `(creados=${creados})`);

  // El callback del temporizador sólo debe tocar la caja abierta.
  const qc2 = nuevoCliente();
  let creados2 = 0; let cb = null;
  registrarRefrescoCaja('suc-cb', qc2, {
    ...deps,
    setIntervalFn: (fn) => { creados2++; cb = fn; return 1; },
  });
  qc2.setQueryData(KEY_CAJA_ABIERTA('suc-cb'), { id: 'x' });
  qc2.setQueryData(KEY_ULTIMO_CIERRE('suc-cb'), { dinero_dejado_en_caja: 1 });
  cb();
  check('callback del timer: invalida caja abierta', invalidada(qc2, KEY_CAJA_ABIERTA('suc-cb')));
  check('callback del timer: NO invalida ultimo_cierre', !invalidada(qc2, KEY_ULTIMO_CIERRE('suc-cb')));

  // Desmontar 5 de 6: el temporizador sigue vivo.
  bajas.slice(0, 5).forEach((f) => f());
  check('quedan observadores -> no se limpia', limpiados === 0 && _registrosActivos().get(SUC_A) === 1);

  // Desmontar el último: se libera.
  bajas[5]();
  check('ultimo observador fuera -> temporizador liberado', limpiados === 1 && !_registrosActivos().has(SUC_A));

  bajaB();
  check('baja idempotente (doble unmount no rompe)', (() => { try { bajas[5](); return true; } catch { return false; } })());
}

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

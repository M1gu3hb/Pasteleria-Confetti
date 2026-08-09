// =====================================================================
// Verificación del ALCANCE del rol `pastelero` (migración 0060).
//
// (A) Réplica de la decisión del trigger trg_guard_pastelero_alcance.
//     Si esta tabla y la del trigger divergen, el POS ofrecería botones que
//     la base rechaza (o al revés). Se prueba aquí porque es lógica pura.
// (B) Réplica de qué botones muestra PedidoPastelDetalleDialog por rol.
//     Regla: NUNCA mostrar un botón cuya escritura la base va a rechazar.
//
// La evidencia contra la BASE REAL (con la sesión del pastelero, en
// transacciones revertidas) está en scripts/pastelero_alcance_evidencia.sql,
// con su salida del 2026-08-09 registrada en la cabecera de ese mismo archivo.
//
// Uso: node scripts/pastelero_alcance_verify.mjs
// =====================================================================
let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};

// ── (A) Réplica del trigger ─────────────────────────────────────────────
const PERMITIDAS = ['nota_voz_transcripcion', 'estado', 'fecha_confirmacion', 'fecha_entrega_real'];

/** Devuelve null si el UPDATE pasa, o el código de rechazo si el trigger aborta. */
function guardPastelero({ esPastelero, old: o, nuevo: n }) {
  if (!esPastelero) return null;                       // NO-OP para el resto de roles

  // (a) ninguna columna fuera de la lista puede cambiar
  const cols = new Set([...Object.keys(o), ...Object.keys(n)]);
  for (const c of cols) {
    if (PERMITIDAS.includes(c)) continue;
    if (o[c] !== n[c]) return 'PASTELERO_FUERA_DE_ALCANCE';
  }

  // (b) transiciones
  if (n.estado !== o.estado) {
    if (n.estado === 'confirmado' && o.estado === 'pendiente') {
      // permitido
    } else if (n.estado === 'entregado' && !['entregado', 'cancelado'].includes(o.estado)) {
      const saldo = Number(o.saldo_pendiente ?? o.resta ?? 0);
      if (o.estado !== 'pagado' && saldo > 0) return 'PASTELERO_SALDO_PENDIENTE';
    } else {
      return 'PASTELERO_TRANSICION_NO_PERMITIDA';
    }
  }

  // (c) fechas sólo se sellan en su transición
  if (n.fecha_confirmacion !== o.fecha_confirmacion
      && !(n.estado === 'confirmado' && o.estado !== 'confirmado')) return 'PASTELERO_FECHA_SUELTA';
  if (n.fecha_entrega_real !== o.fecha_entrega_real
      && !(n.estado === 'entregado' && o.estado !== 'entregado')) return 'PASTELERO_FECHA_SUELTA';

  return null;
}

const base = {
  estado: 'pendiente', saldo_pendiente: 0, resta: 0, total_final: 500,
  nota_voz_transcripcion: 'vieja', fecha_confirmacion: null, fecha_entrega_real: null,
  cliente_nombre: 'Ana', sucursal_id: 'suc-1',
};
const con = (extra) => ({ ...base, ...extra });

check('A1 pastelero EDITA la nota',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ nota_voz_transcripcion: 'nueva' }) }) === null);

check('A2 pastelero NO cambia el precio',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ total_final: 999 }) }) === 'PASTELERO_FUERA_DE_ALCANCE');

check('A3 pastelero NO cambia el cliente',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ cliente_nombre: 'Otro' }) }) === 'PASTELERO_FUERA_DE_ALCANCE');

check('A4 pastelero NO cambia la sucursal',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ sucursal_id: 'suc-2' }) }) === 'PASTELERO_FUERA_DE_ALCANCE');

check('A5 pendiente -> confirmado (con su fecha) permitido',
  guardPastelero({ esPastelero: true, old: base,
    nuevo: con({ estado: 'confirmado', fecha_confirmacion: 'T1' }) }) === null);

check('A6 confirmado -> confirmado NO permite resellar la fecha',
  guardPastelero({ esPastelero: true, old: con({ estado: 'confirmado', fecha_confirmacion: 'T1' }),
    nuevo: con({ estado: 'confirmado', fecha_confirmacion: 'T2' }) }) === 'PASTELERO_FECHA_SUELTA');

check('A7 con_anticipo -> confirmado NO permitido (solo desde pendiente)',
  guardPastelero({ esPastelero: true, old: con({ estado: 'con_anticipo' }),
    nuevo: con({ estado: 'confirmado' }) }) === 'PASTELERO_TRANSICION_NO_PERMITIDA');

check('A8 entregado SIN saldo permitido',
  guardPastelero({ esPastelero: true, old: con({ estado: 'confirmado', saldo_pendiente: 0 }),
    nuevo: con({ estado: 'entregado', saldo_pendiente: 0, fecha_entrega_real: 'T1' }) }) === null);

check('A9 entregado CON saldo BLOQUEADO',
  guardPastelero({ esPastelero: true, old: con({ estado: 'confirmado', saldo_pendiente: 250 }),
    nuevo: con({ estado: 'entregado', saldo_pendiente: 250, fecha_entrega_real: 'T1' }) }) === 'PASTELERO_SALDO_PENDIENTE');

check('A10 pagado -> entregado permitido',
  guardPastelero({ esPastelero: true,
    old:   con({ estado: 'pagado',    saldo_pendiente: 0 }),
    nuevo: con({ estado: 'entregado', saldo_pendiente: 0, fecha_entrega_real: 'T1' }) }) === null);

// CASO REAL, no hipotético: hoy `saldo_pendiente` es NOT NULL DEFAULT 0 y hay
// 68 pedidos con saldo_pendiente=0 y resta>0 (saldados por abonos, con el campo
// legacy `resta` sin actualizar). La pantalla los trata como SIN saldo
// (`saldo_pendiente != null ? saldo_pendiente : resta`), así que el candado de
// la base tiene que hacer lo mismo o el pastelero vería un botón que falla.
check('A11 saldo_pendiente=0 con resta>0 (68 pedidos reales) SÍ se puede entregar',
  guardPastelero({ esPastelero: true,
    old: con({ estado: 'confirmado', saldo_pendiente: 0, resta: 300 }),
    nuevo: con({ estado: 'entregado', saldo_pendiente: 0, resta: 300, fecha_entrega_real: 'T1' }) }) === null);

// Defensivo: el coalesce del trigger sólo se alcanzaría si la columna volviera a
// admitir NULL. Se prueba para que no se rompa en silencio si eso cambiara.
check('A11b (defensivo) saldo_pendiente null caería en `resta`',
  guardPastelero({ esPastelero: true,
    old: con({ estado: 'confirmado', saldo_pendiente: null, resta: 120 }),
    nuevo: con({ estado: 'entregado', saldo_pendiente: null, resta: 120, fecha_entrega_real: 'T1' }) }) === 'PASTELERO_SALDO_PENDIENTE');

check('A12 pastelero NO cancela',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ estado: 'cancelado' }) }) === 'PASTELERO_TRANSICION_NO_PERMITIDA');

check('A13 pastelero NO marca pagado',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ estado: 'pagado' }) }) === 'PASTELERO_TRANSICION_NO_PERMITIDA');

check('A14 pastelero NO sella fecha_entrega_real suelta',
  guardPastelero({ esPastelero: true, old: base, nuevo: con({ fecha_entrega_real: 'T1' }) }) === 'PASTELERO_FECHA_SUELTA');

check('A15 pastelero NO reentrega un pedido ya entregado',
  guardPastelero({ esPastelero: true, old: con({ estado: 'entregado' }),
    nuevo: con({ estado: 'entregado', fecha_entrega_real: 'T2' }) }) === 'PASTELERO_FECHA_SUELTA');

check('A16 pastelero NO resucita un cancelado',
  guardPastelero({ esPastelero: true, old: con({ estado: 'cancelado' }),
    nuevo: con({ estado: 'entregado' }) }) === 'PASTELERO_TRANSICION_NO_PERMITIDA');

// El trigger NO debe estorbar a nadie más: para cualquier otro rol es NO-OP.
check('A17 administrador cambia el precio (trigger NO-OP)',
  guardPastelero({ esPastelero: false, old: base, nuevo: con({ total_final: 999 }) }) === null);
check('A18 administrador cancela (trigger NO-OP)',
  guardPastelero({ esPastelero: false, old: base, nuevo: con({ estado: 'cancelado' }) }) === null);
check('A19 administrador entrega con saldo (trigger NO-OP; su regla es la de pantalla)',
  guardPastelero({ esPastelero: false, old: con({ saldo_pendiente: 300 }),
    nuevo: con({ estado: 'entregado', saldo_pendiente: 300 }) }) === null);

// ── (B) Botones que muestra el diálogo ──────────────────────────────────
// Réplica de las condiciones JSX de PedidoPastelDetalleDialog.
function botones({ rol, pedido }) {
  const esPastelero = rol === 'pastelero';
  const finalizado = pedido.estado === 'entregado' || pedido.estado === 'cancelado';
  const esCatalogo = pedido.tipo_pedido === 'productos_catalogo';
  return {
    confirmar: pedido.estado === 'pendiente',
    pago:      !esPastelero && !finalizado && pedido.estado !== 'pagado',
    entregado: !finalizado,
    editar:    !esPastelero && !finalizado && !esCatalogo,
    cancelar:  !esPastelero && !finalizado,
    guardarNota: true,   // la nota ya es editable para todos
  };
}

const bPast = botones({ rol: 'pastelero', pedido: base });
check('B1 pastelero VE Confirmar', bPast.confirmar === true);
check('B2 pastelero VE Entregado', bPast.entregado === true);
check('B3 pastelero VE Guardar nota', bPast.guardarNota === true);
check('B4 pastelero NO ve Registrar pago', bPast.pago === false);
check('B5 pastelero NO ve Editar', bPast.editar === false);
check('B6 pastelero NO ve Cancelar', bPast.cancelar === false);

const bAdm = botones({ rol: 'administrador', pedido: base });
check('B7 administrador ve TODO igual que antes',
  bAdm.confirmar && bAdm.pago && bAdm.entregado && bAdm.editar && bAdm.cancelar && bAdm.guardarNota);

const bAdmFin = botones({ rol: 'administrador', pedido: con({ estado: 'entregado' }) });
check('B8 pedido finalizado: nadie ve acciones de avance',
  bAdmFin.entregado === false && bAdmFin.editar === false && bAdmFin.cancelar === false);

// (C) COHERENCIA: ningún botón visible para el pastelero puede corresponder a
// una escritura que la base vaya a rechazar. Es la prueba que ata (A) con (B).
check('C1 el botón Confirmar del pastelero pasa el candado de la base',
  bPast.confirmar &&
  guardPastelero({ esPastelero: true, old: base,
    nuevo: con({ estado: 'confirmado', fecha_confirmacion: 'T1' }) }) === null);

const pedidoListo = con({ estado: 'confirmado', saldo_pendiente: 0 });
check('C2 el botón Entregado del pastelero (sin saldo) pasa el candado de la base',
  botones({ rol: 'pastelero', pedido: pedidoListo }).entregado &&
  guardPastelero({ esPastelero: true, old: pedidoListo,
    nuevo: { ...pedidoListo, estado: 'entregado', fecha_entrega_real: 'T1' } }) === null);

check('C3 el botón Guardar nota del pastelero pasa el candado de la base',
  bPast.guardarNota &&
  guardPastelero({ esPastelero: true, old: base,
    nuevo: con({ nota_voz_transcripcion: 'nueva' }) }) === null);

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

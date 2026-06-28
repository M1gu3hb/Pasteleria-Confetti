// FASE 3 #3 — Pago mixto: lógica compartida (un solo lugar, sin duplicar en cada
// punto de cobro). El esquema ya soporta mixto (Venta.metodo_pago='mixto' +
// monto_efectivo/tarjeta/transferencia); aquí va la construcción del pago, la
// validación de cuadre y la etiqueta para el corte/ticket.

// Iniciales para el corte/PDF. Tarjeta=T y Transferencia=TR para que NO se
// confundan entre sí.
export const INICIAL_METODO = { efectivo: 'E', tarjeta: 'T', transferencia: 'TR' };

// Métodos con monto > 0 en una venta (para etiqueta/diagnóstico del mixto).
export function metodosUsadosDe(v) {
  const usados = [];
  if ((Number(v?.monto_efectivo) || 0) > 0) usados.push('efectivo');
  if ((Number(v?.monto_tarjeta) || 0) > 0) usados.push('tarjeta');
  if ((Number(v?.monto_transferencia) || 0) > 0) usados.push('transferencia');
  return usados;
}

// Etiqueta del método para el corte/ticket: método único capitalizado, o
// "Mixto (E+T)" listando SOLO qué métodos se usaron (por iniciales), no el monto.
export function etiquetaMetodoPago(v) {
  if (v?.metodo_pago === 'mixto') {
    const iniciales = metodosUsadosDe(v).map(m => INICIAL_METODO[m]).filter(Boolean);
    return iniciales.length ? `Mixto (${iniciales.join('+')})` : 'Mixto';
  }
  const m = v?.metodo_pago;
  if (!m) return '—';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

// Construye el objeto de pago + validez a partir del método elegido y, si es
// mixto, los montos por método. `total` = monto a cubrir.
//  - método único: todo el total a ese método (válido si total>0).
//  - mixto: la suma de los montos debe ser EXACTAMENTE el total (ni de más ni
//    de menos) y usar al menos 2 métodos. Devuelve `faltante` (>0 falta, <0 sobra).
export function construirPago(total, metodo, montos = {}) {
  const t = Number(total) || 0;
  if (metodo !== 'mixto') {
    return {
      pago: {
        metodo_pago: metodo,
        monto_efectivo: metodo === 'efectivo' ? t : 0,
        monto_tarjeta: metodo === 'tarjeta' ? t : 0,
        monto_transferencia: metodo === 'transferencia' ? t : 0,
      },
      valido: t > 0,
      suma: t,
      faltante: 0,
    };
  }
  const ef = Number(montos.efectivo) || 0;
  const ta = Number(montos.tarjeta) || 0;
  const tr = Number(montos.transferencia) || 0;
  const suma = ef + ta + tr;
  const faltante = Number((t - suma).toFixed(2));
  const numMetodos = [ef, ta, tr].filter(x => x > 0).length;
  const valido = t > 0 && Math.abs(faltante) < 0.01 && numMetodos >= 2;
  return {
    pago: { metodo_pago: 'mixto', monto_efectivo: ef, monto_tarjeta: ta, monto_transferencia: tr },
    valido,
    suma,
    faltante,
  };
}

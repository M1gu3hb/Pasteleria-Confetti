/**
 * Helpers para IVA / impuesto — MODO "INCLUIDO" (Opción A).
 *
 * IMPORTANTE — NO cambia totales:
 *   - El total de la venta YA contiene el IVA. No se suma encima.
 *   - Estos helpers solo calculan el desglose VISUAL para tickets, precuenta,
 *     caja y corte.
 *   - Si el negocio no maneja IVA (iva_porcentaje = 0/vacío/inválido), todo
 *     queda como antes y NO se muestra desglose.
 *
 * Fórmula IVA incluido:
 *   subtotal_sin_iva = total / (1 + iva%/100)
 *   iva_monto        = total - subtotal_sin_iva
 *
 * Ejemplo:
 *   total = 116, iva = 16
 *   subtotal_sin_iva = 116 / 1.16 = 100
 *   iva_monto        = 16
 *
 * Defensivo:
 *   - total inválido / NaN / negativo → { aplica: false }.
 *   - iva inválido / 0 / NaN → { aplica: false }.
 *   - Nunca devuelve NaN ni undefined.
 */

/**
 * Lee el porcentaje de IVA configurado. Devuelve número >= 0.
 * Acepta string ("16"), number (16) o decimal (16.5).
 * Si es inválido o <= 0, devuelve 0 (no se muestra desglose).
 */
export function getIvaPorcentaje(config) {
  const raw = config?.iva_porcentaje;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Tope defensivo: nadie maneja >50% real, pero no bloqueamos por si lo configuran.
  return n;
}

/**
 * Calcula el desglose IVA incluido a partir del total bruto de la venta.
 *
 * @param {number} totalConIva  Total que YA incluye el IVA (Venta.total). Sin propina.
 * @param {number} ivaPorcentaje  Porcentaje de IVA (16, 8, etc.).
 * @returns {{
 *   aplica: boolean,
 *   subtotalSinIva: number,
 *   ivaMonto: number,
 *   totalConIva: number,
 *   porcentaje: number,
 * }}
 */
export function calcularIvaIncluido(totalConIva, ivaPorcentaje) {
  const total = Number(totalConIva);
  const pct = Number(ivaPorcentaje);
  // Defensa: total y pct deben ser válidos y positivos.
  if (!Number.isFinite(total) || total <= 0) {
    return { aplica: false, subtotalSinIva: 0, ivaMonto: 0, totalConIva: 0, porcentaje: 0 };
  }
  if (!Number.isFinite(pct) || pct <= 0) {
    return { aplica: false, subtotalSinIva: total, ivaMonto: 0, totalConIva: total, porcentaje: 0 };
  }
  const subtotalSinIva = Math.round((total / (1 + pct / 100)) * 100) / 100;
  const ivaMonto = Math.round((total - subtotalSinIva) * 100) / 100;
  return {
    aplica: true,
    subtotalSinIva,
    ivaMonto,
    totalConIva: total,
    porcentaje: pct,
  };
}

/**
 * Atajo: lee el porcentaje del config y calcula el desglose. Útil para
 * componentes que ya tienen `config`.
 */
export function desgloseIvaDesdeConfig(totalConIva, config) {
  return calcularIvaIncluido(totalConIva, getIvaPorcentaje(config));
}

/**
 * ¿Debe mostrarse el desglose de IVA en pantalla/ticket?
 * Solo si hay IVA > 0 configurado y total > 0.
 */
export function debeMostrarIva(totalConIva, config) {
  return desgloseIvaDesdeConfig(totalConIva, config).aplica;
}
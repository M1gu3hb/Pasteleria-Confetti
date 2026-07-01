// Efectivo esperado en el cajón (CAMBIOS_V2 · FIX 1 + FIX devoluciones — único origen de verdad).
// "Dinero esperado en caja" = TODO el efectivo físicamente en el cajón ese día,
// contado UNA sola vez. El diálogo de cierre (CierreDiarioDialog) y el valor
// guardado (Caja.jsx) usan efectivoEsperadoDeResumen(resumen) para no divergir.
//
// 🔴 REGLA DE DINERO (abonos):
//   - Un anticipo POSITIVO que ENTRA ya crea una VENTA PARALELA (RegistrarPagoDialog)
//     contada en `totalEfectivo`. Por eso los abonos positivos NO se suman aparte
//     (se contarían dos veces).
//   - Una DEVOLUCIÓN de anticipo (devolucionAnticipo.js) crea SOLO un abono NEGATIVO
//     (sin venta paralela). Ese reembolso en efectivo SÍ sale del cajón, así que SÍ
//     debe restar. Por eso se incluye `devolucionesEfectivo` (suma de monto_efectivo
//     de los abonos con monto<0, que es negativa → resta).
// Verificado: venta 1000 + anticipo 500 (venta paralela 500) → 1500; + devolución 500
//   (abono −500) → 1000 (cada peso una vez).
//
// Fórmula: ventas efectivo + propinas efectivo + devoluciones efectivo (negativas) − gastos efectivo.

// Util genérico (suma de los sumandos provistos). `abonosEfectivo` aquí es el término
// de abonos que SÍ debe entrar (para el corte: solo las devoluciones negativas).
export function calcularEfectivoEsperado({
  ventasEfectivo = 0,
  propinaEfectivo = 0,
  abonosEfectivo = 0,
  gastosEfectivo = 0,
} = {}) {
  return (Number(ventasEfectivo) || 0)
    + (Number(propinaEfectivo) || 0)
    + (Number(abonosEfectivo) || 0)
    - (Number(gastosEfectivo) || 0);
}

// Extrae del `resumen` de Caja y calcula. Ambos call-sites (guardado y diálogo)
// usan ESTA función para que nunca diverjan. Solo entran las devoluciones (abonos
// negativos); los anticipos positivos ya vienen en totalEfectivo por su venta paralela.
export function efectivoEsperadoDeResumen(resumen) {
  const r = resumen || {};
  return calcularEfectivoEsperado({
    ventasEfectivo: r.totalEfectivo,
    propinaEfectivo: r.metodosPagoConPropinas?.efectivo?.propinas,
    abonosEfectivo: r.devolucionesEfectivo, // negativo: resta el reembolso en efectivo
    gastosEfectivo: r.gastosEfectivo,
  });
}

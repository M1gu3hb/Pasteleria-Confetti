// Efectivo esperado en el cajón (CAMBIOS_V2 · FIX 1 — único origen de verdad).
// "Dinero esperado en caja" = TODO el efectivo físicamente en el cajón ese día,
// contado UNA sola vez. El diálogo de cierre (CierreDiarioDialog) y el valor
// guardado (Caja.jsx) usan efectivoEsperadoDeResumen(resumen) para no divergir.
//
// 🔴 HALLAZGO DE AUDITORÍA (dinero) — NO se suma abonosEfectivo:
// En esta arquitectura, CADA abono/anticipo (RegistrarPagoDialog) genera además
// una VENTA PARALELA en el mismo corte, que YA está contada en `totalEfectivo`.
// Por eso el efectivo del anticipo NO se debe sumar otra vez como abono; hacerlo
// lo contaría DOBLE. Verificado empíricamente: venta $1000 + anticipo $500 →
// ventas_efectivo=1500 (= físico en cajón); ventas+abonos=2000 (doble). Ver
// AUDITORIA_PREDEPLOY.md · Hallazgo FIX1. (Decisión de dinero: requiere visto
// bueno de Miguel; su instrucción literal de "sumar abonos" duplicaría por la
// venta paralela.)
//
// Fórmula (cada peso una vez): ventas en efectivo + propinas en efectivo − gastos
// en efectivo. Los anticipos en efectivo ya entran por su venta paralela.

// Util genérico (suma de los sumandos provistos). Se mantiene el parámetro
// abonosEfectivo por generalidad, pero el helper de resumen lo pasa en 0 (ver arriba).
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
// usan ESTA función para que nunca diverjan. abonosEfectivo=0 a propósito: el
// efectivo del anticipo ya está en totalEfectivo por su venta paralela.
export function efectivoEsperadoDeResumen(resumen) {
  const r = resumen || {};
  return calcularEfectivoEsperado({
    ventasEfectivo: r.totalEfectivo,
    propinaEfectivo: r.metodosPagoConPropinas?.efectivo?.propinas,
    abonosEfectivo: 0, // NO sumar: el anticipo ya viene en totalEfectivo (venta paralela).
    gastosEfectivo: r.gastosEfectivo,
  });
}

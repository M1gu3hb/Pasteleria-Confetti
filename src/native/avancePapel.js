// =====================================================================
// avancePapel — bytes ESC/POS para avanzar papel ANTES de cortar.
// ---------------------------------------------------------------------
// POR QUÉ EXISTE (2026-08-09):
//   En una térmica la CUCHILLA está por debajo del CABEZAL en el recorrido del
//   papel. Al terminar de imprimir, los últimos milímetros de contenido están
//   ENTRE ambos: si se corta en ese instante, el final del ticket se queda
//   pegado al ticket siguiente.
//
//   Y se estaba cortando exactamente así. Verificado desensamblando la
//   librería real (javap sobre el AAR de DantSu 3.4.0 en la caché de Gradle):
//
//     public EscPosPrinterCommands cutPaper() {
//         ...write(new byte[]{ 29, 86, 1 });   // 0x1D 0x56 0x01 = GS V 1
//         ...send(100);
//     }
//
//   Tres bytes y un flush. NO avanza papel. El plugin nativo hace
//   `new EscPosPrinterCommands(c).connect().cutPaper()` y el JS lo llama justo
//   después de la última banda del raster.
//
//   Coincide con el síntoma reportado: al ticket de PASTEL le faltaban el total
//   y el bloque de entrega a domicilio, que es lo que va al FINAL.
//
// POR QUÉ SE ARREGLA EN JS Y NO EN EL PLUGIN:
//   `enviarBytes` YA está expuesto por el APK 1.1.1 instalado, así que este
//   arreglo viaja por la web y llega a las tablets SIN recompilar ni
//   reinstalar el APK. Si se hiciera en Java, haría falta la 1.2.
//
// UNIDADES: puntos de impresora. A 203 dpi, 1 punto = 0,125 mm.
// =====================================================================

/** Techo de cordura: ~16 cm de papel. Evita vaciar el rollo por un typo. */
export const MAX_AVANCE_DOTS = 1275;

/**
 * Bytes de `ESC J n` (0x1B 0x4A n) necesarios para avanzar `dots` puntos.
 *
 * `n` es UN BYTE, así que el máximo por comando son 255 puntos (31,9 mm); para
 * más, se encadenan comandos. Con 0, NaN, negativo o basura devuelve un array
 * vacío: no se manda nada y el comportamiento es exactamente el de antes.
 *
 * @param {unknown} dots
 * @returns {number[]} bytes a enviar (vacío = no avanzar)
 */
export function bytesAvancePapel(dots) {
  const n0 = Number(dots);
  if (!Number.isFinite(n0) || n0 <= 0) return [];
  let restantes = Math.min(Math.floor(n0), MAX_AVANCE_DOTS);
  const bytes = [];
  while (restantes > 0) {
    const n = Math.min(255, restantes);
    bytes.push(0x1b, 0x4a, n);
    restantes -= n;
  }
  return bytes;
}

/** Milímetros que representa un avance en puntos, a 203 dpi. Para la UI. */
export function dotsAMilimetros(dots) {
  const n = Number(dots);
  return Number.isFinite(n) && n > 0 ? n * 0.125 : 0;
}

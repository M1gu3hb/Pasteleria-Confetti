/**
 * Config LOCAL de impresora/cajón — POR DISPOSITIVO (Fase 4).
 *
 * Vive en localStorage del dispositivo (NO en la BD compartida de Supabase:
 * cada sucursal tiene su impresora/IP y no debe afectar a las demás). La UI
 * para editarla se agrega en la Fase 6; aquí solo el getter/setter con defaults.
 *
 * Defaults: modo=imagen (preserva el diseño), conexion=usb, puerto=9100.
 */
const KEY = 'confetti_printer_cfg';

const DEFAULTS = Object.freeze({
  modo: 'imagen',          // 'imagen' (default, preserva diseño) | 'texto' (ESC/POS plano)
  conexion: 'usb',         // 'usb' | 'tcp'
  ip: '',                  // IP de la impresora si conexion === 'tcp'
  puerto: 9100,            // puerto TCP ESC/POS estándar
  // FIX B (selección de impresora USB): la impresora ELEGIDA por el usuario (Config → Detectar).
  // null = sin elección → el nativo cae a la primera impresora USB (byte-idéntico).
  usbVendorId: null,       // number | null
  usbProductId: null,      // number | null
  usbNombre: '',           // etiqueta para mostrar la elegida en la UI
  metodoCajon: 'ninguno',  // 'ninguno' | 'usb_trigger' | 'kick_impresora'
  formatoCorte: 'pdf',     // 'pdf' (default, PDF carta actual) | 'termico' (ESC/POS)
  // ── AVANCE ANTES DEL CORTE (2026-08-09) ───────────────────────────────
  // En una térmica la CUCHILLA está por debajo del CABEZAL en el recorrido del
  // papel. Al terminar de imprimir, los últimos milímetros de contenido están
  // ENTRE el cabezal y la cuchilla: si se corta en ese momento, el final del
  // ticket se queda pegado al siguiente.
  //
  // Y se cortaba exactamente así. Verificado desensamblando la librería:
  // `EscPosPrinterCommands.cutPaper()` de DantSu 3.4.0 escribe SÓLO 3 bytes
  // —0x1D 0x56 0x01 (GS V 1, corte parcial)— y hace send(100). NO avanza papel.
  // El plugin nativo llama `new EscPosPrinterCommands(c).connect().cutPaper()`
  // y el JS lo invoca justo después de la última banda del raster, sin avance.
  //
  // Coincide con el síntoma que reportó Abel: al ticket de PASTEL le faltaban
  // el total y el bloque de entrega a domicilio — justo lo que va al FINAL.
  //
  // Se expresa en PUNTOS de impresora: a 203 dpi, 1 punto = 0,125 mm.
  //   150 puntos ≈ 18,8 mm. El hueco cabezal→cuchilla típico en 80 mm es de
  //   ~10–16 mm, así que 150 lo cubre con margen.
  // Equivocarse POR ARRIBA sólo gasta un poco de papel; equivocarse por abajo
  // deja el bug vivo. Por eso el default es generoso.
  //
  // AJUSTABLE POR DISPOSITIVO desde Config → Operación, sin recompilar el APK:
  // el avance se manda con ESC J desde JS (`enviarBytes`, que YA existe en el
  // APK 1.1.1 instalado), así que este arreglo llega por la web.
  avanceAntesCorteDots: 150,
});

export function getPrinterConfig() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPrinterConfig(patch) {
  const next = { ...getPrinterConfig(), ...(patch || {}) };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible: se queda con defaults en memoria */
  }
  return next;
}

export { DEFAULTS as PRINTER_DEFAULTS };

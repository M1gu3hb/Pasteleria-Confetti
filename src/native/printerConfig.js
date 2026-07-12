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

import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { abrirCajonPorImpresora, abrirCajonUsbSerial } from '@/native/confettiPrinter';
import { conImpresora } from '@/native/printTicket';
import { getPrinterConfig } from '@/native/printerConfig';

/**
 * abrirCajon — abre el cajón de dinero según el método de la config LOCAL
 * (printerConfig.metodoCajon). Fase 5.
 *
 * 🔒 Solo corre DENTRO del APK: en el navegador no hace NADA. Errores VISIBLES
 * con toast (sonner). La UI para seleccionar/probar los métodos llega en Fase 6.
 * NO toca dinero/RLS/tickets.
 *
 * Métodos (todos seleccionables + probables en sitio):
 *   'ninguno'        → no hace nada (sin cajón electrónico / se abre a mano).
 *   'usb_trigger'    → disparador USB-serial de cajón (dispositivo aparte del
 *                      printer; la tablet/impresora no tienen RJ11).
 *   'kick_impresora' → patada ESC/POS por la impresora (por si a futuro hay una
 *                      impresora con puerto RJ11 de cajón).
 *
 * @param {('ninguno'|'usb_trigger'|'kick_impresora')} [metodoOverride] fuerza un
 *   método (para los botones "Probar cajón" de la Fase 6).
 * @returns {Promise<{ ok: boolean, metodo: string }>}
 */
export async function abrirCajon(metodoOverride) {
  if (!Capacitor.isNativePlatform()) return { ok: false, metodo: 'navegador' };
  const cfg = getPrinterConfig();
  const metodo = metodoOverride || cfg.metodoCajon || 'ninguno';
  try {
    if (metodo === 'kick_impresora') {
      // La patada va por la impresora. FIX A: conectar → patear → desconectar (mismo ciclo de
      // vida que la impresión, sin dejar la conexión colgada).
      await conImpresora(cfg, () => abrirCajonPorImpresora());
    } else if (metodo === 'usb_trigger') {
      await abrirCajonUsbSerial(); // usa la patada ESC/POS por defecto en el nativo
    } else {
      // 'ninguno': no hace nada (botón oculto / cajón manual).
      return { ok: true, metodo: 'ninguno' };
    }
    return { ok: true, metodo };
  } catch (err) {
    const msg = (err && err.message) ? err.message : 'No se pudo abrir el cajón.';
    toast.error('Cajón: ' + msg);
    throw err;
  }
}

export const METODOS_CAJON = ['ninguno', 'usb_trigger', 'kick_impresora'];

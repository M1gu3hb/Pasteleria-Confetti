/**
 * Selector de impresora USB (Configuración → Operación → Impresora y cajón).
 *
 * "Detectar impresoras USB" lista todo lo conectado. Un lector de códigos (teclado HID) NO debe
 * poder guardarse como impresora:
 *   - APK 1.3.0+ (respuesta.clasificado): el nativo informa `tipo` y `seleccionable` a partir de
 *     las interfaces USB y de los teclados que Android reconoce. Se respeta tal cual; una térmica
 *     de clase propietaria (0xFF con salida bulk) sigue siendo elegible.
 *   - APK anterior: sólo se habilita lo que expone interfaz de clase impresora. Esa versión imprime
 *     con DantSu 3.4.0, que únicamente abre interfaces de clase Printer: cualquier otro dispositivo
 *     (lector, teclado, o térmica propietaria) nunca podría imprimir ahí, así que no se excluye nada
 *     que funcionara.
 */
export const ETIQUETA_TIPO_USB = {
  impresora: 'Impresora',
  propietaria: 'Impresora (interfaz del fabricante)',
  lector_teclado: 'Lector o teclado: no es impresora',
  otro: 'No es impresora',
  sin_interfaz: 'Sin interfaz de impresora (no compatible con esta versión de la app)',
};

export function clasificarDispositivosUSB(respuesta) {
  const lista = Array.isArray(respuesta?.dispositivos) ? respuesta.dispositivos.filter(d => d && typeof d === 'object') : [];
  const clasificado = respuesta?.clasificado === true;
  return lista.map(d => {
    const tipo = clasificado ? (typeof d.tipo === 'string' ? d.tipo : 'otro') : (d.esImpresora === true ? 'impresora' : 'sin_interfaz');
    const seleccionable = clasificado ? d.seleccionable === true && ['impresora', 'propietaria'].includes(tipo) : d.esImpresora === true;
    return { ...d, tipo, seleccionable };
  }).sort((a, b) => (Number(b.seleccionable) - Number(a.seleccionable)) || (Number(b.tipo === 'impresora') - Number(a.tipo === 'impresora')));
}

/** La elección guardada apunta a un dispositivo detectado que NO es impresora. */
export function eleccionInvalida(cfg, dispositivos) {
  if (cfg?.usbVendorId == null || cfg?.usbProductId == null) return null;
  const d = (dispositivos || []).find(x => x.vendorId === cfg.usbVendorId && x.productId === cfg.usbProductId);
  return d && !d.seleccionable ? d : null;
}

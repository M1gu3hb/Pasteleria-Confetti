/** @param {unknown} value */
export function normalizeBarcode(value) {
  return typeof value === 'string' ? value.replace(/^[\s\u0000-\u001f\u007f]+|[\s\u0000-\u001f\u007f]+$/g, '') : '';
}
/** @param {unknown} value */
export function validBarcode(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(typeof value === 'string' ? value : '');
}
/** Immutable update: burst scans must always use the latest cart. */
export function addBarcodeProduct(items, product) {
  const index = items.findIndex(i => i.producto_id === product.id && !i.tipo_venta && Number(i.precio_venta) === Number(product.precio_venta));
  if (index >= 0) return items.map((item, i) => i === index ? { ...item, cantidad: item.cantidad + 1 } : item);
  return [...items, { producto_id: product.id, nombre: product.nombre, precio_venta: product.precio_venta,
    costo: product.costo_calculado_actual || 0, area_preparacion: product.area_preparacion, cantidad: 1, notas: '' }];
}
/** Each terminated frame is an intentional scan; never deduplicate by code/time.
 * @param {(code:string)=>void} onScan
 * @param {{maxGap?:number|(()=>number)}} options
 */
export function createBarcodeReader(onScan, { maxGap = 250 } = {}) {
  let buffer = '', last = null, rejected = false;
  const reset = () => { buffer = ''; last = null; rejected = false; };
  return {
    reset,
    discard() { buffer = ''; last = null; rejected = true; },
    get buffer() { return buffer; },
    feed(key, now, repeat = false) {
      if (repeat) return null;
      if (key === 'Enter') {
        const value = buffer;
        const gap = typeof maxGap === 'function' ? maxGap() : maxGap;
        const ok = !rejected && last !== null && now >= last && now - last <= gap && validBarcode(value);
        reset();
        if (ok) { onScan(value); return value; }
        return null;
      }
      if (key === 'Escape' || key === 'Tab') { reset(); return null; }
      if (key.length !== 1) return null;
      const gap = typeof maxGap === 'function' ? maxGap() : maxGap;
      if (last !== null && (now < last || now - last > gap)) rejected = true; // discard whole frame, never its suffix
      last = now;
      if (buffer.length < 65) buffer += key;
      if (buffer.length > 64) rejected = true;
      return null;
    },
  };
}

/** Ordered scans; stale responses cannot add to a new sale or branch. */
export function createScanQueue({ lookup, onProduct, onError, onPending }) {
  let epoch = 0, pending = 0, chain = Promise.resolve();
  const clear = () => { epoch++; pending = 0; chain = Promise.resolve(); onPending(0); };
  return {
    clear,
    get pending() { return pending; },
    enqueue(code, branch) {
      const current = epoch;
      pending++;onPending(pending);
      chain = chain.then(async () => {
        if (current !== epoch) return;
        try {
          const products = await lookup(code, branch);
          if (current !== epoch) return;
          if (products.length !== 1) throw new Error(products.length ? 'Código ambiguo. Administración debe revisar las etiquetas antes de usarlo.' : `Código ${code}: producto no disponible en esta sucursal.`);
          onProduct(products[0],branch);
        } catch (error) { if (current === epoch) onError(error); }
        finally { if (current === epoch) { pending--;onPending(pending); } }
      });
      return chain;
    },
  };
}

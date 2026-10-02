// One queue for the complete job: render/connect/write/cut/disconnect, shared
// by receipts, cuts, test jobs and the cash drawer. A rejection cannot poison
// subsequent jobs. Never release the queue on a JS timeout while native I/O
// might still be writing: its result would be uncertain and jobs could overlap.
let cola = Promise.resolve();

export function encolarImpresion(accion, signal) {
  const trabajo = cola.then(async () => {
    if (signal?.aborted) throw new Error('Impresión cancelada antes de comenzar.');
    return accion();
  });
  cola = trabajo.then(() => undefined, () => undefined);
  return trabajo;
}

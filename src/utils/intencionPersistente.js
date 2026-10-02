// Recover the exact original request after a response lost following COMMIT.
const enCurso = new Map();
export async function ejecutarIntencion(slot, solicitud, ejecutar) {
  if (enCurso.has(slot)) return enCurso.get(slot);
  const trabajo = (async () => {
    const storageKey = `confetti:intencion:v1:${slot}`;
    let anterior;
    try { anterior = JSON.parse(localStorage.getItem(storageKey) || 'null'); }
    catch { throw new Error('No se puede recuperar la operación pendiente. No se realizó otro cobro.'); }
    const intencion = anterior || { ...solicitud, clave: crypto.randomUUID() };
    localStorage.setItem(storageKey, JSON.stringify(intencion));
    let resultado;
    try { resultado = await ejecutar(intencion); }
    catch (error) {
      if (error?.definitivo) localStorage.removeItem(storageKey);
      throw error;
    }
    localStorage.removeItem(storageKey);
    return { ...resultado, montoRegistrado: Number(intencion.monto) || 0, intencionRecuperada: !!anterior };
  })();
  enCurso.set(slot, trabajo);
  try { return await trabajo; } finally { enCurso.delete(slot); }
}

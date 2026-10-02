import { supabase, ensureSession } from '@/api/supabaseClient';
import { ejecutarIntencion as persistir } from '@/utils/intencionPersistente';
export function claveIntencion(tipo, sucursalId, usuarioId) {
  return `${tipo}:${sucursalId || ''}:${usuarioId || ''}`;
}
export async function ejecutarIntencion(scope, rpc, parametros, campoClave = 'p_clave') {
  await ensureSession();
  const res = await persistir(scope, { rpc, parametros }, async (intencion) => {
    const solicitud = { ...intencion.parametros, [campoClave]: intencion.clave };
    const { data, error } = await supabase.rpc(intencion.rpc, solicitud);
    if (error) {
      /** @type {Error & {definitivo?: boolean}} */
      const fallo = new Error(error.message || 'Reintenta para confirmar la misma operación.');
      fallo.definitivo = ['P0001','23514','23505','22P02','42501'].includes(error.code);
      throw fallo;
    }
    if (!data?.venta?.id || !Array.isArray(data.detalles)) throw new Error('Respuesta incompleta; reintenta para confirmar la misma venta.');
    return { data, parametros: solicitud };
  });
  return { ...res, recuperada: res.intencionRecuperada };
}

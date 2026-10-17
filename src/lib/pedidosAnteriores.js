import { supabase, ensureSession } from '@/api/supabaseClient';

// Cada respuesta es una página real del servidor, con conteos de la sucursal.
// El cursor incluye el límite de creación capturado en la primera página.
export async function cargarPaginaPedidos({ sucursal, vista, filtros, cursor = null, limite = 50 }) {
  await ensureSession();
  const { data, error } = await supabase.rpc('listar_pedidos_pastel_pos', {
    p_sucursal: sucursal || null, p_vista: vista, p_filtros: filtros,
    p_limite: limite, p_cursor: cursor,
  });
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data.pedidos) || !data.conteos || typeof data.hay_mas !== 'boolean' ||
      !Number.isSafeInteger(data.total) || data.total < 0 || (data.hay_mas && (!data.siguiente || !data.pedidos.length || data.siguiente.id === cursor?.id))) {
    throw new Error('La lista de pedidos llegó incompleta. Reintenta.');
  }
  if (data.pedidos.some(p => !p?.id || (sucursal && p.sucursal_id !== sucursal))) {
    throw new Error('No se pudo verificar la sucursal de los pedidos.');
  }
  return data;
}

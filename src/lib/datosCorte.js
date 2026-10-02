import { supabase, ensureSession } from '@/api/supabaseClient';

// Única consulta para visor, descarga automática e impresión térmica.
export async function cargarDatosCorte(corte) {
  if (!corte?.id || !corte?.sucursal_id) throw new Error('El corte no tiene una sucursal verificable.');
  await ensureSession();
  const { data, error } = await supabase.rpc('datos_corte_pos', { p_corte_id: corte.id });
  if (error) throw new Error(error.message);
  if (!data?.corte || data.corte.id !== corte.id || data.corte.sucursal_id !== corte.sucursal_id) throw new Error('No se pudo verificar el corte y su sucursal.');
  for (const key of ['ventas', 'cancelaciones', 'detalles', 'detallesCancel', 'gastos', 'abonos', 'entregas']) {
    if (!Array.isArray(data[key])) throw new Error(`Consulta incompleta: ${key}.`);
  }
  return { ...data, ingredientes: [], alertas: [] }; // Confetti Esencial no utiliza escandallos.
}

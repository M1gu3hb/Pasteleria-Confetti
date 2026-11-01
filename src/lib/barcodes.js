import { supabase, ensureSession } from '@/api/supabaseClient';
import { normalizeBarcode, validBarcode } from './barcodeCore';

function barcodeError(error) {
  const text = String(error?.message || error || 'No se pudo completar la operación.');
  if (/CODIGO_YA_RESERVADO|productos_codigo_barras_unique|codigos_producto_reservados_pkey/.test(text)) return new Error('Este código ya pertenece a otro producto o está retirado. No se reasignó.');
  if (/PREFIJO_INTERNO_RESERVADO/.test(text)) return new Error('Los códigos CF están reservados al generador de Confetti.');
  if (/SOLO_ADMINISTRACION|SUCURSAL_AJENA/.test(text)) return new Error('Tu sesión no permite modificar este producto.');
  if (/CODIGO_INVALIDO/.test(text)) return new Error('Código inválido: usa entre 2 y 64 letras, números o . _ / -');
  return new Error(text);
}
export async function assignBarcode(productId, code = '', generate = false) {
  const normalized = normalizeBarcode(code);
  if (!generate && normalized && !validBarcode(normalized)) throw barcodeError('CODIGO_INVALIDO');
  await ensureSession();
  const { data, error } = await supabase.rpc('asignar_codigo_producto_pos', { p_producto: productId, p_codigo: normalized || null, p_generar: generate });
  if (error) throw barcodeError(error);
  const row = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (!row?.id || row.id !== productId) throw new Error('No se pudo verificar el código guardado. Actualiza el catálogo antes de imprimir.');
  return row;
}
async function lookupCurrentBarcode(code, branch) {
  if (!branch || !validBarcode(code)) throw new Error('Lectura incompleta o sucursal no seleccionada.');
  await ensureSession();
  const { data, error } = await supabase.rpc('buscar_producto_codigo_pos', { p_codigo: normalizeBarcode(code), p_sucursal: branch });
  if (error) throw barcodeError(error);
  if (!Array.isArray(data)) throw new Error('Respuesta de catálogo incompleta. Reintenta.');
  const expected=normalizeBarcode(code);
  for (const row of data) {
    if (!row?.id || typeof row.nombre !== 'string' || row.codigo_barras !== expected || row.activo !== true || row.visible_en_pos !== true ||
        row.precio_venta == null || !Number.isFinite(Number(row.precio_venta)) || Number(row.precio_venta)<0 ||
        (row.sucursal_ids?.length && !row.sucursal_ids.includes(branch))) throw new Error('El catálogo devolvió un producto inválido. Actualiza y vuelve a escanear.');
  }
  return data;
}

/** Never leave checkout waiting indefinitely when the network stalls. */
export async function lookupBarcode(code, branch) {
  let timer;
  try {
    return await Promise.race([lookupCurrentBarcode(code,branch),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('El lector no pudo consultar el catálogo a tiempo. Revisa la conexión y vuelve a escanear.')),15000);})]);
  } finally {clearTimeout(timer);}
}

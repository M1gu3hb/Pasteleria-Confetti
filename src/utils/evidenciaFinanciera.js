import { supabase, ensureSession } from '@/api/supabaseClient';

export function fechaEvidencia(valor) {
  if (!valor || !Number.isFinite(Date.parse(valor))) return 'Sin fecha registrada';
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(valor)) + ' CDMX';
}

export function importeEvidencia(valor) {
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return 'Sin importe registrado';
  return '$' + Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Full, explicit history; any failed/invalid/repeated page rejects the result. */
export async function cargarHistorialEvidencia(entidad, registro) {
  await ensureSession();
  const eventos = [], ids = new Set();
  let antes = null, hasta = null;
  for (;;) {
    const { data, error } = await supabase.rpc('historial_evidencia_pos', { p_entidad: entidad, p_registro: registro, p_antes: antes, p_hasta: hasta });
    if (error) throw new Error('No se pudo leer la bitácora completa. Reintenta.');
    if (!data || !Array.isArray(data.eventos) || !/^\d+$/.test(data.hasta) || (hasta !== null && data.hasta !== hasta) || (data.siguiente !== null && !/^[1-9]\d*$/.test(data.siguiente))) throw new Error('La bitácora está incompleta.');
    hasta = data.hasta;
    let anterior = antes === null ? BigInt(hasta) + 1n : BigInt(antes);
    for (const e of data.eventos) {
      if (!e || !/^[1-9]\d*$/.test(e.id) || ids.has(e.id) || BigInt(e.id) >= anterior || BigInt(e.id) > BigInt(hasta) || !e.registrado_en || !['OBSERVADO', 'INSERT', 'UPDATE', 'DELETE'].includes(e.accion)) throw new Error('La bitácora contiene una página inválida.');
      anterior = BigInt(e.id); ids.add(e.id); eventos.push(e);
    }
    if (data.siguiente === null) return eventos;
    if (!data.eventos.length || data.siguiente !== data.eventos[data.eventos.length - 1].id) throw new Error('La bitácora no avanzó.');
    antes = data.siguiente;
  }
}

export function cambiosEvidencia(evento) {
  const campos = ['estado', 'total', 'total_final', 'monto', 'total_abonado', 'saldo_pendiente', 'monto_devuelto', 'metodo_pago', 'tipo_cancelacion', 'motivo_cancelacion', 'folio', 'sucursal_id', 'corte_caja_id', 'cantidad', 'subtotal'];
  return campos.filter(k => JSON.stringify(evento.anterior?.[k]) !== JSON.stringify(evento.posterior?.[k]))
    .map(k => `${k.replaceAll('_', ' ')}: ${evento.anterior?.[k] ?? '—'} → ${evento.posterior?.[k] ?? '—'}`).join('; ') || 'Estado financiero conservado';
}

export async function cargarEvidenciaPago(pedidoId, ventaId) {
  await ensureSession();
  const { data, error } = await supabase.rpc('conciliacion_operativa_pos', { p_sucursal: null });
  if (error || !Array.isArray(data?.pagos_con_venta_cancelada)) throw new Error('No se pudo consultar la evidencia actual del pago.');
  const pago = data.pagos_con_venta_cancelada.find(x => x.pedido_id === pedidoId && x.venta_id === ventaId);
  if (!pago || !['monto', 'saldo_pedido', 'abonado_pedido', 'devuelto_registrado', 'devoluciones_libro'].every(k => typeof pago[k] === 'number' && Number.isFinite(pago[k])) || !Array.isArray(pago.pedidos_relacionados)) throw new Error('El pago cambió o su evidencia está incompleta. Actualiza la conciliación.');
  return { pago, eventos: await cargarHistorialEvidencia('pedidos', pedidoId) };
}

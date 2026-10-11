// Horas locales de entrega (24 h), sin convertirlas a la zona del dispositivo.
// No inferir AM/PM ni modificar pedidos históricos con hora ausente o inválida.
/** @param {unknown} hora @returns {number | null} */
export function segundosHoraEntrega(hora) {
  if (typeof hora !== 'string') return null;
  const partes = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hora.trim());
  if (!partes) return null;
  const h = Number(partes[1]);
  const m = Number(partes[2]);
  const s = Number(partes[3] || 0);
  return h < 24 && m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
}

/** @param {unknown} hora @param {string} filtro */
export function coincideHorarioEntrega(hora, filtro) {
  if (filtro === 'todos') return true;
  const segundos = segundosHoraEntrega(hora);
  if (filtro === 'sin_hora') return segundos === null;
  if (segundos === null) return false;
  if (filtro === 'manana') return segundos < 12 * 3600;
  if (filtro === 'tarde') return segundos >= 12 * 3600 && segundos < 18 * 3600;
  if (filtro === 'noche') return segundos >= 18 * 3600;
  return false;
}

/** @typedef {{id?: string, fecha_entrega?: string | null, hora_entrega?: string | null}} PedidoHorario */
/** @param {PedidoHorario} a @param {PedidoHorario} b */
export function compararEntregaPedidos(a, b) {
  const fecha = (a.fecha_entrega || '\uffff').localeCompare(b.fecha_entrega || '\uffff');
  if (fecha) return fecha;
  // La hora ausente va después de las 23:59:59, dentro de su misma fecha.
  const hora = (segundosHoraEntrega(a.hora_entrega) ?? 86400) -
    (segundosHoraEntrega(b.hora_entrega) ?? 86400);
  return hora || String(a.id || '').localeCompare(String(b.id || ''));
}

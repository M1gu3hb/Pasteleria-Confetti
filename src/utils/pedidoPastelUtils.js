// Utilidades del módulo Pedidos de Pastel Personalizado (Fase 3).
// Sin dependencias de caja/ventas — módulo aislado.
import { supabase, ensureSession } from '@/api/supabaseClient';

export const ESTADOS_PEDIDO = {
  pendiente:    { label: 'Pendiente',    badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  confirmado:   { label: 'Confirmado',   badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  con_anticipo: { label: 'Con anticipo', badge: 'bg-orange-100 text-orange-800 border-orange-300' },
  pagado:       { label: 'Pagado',       badge: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  entregado:    { label: 'Entregado',    badge: 'bg-emerald-200 text-emerald-900 border-emerald-400' },
  cancelado:    { label: 'Cancelado',    badge: 'bg-red-100 text-red-700 border-red-300 line-through' },
};

// Fecha de entrega expresada como día de CDMX, independiente de la zona del dispositivo.
export function fechaCDMX(diasDesdeHoy = 0, ahora = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ahora).map(({ type, value }) => [type, value]));
  const dia = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + diasDesdeHoy));
  return dia.toISOString().slice(0, 10);
}

function parseJsonObj(str) {
  try {
    const o = JSON.parse(str || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

// Precio por kilo efectivo para una sucursal según la configuración.
export function getPrecioKilo(config, sucursalId) {
  const global = Number(config?.precio_kilo_global);
  const def = Number.isFinite(global) && global > 0 ? global : 350;
  if (config?.precio_kilo_es_global !== false) return def;
  const mapa = parseJsonObj(config?.precio_kilo_por_sucursal);
  const v = Number(mapa[sucursalId]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

// Ratio personas/kilo efectivo para una sucursal.
export function getRatioPersonas(config, sucursalId) {
  const global = Number(config?.ratio_personas_por_kilo);
  const def = Number.isFinite(global) && global > 0 ? global : 10;
  if (config?.ratio_personas_es_global !== false) return def;
  const mapa = parseJsonObj(config?.ratio_personas_por_sucursal);
  const v = Number(mapa[sucursalId]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

// Los folios se reservan en PostgreSQL, sin lectores/escritores cliente del contador.
async function reservarFolio(tipo, sucursalId) {
  await ensureSession();
  const { data, error } = await supabase.rpc('reservar_folio_pos', { p_tipo: tipo, p_sucursal_id: sucursalId });
  if (error) throw new Error(error.message);
  return data;
}
export async function generarFolioPedido(sucursalId) { return reservarFolio('pedido_pastel', sucursalId); }

// Link wa.me con mensaje prellenado.
export function buildWhatsAppLink(pedido) {
  if (!pedido) return '#';
  const tel = String(pedido.cliente_telefono || '').replace(/\D/g, '');
  const num = tel.length === 10 ? `52${tel}` : tel;
  const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const msg =
    `Hola ${pedido.cliente_nombre || ''}, tu pedido en Pastelería Confetti quedó registrado con el folio ${pedido.folio}.\n` +
    `📅 Entrega: ${pedido.fecha_entrega || ''} ${pedido.hora_entrega || ''}\n` +
    `🎂 ${pedido.kilos || 0}kg${pedido.concepto ? ` - ${pedido.concepto}` : ''}\n` +
    `💰 Total: ${fmt(pedido.total_final)}\n` +
    `💵 Abonado: ${fmt(pedido.total_abonado ?? pedido.a_cuenta)} | Resta: ${fmt(pedido.saldo_pendiente ?? pedido.resta)}\n` +
    `¡Gracias por tu preferencia! 🎉`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

// Link mailto: con asunto y cuerpo prellenados (solo texto, sin imagen).
export function buildMailtoLink(pedido) {
  if (!pedido) return '#';
  const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const email = String(pedido.cliente_email || '').trim();
  const subject = `Pastelería Confetti — Pedido ${pedido.folio || ''}`;
  const lineas = [
    `Hola ${pedido.cliente_nombre || ''},`,
    '',
    `Tu pedido en Pastelería Confetti quedó registrado.`,
    `Folio: ${pedido.folio || ''}`,
    `Entrega: ${pedido.fecha_entrega || ''} ${pedido.hora_entrega || ''}`.trim(),
    `Pastel: ${pedido.kilos || 0} kg${pedido.concepto ? ` - ${pedido.concepto}` : ''}`,
    pedido.rellenos ? `Relleno: ${pedido.rellenos}` : null,
    pedido.decorado ? `Decorado: ${pedido.decorado}` : null,
    '',
    `Total: ${fmt(pedido.total_final)}`,
    `Abonado: ${fmt(pedido.total_abonado ?? pedido.a_cuenta)} | Resta: ${fmt(pedido.saldo_pendiente ?? pedido.resta)}`,
    '',
    `¡Gracias por tu preferencia!`,
  ].filter(l => l !== null);
  const body = lineas.join('\n');
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function generarFolioVenta(sucursalId) { return reservarFolio('venta', sucursalId); }
export async function generarFolioCorte(sucursalId, _prefijo = '') { return reservarFolio('corte', sucursalId); }

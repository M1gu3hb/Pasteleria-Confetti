// Utilidades del módulo Pedidos de Pastel Personalizado (Fase 3).
// Sin dependencias de caja/ventas — módulo aislado.
import { base44 } from '@/api/base44Client';

export const ESTADOS_PEDIDO = {
  pendiente:    { label: 'Pendiente',    badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  confirmado:   { label: 'Confirmado',   badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  con_anticipo: { label: 'Con anticipo', badge: 'bg-orange-100 text-orange-800 border-orange-300' },
  pagado:       { label: 'Pagado',       badge: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  entregado:    { label: 'Entregado',    badge: 'bg-emerald-200 text-emerald-900 border-emerald-400' },
  cancelado:    { label: 'Cancelado',    badge: 'bg-red-100 text-red-700 border-red-300 line-through' },
};

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

// Genera el siguiente folio PP-[PREFIJO]-NNNN para la sucursal.
// Si la query falla, fallback con timestamp corto.
export async function generarFolioPedido(sucursalId, prefijo) {
  const pref = (prefijo || 'X').toUpperCase();
  try {
    const contadores = await base44.entities.FolioContador.filter({
      tipo: 'pedido_pastel',
      sucursal_id: sucursalId
    });
    let contador = Array.isArray(contadores) && contadores.length > 0
      ? contadores[0] : null;

    if (!contador) {
      // Inicialización: leer el máximo folio existente en esa sucursal
      const previos = await base44.entities.PedidoPastel.filter(
        { sucursal_id: sucursalId }, '-created_date', 200
      );
      const arr = Array.isArray(previos) ? previos : [];
      let max = 0;
      arr.forEach(p => {
        const m = String(p?.folio || '').match(/PP-[A-Z0-9]+-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
      });
      contador = await base44.entities.FolioContador.create({
        tipo: 'pedido_pastel',
        sucursal_id: sucursalId,
        prefijo: pref,
        ultimo_numero: max
      });
    }

    // PARTE G — anti-race: verificamos que el folio de pedido no exista ya.
    const MAX_INTENTOS = 5;
    for (let i = 0; i < MAX_INTENTOS; i++) {
      const siguiente = (contador.ultimo_numero || 0) + 1;
      const folio = `PP-${pref}-${String(siguiente).padStart(4, '0')}`;
      const pedidosConFolio = await base44.entities.PedidoPastel.filter({ folio }, null, 1);
      await base44.entities.FolioContador.update(contador.id, { ultimo_numero: siguiente });
      contador = { ...contador, ultimo_numero: siguiente };
      if (Array.isArray(pedidosConFolio) && pedidosConFolio.length > 0) {
        continue;
      }
      return folio;
    }
    throw new Error('No se pudo generar un folio único de pedido tras varios intentos.');
  } catch (err) {
    console.warn('[FolioContador] fallback timestamp:', err);
    return `PP-${pref}-${Date.now().toString().slice(-6)}`;
  }
}

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
    `💵 Anticipo: ${fmt(pedido.a_cuenta)} | Resta: ${fmt(pedido.resta)}\n` +
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
    `Anticipo: ${fmt(pedido.a_cuenta)} | Resta: ${fmt(pedido.resta)}`,
    '',
    `¡Gracias por tu preferencia!`,
  ].filter(l => l !== null);
  const body = lineas.join('\n');
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─── Fase 5: folios para Venta y CorteCaja ─────────────────────────

export async function generarFolioVenta(sucursalId, prefijo) {
  const pref = (prefijo || 'X').toUpperCase();
  try {
    // PARTE G — anti-race: si dos cajeros cobran a la vez, verificamos que el
    // folio no exista ya antes de reservarlo. Si colisiona, incrementamos y
    // reintentamos hasta MAX_INTENTOS.
    const MAX_INTENTOS = 5;
    const contadores = await base44.entities.FolioContador.filter({
      tipo: 'venta',
      sucursal_id: sucursalId
    });
    let contador = Array.isArray(contadores) && contadores.length > 0
      ? contadores[0] : null;
    if (!contador) {
      contador = await base44.entities.FolioContador.create({
        tipo: 'venta',
        sucursal_id: sucursalId,
        prefijo: pref,
        ultimo_numero: 0
      });
    }
    for (let i = 0; i < MAX_INTENTOS; i++) {
      const numero = (contador.ultimo_numero || 0) + 1;
      const folio = `CONF-${pref}-V${String(numero).padStart(4, '0')}`;
      const ventasConFolio = await base44.entities.Venta.filter({ folio }, null, 1);
      // Reservar el número en el contador (suba siempre, haya colisión o no).
      await base44.entities.FolioContador.update(contador.id, { ultimo_numero: numero });
      contador = { ...contador, ultimo_numero: numero };
      if (Array.isArray(ventasConFolio) && ventasConFolio.length > 0) {
        continue; // colisión → siguiente número
      }
      return folio;
    }
    throw new Error('No se pudo generar un folio único de venta tras varios intentos.');
  } catch (err) {
    console.warn('[FolioVenta] fallback:', err);
    return `CONF-${pref}-V${Date.now().toString().slice(-6)}`;
  }
}

export async function generarFolioCorte(sucursalId, prefijo) {
  const pref = (prefijo || 'X').toUpperCase();
  try {
    // PARTE G — anti-race: verificamos que el folio de corte no exista ya.
    const MAX_INTENTOS = 5;
    const contadores = await base44.entities.FolioContador.filter({
      tipo: 'corte',
      sucursal_id: sucursalId
    });
    let contador = Array.isArray(contadores) && contadores.length > 0
      ? contadores[0] : null;
    if (!contador) {
      contador = await base44.entities.FolioContador.create({
        tipo: 'corte',
        sucursal_id: sucursalId,
        prefijo: pref,
        ultimo_numero: 0
      });
    }
    for (let i = 0; i < MAX_INTENTOS; i++) {
      const numero = (contador.ultimo_numero || 0) + 1;
      const folio = `CONF-${pref}-C${String(numero).padStart(3, '0')}`;
      const cortesConFolio = await base44.entities.CorteCaja.filter({ folio }, null, 1);
      await base44.entities.FolioContador.update(contador.id, { ultimo_numero: numero });
      contador = { ...contador, ultimo_numero: numero };
      if (Array.isArray(cortesConFolio) && cortesConFolio.length > 0) {
        continue;
      }
      return folio;
    }
    throw new Error('No se pudo generar un folio único de corte tras varios intentos.');
  } catch (err) {
    console.warn('[FolioCorte] fallback:', err);
    return `CONF-${pref}-C${Date.now().toString().slice(-5)}`;
  }
}
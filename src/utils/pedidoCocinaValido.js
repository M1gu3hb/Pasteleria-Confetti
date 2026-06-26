// =====================================================
// utils/pedidoCocinaValido.js
// =====================================================
// BUGFIX cross-paquete / pedidos "Mostrador": define qué PedidoPreparacion
// es VÁLIDO para mostrarse en Cocina (activos e historial).
//
// CONTEXTO (datos reales auditados en el proyecto):
//  - Mesero  (pages/Mesero.jsx)   → crea PedidoPreparacion con
//      origen_pedido: 'mesero',  mesa_id presente, venta_id presente.
//  - PortalQR (utils/qrPedidoFlow.js) → crea con
//      origen_pedido: 'portal_qr', mesa_id presente, venta_id presente.
//  - POS/Mostrador (pages/POS.jsx) → ANTES creaba con
//      SIN origen_pedido (undefined), SIN mesa_id, SIN mesa_numero.
//      Esos son los pedidos que aparecían como "Mostrador" en Cocina.
//
// REGLA: Cocina pertenece SOLO al flujo Restaurante Pro y solo debe mostrar
// pedidos que vengan de Mesero o Portal QR (con venta asociada). Cualquier
// pedido de mostrador / sin origen / sin venta queda OCULTO (no se borra).
//
// Este helper NO toca BD, NO borra nada, NO afecta caja/inventario/tickets.
// Es puramente un filtro de visualización (defensivo y sin excepciones).
// =====================================================

// Orígenes que SÍ pertenecen al flujo de Cocina en Restaurante Pro.
export const ORIGENES_COCINA_VALIDOS = ['mesero', 'portal_qr'];

// Orígenes que explícitamente NO deben aparecer en Cocina (venta directa).
// NOTA: 'pos' SE QUITÓ de esta lista negra. Ahora 'pos' puede ser válido SOLO
// en Restaurante Pro y SOLO cuando el pedido viene del flujo "Para llevar"
// (lo crea POS.jsx con origen_pedido:'pos' + mesa_numero:'Para llevar'). El
// gating fuerte vive en POS.jsx: en Esencial/Operativo NUNCA se crea 'pos'.
export const ORIGENES_NO_COCINA = ['caja', 'mostrador', 'venta_directa', 'caja_directa'];

// Marcas de mesa que identifican un pedido POS válido de "Para llevar" en Pro.
export const MESA_PARA_LLEVAR = ['para llevar', 'mostrador pro'];

/**
 * Determina si un PedidoPreparacion es válido para mostrarse en Cocina.
 *
 * @param {Object} pedido            El PedidoPreparacion a evaluar.
 * @param {boolean} esRestaurantePro Si el paquete actual es 'restaurante_pro'.
 * @returns {boolean} true solo si el pedido pertenece al flujo real de Cocina Pro.
 */
export function esPedidoValidoParaCocina(pedido, esRestaurantePro) {
  // 1) Cocina solo existe en Restaurante Pro.
  if (!esRestaurantePro) return false;
  // 2) El pedido debe existir.
  if (!pedido || typeof pedido !== 'object') return false;

  const origen = String(pedido.origen_pedido || '').trim().toLowerCase();

  // 3) Origen explícitamente de mostrador/caja → NUNCA en Cocina.
  if (ORIGENES_NO_COCINA.includes(origen)) return false;

  // 4) Debe tener venta asociada (venta directa de POS sí la tiene, pero la
  //    descartamos por origen/sin-mesa abajo; los pedidos sin venta tampoco
  //    pertenecen a un flujo de mesa real).
  if (!pedido.venta_id) return false;

  // 5) Debe tener items reales (no pedidos vacíos).
  const items = Array.isArray(pedido.items) ? pedido.items : [];
  if (items.length === 0) return false;

  // 6) Origen válido explícito (mesero / portal_qr) → mostrar.
  if (ORIGENES_COCINA_VALIDOS.includes(origen)) return true;

  // 6.b) Origen 'pos' → SOLO válido en Restaurante Pro y SOLO si es un pedido
  //      "Para llevar" claramente marcado (mesa_numero textual). Un 'pos' sin
  //      esa marca = venta directa de mostrador → se oculta. (Esencial/Operativo
  //      nunca llega aquí porque POS.jsx no crea 'pos' fuera de Pro, pero igual
  //      validamos esRestaurantePro de forma defensiva.)
  if (origen === 'pos') {
    if (!esRestaurantePro) return false;
    const marcaMesa = String(pedido.mesa_numero || '').trim().toLowerCase();
    return MESA_PARA_LLEVAR.includes(marcaMesa);
  }

  // 7) Pedidos SIN origen_pedido (legacy):
  //    - Mesero y Portal QR SIEMPRE traen mesa_id.
  //    - POS/Mostrador NUNCA trae mesa_id.
  //    Por eso, para pedidos sin origen, exigimos mesa_id real como prueba de
  //    que vienen de una mesa (flujo Pro) y no de mostrador.
  if (!origen) {
    return !!pedido.mesa_id;
  }

  // 8) Cualquier otro origen desconocido → ocultar por seguridad.
  return false;
}

/**
 * Etiqueta de "mesa" para mostrar en Cocina / historial.
 *  - mesa_numero numérico   → "Mesa 5".
 *  - mesa_numero texto       → tal cual (ej. "Para llevar").
 *  - sin mesa_numero         → "Mostrador" (legacy).
 * Defensivo: nunca lanza, siempre devuelve string.
 */
export function etiquetaMesaCocina(pedido) {
  const raw = pedido?.mesa_numero;
  if (raw === null || raw === undefined || raw === '') return 'Mostrador';
  const txt = String(raw).trim();
  if (txt === '') return 'Mostrador';
  // Si es un entero puro → "Mesa N". Cualquier otro texto (Para llevar) → tal cual.
  if (/^\d+$/.test(txt)) return `Mesa ${txt}`;
  return txt;
}

/**
 * Filtra una lista de pedidos dejando solo los válidos para Cocina.
 * Siempre devuelve un array (nunca undefined) — defensivo.
 */
export function filtrarPedidosValidosCocina(pedidos, esRestaurantePro) {
  const arr = Array.isArray(pedidos) ? pedidos : [];
  if (!esRestaurantePro) return [];
  return arr.filter((p) => esPedidoValidoParaCocina(p, esRestaurantePro));
}
// =====================================================
// utils/entregaPedidos.js
// =====================================================
// F3.2: Entrega de pedidos LISTOS por estación.
//
// Reglas críticas (no romper bajo ninguna condición):
//  - SOLO marca como entregado los pedidos en estado "listo".
//  - NUNCA toca pedidos "nuevo" / "en_preparacion" / "cancelado" / ya "entregado".
//  - NO descuenta inventario.
//  - NO cobra.
//  - NO cierra venta.
//  - NO genera ticket/PDF.
//  - Devuelve un objeto resultado con métricas para que el caller decida UI/toasts.
// =====================================================

import { base44 } from '@/api/base44Client';

/**
 * Resuelve la venta activa de una mesa de forma robusta.
 * Intenta en este orden:
 *   1. ventaIdHint si viene.
 *   2. mesa.venta_activa_id.
 *   3. buscar Venta por mesa_id con estado activo.
 *
 * Devuelve { ventaId, mesa } o { ventaId: null, mesa: null }.
 */
async function resolverVentaActiva({ mesaId, ventaIdHint }) {
  let mesa = null;
  let ventaId = ventaIdHint || null;

  if (mesaId) {
    try {
      mesa = await base44.entities.Mesa.get(mesaId);
    } catch { mesa = null; }
  }

  if (!ventaId && mesa?.venta_activa_id) {
    ventaId = mesa.venta_activa_id;
  }

  if (!ventaId && mesaId) {
    // Buscar venta activa por mesa_id
    try {
      const ventas = await base44.entities.Venta.filter({ mesa_id: mesaId });
      const arr = Array.isArray(ventas) ? ventas : [];
      const activos = ['abierta', 'enviada', 'en_preparacion', 'lista', 'cuenta_solicitada'];
      const v = arr
        .filter((x) => x && activos.includes(x.estado))
        .sort((a, b) => new Date(b?.fecha_apertura || b?.created_date || 0) - new Date(a?.fecha_apertura || a?.created_date || 0))[0];
      if (v?.id) ventaId = v.id;
    } catch {}
  }

  return { ventaId, mesa };
}

/**
 * Marca como entregados SOLO los pedidos que están en estado "listo".
 * Si después de entregar ya no quedan pedidos activos (nuevo/en_preparacion/listo),
 * la mesa vuelve a 'ocupada'.
 *
 * @param {Object} opts
 * @param {string} opts.mesaId        ID de la mesa.
 * @param {string} [opts.ventaId]     Hint del id de venta (recomendado).
 * @param {string[]} [opts.pedidoIds] Si se pasa, solo entrega ESOS pedidos
 *                                    (siguen filtrándose por estado === 'listo').
 *                                    Útil para "entregar solo una estación".
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   entregados: number,
 *   estaciones: string[],          // nombres de estaciones entregadas
 *   pedidoIdsEntregados: string[], // ids de los pedidos actualizados
 *   mesaCambiada: boolean,         // si la mesa cambió de estado
 *   mensaje: string,
 * }>}
 */
export async function entregarPedidosListosDeMesa({ mesaId, ventaId, pedidoIds }) {
  const resultado = {
    ok: false,
    entregados: 0,
    estaciones: [],
    pedidoIdsEntregados: [],
    mesaCambiada: false,
    mensaje: '',
  };

  if (!mesaId) {
    resultado.mensaje = 'No hay mesa activa.';
    return resultado;
  }

  const { ventaId: ventaIdResuelto, mesa } = await resolverVentaActiva({ mesaId, ventaIdHint: ventaId });

  if (!ventaIdResuelto) {
    resultado.mensaje = 'No se encontró venta activa para esta mesa.';
    return resultado;
  }

  // Buscar pedidos de la venta. Si filter falla, fallback por mesa_id.
  let pedidos = [];
  try {
    pedidos = await base44.entities.PedidoPreparacion.filter({ venta_id: ventaIdResuelto });
  } catch {
    pedidos = [];
  }
  if (!Array.isArray(pedidos)) pedidos = [];

  // Si no encontramos por venta, intentar por mesa (defensa)
  if (pedidos.length === 0) {
    try {
      const porMesa = await base44.entities.PedidoPreparacion.filter({ mesa_id: mesaId });
      pedidos = Array.isArray(porMesa) ? porMesa : [];
    } catch { pedidos = []; }
  }

  // Filtrar SOLO los pedidos en estado "listo".
  let candidatos = pedidos.filter((p) => p?.estado === 'listo');

  // Si pidieron entregar solo pedidos específicos, restringir.
  if (Array.isArray(pedidoIds) && pedidoIds.length > 0) {
    const wanted = new Set(pedidoIds);
    candidatos = candidatos.filter((p) => wanted.has(p?.id));
  }

  // HOTFIX MÓVIL — Reintento si no encontramos pedidos listos.
  // El card del Mesero puede mostrar "Listo para recoger" gracias al latch
  // local mientras el backend todavía no propaga el cambio a este filter.
  // Reintentamos 1 vez tras 600ms antes de devolver "no hay pedidos listos",
  // evitando el falso negativo "no hay pedidos para entregar" en móvil.
  if (candidatos.length === 0) {
    await new Promise((res) => setTimeout(res, 600));
    let pedidosRetry = [];
    try {
      pedidosRetry = await base44.entities.PedidoPreparacion.filter({ venta_id: ventaIdResuelto });
    } catch { pedidosRetry = []; }
    if (!Array.isArray(pedidosRetry)) pedidosRetry = [];
    // Si el reintento también vino vacío, intentar por mesa como defensa.
    if (pedidosRetry.length === 0 && mesaId) {
      try {
        const porMesa = await base44.entities.PedidoPreparacion.filter({ mesa_id: mesaId });
        pedidosRetry = Array.isArray(porMesa) ? porMesa : [];
      } catch { pedidosRetry = []; }
    }
    let candidatosRetry = pedidosRetry.filter((p) => p?.estado === 'listo');
    if (Array.isArray(pedidoIds) && pedidoIds.length > 0) {
      const wanted = new Set(pedidoIds);
      candidatosRetry = candidatosRetry.filter((p) => wanted.has(p?.id));
    }
    if (candidatosRetry.length > 0) {
      pedidos = pedidosRetry;
      candidatos = candidatosRetry;
    } else {
      resultado.mensaje = 'No hay pedidos listos para entregar.';
      return resultado;
    }
  }

  const ahora = new Date().toISOString();

  // Update en paralelo. Cada uno tiene su propio try/catch para no fallar el lote.
  const updates = await Promise.all(
    candidatos.map(async (p) => {
      try {
        await base44.entities.PedidoPreparacion.update(p.id, {
          estado: 'entregado',
          fecha_entregado: ahora,
        });
        return { ok: true, pedido: p };
      } catch (e) {
        console.warn('[entregaPedidos] update fail', p?.id, e);
        return { ok: false, pedido: p, error: e };
      }
    })
  );

  const exitosos = updates.filter((u) => u.ok).map((u) => u.pedido);
  resultado.entregados = exitosos.length;
  resultado.pedidoIdsEntregados = exitosos.map((p) => p.id);
  resultado.estaciones = [
    ...new Set(
      exitosos
        .map((p) => p?.estacion_preparacion_nombre || '')
        .filter(Boolean)
    ),
  ];

  if (exitosos.length === 0) {
    resultado.mensaje = 'No se pudo entregar ningún pedido. Intenta de nuevo.';
    return resultado;
  }

  // ¿Quedan otros pedidos activos (nuevo/en_preparacion/listo) tras este update?
  const idsEntregados = new Set(resultado.pedidoIdsEntregados);
  const restantesActivos = pedidos.filter(
    (p) =>
      p &&
      !idsEntregados.has(p.id) &&
      !['entregado', 'cancelado'].includes(p?.estado)
  );

  // Actualizar estado de la mesa SOLO si ya no quedan pedidos activos pendientes.
  // No tocamos venta, no cerramos, no cobramos.
  if (restantesActivos.length === 0 && mesa?.estado) {
    // Si la mesa estaba en 'en_espera_entrega' o 'lista' o equivalente,
    // volverla a 'ocupada' para indicar que sigue ocupada pero sin pedidos en cocina.
    // No tocamos si la mesa ya está en 'cuenta_solicitada' / 'pagada'.
    const estadosNoTocar = ['cuenta_solicitada', 'pagada', 'cancelada', 'libre', 'limpieza'];
    if (!estadosNoTocar.includes(mesa.estado)) {
      try {
        await base44.entities.Mesa.update(mesaId, { estado: 'ocupada' });
        resultado.mesaCambiada = true;
      } catch (e) {
        console.warn('[entregaPedidos] mesa update fail', e);
      }
    }
  }

  resultado.ok = true;
  if (resultado.estaciones.length === 1) {
    resultado.mensaje = `Entregado: ${resultado.estaciones[0]}.`;
  } else if (resultado.estaciones.length > 1) {
    resultado.mensaje = `Entregado: ${resultado.estaciones.join(' y ')}.`;
  } else {
    resultado.mensaje = `Entregado (${resultado.entregados}).`;
  }

  return resultado;
}
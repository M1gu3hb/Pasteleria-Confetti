import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Limpia ventas, detalles, pedidos, descuentos y cortes (datos de PRUEBA).
 * Solo administrador.
 *
 * Optimizaciones contra timeout 500:
 * - Borrados en PARALELO (Promise.allSettled con concurrencia controlada).
 * - Cada error individual se contabiliza, no rompe el resto.
 * - Devuelve status 200 incluso si hay errores parciales.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body?.rol !== 'administrador') {
      return Response.json({ ok: false, error: 'Forbidden: solo administrador' }, { status: 200 });
    }

    const revertirInventario = body?.revertirInventario === true;
    const counts = {
      ventas: 0, detalles: 0, pedidos: 0, descuentos: 0, cortes: 0,
      mesas_reset: 0, movimientos_borrados: 0, ingredientes_revertidos: 0,
      errors: 0,
    };

    // Borra todos los registros de un entity en paralelo (concurrencia 10)
    async function deleteAllParallel(entityName, limit = 1000) {
      let deleted = 0;
      try {
        const items = await base44.asServiceRole.entities[entityName].list('-created_date', limit);
        if (!Array.isArray(items) || items.length === 0) return 0;

        const CHUNK = 10;
        for (let i = 0; i < items.length; i += CHUNK) {
          const slice = items.slice(i, i + CHUNK);
          const results = await Promise.allSettled(
            slice.map(it => base44.asServiceRole.entities[entityName].delete(it.id))
          );
          for (const r of results) {
            if (r.status === 'fulfilled') deleted++;
            else counts.errors++;
          }
        }
      } catch (e) {
        console.error(`Error listando ${entityName}:`, e?.message);
      }
      return deleted;
    }

    // 1. Revertir inventario (opcional, antes de borrar descuentos)
    if (revertirInventario) {
      try {
        const descuentosAll = await base44.asServiceRole.entities.DescuentoInventarioVenta.list('-created_date', 2000).catch(() => []);
        const sumas = {};
        for (const d of (Array.isArray(descuentosAll) ? descuentosAll : [])) {
          if (!d?.ingrediente_id) continue;
          sumas[d.ingrediente_id] = (sumas[d.ingrediente_id] || 0) + (d.cantidad_total_descontada || 0);
        }
        const ingsAll = await base44.asServiceRole.entities.Ingrediente.list('-created_date', 1000).catch(() => []);
        const ingMap = {};
        for (const ing of (Array.isArray(ingsAll) ? ingsAll : [])) ingMap[ing.id] = ing;

        const ingIds = Object.keys(sumas);
        const CHUNK = 8;
        for (let i = 0; i < ingIds.length; i += CHUNK) {
          const slice = ingIds.slice(i, i + CHUNK);
          const results = await Promise.allSettled(slice.map(ingId => {
            const ingObj = ingMap[ingId];
            if (!ingObj) return Promise.resolve(null);
            const nuevoStock = (ingObj.stock_actual || 0) + sumas[ingId];
            return base44.asServiceRole.entities.Ingrediente.update(ingId, { stock_actual: nuevoStock });
          }));
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value !== null) counts.ingredientes_revertidos++;
            else if (r.status === 'rejected') counts.errors++;
          }
        }

        // Borrar movimientos tipo salida_venta en paralelo
        const movs = await base44.asServiceRole.entities.MovimientoInventario.list('-created_date', 2000).catch(() => []);
        const movsSalida = (Array.isArray(movs) ? movs : []).filter(m => m?.tipo_movimiento === 'salida_venta');
        for (let i = 0; i < movsSalida.length; i += CHUNK) {
          const slice = movsSalida.slice(i, i + CHUNK);
          const results = await Promise.allSettled(
            slice.map(m => base44.asServiceRole.entities.MovimientoInventario.delete(m.id))
          );
          for (const r of results) {
            if (r.status === 'fulfilled') counts.movimientos_borrados++;
            else counts.errors++;
          }
        }
      } catch (e) {
        console.error('Error revertir inventario:', e?.message);
      }
    }

    // 2-6. Borrar entidades en paralelo (orden lógico: hijos antes que padres)
    counts.detalles = await deleteAllParallel('DetalleVenta', 2000);
    counts.pedidos = await deleteAllParallel('PedidoPreparacion', 2000);
    counts.descuentos = await deleteAllParallel('DescuentoInventarioVenta', 2000);
    counts.ventas = await deleteAllParallel('Venta', 2000);
    counts.cortes = await deleteAllParallel('CorteCaja', 500);

    // 7. Reset Mesas a libre (paralelo)
    try {
      const mesas = await base44.asServiceRole.entities.Mesa.list('-created_date', 500);
      const aResetear = (Array.isArray(mesas) ? mesas : []).filter(m =>
        m?.estado !== 'libre' || m?.venta_activa_id
      );
      const CHUNK = 10;
      for (let i = 0; i < aResetear.length; i += CHUNK) {
        const slice = aResetear.slice(i, i + CHUNK);
        const results = await Promise.allSettled(slice.map(m =>
          base44.asServiceRole.entities.Mesa.update(m.id, {
            estado: 'libre', venta_activa_id: null, personas_actuales: 0, cliente_temporal: '',
          })
        ));
        for (const r of results) {
          if (r.status === 'fulfilled') counts.mesas_reset++;
          else counts.errors++;
        }
      }
    } catch (e) {
      console.error('Error reseteando mesas:', e?.message);
    }

    return Response.json({ ok: true, counts });
  } catch (error) {
    console.error('limpiarVentas error general:', error?.message, error?.stack);
    return Response.json({ ok: false, error: error?.message || 'Error interno' }, { status: 200 });
  }
});
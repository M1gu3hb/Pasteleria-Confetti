import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Limpia historial de UNA sección específica (admin-only).
 * NO toca datos maestros (productos, recetas, ingredientes, mesas, usuarios, config).
 * NO ajusta stock automáticamente — limpiar movimientos no revierte inventario.
 *
 * Body: { seccion: 'cortes' | 'ventas' | 'compras' | 'gastos' | 'movimientos' }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdminApp = user.role === 'admin';
    const posUser = await base44.entities.UsuarioPOS.list().catch(() => []);
    const isAdminPos = posUser.some(u => u.rol === 'administrador');
    if (!isAdminApp && !isAdminPos) {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { seccion } = await req.json();
    const allowed = ['cortes', 'ventas', 'compras', 'gastos', 'movimientos'];
    if (!allowed.includes(seccion)) {
      return Response.json({ error: 'Sección inválida' }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;
    let deleted = 0;

    const bulkDelete = async (entityName, filter = {}) => {
      const records = await svc[entityName].filter(filter).catch(() => []);
      for (const r of records) {
        await svc[entityName].delete(r.id).catch(() => {});
        deleted++;
      }
    };

    if (seccion === 'cortes') {
      await bulkDelete('CorteCaja');
    } else if (seccion === 'ventas') {
      // Borrar ventas + sus detalles + descuentos asociados + pedidos preparación
      const ventas = await svc.Venta.list('-created_date', 5000).catch(() => []);
      for (const v of ventas) {
        const dets = await svc.DetalleVenta.filter({ venta_id: v.id }).catch(() => []);
        for (const d of dets) await svc.DetalleVenta.delete(d.id).catch(() => {});
        const descs = await svc.DescuentoInventarioVenta.filter({ venta_id: v.id }).catch(() => []);
        for (const d of descs) await svc.DescuentoInventarioVenta.delete(d.id).catch(() => {});
        const peds = await svc.PedidoPreparacion.filter({ venta_id: v.id }).catch(() => []);
        for (const p of peds) await svc.PedidoPreparacion.delete(p.id).catch(() => {});
        await svc.Venta.delete(v.id).catch(() => {});
        deleted++;
      }
    } else if (seccion === 'compras') {
      // Borrar compras + sus detalles
      const compras = await svc.CompraInsumo.list('-created_date', 5000).catch(() => []);
      for (const c of compras) {
        const dets = await svc.DetalleCompra.filter({ compra_id: c.id }).catch(() => []);
        for (const d of dets) await svc.DetalleCompra.delete(d.id).catch(() => {});
        await svc.CompraInsumo.delete(c.id).catch(() => {});
        deleted++;
      }
    } else if (seccion === 'gastos') {
      await bulkDelete('GastoOperativo');
    } else if (seccion === 'movimientos') {
      await bulkDelete('MovimientoInventario');
    }

    return Response.json({ ok: true, seccion, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
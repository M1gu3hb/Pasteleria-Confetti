/**
 * reiniciarSistema
 * --------------------------------------------------------------
 * Borra datos operativos del POS para dejar el sistema "pelón"
 * listo para un nuevo cliente.
 *
 * Modos:
 *   - "all"   : borra todo (productos, recetas, ingredientes, mesas, ventas,
 *               cortes, compras, gastos, etc.). Conserva al menos un admin POS
 *               y deja ConfiguracionNegocio reseteada a valores base.
 *   - "tests" : borra solo datos transaccionales (ventas, detalles, cortes,
 *               compras, gastos, propinas, pedidos cocina, solicitudes QR,
 *               movimientos, descuentos). Conserva productos, recetas,
 *               ingredientes, categorías, mesas, usuarios y configuración.
 *
 * Seguridad: solo rol "administrador" puede ejecutarlo. Requiere además
 * que el cliente envíe la palabra de confirmación correcta.
 *
 * NO toca:
 *   - Código / estructura.
 *   - UsuarioPOS administradores activos (al menos 1 se conserva).
 *   - Autenticación de Base44.
 *
 * Estable por diseño: cada bloque va en try/catch; un fallo en un bloque
 * no detiene el resto. Devuelve resumen de eliminados/errores.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ENTITIES_TESTS = [
  // 1) Detalles / movimientos / dependientes primero
  'DetalleVenta',
  'DescuentoInventarioVenta',
  'MovimientoInventario',
  'DetalleCompra',
  // 2) Pedidos y solicitudes
  'PedidoPreparacion',
  'SolicitudQR',
  // 3) Documentos / cabeceras transaccionales
  'LiquidacionPropina',
  'Venta',
  'CompraInsumo',
  'GastoOperativo',
  'CorteCaja',
  // 4) Logs de integraciones (historial transaccional)
  'IntegrationSyncLog',
];

const ENTITIES_MASTER_DATA = [
  // 5) Catálogos (después de transaccional, porque éste puede tener fk lógicas)
  'RecetaEscandallo',
  'ProductoTerminado',
  'CategoriaProducto',
  'Ingrediente',
  'CategoriaIngrediente',
  'PlantillaCompra',
  'Proveedor',
  'Cliente',
  // 6) Operativo de sala / portal
  'Mesa',
  'MenuQRSeccion',
];

const RESET_CFG = {
  nombre_negocio: 'Mi negocio',
  nombre_sistema: 'POS MH',
  platform_brand: 'MH Astral Systems',
  color_primario: '#1e40af',
  color_secundario: '#0f172a',
  color_exito: '#16a34a',
  color_alerta: '#f59e0b',
  background_opacity: 0.12,
  colorear_importes_monetarios: true,
  moneda: 'MXN',
  simbolo_moneda: '$',
  iva_porcentaje: 0,
  usa_mesas: true,
  usa_cocina: true,
  usa_barra: false,
  hora_inicio_dia_operativo: '06:00',
  mensaje_ticket: '¡Gracias por tu visita!',
  mostrar_logo_ticket: true,
  mostrar_costos_a_caja: false,
  permitir_venta_sin_stock: false,
  sonidos_activos: true,
  volumen_sonido: 0.7,
  descargar_pdf_corte_auto: true,
  formato_export_default: 'csv',
  google_sheets_enabled: false,
  google_drive_enabled: false,
  google_sheets_status: 'pending_connection',
  google_drive_status: 'pending_connection',
  auto_sync_on_cash_cut: false,
  auto_save_pdf_to_drive: false,
  auto_update_daily_summary: false,
  paquete_modo: 'restaurante_pro',
  modo_presentacion_activo: false,
  propinas_activas: true,
  propina_porcentajes_sugeridos: '5,10,15,20',
  portal_qr_activo: false,
  portal_qr_modo_menu: 'productos_pos',
  portal_qr_mostrar_precios: true,
  portal_qr_mostrar_sin_imagen: true,
  portal_qr_permitir_ordenar: true,
  portal_qr_permitir_cuenta: true,
  portal_qr_permitir_ayuda: true,
  asignacion_mesas_activa: false,
  silenciar_notificaciones_admin: true,
  // Unidades de medida — siempre presentes para clientes nuevos. La conversión
  // del POS depende de estas unidades base. Si el admin las personaliza, se
  // guardarán en el mismo campo y sobrescribirán estos defaults.
  unidades_medida_lista: 'kg, g, litro, ml, pieza, caja, paquete, bolsa, unidad',
};

async function deleteAllOfEntity(base44, entityName) {
  let deleted = 0;
  let errors = 0;
  try {
    // Paginamos por seguridad. Tomamos lotes de 500 hasta que no queden registros.
    let safety = 50; // máximo 25.000 registros por entidad — protección
    while (safety-- > 0) {
      const list = await base44.asServiceRole.entities[entityName].list('-created_date', 500);
      if (!Array.isArray(list) || list.length === 0) break;
      for (const r of list) {
        try {
          await base44.asServiceRole.entities[entityName].delete(r.id);
          deleted++;
        } catch (e) {
          errors++;
        }
      }
      if (list.length < 500) break;
    }
  } catch (e) {
    return { entity: entityName, deleted, errors: errors + 1, error: e?.message || String(e) };
  }
  return { entity: entityName, deleted, errors };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { mode, confirm, posRol, posUserId } = body || {};

    // Solo administrador POS puede ejecutar.
    if (posRol !== 'administrador') {
      return Response.json({ ok: false, error: 'Solo el administrador puede reiniciar el sistema.' }, { status: 403 });
    }

    const expectedConfirm = mode === 'all' ? 'BORRAR TODO' : 'BORRAR PRUEBAS';
    if (confirm !== expectedConfirm) {
      return Response.json({ ok: false, error: `Confirmación inválida. Debes escribir "${expectedConfirm}".` }, { status: 400 });
    }

    const results = [];

    // ===== 1) Borrar transaccional siempre =====
    for (const entity of ENTITIES_TESTS) {
      const r = await deleteAllOfEntity(base44, entity);
      results.push(r);
    }

    // ===== 2) Si es "all": borrar master data y resetear config + usuarios =====
    if (mode === 'all') {
      for (const entity of ENTITIES_MASTER_DATA) {
        const r = await deleteAllOfEntity(base44, entity);
        results.push(r);
      }

      // Reset ConfiguracionNegocio: si hay registros, conservamos el primero y
      // sobreescribimos con valores base. Si hay duplicados, los borramos.
      try {
        const cfgs = await base44.asServiceRole.entities.ConfiguracionNegocio.list();
        const arr = Array.isArray(cfgs) ? cfgs : [];
        if (arr.length === 0) {
          await base44.asServiceRole.entities.ConfiguracionNegocio.create(RESET_CFG);
          results.push({ entity: 'ConfiguracionNegocio', deleted: 0, errors: 0, reset: true });
        } else {
          const keep = arr[0];
          await base44.asServiceRole.entities.ConfiguracionNegocio.update(keep.id, RESET_CFG);
          let deletedDup = 0;
          for (let i = 1; i < arr.length; i++) {
            try { await base44.asServiceRole.entities.ConfiguracionNegocio.delete(arr[i].id); deletedDup++; } catch {}
          }
          results.push({ entity: 'ConfiguracionNegocio', deleted: deletedDup, errors: 0, reset: true });
        }
      } catch (e) {
        results.push({ entity: 'ConfiguracionNegocio', deleted: 0, errors: 1, error: e?.message || String(e) });
      }

      // Limpieza de UsuarioPOS: conservamos al admin actual (posUserId) y
      // garantizamos al menos 1 admin activo. Borramos el resto.
      try {
        const allUsers = await base44.asServiceRole.entities.UsuarioPOS.list('-created_date', 1000);
        const users = Array.isArray(allUsers) ? allUsers : [];
        const admins = users.filter(u => u?.rol === 'administrador');
        // Determinar qué admin se conserva: prioridad al posUserId actual; si no
        // existe, primer admin activo; si no, primer admin.
        let keepUser = null;
        if (posUserId) keepUser = admins.find(u => u.id === posUserId) || null;
        if (!keepUser) keepUser = admins.find(u => u.activo) || admins[0] || null;
        let deletedUsers = 0;
        let errorsUsers = 0;
        for (const u of users) {
          if (keepUser && u.id === keepUser.id) continue;
          try { await base44.asServiceRole.entities.UsuarioPOS.delete(u.id); deletedUsers++; }
          catch { errorsUsers++; }
        }
        // Si no había ningún admin, creamos uno por defecto.
        if (!keepUser) {
          try {
            await base44.asServiceRole.entities.UsuarioPOS.create({
              nombre: 'Administrador',
              rol: 'administrador',
              pin: '1234',
              activo: true,
            });
            results.push({ entity: 'UsuarioPOS', deleted: deletedUsers, errors: errorsUsers, created_default_admin: true });
          } catch (e) {
            results.push({ entity: 'UsuarioPOS', deleted: deletedUsers, errors: errorsUsers + 1, error: e?.message || String(e) });
          }
        } else {
          // Aseguramos que el admin conservado quede activo.
          try { await base44.asServiceRole.entities.UsuarioPOS.update(keepUser.id, { activo: true }); } catch {}
          results.push({ entity: 'UsuarioPOS', deleted: deletedUsers, errors: errorsUsers, kept_admin_id: keepUser.id });
        }
      } catch (e) {
        results.push({ entity: 'UsuarioPOS', deleted: 0, errors: 1, error: e?.message || String(e) });
      }
    }

    const totalDeleted = results.reduce((s, r) => s + (r.deleted || 0), 0);
    const totalErrors = results.reduce((s, r) => s + (r.errors || 0), 0);

    return Response.json({
      ok: true,
      mode,
      total_deleted: totalDeleted,
      total_errors: totalErrors,
      results,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});
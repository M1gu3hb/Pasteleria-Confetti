/**
 * EJECUTORES DE IMPORTACIÓN — corren SOLO después de que el usuario confirmó
 * la vista previa. Reciben filas ya validadas (`parsed`) y escriben en BD.
 *
 * Reglas críticas:
 *  - Stock: si se ajusta, SIEMPRE crear MovimientoInventario con motivo
 *    "Importación masiva".
 *  - Inactivos: NUNCA reactivar silenciosamente. La vista previa marca esas
 *    filas como `advertencia/_isInactive` y aquí se IGNORAN.
 *  - Cualquier fila marcada como 'error' se ignora.
 *  - Catch por fila → reportamos el error pero seguimos con las demás.
 */

import { base44 } from '@/api/base44Client';

const safeStr = (v) => (v === null || v === undefined ? '' : String(v));

// ---------- INVENTARIO ----------
/**
 * @param previewRows  filas del preview de validarInventario
 * @param options      { ajustarStock: boolean, posUser, fechaIso }
 *                     ajustarStock=false → solo actualiza datos maestros, NO toca stock.
 *                     ajustarStock=true  → ajusta stock al valor del CSV creando MovimientoInventario.
 */
export async function ejecutarImportInventario(previewRows, { ajustarStock = false, posUser, fechaIso }) {
  const reporte = { creados: 0, actualizados: 0, ajustes_stock: 0, omitidos_inactivos: 0, fallidos: 0, errores: [] };
  const fecha = fechaIso || new Date().toISOString();

  for (const r of previewRows || []) {
    try {
      if (r.status === 'error') { continue; }
      if (r.status === 'advertencia' && r.parsed?._isInactive) {
        reporte.omitidos_inactivos++;
        continue;
      }
      if (!r.parsed) continue;
      const p = r.parsed;

      if (p._existingId) {
        // ACTUALIZAR datos maestros sin tocar stock (siempre seguro)
        await base44.entities.Ingrediente.update(p._existingId, {
          stock_minimo: p.stock_minimo,
          stock_critico: p.stock_critico,
          costo_por_unidad_base: p.costo_por_unidad_base,
          unidad_compra_default: p.unidad_compra_default,
          cantidad_por_compra_default: p.cantidad_por_compra_default,
          costo_compra_default: p.costo_compra_default,
          notas: p.notas,
          // No actualizamos nombre/unidad_base/activo aquí para evitar romper recetas existentes
        });
        reporte.actualizados++;

        if (ajustarStock) {
          const oldStock = Number(p._existingStock) || 0;
          const newStock = Number(p.stock_actual) || 0;
          const delta = newStock - oldStock;
          if (delta !== 0) {
            // Actualizar stock real
            await base44.entities.Ingrediente.update(p._existingId, { stock_actual: newStock });
            // SIEMPRE crear MovimientoInventario para que quede historial
            await base44.entities.MovimientoInventario.create({
              ingrediente_id: p._existingId,
              ingrediente_nombre: p.nombre,
              tipo_movimiento: 'ajuste_manual',
              cantidad: Math.abs(delta),
              unidad_base: p.unidad_base,
              stock_anterior: oldStock,
              stock_nuevo: newStock,
              costo_unitario_en_momento: p.costo_por_unidad_base || 0,
              costo_total_movimiento: 0,
              referencia_tipo: 'importacion',
              referencia_id: '',
              motivo: `Importación masiva (línea ${r.line}). Δ = ${delta > 0 ? '+' : ''}${delta} ${p.unidad_base}`,
              usuario_id: posUser?.id,
              usuario_nombre: posUser?.nombre,
              fecha,
            });
            reporte.ajustes_stock++;
          }
        }
      } else {
        // CREAR nuevo ingrediente
        const created = await base44.entities.Ingrediente.create({
          nombre: p.nombre,
          unidad_base: p.unidad_base,
          stock_actual: Number(p.stock_actual) || 0,
          stock_minimo: Number(p.stock_minimo) || 0,
          stock_critico: Number(p.stock_critico) || 0,
          costo_por_unidad_base: Number(p.costo_por_unidad_base) || 0,
          unidad_compra_default: p.unidad_compra_default,
          cantidad_por_compra_default: p.cantidad_por_compra_default,
          costo_compra_default: p.costo_compra_default,
          activo: p.activo !== false,
          notas: p.notas,
        });
        reporte.creados++;

        // Si traía stock > 0, registrar movimiento de inicio
        const stockIni = Number(p.stock_actual) || 0;
        if (stockIni > 0) {
          await base44.entities.MovimientoInventario.create({
            ingrediente_id: created.id,
            ingrediente_nombre: p.nombre,
            tipo_movimiento: 'ajuste_manual',
            cantidad: stockIni,
            unidad_base: p.unidad_base,
            stock_anterior: 0,
            stock_nuevo: stockIni,
            costo_unitario_en_momento: Number(p.costo_por_unidad_base) || 0,
            costo_total_movimiento: 0,
            referencia_tipo: 'importacion',
            referencia_id: '',
            motivo: `Importación masiva — stock inicial (línea ${r.line})`,
            usuario_id: posUser?.id,
            usuario_nombre: posUser?.nombre,
            fecha,
          });
        }
      }
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}

// ---------- PRODUCTOS ----------
export async function ejecutarImportProductos(previewRows, { crearCategoriasFaltantes = false } = {}) {
  const reporte = { creados: 0, actualizados: 0, fallidos: 0, categorias_creadas: 0, errores: [] };
  const cacheCatPorNombre = new Map();

  for (const r of previewRows || []) {
    try {
      if (r.status === 'error' || !r.parsed) continue;
      const p = r.parsed;

      let catId = p.categoria_id;
      let catNombre = p.categoria_nombre;

      if (!catId && p._categoriaPorCrear && crearCategoriasFaltantes) {
        const claveCache = String(p._categoriaPorCrear).trim().toLowerCase();
        if (cacheCatPorNombre.has(claveCache)) {
          const c = cacheCatPorNombre.get(claveCache);
          catId = c.id;
          catNombre = c.nombre;
        } else {
          const nuevaCat = await base44.entities.CategoriaProducto.create({
            nombre: String(p._categoriaPorCrear).trim(),
            activo: true,
            orden: 99,
          });
          cacheCatPorNombre.set(claveCache, nuevaCat);
          catId = nuevaCat.id;
          catNombre = nuevaCat.nombre;
          reporte.categorias_creadas++;
        }
      }

      const payload = {
        nombre: p.nombre,
        categoria_id: catId || '',
        categoria_nombre: catNombre || '',
        descripcion: safeStr(p.descripcion),
        precio_venta: Number(p.precio_venta) || 0,
        area_preparacion: p.area_preparacion || 'ninguno',
        visible_en_pos: p.visible_en_pos !== false,
        activo: p.activo !== false,
      };

      if (p._existingId) {
        await base44.entities.ProductoTerminado.update(p._existingId, payload);
        reporte.actualizados++;
      } else {
        await base44.entities.ProductoTerminado.create(payload);
        reporte.creados++;
      }
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}

// ---------- RECETAS ----------
/**
 * Agrupa las filas válidas por producto y crea las líneas nuevas.
 *
 * REGLAS CRÍTICAS:
 *  1. NUNCA borrado físico de recetas existentes. Se usa SOFT-DELETE (activo:false)
 *     y solo DESPUÉS de que las nuevas líneas se crearon con éxito.
 *  2. Si falla la creación de cualquier línea nueva del producto:
 *     - Se hace rollback de las nuevas líneas ya creadas (best-effort).
 *     - Las anteriores quedan ACTIVAS (no se inactivaron porque la operación
 *       falló antes de llegar al paso de soft-delete).
 *     - Se reporta el producto como fallido.
 *  3. Costo de línea usa `cantidad_convertida_unidad_base` (gramos/ml/piezas),
 *     misma fórmula que el formulario manual de recetas.
 */
export async function ejecutarImportRecetas(previewRows, { reemplazarExistente = false } = {}) {
  const reporte = {
    productos_actualizados: 0,
    lineas_creadas: 0,
    productos_omitidos: 0,
    lineas_inactivadas: 0,
    fallidos: 0,
    errores: [],
  };

  // Solo filas con parsed válido (status: 'nueva' o 'advertencia')
  const validas = (previewRows || []).filter(r => r.parsed && r.status !== 'error');

  // Agrupar por producto_id
  const porProducto = new Map();
  for (const r of validas) {
    const k = r.parsed.producto_id;
    if (!porProducto.has(k)) porProducto.set(k, []);
    porProducto.get(k).push(r.parsed);
  }

  for (const [productoId, lineas] of porProducto.entries()) {
    const productoNombre = lineas[0]?.producto_nombre || productoId;
    const lineasCreadasIds = []; // para rollback si algo falla
    try {
      // Verificar si hay recetas activas previas
      const existentes = await base44.entities.RecetaEscandallo.filter({ producto_id: productoId });
      const existentesActivas = (Array.isArray(existentes) ? existentes : []).filter(x => x?.activo !== false);

      if (existentesActivas.length > 0 && !reemplazarExistente) {
        reporte.productos_omitidos++;
        reporte.errores.push(`Producto "${productoNombre}" ya tiene receta. Marca "Reemplazar receta existente" para sobrescribir.`);
        continue;
      }

      // 1) CREAR primero todas las nuevas líneas. Si alguna falla, hacemos rollback.
      let costoTotal = 0;
      for (const l of lineas) {
        const costoUnit = Number(l.costo_unitario_base_snapshot) || 0;
        const cantOriginal = Number(l.cantidad_usada) || 0;
        const cantBase = Number(l.cantidad_convertida_unidad_base);
        if (!Number.isFinite(cantBase) || cantBase <= 0) {
          throw new Error(`Línea inválida para "${l.ingrediente_nombre}": cantidad convertida ${cantBase}`);
        }
        const merma = Number(l.merma_porcentaje) || 0;
        // FÓRMULA EXACTA del formulario manual (RecetaFormDialog):
        //   costoLinea = cantidad_base × (1 + merma/100) × costo_unitario_base
        const costoLinea = cantBase * (1 + merma / 100) * costoUnit;
        costoTotal += costoLinea;

        const creada = await base44.entities.RecetaEscandallo.create({
          producto_id: l.producto_id,
          ingrediente_id: l.ingrediente_id,
          ingrediente_nombre: l.ingrediente_nombre,
          cantidad_usada: cantOriginal,
          unidad_usada: l.unidad_usada,
          cantidad_convertida_unidad_base: cantBase,
          merma_porcentaje: merma,
          costo_unitario_base_snapshot: costoUnit,
          costo_linea_calculado: costoLinea,
          activo: true,
          notas: l.notas,
        });
        if (creada?.id) lineasCreadasIds.push(creada.id);
        reporte.lineas_creadas++;
      }

      // 2) SOFT-DELETE de las anteriores SOLO DESPUÉS de que todas las nuevas fueron creadas.
      //    Si la inactivación de alguna falla, no es crítico — las nuevas ya están vivas y
      //    el frontend filtra por activo:true. Reportamos best-effort.
      if (reemplazarExistente && existentesActivas.length > 0) {
        for (const old of existentesActivas) {
          try {
            await base44.entities.RecetaEscandallo.update(old.id, { activo: false });
            reporte.lineas_inactivadas++;
          } catch (errInact) {
            reporte.errores.push(`Aviso: no se pudo inactivar línea previa de "${productoNombre}": ${errInact?.message || ''}`);
          }
        }
      }

      // 3) Actualizar costo calculado del producto (best-effort)
      try {
        const prod = await base44.entities.ProductoTerminado.get(productoId);
        if (prod) {
          const precio = Number(prod.precio_venta) || 0;
          const utilidad = precio - costoTotal;
          const margen = precio > 0 ? (utilidad / precio) * 100 : 0;
          await base44.entities.ProductoTerminado.update(productoId, {
            costo_calculado_actual: Math.round(costoTotal * 100) / 100,
            utilidad_bruta_actual: Math.round(utilidad * 100) / 100,
            margen_bruto_actual: Math.round(margen * 100) / 100,
          });
        }
      } catch {}
      reporte.productos_actualizados++;
    } catch (e) {
      // ROLLBACK best-effort de las nuevas líneas creadas en este producto.
      // Las anteriores quedan ACTIVAS porque el soft-delete corre solo si llegamos
      // a ese paso con éxito.
      for (const idCreado of lineasCreadasIds) {
        try { await base44.entities.RecetaEscandallo.delete(idCreado); } catch {}
      }
      reporte.lineas_creadas -= lineasCreadasIds.length;
      if (reporte.lineas_creadas < 0) reporte.lineas_creadas = 0;
      reporte.fallidos++;
      reporte.errores.push(`Producto "${productoNombre}": ${e?.message || 'error'} — receta anterior intacta.`);
    }
  }
  return reporte;
}

// ---------- PROVEEDORES ----------
export async function ejecutarImportProveedores(previewRows) {
  const reporte = { creados: 0, actualizados: 0, fallidos: 0, errores: [] };
  for (const r of previewRows || []) {
    try {
      if (r.status === 'error' || !r.parsed) continue;
      const p = r.parsed;
      const payload = {
        nombre: p.nombre,
        contacto: p.contacto,
        telefono: p.telefono,
        correo: p.correo,
        notas: p.notas,
        activo: p.activo !== false,
      };
      if (p._existingId) {
        await base44.entities.Proveedor.update(p._existingId, payload);
        reporte.actualizados++;
      } else {
        await base44.entities.Proveedor.create(payload);
        reporte.creados++;
      }
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}

// ---------- GASTOS ----------
export async function ejecutarImportGastos(previewRows, { posUser } = {}) {
  const reporte = { creados: 0, fallidos: 0, errores: [] };
  for (const r of previewRows || []) {
    try {
      if (r.status === 'error' || !r.parsed) continue;
      const p = r.parsed;
      await base44.entities.GastoOperativo.create({
        fecha: p.fecha,
        descripcion: p.descripcion,
        categoria: p.categoria,
        monto: Number(p.monto) || 0,
        metodo_pago: p.metodo_pago,
        usuario_id: posUser?.id,
        usuario_nombre: posUser?.nombre,
        notas: `[Importado] ${p.notas || ''}`.trim(),
      });
      reporte.creados++;
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}
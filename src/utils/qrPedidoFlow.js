// =====================================================
// utils/qrPedidoFlow.js — Lógica pura del flujo de pedido desde Portal QR.
// =====================================================
// Reglas críticas:
//  - NO descuenta inventario (eso ocurre solo al cobrar en Caja).
//  - NO cobra ni mueve dinero.
//  - NO usa prefijos "[QR]" en notas visibles. La trazabilidad se guarda
//    en campos separados (origen_pedido, area_preparacion_snapshot).
//  - F3: Si `estaciones_preparacion_activas` está activo, agrupa por
//    EstacionPreparacion (Producto → Categoría → Estación). Si está
//    apagado, mantiene el comportamiento legacy: agrupa por
//    `producto.area_preparacion` ('cocina' | 'barra').
//  - Estructura DetalleVenta/Venta idéntica a la del flujo Mesero.
//  - Valida producto activo + visible antes de crear cualquier registro.
// =====================================================

import { base44 } from '@/api/base44Client';
import { agruparItemsPorEstacion } from '@/utils/preparacionEstacionUtils';

const ESTADOS_VENTA_ACTIVA = [
  'abierta',
  'enviada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
];

const ESTADOS_BLOQUEADOS_PARA_AGREGAR = ['cuenta_solicitada', 'pagada', 'cancelada'];

/**
 * Busca la venta activa de una mesa. Devuelve null si no hay ninguna.
 * Fuente de verdad: la BD. No depende de caché frontal.
 */
export async function findVentaActivaMesa(mesaId) {
  if (!mesaId) return null;
  try {
    const ventas = await base44.entities.Venta.filter({ mesa_id: mesaId }).catch(() => []);
    const arr = Array.isArray(ventas) ? ventas : [];
    const activas = arr
      .filter((v) => v && ESTADOS_VENTA_ACTIVA.includes(v.estado))
      .sort(
        (a, b) =>
          new Date(b?.fecha_apertura || b?.created_date || 0) -
          new Date(a?.fecha_apertura || a?.created_date || 0)
      );
    return activas[0] || null;
  } catch (err) {
    console.error('[qrPedidoFlow] findVentaActivaMesa:', err);
    return null;
  }
}

/**
 * Abre una mesa libre desde el QR del comensal.
 * Reglas:
 *  - La mesa debe tener mesero_asignado_id (asignación de mesas activa).
 *  - Re-chequea venta activa ANTES Y DESPUÉS de crear para evitar duplicados.
 *  - Si se detecta carrera, devuelve la venta existente y descarta la nueva.
 *
 * @returns {Promise<{venta: object, reused: boolean}>}
 */
export async function abrirMesaDesdeQR({ mesa, personas, cliente_nombre, notas, notas_alergias, celebracion_especial, tipo_celebracion }) {
  if (!mesa?.id) throw new Error('Mesa inválida');
  if (!mesa?.mesero_asignado_id) {
    throw new Error('Esta mesa aún no tiene un mesero asignado.');
  }
  // 6A: normalizar campos opcionales
  const notasAlergiasClean = (notas_alergias || '').trim();
  const celebracion = !!celebracion_especial;
  const tipoCelebClean = celebracion ? (tipo_celebracion || '').trim() : '';

  // ----- Anti-race 1: re-chequear venta activa antes de crear -----
  const previa = await findVentaActivaMesa(mesa.id);
  if (previa) {
    return { venta: previa, reused: true };
  }

  const personasNum = Math.max(1, parseInt(personas, 10) || 1);
  const fechaApertura = new Date().toISOString();

  // Folio compacto. Prefijo Q para distinguir origen QR.
  const folio = `Q${String(mesa.numero || 0).padStart(2, '0')}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

  const nuevaVenta = await base44.entities.Venta.create({
    folio,
    fecha_apertura: fechaApertura,
    tipo_venta: 'mesa',
    mesa_id: mesa.id,
    mesa_numero: mesa.numero || 0,
    personas: personasNum,
    cliente_nombre: (cliente_nombre || '').trim(),
    usuario_mesero_id: mesa.mesero_asignado_id,
    usuario_mesero_nombre: mesa.mesero_asignado_nombre || '',
    estado: 'abierta',
    subtotal: 0,
    total: 0,
    notas: (notas || '').trim(), // SIN prefijo [QR]
    // 6A: snapshot en la venta
    notas_alergias: notasAlergiasClean,
    celebracion_especial: celebracion,
    tipo_celebracion: tipoCelebClean,
  });

  // ----- Anti-race 2: revisar si otro flujo creó venta entre la consulta y el create -----
  // Si encontramos OTRA venta activa además de la nuestra, conservamos la más antigua
  // y cancelamos la nueva. La trazabilidad queda en motivo_cancelacion.
  try {
    const ventasMesa = await base44.entities.Venta.filter({ mesa_id: mesa.id }).catch(() => []);
    const activas = (Array.isArray(ventasMesa) ? ventasMesa : [])
      .filter((v) => v && ESTADOS_VENTA_ACTIVA.includes(v.estado))
      .sort(
        (a, b) =>
          new Date(a?.fecha_apertura || a?.created_date || 0) -
          new Date(b?.fecha_apertura || b?.created_date || 0)
      );
    if (activas.length > 1) {
      const ganadora = activas[0];
      const perdedores = activas.slice(1);
      const esNuestraGanadora = ganadora.id === nuevaVenta.id;
      if (!esNuestraGanadora) {
        // Cancelar la nuestra (es la perdedora) — quedó duplicada.
        await base44.entities.Venta.update(nuevaVenta.id, {
          estado: 'cancelada',
          motivo_cancelacion: 'duplicado_apertura_qr',
        }).catch(() => {});
        return { venta: ganadora, reused: true };
      }
      // Si la ganadora SÍ es la nuestra, cancelar las que llegaron después.
      await Promise.all(
        perdedores.map((v) =>
          base44.entities.Venta.update(v.id, {
            estado: 'cancelada',
            motivo_cancelacion: 'duplicado_apertura_qr',
          }).catch(() => {})
        )
      );
    }
  } catch (err) {
    console.warn('[qrPedidoFlow] anti-race apertura:', err);
  }

  // Actualizar mesa
  try {
    await base44.entities.Mesa.update(mesa.id, {
      estado: 'esperando_orden',
      venta_activa_id: nuevaVenta.id,
      personas_actuales: personasNum,
      cliente_temporal: (cliente_nombre || '').trim(),
      // 6A: indicaciones críticas visibles para mesero/cocina
      notas_alergias: notasAlergiasClean,
      celebracion_especial: celebracion,
      tipo_celebracion: tipoCelebClean,
    });
  } catch (err) {
    console.warn('[qrPedidoFlow] update mesa:', err);
  }

  return { venta: nuevaVenta, reused: false };
}

/**
 * Valida que un producto siga activo y disponible para el menú digital.
 * Lee la BD fresca (no caché). Devuelve {ok, producto, motivo}.
 */
async function validarProductoActivo(productoId) {
  if (!productoId) return { ok: false, motivo: 'sin_id' };
  try {
    const p = await base44.entities.ProductoTerminado.get(productoId).catch(() => null);
    if (!p) return { ok: false, motivo: 'no_existe' };
    if (p.activo === false) return { ok: false, motivo: 'desactivado', producto: p };
    if (p.visible_en_menu_digital === false) {
      return { ok: false, motivo: 'oculto_menu', producto: p };
    }
    if (!Number.isFinite(Number(p.precio_venta)) || Number(p.precio_venta) <= 0) {
      return { ok: false, motivo: 'sin_precio', producto: p };
    }
    return { ok: true, producto: p };
  } catch (err) {
    console.error('[qrPedidoFlow] validarProductoActivo:', err);
    return { ok: false, motivo: 'error' };
  }
}

/**
 * Valida todos los items del carrito QR contra BD.
 * Devuelve {ok, invalidos:[{id, nombre, motivo}], productosFrescos:Map}.
 */
export async function validarCarritoQR(items) {
  const arr = Array.isArray(items) ? items : [];
  const invalidos = [];
  const productosFrescos = new Map();
  for (const it of arr) {
    if (!it?.id) continue;
    if (productosFrescos.has(it.id)) continue;
    // eslint-disable-next-line no-await-in-loop
    const r = await validarProductoActivo(it.id);
    if (!r.ok) {
      invalidos.push({
        id: it.id,
        nombre: it.nombre || r.producto?.nombre || 'Producto',
        motivo: r.motivo,
      });
    } else {
      productosFrescos.set(it.id, r.producto);
    }
  }
  return { ok: invalidos.length === 0, invalidos, productosFrescos };
}

/**
 * Construye el texto de modificadores legible para mostrar en cocina/ticket.
 * Mismo formato que SeleccionModificadoresDialog en flujo Mesero.
 */
function formatearModificadoresLegible(modificadoresArr) {
  if (!Array.isArray(modificadoresArr) || modificadoresArr.length === 0) return '';
  return modificadoresArr
    .map((g) => {
      const opciones = Array.isArray(g?.opciones) ? g.opciones : [];
      const nombres = opciones.map((o) => o?.nombre || '').filter(Boolean).join(', ');
      // Compatibilidad: nombre real del grupo es `grupo_nombre` (estándar
      // Cocina/Mesero). Fallback a `grupo` o `nombre` por si llega legacy.
      const grupoNombre = g?.grupo_nombre || g?.grupo || g?.nombre || '';
      if (!nombres) return '';
      return grupoNombre ? `${grupoNombre}: ${nombres}` : nombres;
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * Envía un pedido del carrito QR a preparación.
 *
 * @param {Object} args
 *  - mesa, venta: objetos.
 *  - items: array del carrito QR, cada item con:
 *      {id, nombre, precio_venta, costo_calculado_actual, area_preparacion,
 *       cantidad, notas, _modificadores}
 *  - notaGeneral: nota general del pedido (sin prefijo).
 */
export async function enviarPedidoQR({ mesa, venta, items, notaGeneral, config: configArg, categorias: categoriasArg, estaciones: estacionesArg }) {
  if (!mesa?.id) throw new Error('Mesa inválida');
  if (!venta?.id) throw new Error('Venta inválida');
  const carrito = Array.isArray(items) ? items.filter((i) => i && Number(i.cantidad) > 0) : [];
  if (carrito.length === 0) throw new Error('El carrito está vacío');
  if (ESTADOS_BLOQUEADOS_PARA_AGREGAR.includes(venta.estado)) {
    throw new Error('La cuenta ya fue solicitada para esta mesa.');
  }

  // F3: si el caller no pasó config/categorias/estaciones, los cargamos desde BD.
  // Esto preserva compatibilidad con llamadas legacy del portal y nos asegura
  // que la lógica de estaciones funcione siempre que estén configuradas.
  let config = configArg;
  if (!config) {
    try {
      const lista = await base44.entities.ConfiguracionNegocio.list().catch(() => []);
      config = (Array.isArray(lista) ? lista : [])[0] || null;
    } catch { config = null; }
  }
  const estacionesActivasGlobal = config?.estaciones_preparacion_activas === true;
  let categorias = Array.isArray(categoriasArg) ? categoriasArg : null;
  let estaciones = Array.isArray(estacionesArg) ? estacionesArg : null;
  if (estacionesActivasGlobal) {
    if (!categorias) {
      try { categorias = await base44.entities.CategoriaProducto.filter({ activo: true }).catch(() => []); } catch { categorias = []; }
    }
    if (!estaciones) {
      try { estaciones = await base44.entities.EstacionPreparacion.filter({ activo: true }).catch(() => []); } catch { estaciones = []; }
    }
  }

  // ----- 1) Validar productos activos -----
  const validacion = await validarCarritoQR(carrito);
  if (!validacion.ok) {
    const nombres = validacion.invalidos.map((x) => x.nombre).join(', ');
    const err = new Error(
      `Estos productos ya no están disponibles: ${nombres}. Quítalos del carrito para enviar.`
    );
    err.invalidos = validacion.invalidos;
    throw err;
  }

  // ----- 2) Crear DetalleVenta por línea -----
  // SIN prefijos [QR]. Trazabilidad va en area_preparacion_snapshot y a través de la Venta (folio Q*).
  const nuevosDetalles = await Promise.all(
    carrito.map((item) => {
      const productoFresco = validacion.productosFrescos.get(item.id) || {};
      const modificadoresArr = Array.isArray(item?._modificadores) ? item._modificadores : [];
      // 6B / 1.E — Si la línea es VARIABLE, el precio (precio_venta efectivo) ya viene
      // calculado desde el cliente como precio_total_linea. cantidad = 1.
      // Para precio_fijo: comportamiento histórico intacto (precio * cantidad).
      const variableSnap = item?._variable || null;
      const cantidad = Number(item.cantidad) || 0;
      const precio = variableSnap
        ? (Number(item.precio_venta) || 0)
        : (Number(productoFresco.precio_venta ?? item.precio_venta) || 0);
      const costoUnit = Number(productoFresco.costo_calculado_actual ?? item.costo_calculado_actual) || 0;
      const subtotal = precio * cantidad;
      // En variable, el costo lo recalcula 1.G a partir de cantidad_base * costo_por_unidad_base.
      // Hasta entonces dejamos costo_linea = 0 si es variable (no propagamos costo unitario erróneo).
      const costoLinea = variableSnap ? 0 : (costoUnit * cantidad);
      const utilidadLinea = subtotal - costoLinea;
      const margen = precio > 0 ? (utilidadLinea / subtotal) * 100 : 0;
      const areaItem = productoFresco.area_preparacion || item.area_preparacion || 'cocina';

      // 6B / 1.E — Snapshots del schema 6B (solo si la línea es variable).
      const variableFields = variableSnap ? {
        tipo_venta_snapshot: variableSnap.tipo_venta,
        unidad_variable_snapshot: variableSnap.unidad_variable || '',
        cantidad_variable_snapshot: Number(variableSnap.cantidad_variable) || 0,
        ingrediente_base_id_snapshot: variableSnap.ingrediente_base_id || '',
        ingrediente_base_nombre_snapshot: variableSnap.ingrediente_base_nombre || '',
        precio_por_unidad_snapshot: Number(variableSnap.precio_por_unidad_snapshot) || 0,
        nombre_porcion_snapshot: variableSnap.nombre_porcion || '',
        ml_por_porcion_snapshot: Number(variableSnap.ml_por_porcion) || 0,
        cantidad_porciones_snapshot: Number(variableSnap.cantidad_porciones) || 0,
      } : {};

      return base44.entities.DetalleVenta.create({
        venta_id: venta.id,
        producto_id: item.id,
        producto_nombre: productoFresco.nombre || item.nombre || '',
        cantidad,
        precio_unitario_snapshot: precio,
        costo_unitario_snapshot: variableSnap ? 0 : costoUnit,
        subtotal,
        costo_total_linea_snapshot: costoLinea,
        utilidad_linea_snapshot: utilidadLinea,
        margen_linea_snapshot: margen,
        notas_producto: (item.notas || '').trim(), // SIN prefijo [QR]
        modificadores_snapshot:
          modificadoresArr.length > 0 ? JSON.stringify(modificadoresArr) : '',
        estado_preparacion: 'pendiente',
        area_preparacion_snapshot: areaItem,
        ...variableFields,
      });
    })
  );

  // ----- 3) Re-totalizar la venta a partir de TODOS los DetalleVenta -----
  let todosDetalles = [];
  try {
    const fresh = await base44.entities.DetalleVenta.filter({ venta_id: venta.id }).catch(() => []);
    todosDetalles = Array.isArray(fresh) ? fresh : [];
  } catch {
    todosDetalles = nuevosDetalles;
  }
  const subtotal = todosDetalles.reduce((s, d) => s + (Number(d?.subtotal) || 0), 0);
  const costoTotal = todosDetalles.reduce(
    (s, d) => s + (Number(d?.costo_total_linea_snapshot) || 0),
    0
  );
  await base44.entities.Venta.update(venta.id, {
    estado: 'enviada',
    subtotal,
    total: subtotal,
    costo_total_snapshot: costoTotal,
    utilidad_bruta_snapshot: subtotal - costoTotal,
    margen_snapshot: subtotal > 0 ? ((subtotal - costoTotal) / subtotal) * 100 : 0,
  });

  // ----- 4) Agrupar items y crear PedidoPreparacion -----
  // F3: si estaciones están activas → agrupar por EstacionPreparacion
  //     (Producto → Categoría → Estación). Si está apagado → legacy
  //     (agrupar por producto.area_preparacion 'cocina'|'barra').
  const notaLimpia = (notaGeneral || '').trim(); // SIN prefijo [QR]
  const fechaCreacion = new Date().toISOString();
  const estacionesActivas = estacionesActivasGlobal;
  const areasDeUso = [];

  // 6A: snapshot de alergias/celebración para cocina. Preferimos la venta
  // (fuente más estable), con fallback a la mesa (lo que vea el mesero ahora).
  const alergiasSnap = (venta?.notas_alergias || mesa?.notas_alergias || '').trim();
  const celebSnap = !!(venta?.celebracion_especial || mesa?.celebracion_especial);
  const tipoCelebSnap = celebSnap ? (venta?.tipo_celebracion || mesa?.tipo_celebracion || '').trim() : '';

  const buildItemsParaPedido = (itemsArea, normalizarArea = false) => itemsArea.map((item) => {
    const pFresco = item._productoFresco || validacion.productosFrescos.get(item.id) || {};
    const modificadoresArr = Array.isArray(item?._modificadores) ? item._modificadores : [];
    const variableSnap = item?._variable || null;
    const baseItem = {
      producto_id: item.id,
      producto_nombre: pFresco.nombre || item.nombre || '',
      cantidad: Number(item.cantidad) || 0,
      notas: (item.notas || '').trim(),
      modificadores: modificadoresArr,
      estado: 'pendiente',
      origen: 'portal_qr',
      area_preparacion_snapshot: pFresco.area_preparacion || item.area_preparacion || 'cocina',
    };
    // 6B / 1.E — Snapshot variable para Cocina (1.F lo renderizará).
    if (variableSnap) {
      baseItem.tipo_venta = variableSnap.tipo_venta;
      if (variableSnap.tipo_venta === 'variable_medida') {
        baseItem.unidad_variable = variableSnap.unidad_variable || '';
        baseItem.cantidad_variable = Number(variableSnap.cantidad_variable) || 0;
      } else if (variableSnap.tipo_venta === 'porcion_contenedor') {
        baseItem.nombre_porcion = variableSnap.nombre_porcion || '';
        baseItem.cantidad_porciones = Number(variableSnap.cantidad_porciones) || 0;
      }
    }
    return baseItem;
  });

  if (!estacionesActivas) {
    // === MODO LEGACY ===
    const normalizarArea = (a) => (a === 'barra' ? 'barra' : 'cocina');
    const itemsPorArea = new Map();
    carrito.forEach((item) => {
      const productoFresco = validacion.productosFrescos.get(item.id) || {};
      const areaItem = normalizarArea(productoFresco.area_preparacion || item.area_preparacion || 'cocina');
      if (!itemsPorArea.has(areaItem)) itemsPorArea.set(areaItem, []);
      itemsPorArea.get(areaItem).push({ ...item, _productoFresco: productoFresco });
    });

    await Promise.all(Array.from(itemsPorArea.entries()).map(([area, itemsArea]) => {
      areasDeUso.push(area);
      return base44.entities.PedidoPreparacion.create({
        venta_id: venta.id,
        venta_folio: venta.folio || '',
        mesa_id: mesa.id,
        mesa_numero: mesa.numero || 0,
        area,
        estado: 'nuevo',
        fecha_creacion: fechaCreacion,
        notas: notaLimpia,
        origen_pedido: 'portal_qr',
        // 6A: snapshot visible en cocina
        notas_alergias: alergiasSnap,
        celebracion_especial: celebSnap,
        tipo_celebracion: tipoCelebSnap,
        items: buildItemsParaPedido(itemsArea),
      });
    }));
  } else {
    // === MODO ESTACIONES ===
    // Usar producto fresco como base para resolver la categoría correcta.
    const carritoConFreshProd = carrito.map((item) => {
      const pFresco = validacion.productosFrescos.get(item.id) || {};
      return { ...item, ...pFresco, _productoFresco: pFresco, cantidad: item.cantidad, notas: item.notas, _modificadores: item._modificadores };
    });
    const grupos = agruparItemsPorEstacion(carritoConFreshProd, null, categorias, estaciones, config);
    await Promise.all(Array.from(grupos.values()).map((grp) => {
      const info = grp?.info || null;
      areasDeUso.push(info?.estacion_preparacion_nombre || 'general');
      return base44.entities.PedidoPreparacion.create({
        venta_id: venta.id,
        venta_folio: venta.folio || '',
        mesa_id: mesa.id,
        mesa_numero: mesa.numero || 0,
        // Mantener 'area' como fallback legacy.
        area: 'cocina',
        estado: 'nuevo',
        fecha_creacion: fechaCreacion,
        notas: notaLimpia,
        origen_pedido: 'portal_qr',
        estacion_preparacion_id: info?.estacion_preparacion_id || '',
        estacion_preparacion_nombre: info?.estacion_preparacion_nombre || '',
        estacion_preparacion_color: info?.estacion_preparacion_color || '',
        // 6A: snapshot visible en cocina
        notas_alergias: alergiasSnap,
        celebracion_especial: celebSnap,
        tipo_celebracion: tipoCelebSnap,
        items: buildItemsParaPedido(grp.items || []),
      });
    }));
  }

  // ----- 5) Actualizar estado visual de la mesa -----
  try {
    await base44.entities.Mesa.update(mesa.id, {
      estado: 'pedido_enviado',
      venta_activa_id: venta.id,
    });
  } catch (err) {
    console.warn('[qrPedidoFlow] update mesa estado:', err);
  }

  return { subtotal, costoTotal, areas: areasDeUso };
}

// Export utilitario para textos legibles si alguna UI lo necesita.
export { formatearModificadoresLegible };
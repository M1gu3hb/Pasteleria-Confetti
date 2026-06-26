/**
 * VALIDADORES DE IMPORTACIÓN — núcleo de seguridad de la carga masiva.
 *
 * Cada validador recibe las filas parseadas del CSV + el snapshot actual de la
 * base de datos (ingredientes, productos, categorías, proveedores existentes).
 * Devuelve un PREVIEW con:
 *   - rows: cada fila etiquetada con { status: 'nueva'|'actualizar'|'error'|'advertencia',
 *           messages: string[], parsed: {...campos casteados} }
 *   - resumen: contadores por tipo
 *
 * NO TOCA BASE DE DATOS. Solo valida en memoria. La grabación corre en otra
 * capa después de que el usuario confirme.
 */

import { toNumber, toBool } from '@/utils/csvParser';
import { normalizarNombreIngrediente, buscarIngredientePorNombre } from '@/utils/ingredienteMatcher';
import { normalizarNombreProducto, buscarProductoPorNombre, buscarCategoriaPorNombre } from '@/utils/productoMatcher';
import { canonicalUnidad, unidadBaseDe, convertirAUnidadBase, validarCompatibilidad } from '@/utils/unidadesMedida';

const UNIDADES_BASE_VALIDAS = ['g', 'ml', 'pieza'];
const CATEGORIAS_GASTO_VALIDAS = ['limpieza', 'transporte', 'reparacion', 'servicios', 'pago_extraordinario', 'marketing', 'otro'];
const METODOS_PAGO_VALIDOS = ['efectivo', 'tarjeta', 'transferencia'];

// ============================================================
// INVENTARIO / INGREDIENTES
// ============================================================
export function validarInventario(rows, { ingredientes }) {
  const safeIng = Array.isArray(ingredientes) ? ingredientes : [];
  const enVuelo = new Set(); // detectar duplicados dentro del mismo archivo
  const out = [];
  let nuevas = 0;
  let actualizar = 0;
  let errores = 0;
  let inactivos = 0;
  let duplicadasArchivo = 0;

  for (const r of rows || []) {
    const messages = [];
    const nombreRaw = String(r.nombre || '').trim();
    const unidad = String(r.unidad_base || 'g').trim().toLowerCase();
    const stock = toNumber(r.stock_actual, 0);
    const stockMin = toNumber(r.stock_minimo, 0);
    const stockCritico = toNumber(r.stock_critico, 0);
    const costoBase = toNumber(r.costo_por_unidad_base, 0);
    const activo = toBool(r.activo, true);

    if (!nombreRaw) {
      errores++;
      out.push({ status: 'error', messages: ['Falta el nombre del ingrediente.'], parsed: null, line: r.__line });
      continue;
    }
    if (!UNIDADES_BASE_VALIDAS.includes(unidad)) {
      errores++;
      out.push({ status: 'error', messages: [`Unidad base inválida "${unidad}". Debe ser g, ml o pieza.`], parsed: null, line: r.__line });
      continue;
    }

    const norm = normalizarNombreIngrediente(nombreRaw);
    if (enVuelo.has(norm)) {
      duplicadasArchivo++;
      out.push({ status: 'error', messages: ['Este ingrediente está repetido en el mismo archivo.'], parsed: null, line: r.__line });
      continue;
    }
    enVuelo.add(norm);

    const existente = buscarIngredientePorNombre(nombreRaw, safeIng);
    const parsed = {
      nombre: nombreRaw,
      unidad_base: unidad,
      stock_actual: stock,
      stock_minimo: stockMin,
      stock_critico: stockCritico,
      costo_por_unidad_base: costoBase,
      unidad_compra_default: String(r.unidad_compra_default || '').trim() || undefined,
      cantidad_por_compra_default: toNumber(r.cantidad_por_compra_default, 0) || undefined,
      costo_compra_default: toNumber(r.costo_compra_default, 0) || undefined,
      activo,
      notas: String(r.notas || '').trim() || undefined,
    };

    if (existente) {
      if (existente.activo === false) {
        inactivos++;
        messages.push(`"${existente.nombre}" existe pero está DESACTIVADO. Reactívalo manualmente desde Inventario antes de importar, o cambia el nombre.`);
        out.push({ status: 'advertencia', messages, parsed: { ...parsed, _existingId: existente.id, _isInactive: true }, line: r.__line });
        continue;
      }
      // Existe activo → se va a actualizar datos maestros. El stock se maneja según
      // el modo del usuario en la pantalla de importación (NO aquí).
      actualizar++;
      messages.push(`Se actualizarán datos maestros de "${existente.nombre}" (no se tocará stock automáticamente).`);
      if (existente.unidad_base && existente.unidad_base !== unidad) {
        messages.push(`⚠ La unidad base del archivo ("${unidad}") no coincide con la actual ("${existente.unidad_base}"). Se conservará la actual.`);
      }
      out.push({ status: 'actualizar', messages, parsed: { ...parsed, _existingId: existente.id, _existingStock: existente.stock_actual || 0 }, line: r.__line });
    } else {
      nuevas++;
      out.push({ status: 'nueva', messages, parsed, line: r.__line });
    }
  }

  return {
    rows: out,
    resumen: { total: out.length, nuevas, actualizar, errores, inactivos, duplicadasArchivo },
  };
}

// ============================================================
// PRODUCTOS
// ============================================================
export function validarProductos(rows, { productos, categorias }) {
  const safeProd = Array.isArray(productos) ? productos : [];
  const safeCat = Array.isArray(categorias) ? categorias : [];
  const enVuelo = new Set();
  const out = [];
  const categoriasFaltantes = new Set();
  let nuevas = 0;
  let actualizar = 0;
  let errores = 0;
  let duplicadasArchivo = 0;

  for (const r of rows || []) {
    const messages = [];
    const nombre = String(r.nombre || '').trim();
    const categoria = String(r.categoria || '').trim();
    const precio = toNumber(r.precio_venta, 0);
    const activo = toBool(r.activo, true);
    const visible = toBool(r.visible_en_pos, true);
    const area = String(r.area_preparacion || '').trim().toLowerCase();

    if (!nombre) {
      errores++;
      out.push({ status: 'error', messages: ['Falta el nombre del producto.'], parsed: null, line: r.__line });
      continue;
    }
    if (!(precio > 0)) {
      errores++;
      out.push({ status: 'error', messages: ['Precio de venta inválido (debe ser mayor a 0).'], parsed: null, line: r.__line });
      continue;
    }

    const norm = normalizarNombreProducto(nombre);
    if (enVuelo.has(norm)) {
      duplicadasArchivo++;
      out.push({ status: 'error', messages: ['Producto repetido en el mismo archivo.'], parsed: null, line: r.__line });
      continue;
    }
    enVuelo.add(norm);

    let cat = null;
    if (categoria) {
      cat = buscarCategoriaPorNombre(categoria, safeCat);
      if (!cat) categoriasFaltantes.add(categoria);
    }

    const areaValida = ['cocina', 'barra', 'ambos', 'ninguno'].includes(area) ? area : 'ninguno';

    const parsed = {
      nombre,
      categoria_id: cat?.id || '',
      categoria_nombre: cat?.nombre || categoria || '',
      _categoriaPorCrear: categoria && !cat ? categoria : null,
      precio_venta: precio,
      descripcion: String(r.descripcion || '').trim() || undefined,
      area_preparacion: areaValida,
      visible_en_pos: visible,
      activo,
    };

    const existente = buscarProductoPorNombre(nombre, safeProd);
    if (existente) {
      actualizar++;
      messages.push(`Se actualizarán datos de "${existente.nombre}".`);
      out.push({ status: 'actualizar', messages, parsed: { ...parsed, _existingId: existente.id }, line: r.__line });
    } else {
      nuevas++;
      if (cat) messages.push(`Categoría "${cat.nombre}" encontrada.`);
      else if (categoria) messages.push(`Categoría "${categoria}" no existe — se creará al confirmar.`);
      out.push({ status: 'nueva', messages, parsed, line: r.__line });
    }
  }

  return {
    rows: out,
    resumen: { total: out.length, nuevas, actualizar, errores, duplicadasArchivo, categoriasFaltantes: Array.from(categoriasFaltantes) },
  };
}

// ============================================================
// RECETAS / ESCANDALLOS
// ============================================================
export function validarRecetas(rows, { ingredientes, productos }) {
  const safeIng = Array.isArray(ingredientes) ? ingredientes : [];
  const safeProd = Array.isArray(productos) ? productos : [];
  const out = [];
  const ingredientesFaltantes = new Set();
  const productosFaltantes = new Set();
  let validas = 0;
  let errores = 0;
  let advertencias = 0;

  for (const r of rows || []) {
    const messages = [];
    const productoNombre = String(r.producto_nombre || '').trim();
    const ingredienteNombre = String(r.ingrediente_nombre || '').trim();
    const cantidad = toNumber(r.cantidad, 0);
    const unidad = String(r.unidad || '').trim().toLowerCase();
    const merma = toNumber(r.merma_porcentaje, 0);

    if (!productoNombre || !ingredienteNombre) {
      errores++;
      out.push({ status: 'error', messages: ['Faltan producto o ingrediente.'], parsed: null, line: r.__line });
      continue;
    }
    if (!(cantidad > 0)) {
      errores++;
      out.push({ status: 'error', messages: ['Cantidad inválida (debe ser mayor a 0).'], parsed: null, line: r.__line });
      continue;
    }
    if (!unidad) {
      errores++;
      out.push({ status: 'error', messages: ['Falta unidad.'], parsed: null, line: r.__line });
      continue;
    }

    const ing = buscarIngredientePorNombre(ingredienteNombre, safeIng);
    const prod = buscarProductoPorNombre(productoNombre, safeProd);

    if (!ing) ingredientesFaltantes.add(ingredienteNombre);
    if (!prod) productosFaltantes.add(productoNombre);

    if (!ing || !prod) {
      const msgs = [];
      if (!ing) msgs.push(`Ingrediente "${ingredienteNombre}" no existe.`);
      if (!prod) msgs.push(`Producto "${productoNombre}" no existe.`);
      msgs.push('Crea los datos faltantes antes de importar recetas, o no se podrá registrar esta línea.');
      errores++;
      out.push({ status: 'error', messages: msgs, parsed: null, line: r.__line });
      continue;
    }

    // Compatibilidad de unidad — para recetas ES ERROR si la unidad es estándar
    // pero no coincide con la base del ingrediente (ej: ml para un ingrediente en g).
    // Las unidades personalizadas (caja/paquete) requerirían equivalencia explícita
    // que no viaja en el CSV, así que también se bloquean.
    const baseEsperada = ing.unidad_base;
    const compat = validarCompatibilidad(unidad, baseEsperada);
    const canon = canonicalUnidad(unidad);
    if (!compat.compatible) {
      errores++;
      out.push({
        status: 'error',
        messages: [`Unidad "${unidad}" no es compatible con la base "${baseEsperada}" del ingrediente "${ing.nombre}".`],
        parsed: null,
        line: r.__line,
      });
      continue;
    }
    if (!canon) {
      // Personalizada (caja/paquete/bolsa o custom) — el CSV no trae equivalencia,
      // así que NO podemos convertir con seguridad. Bloqueamos para no inventar costos.
      errores++;
      out.push({
        status: 'error',
        messages: [`Unidad "${unidad}" requiere equivalencia explícita y no se admite en importación de recetas. Usa g, ml, kg, l, pieza.`],
        parsed: null,
        line: r.__line,
      });
      continue;
    }

    // CONVERSIÓN A UNIDAD BASE — usa el helper único del sistema.
    // Misma lógica que el formulario manual de recetas usa internamente para costear.
    //   kg → g (×1000), g → g, l/litro → ml (×1000), ml → ml, pieza → pieza
    const cantidadBase = convertirAUnidadBase(cantidad, unidad, 1);
    if (!Number.isFinite(cantidadBase) || cantidadBase <= 0) {
      errores++;
      out.push({
        status: 'error',
        messages: [`No se pudo convertir ${cantidad} ${unidad} a ${baseEsperada}.`],
        parsed: null,
        line: r.__line,
      });
      continue;
    }

    if (ing.activo === false) {
      advertencias++;
      messages.push(`⚠ Ingrediente "${ing.nombre}" está DESACTIVADO.`);
    }
    if ((ing.stock_actual || 0) < cantidadBase) {
      messages.push(`ℹ Stock actual (${ing.stock_actual || 0} ${ing.unidad_base}) menor al uso de la receta (${cantidadBase} ${baseEsperada}). Es una ficha técnica, no bloquea.`);
    }
    if (cantidad !== cantidadBase) {
      messages.push(`Conversión: ${cantidad} ${unidad} = ${cantidadBase} ${baseEsperada}.`);
    }

    validas++;
    out.push({
      status: messages.some(m => m.startsWith('⚠')) ? 'advertencia' : 'nueva',
      messages,
      parsed: {
        producto_id: prod.id,
        producto_nombre: prod.nombre,
        ingrediente_id: ing.id,
        ingrediente_nombre: ing.nombre,
        cantidad_usada: cantidad,
        unidad_usada: unidad,
        cantidad_convertida_unidad_base: cantidadBase,
        merma_porcentaje: merma,
        costo_unitario_base_snapshot: ing.costo_por_unidad_base || 0,
        notas: String(r.notas || '').trim() || undefined,
      },
      line: r.__line,
    });
  }

  // Agrupar por producto para mostrar al usuario un resumen
  const porProducto = new Map();
  for (const x of out) {
    if (x.status === 'error' || !x.parsed) continue;
    const k = x.parsed.producto_nombre;
    if (!porProducto.has(k)) porProducto.set(k, []);
    porProducto.get(k).push(x.parsed);
  }

  return {
    rows: out,
    resumen: {
      total: out.length,
      validas,
      errores,
      advertencias,
      ingredientesFaltantes: Array.from(ingredientesFaltantes),
      productosFaltantes: Array.from(productosFaltantes),
      productosAfectados: Array.from(porProducto.keys()),
    },
  };
}

// ============================================================
// PROVEEDORES
// ============================================================
export function validarProveedores(rows, { proveedores }) {
  const safeProv = Array.isArray(proveedores) ? proveedores : [];
  const enVuelo = new Set();
  const out = [];
  let nuevas = 0;
  let actualizar = 0;
  let errores = 0;
  let duplicadasArchivo = 0;

  for (const r of rows || []) {
    const messages = [];
    const nombre = String(r.nombre || '').trim();
    if (!nombre) {
      errores++;
      out.push({ status: 'error', messages: ['Falta el nombre del proveedor.'], parsed: null, line: r.__line });
      continue;
    }
    const norm = normalizarNombreProducto(nombre);
    if (enVuelo.has(norm)) {
      duplicadasArchivo++;
      out.push({ status: 'error', messages: ['Proveedor repetido en el mismo archivo.'], parsed: null, line: r.__line });
      continue;
    }
    enVuelo.add(norm);

    const existente = safeProv.find(p => normalizarNombreProducto(p?.nombre) === norm);

    const parsed = {
      nombre,
      contacto: String(r.contacto || '').trim(),
      telefono: String(r.telefono || '').trim(),
      correo: String(r.correo || '').trim(),
      notas: String(r.notas || '').trim(),
      activo: toBool(r.activo, true),
    };

    if (existente) {
      actualizar++;
      messages.push(`Se actualizará "${existente.nombre}".`);
      out.push({ status: 'actualizar', messages, parsed: { ...parsed, _existingId: existente.id }, line: r.__line });
    } else {
      nuevas++;
      out.push({ status: 'nueva', messages, parsed, line: r.__line });
    }
  }

  return { rows: out, resumen: { total: out.length, nuevas, actualizar, errores, duplicadasArchivo } };
}

// ============================================================
// GASTOS OPERATIVOS
// ============================================================
export function validarGastos(rows) {
  const out = [];
  let validas = 0;
  let errores = 0;

  for (const r of rows || []) {
    const messages = [];
    const fechaRaw = String(r.fecha || '').trim();
    const descripcion = String(r.descripcion || '').trim();
    const categoria = String(r.categoria || '').trim().toLowerCase();
    const monto = toNumber(r.monto, 0);
    const metodo = String(r.metodo_pago || 'efectivo').trim().toLowerCase();

    if (!descripcion) {
      errores++;
      out.push({ status: 'error', messages: ['Falta descripción.'], parsed: null, line: r.__line });
      continue;
    }
    if (!(monto > 0)) {
      errores++;
      out.push({ status: 'error', messages: ['Monto inválido.'], parsed: null, line: r.__line });
      continue;
    }
    // Fecha: aceptar YYYY-MM-DD; si viene mal, usar hoy con advertencia
    let fechaIso = fechaRaw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
      fechaIso = new Date().toISOString().slice(0, 10);
      messages.push(`Fecha "${fechaRaw}" no es válida (AAAA-MM-DD). Se usará hoy: ${fechaIso}.`);
    }
    const catFinal = CATEGORIAS_GASTO_VALIDAS.includes(categoria) ? categoria : 'otro';
    if (catFinal !== categoria) messages.push(`Categoría "${categoria}" no reconocida. Se usará "otro".`);
    const metodoFinal = METODOS_PAGO_VALIDOS.includes(metodo) ? metodo : 'efectivo';

    validas++;
    out.push({
      status: messages.length ? 'advertencia' : 'nueva',
      messages,
      parsed: {
        fecha: fechaIso,
        descripcion,
        categoria: catFinal,
        monto,
        metodo_pago: metodoFinal,
        notas: String(r.notas || '').trim() || undefined,
      },
      line: r.__line,
    });
  }
  return { rows: out, resumen: { total: out.length, validas, errores } };
}
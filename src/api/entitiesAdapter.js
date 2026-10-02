// =====================================================================
// Capa de adaptación: contrato base44.entities.* -> Supabase
// ---------------------------------------------------------------------
// Preserva la API que usa todo el POS:
//   X.filter(query, sort, limit, skip) / X.list(sort, limit) / X.get(id)
//   X.create(obj) / X.update(id, obj) / X.delete(id) / X.bulkCreate([...])
// Traduce el filtro estilo Mongo de Base44 ($in, $ne, $gte, $lte, $gt, $lt)
// a los operadores de Supabase. NO es un find-replace: respeta los contratos
// de dinero (los call-sites no cambian su lógica, solo la fuente de datos).
// =====================================================================
import { supabase } from './supabaseClient';
import { ensureSession } from './supabaseClient';

// Entidad Base44 (PascalCase) -> tabla Postgres (snake_case)
const TABLE_MAP = {
  Sucursal: 'sucursales',
  UsuarioPOS: 'usuarios_pos',
  ConfiguracionNegocio: 'configuracion_negocio',
  ProductoTerminado: 'productos',
  CategoriaProducto: 'categorias_producto',
  Venta: 'ventas',
  DetalleVenta: 'detalle_venta',
  CorteCaja: 'cortes_caja',
  PedidoPastel: 'pedidos',
  Abono: 'abonos',
  FolioContador: 'folio_contador',
  GastoOperativo: 'gastos_operativos',
};

// Columnas permitidas por tabla (whitelist para writes: descarta campos de
// Base44 que no existen en el esquema migrado y evita "column does not exist").
const COLUMNS = {
  sucursales: ['nombre','direccion','telefono','activa','folio_prefijo','orden_visual','notas','google_maps_url','whatsapp_numero'],
  usuarios_pos: ['nombre','rol','activo','color','telefono','correo','sucursal_id','sucursal_nombre','permisos_extra'],
  configuracion_negocio: ['nombre_negocio','nombre_sistema','platform_brand','logo_url','logo_ticket_url','logo_pdf_url','background_logo_url','background_image_url','background_fit','background_opacity','color_primario','color_secundario','color_acento','colorear_importes_monetarios','moneda','simbolo_moneda','iva_porcentaje','paquete_modo','usa_mesas','usa_cocina','usa_barra','permitir_venta_sin_stock','mostrar_costos_a_caja','mostrar_logo_ticket','mensaje_ticket','ticket_footer','pdf_footer','footer_text','descargar_pdf_corte_auto','formato_export_default','modo_presentacion_activo','presentacion_password','propinas_activas','propina_porcentajes_sugeridos','sonidos_activos','hora_inicio_dia_operativo','precio_kilo_global','precio_kilo_es_global','precio_kilo_por_sucursal','ratio_personas_por_kilo','ratio_personas_es_global','ratio_personas_por_sucursal','extras_pastel','rellenos_pastel','base_rangos','direccion','telefono','whatsapp','correo','ancho_impresora'],
  categorias_producto: ['nombre','descripcion','color','icono','orden','activo'],
  productos: ['nombre','categoria_id','categoria_nombre','descripcion','descripcion_web','sucursal_ids','precio_venta','imagen_url','orden','activo','visible_en_pos','visible_en_web','notas'],
  cortes_caja: ['folio','tipo_corte','sucursal_id','sucursal_nombre','fecha_inicio','fecha_apertura','fecha_cierre','usuario_cajero_id','usuario_cajero_nombre','usuario_apertura_id','usuario_apertura_nombre','efectivo_inicial_contado','fondo_esperado_apertura','diferencia_apertura','total_efectivo','total_tarjeta','total_transferencia','total_general','total_descuentos','total_cancelaciones','numero_ventas','ticket_promedio','efectivo_esperado','efectivo_contado','diferencia_efectivo','dinero_dejado_en_caja','total_gastos','estado','notas'],
  ventas: ['folio','sucursal_id','sucursal_nombre','fecha_apertura','fecha_cierre','tipo_venta','cliente_nombre','cliente_id','codigo_caja','usuario_cajero_id','usuario_cajero_nombre','estado','subtotal','descuentos','impuestos','total','metodo_pago','monto_efectivo','monto_tarjeta','monto_transferencia','cambio','notas','motivo_cancelacion','corte_caja_id','tipo_cancelacion','monto_devuelto','fecha_cancelacion','cancelado_por_id','cancelado_por_nombre'],
  detalle_venta: ['venta_id','producto_id','producto_nombre','cantidad','precio_unitario_snapshot','costo_unitario_snapshot','subtotal','notas_producto','estado_preparacion'],
  pedidos: ['folio','sucursal_id','sucursal_nombre','origen','tipo_pedido','estado','cliente_nombre','cliente_telefono','cliente_email','cliente_direccion','requiere_entrega','fecha_entrega','hora_entrega','kilos','personas_estimadas','decorado','concepto','rellenos','leyenda_pastel','incluye_base','precio_base','incluye_oblea','precio_oblea','incluye_muneca','precio_muneca','incluye_velas','precio_velas','precio_kilo_usado','subtotal_pastel','subtotal_extras','total_calculado','total_final','a_cuenta','resta','total_abonado','saldo_pendiente','nota_interna','imagen_referencia_url','notas_generales','creado_por_id','creado_por_nombre','fecha_confirmacion','fecha_anticipo','fecha_pago_completo','fecha_entrega_real','tipo_cancelacion','motivo_cancelacion','cancelado_por_id','cancelado_por_nombre','fecha_cancelacion','monto_devuelto','nota_voz_url','nota_voz_transcripcion','extras_seleccionados','atendido_por'],
  abonos: ['pedido_id','sucursal_id','sucursal_nombre','monto','metodo_pago','monto_efectivo','monto_tarjeta','monto_transferencia','afecta_caja','corte_caja_id','registrado_por_id','registrado_por_nombre','fecha_abono','notas'],
  folio_contador: ['tipo','sucursal_id','prefijo','ultimo_numero'],
  gastos_operativos: ['fecha','categoria','descripcion','monto','metodo_pago','sucursal_id','sucursal_nombre','usuario_id','usuario_nombre','notas','corte_caja_id'],
};

// Base44 usaba created_date/updated_date; el esquema migrado usa created_at.
const FIELD_ALIAS = { created_date: 'created_at', updated_date: 'created_at' };
const mapField = (f) => FIELD_ALIAS[f] || f;

// En lectura, expone created_date/updated_date como alias de created_at para
// no romper a los consumidores (sorts, formateo de fechas, etc.).
function decorateRow(row) {
  if (row && typeof row === 'object' && 'created_at' in row) {
    if (!('created_date' in row)) row.created_date = row.created_at;
    if (!('updated_date' in row)) row.updated_date = row.created_at;
  }
  return row;
}
const decorate = (rows) => Array.isArray(rows) ? rows.map(decorateRow) : decorateRow(rows);

// Limpia el payload de escritura: solo columnas válidas de la tabla.
function pickColumns(table, obj) {
  const allowed = COLUMNS[table];
  if (!allowed || !obj) return {};
  const out = {};
  for (const k of allowed) if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// Aplica un valor de filtro (con o sin operadores Mongo) a un builder Supabase.
function applyCondition(builder, field, value) {
  const col = mapField(field);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [op, v] of Object.entries(value)) {
      switch (op) {
        case '$in':  builder = builder.in(col, v); break;
        case '$nin': builder = builder.not(col, 'in', `(${(v || []).join(',')})`); break;
        case '$ne':  builder = builder.neq(col, v); break;
        case '$gt':  builder = builder.gt(col, v); break;
        case '$gte': builder = builder.gte(col, v); break;
        case '$lt':  builder = builder.lt(col, v); break;
        case '$lte': builder = builder.lte(col, v); break;
        case '$exists': builder = v ? builder.not(col, 'is', null) : builder.is(col, null); break;
        default:     builder = builder.eq(col, v); break;
      }
    }
  } else if (value === null) {
    builder = builder.is(col, null);
  } else {
    builder = builder.eq(col, value);
  }
  return builder;
}

// "-created_date" -> order(created_at, desc) ; "orden" -> order(orden, asc)
function applySort(builder, sort) {
  if (!sort || typeof sort !== 'string') return builder.order('id', { ascending: true });
  const desc = sort.startsWith('-');
  const col = mapField(desc ? sort.slice(1) : sort);
  const ordered = builder.order(col, { ascending: !desc, nullsFirst: false });
  return col === 'id' ? ordered : ordered.order('id', { ascending: !desc });
}

function ordenarCompleto(rows, sort) {
  if (sort) {
    const desc = sort.startsWith('-');
    const field = mapField(desc ? sort.slice(1) : sort);
    rows.sort((a, b) => a[field] == null ? (b[field] == null ? 0 : 1) : b[field] == null ? -1 :
      ((a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : String(a.id).localeCompare(String(b.id))) * (desc ? -1 : 1)));
  }
  return decorate(rows);
}
const TABLAS_FINANCIERAS = new Set(['ventas','detalle_venta','abonos','gastos_operativos','pedidos','cortes_caja']);

function makeEntity(entityName) {
  const table = TABLE_MAP[entityName];

  // Entidad de plantilla (lista roja) que pudiera quedar referenciada por un
  // componente verde (p. ej. CorteViewer lee Ingrediente/Receta para costos que
  // Confetti no usa): stub inocuo -> [] / no-op. Preserva el comportamiento
  // (esos datos siempre fueron vacíos/0 en Confetti) sin romper la pantalla.
  if (!table) {
    return {
      async filter() { return []; },
      async list() { return []; },
      async listAll() { return []; },
      async filterAll() { return []; },
      async get() { return null; },
      async create() { throw new Error(`ENTIDAD_NO_DISPONIBLE: ${entityName} no permite guardar datos en este sistema.`); },
      async update() { throw new Error(`ENTIDAD_NO_DISPONIBLE: ${entityName} no permite guardar datos en este sistema.`); },
      async delete() { throw new Error(`ENTIDAD_NO_DISPONIBLE: ${entityName} no permite borrar datos en este sistema.`); },
      async bulkCreate() { throw new Error(`ENTIDAD_NO_DISPONIBLE: ${entityName} no permite guardar datos en este sistema.`); },
    };
  }

  const run = async (build) => {
    await ensureSession();
    const { data, error } = await build(supabase.from(table));
    if (error) {
      // ADITIVO: se conserva el mismo `message` de siempre (los call-sites que
      // sólo leen err.message no cambian), pero además se propaga el SQLSTATE
      // de PostgREST para poder distinguir casos concretos. Sin esto, una
      // violación de índice único (23505) llegaba indistinguible de cualquier
      // otro fallo. Lo usa handleAbrirCaja para el mensaje "ya existe caja
      // abierta" cuando dos dispositivos abren a la vez.
      /** @type {Error & { code?: string, details?: string }} */
      const e = new Error(`[${table}] ${error.message}`);
      if (error.code) e.code = error.code;
      if (error.details) e.details = error.details;
      throw e;
    }
    return data;
  };

  const selectColumns = table === 'usuarios_pos' ? 'id,created_at,nombre,rol,activo,color,telefono,correo,sucursal_id,sucursal_nombre,permisos_extra' : '*';
  return {
    async filter(query = {}, sort, limit, skip) {
      return run((q) => {
        let b = q.select(selectColumns);
        for (const [field, value] of Object.entries(query || {})) b = applyCondition(b, field, value);
        b = applySort(b, sort);
        if (typeof skip === 'number' && typeof limit === 'number') b = b.range(skip, skip + limit - 1);
        else if (typeof limit === 'number') b = b.limit(limit);
        return b;
      }).then(decorate);
    },
    async list(sort, limit, skip) {
      return run((q) => {
        let b = q.select(selectColumns);
        b = applySort(b, sort);
        if (typeof skip === 'number' && typeof limit === 'number') b = b.range(skip, skip + limit - 1);
        else if (typeof limit === 'number') b = b.limit(limit);
        return b;
      }).then(decorate);
    },
    async filterAll(query = {}, sort) {
      if (TABLAS_FINANCIERAS.has(table)) {
        await ensureSession();
        const filtro = Object.fromEntries(Object.entries(query || {}).map(([key, value]) => [mapField(key), value]));
        const { data, error } = await supabase.rpc('historial_operativo_pos', { p_tabla: table, p_filtro: filtro });
        if (error) throw new Error(`[${table}] ${error.message}`);
        if (!Array.isArray(data)) throw new Error(`[${table}] respuesta financiera incompleta`);
        return ordenarCompleto(data, sort);
      }
      const contar = async () => {
        await ensureSession();
        let b = supabase.from(table).select('id', { count: 'exact', head: true });
        for (const [field, value] of Object.entries(query || {})) b = applyCondition(b, field, value);
        const { count, error } = await b;
        if (error) throw new Error(`[${table}] ${error.message}`);
        if (typeof count !== 'number' || !Number.isFinite(count)) throw new Error(`[${table}] no se pudo verificar la cantidad de registros`);
        return count;
      };
      const esperado = await contar();
      const rows = [];
      let cursor = null;
      // Cursor por ID inmutable: no saltar PAGE si la API devuelve menos.
      // La página vacía es el final; una página corta NO significa completo.
      for (;;) {
        const page = await run((q) => {
          let b = q.select(selectColumns);
          for (const [field, value] of Object.entries(query || {})) b = applyCondition(b, field, value);
          if (cursor) b = b.gt('id', cursor);
          return b.order('id', { ascending: true }).limit(500);
        });
        if (!Array.isArray(page)) throw new Error(`[${table}] respuesta incompleta`);
        if (!page.length) break;
        const next = page[page.length - 1]?.id;
        if (!next || next === cursor) throw new Error(`[${table}] paginación sin avance`);
        rows.push(...page);
        cursor = next;
      }
      const obtenido = new Set(rows.map(row => row.id)).size;
      if (obtenido !== rows.length || obtenido !== esperado || await contar() !== esperado) {
        throw new Error(`[${table}] los datos cambiaron durante la consulta. Reintenta para obtener una lista completa.`);
      }
      return ordenarCompleto(rows, sort);
    },
    async listAll(sort) { return this.filterAll({}, sort); },
    async get(id) {
      const data = await run((q) => q.select(selectColumns).eq('id', id).maybeSingle());
      return decorate(data);
    },
    async create(obj) {
      const data = await run((q) => q.insert(pickColumns(table, obj)).select().single());
      return decorate(data);
    },
    async bulkCreate(arr) {
      const rows = (Array.isArray(arr) ? arr : []).map((o) => pickColumns(table, o));
      const data = await run((q) => q.insert(rows).select());
      return decorate(data);
    },
    async update(id, obj) {
      if (table === 'usuarios_pos') {
        await ensureSession();
        const { data, error } = await supabase.rpc('actualizar_usuario_pos', { p_user_id: id, p_cambios: pickColumns(table, obj), p_motivo: obj?.activo === false ? 'Desactivación desde Configuración' : 'Edición desde Configuración' });
        if (error) throw new Error(error.message);
        return decorate(data);
      }
      const data = await run((q) => q.update(pickColumns(table, obj)).eq('id', id).select().single());
      return decorate(data);
    },
    async delete(id) {
      await run((q) => q.delete().eq('id', id));
      return { success: true };
    },
  };
}

// Proxy: entities.<CualquierEntidad> devuelve un adaptador (memoizado).
const _cache = {};
/** @type {Record<string, ReturnType<typeof makeEntity>>} */
export const entities = new Proxy({}, {
  get(_t, name) {
    if (typeof name !== 'string') return undefined;
    if (!_cache[name]) _cache[name] = makeEntity(name);
    return _cache[name];
  },
});

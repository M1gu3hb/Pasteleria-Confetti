-- ============================================================================
-- Pastelería Confetti — Esquema unificado POS + Web (PROPUESTA — Fase 1)
-- ----------------------------------------------------------------------------
-- Arquitectura: Opción A (una sola DB Supabase compartida POS + Web, separadas
-- por RLS). Destino: proyecto staging `ivqcxdpqxwjxfohiswqb` (schema public vacío).
--
-- ⚠️ ESTO ES UNA PROPUESTA. NO APLICAR sin auditoría de Miguel + arquitecto.
--    No toca datos reales, ni Base44, ni la api_key.
--
-- Convenciones:
--   * snake_case en todo (tablas y columnas).
--   * IDs uuid (gen_random_uuid, core en PG13+). Al migrar datos se generan
--     nuevos uuid y se remapean referencias (Fase 2/6).
--   * created_at timestamptz default now() (Base44 ignoraba created_date en POST;
--     aquí lo controla la DB). El adaptador mapea created_date -> created_at.
--   * "enums" como text + CHECK (no tipos ENUM nativos): más fácil evolucionar
--     estados sin ALTER TYPE. Mismos valores que Base44.
--   * sucursal_id = columna vertebral en todo registro operativo.
--   * Snapshots de nombre/precio en detalle_venta para que el hard-delete de
--     un producto NO reescriba el histórico.
--
-- Lista verde (12 tablas). `clientes` NO se crea: 0 referencias en src (audit);
-- cliente_nombre/cliente_id viven inline en ventas/pedidos.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) sucursales
-- ────────────────────────────────────────────────────────────────────────────
create table sucursales (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  direccion      text,
  telefono       text,
  activa         boolean not null default true,
  folio_prefijo  text not null,            -- A / B / C
  orden_visual   numeric,
  notas          text,
  created_at     timestamptz not null default now(),
  unique (folio_prefijo)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) usuarios_pos   (PIN nunca en claro; Auth real + hash en Fase 4)
-- ────────────────────────────────────────────────────────────────────────────
create table usuarios_pos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  rol            text not null check (rol in ('administrador','caja','mesero','cocina','barra')),
  pin_hash       text,                     -- hash del PIN (Fase 4). NUNCA texto plano.
  auth_user_id   uuid,                     -- mapeo a auth.users (Supabase Auth) — Fase 4
  activo         boolean not null default true,
  color          text,
  telefono       text,
  correo         text,
  sucursal_id    uuid references sucursales(id),
  sucursal_nombre text,
  permisos_extra jsonb,
  created_at     timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) configuracion_negocio   (solo el subconjunto que usa Confetti — doc 02/05)
--    NOTA: el set exacto de campos se confirma contra los datos vivos en Fase 2.
-- ────────────────────────────────────────────────────────────────────────────
create table configuracion_negocio (
  id                         uuid primary key default gen_random_uuid(),
  nombre_negocio             text not null,
  logo_url                   text,
  color_primario             text,
  color_acento               text,
  moneda                     text default 'MXN',
  -- precios de pastel
  precio_kilo_global         numeric,
  precio_kilo_es_global      boolean default true,
  precio_kilo_por_sucursal   jsonb,
  ratio_personas_por_kilo    numeric default 10,
  ratio_personas_es_global   boolean default true,
  ratio_personas_por_sucursal jsonb,
  -- extras / rellenos de pastel (antes sincronizados al WEB_CONFIG_ID por el puente)
  extras_pastel              jsonb,
  rellenos_pastel            jsonb,
  -- ajustes de folio / ticket
  ticket_config              jsonb,
  -- lock de "modo presentación" (UI local; default histórico '2797')
  presentacion_password      text,
  created_at                 timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) categorias_producto
-- ────────────────────────────────────────────────────────────────────────────
create table categorias_producto (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  color       text,
  icono       text,
  orden       numeric,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5) productos   (ex ProductoTerminado; campos POS + web unificados)
--    Sin `producto_pos_id` (muere el puente). Sin columna de costo/margen
--    (Confetti no la usa); si algún día se agrega, NO debe entrar a catalogo_publico.
-- ────────────────────────────────────────────────────────────────────────────
create table productos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  categoria_id    uuid references categorias_producto(id),
  categoria_nombre text,                   -- snapshot; la web agrupa por este string
  descripcion     text,
  descripcion_web text,
  sucursal_ids    uuid[],                  -- vacío/null = global (todas las sucursales)
  precio_venta    numeric not null,
  imagen_url      text,
  orden           numeric,
  activo          boolean not null default true,
  visible_en_pos  boolean not null default true,
  visible_en_web  boolean not null default false,
  notas           text,
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6) cortes_caja   (un corte por sucursal; nunca caja global)
-- ────────────────────────────────────────────────────────────────────────────
create table cortes_caja (
  id                       uuid primary key default gen_random_uuid(),
  folio                    text not null,
  tipo_corte               text not null default 'cierre_diario' check (tipo_corte in ('cierre_diario','turno')),
  sucursal_id              uuid not null references sucursales(id),
  sucursal_nombre          text,
  fecha_inicio             timestamptz,
  fecha_apertura           timestamptz,
  fecha_cierre             timestamptz,
  usuario_cajero_id        uuid,           -- sin FK: se guarda id + nombre (snapshot)
  usuario_cajero_nombre    text,
  usuario_apertura_id      uuid,
  usuario_apertura_nombre  text,
  efectivo_inicial_contado numeric default 0,
  fondo_esperado_apertura  numeric default 0,
  diferencia_apertura      numeric default 0,
  total_efectivo           numeric default 0,
  total_tarjeta            numeric default 0,
  total_transferencia      numeric default 0,
  total_general            numeric default 0,   -- ventas sin propina
  total_descuentos         numeric default 0,
  total_cancelaciones      numeric default 0,
  numero_ventas            numeric default 0,
  ticket_promedio          numeric default 0,
  efectivo_esperado        numeric default 0,
  efectivo_contado         numeric default 0,
  diferencia_efectivo      numeric default 0,
  dinero_dejado_en_caja    numeric default 0,
  total_gastos             numeric default 0,
  estado                   text not null default 'abierto' check (estado in ('abierto','cerrado','registrado')),
  notas                    text,
  created_at               timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 7) ventas   (transacción de mostrador; también la "venta paralela" del abono)
--    Cancelar NUNCA borra: es cambio de estado + sellos.
-- ────────────────────────────────────────────────────────────────────────────
create table ventas (
  id                   uuid primary key default gen_random_uuid(),
  folio                text not null,
  sucursal_id          uuid not null references sucursales(id),
  sucursal_nombre      text,
  fecha_apertura       timestamptz,
  fecha_cierre         timestamptz,
  tipo_venta           text not null default 'mostrador' check (tipo_venta in ('mesa','mostrador','para_llevar','delivery')),
  cliente_nombre       text,
  cliente_id           uuid,
  codigo_caja          text,
  usuario_cajero_id    uuid,               -- sin FK: id + nombre (snapshot)
  usuario_cajero_nombre text,
  estado               text not null default 'abierta'
                         check (estado in ('abierta','enviada','en_preparacion','lista','cuenta_solicitada','pagada','cancelada')),
  subtotal             numeric default 0,
  descuentos           numeric default 0,
  impuestos            numeric default 0,
  total                numeric default 0,
  metodo_pago          text check (metodo_pago in ('efectivo','tarjeta','transferencia','mixto')),
  monto_efectivo       numeric default 0,
  monto_tarjeta        numeric default 0,
  monto_transferencia  numeric default 0,
  cambio               numeric default 0,
  notas                text,
  motivo_cancelacion   text,
  corte_caja_id        uuid references cortes_caja(id),   -- 🔒 CANDADO 1: asociación venta↔corte
  -- cancelación / devolución (agregados)
  tipo_cancelacion     text check (tipo_cancelacion in ('cancelacion','devolucion')),
  monto_devuelto       numeric not null default 0,
  fecha_cancelacion    timestamptz,
  cancelado_por_id     uuid,
  cancelado_por_nombre text,
  created_at           timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8) detalle_venta   (líneas con snapshots)
--    producto_id SIN FK: el histórico sobrevive al hard-delete del producto.
-- ────────────────────────────────────────────────────────────────────────────
create table detalle_venta (
  id                       uuid primary key default gen_random_uuid(),
  venta_id                 uuid not null references ventas(id) on delete cascade,
  producto_id              uuid not null,            -- sin FK a propósito (snapshots)
  producto_nombre          text,                     -- snapshot congelado
  cantidad                 numeric not null,
  precio_unitario_snapshot numeric,                  -- snapshot congelado
  costo_unitario_snapshot  numeric,
  subtotal                 numeric,
  notas_producto           text,
  estado_preparacion       text default 'pendiente',
  created_at               timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 9) pedidos   (ex PedidoPastel — pastel personalizado Y catálogo web)
--    tipo_pedido EXPLÍCITO. NOT NULL de pastel relajados para catálogo:
--    kilos default 0; fecha_entrega nullable.
-- ────────────────────────────────────────────────────────────────────────────
create table pedidos (
  id                  uuid primary key default gen_random_uuid(),
  folio               text not null,                  -- unificado (ex folio / folio_pedido)
  sucursal_id         uuid not null references sucursales(id),
  sucursal_nombre     text,
  origen              text not null default 'pos_interno' check (origen in ('pos_interno','web')),
  tipo_pedido         text not null default 'pastel_personalizado'
                        check (tipo_pedido in ('pastel_personalizado','productos_catalogo')),
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente','confirmado','con_anticipo','pagado','entregado','cancelado')),
  cliente_nombre      text not null,
  cliente_telefono    text not null,
  cliente_email       text,
  cliente_direccion   text,
  requiere_entrega    boolean not null default false,
  fecha_entrega       date,                           -- NULLABLE (catálogo puede no traerla)
  hora_entrega        text,
  kilos               numeric not null default 0,     -- catálogo = 0
  personas_estimadas  numeric,
  decorado            text,
  concepto            text,
  rellenos            text,
  leyenda_pastel      text,
  incluye_base        boolean default false,
  precio_base         numeric default 0,
  incluye_oblea       boolean default false,
  precio_oblea        numeric default 0,
  incluye_muneca      boolean default false,
  precio_muneca       numeric default 0,
  incluye_velas       boolean default false,
  precio_velas        numeric default 0,
  precio_kilo_usado   numeric,
  subtotal_pastel     numeric default 0,
  subtotal_extras     numeric default 0,
  total_calculado     numeric default 0,
  total_final         numeric default 0,
  a_cuenta            numeric default 0,              -- legacy (solo dato)
  resta               numeric default 0,
  total_abonado       numeric not null default 0,     -- suma de abonos
  saldo_pendiente     numeric not null default 0,     -- = total_final - total_abonado (lo mantiene la app)
  nota_interna        text,
  imagen_referencia_url text,
  notas_generales     text,                           -- catálogo: productos como texto
  creado_por_id       uuid,
  creado_por_nombre   text,
  fecha_confirmacion  timestamptz,
  fecha_anticipo      timestamptz,
  fecha_pago_completo timestamptz,
  fecha_entrega_real  timestamptz,
  created_at          timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 10) abonos   (sellado con la sucursal DEL PEDIDO; la venta paralela va al corte
--     abierto de la sucursal DEL TERMINAL — ver reporte de comprensión)
-- ────────────────────────────────────────────────────────────────────────────
create table abonos (
  id                  uuid primary key default gen_random_uuid(),
  pedido_id           uuid not null references pedidos(id),
  sucursal_id         uuid not null references sucursales(id),   -- sucursal del PEDIDO
  sucursal_nombre     text,
  monto               numeric not null,
  metodo_pago         text not null check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  afecta_caja         boolean not null default true,
  corte_caja_id       uuid references cortes_caja(id),           -- corte abierto al registrar
  registrado_por_id   uuid,
  registrado_por_nombre text,
  fecha_abono         timestamptz default now(),
  notas               text,
  created_at          timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 11) folio_contador   (uno por tipo + sucursal). Folios ATÓMICOS vía función.
-- ────────────────────────────────────────────────────────────────────────────
create table folio_contador (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,             -- p.ej. pedido_pastel | venta | corte
  sucursal_id   uuid not null references sucursales(id),
  prefijo       text not null,             -- A/B/C (snapshot del prefijo de la sucursal)
  ultimo_numero numeric not null default 0,
  created_at    timestamptz not null default now(),
  unique (tipo, sucursal_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12) gastos_operativos
-- ────────────────────────────────────────────────────────────────────────────
create table gastos_operativos (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  categoria       text,                    -- valores enum a confirmar en Fase 2
  descripcion     text not null,
  monto           numeric not null,
  metodo_pago     text check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  sucursal_id     uuid references sucursales(id),   -- la app/RLS fuerza la sucursal (regla vertebral)
  sucursal_nombre text,
  usuario_id      uuid,
  usuario_nombre  text,
  notas           text,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- FOLIOS ATÓMICOS  (reemplaza el read-increment-write no atómico de Base44)
-- siguiente_folio(tipo, sucursal) -> incrementa con bloqueo de fila y devuelve
-- el folio formateado. Elimina la condición de carrera por (tipo, sucursal).
-- ============================================================================
create or replace function siguiente_folio(p_tipo text, p_sucursal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefijo text;
  v_num     bigint;
begin
  select folio_prefijo into v_prefijo from sucursales where id = p_sucursal_id;
  if v_prefijo is null then
    raise exception 'Sucursal % inexistente o sin folio_prefijo', p_sucursal_id;
  end if;

  -- asegura el contador sin pisar el valor si ya existe
  insert into folio_contador (tipo, sucursal_id, prefijo, ultimo_numero)
  values (p_tipo, p_sucursal_id, v_prefijo, 0)
  on conflict (tipo, sucursal_id) do nothing;

  -- incremento atómico (lock de fila) y nuevo número
  update folio_contador
     set ultimo_numero = ultimo_numero + 1
   where tipo = p_tipo and sucursal_id = p_sucursal_id
  returning ultimo_numero into v_num;

  return case p_tipo
    when 'venta'         then format('CONF-%s-V%s', v_prefijo, v_num)
    when 'corte'         then format('CONF-%s-C%s', v_prefijo, lpad(v_num::text, 3, '0'))
    when 'pedido_pastel' then format('PP-%s-%s',   v_prefijo, lpad(v_num::text, 4, '0'))
    else format('%s-%s-%s', p_tipo, v_prefijo, v_num)
  end;
end;
$$;

-- ============================================================================
-- VISTAS PÚBLICAS (para la Web futura con anon key)
-- security_invoker = false (corren como owner) para exponer SOLO lo curado sin
-- dar acceso directo a las tablas base. NUNCA exponen costo/margen ni datos
-- operativos/internos.
-- ============================================================================
create view catalogo_publico
with (security_invoker = false) as
  select id, nombre, descripcion_web, precio_venta, categoria_nombre,
         imagen_url, sucursal_ids, orden
  from productos
  where visible_en_web = true and activo = true;

create view config_publica
with (security_invoker = false) as
  select nombre_negocio, logo_url, color_primario, color_acento,
         precio_kilo_global, ratio_personas_por_kilo
  from configuracion_negocio;   -- sin presentacion_password ni jsonb internos

-- ============================================================================
-- ÍNDICES (rutas calientes: corte / dinero / colas)
-- ============================================================================
create index idx_ventas_estado            on ventas (estado);
create index idx_ventas_sucursal          on ventas (sucursal_id);
create index idx_ventas_corte             on ventas (corte_caja_id);
create index idx_ventas_fecha_cierre      on ventas (fecha_cierre);
create index idx_ventas_folio             on ventas (folio);
create index idx_detalle_venta_venta      on detalle_venta (venta_id);
create index idx_pedidos_origen_estado    on pedidos (origen, estado, sucursal_id);
create index idx_pedidos_folio            on pedidos (folio);
create index idx_pedidos_sucursal_estado  on pedidos (sucursal_id, estado);
create index idx_abonos_pedido            on abonos (pedido_id);
create index idx_abonos_corte             on abonos (corte_caja_id);
create index idx_cortes_sucursal_estado   on cortes_caja (sucursal_id, estado);
create index idx_productos_web            on productos (visible_en_web, activo);
create index idx_productos_categoria      on productos (categoria_id);

-- ============================================================================
-- RLS
-- Política de esta fase:
--   * ANON (web pública): restrictiva de verdad.
--   * AUTHENTICATED (POS): AMPLIA y TEMPORAL, para no estorbar la validación de
--     dinero (Fase 3). El blindaje real por rol/sucursal entra en Fase 4.
-- (En Fase 2 el POS abre una sesión Supabase Auth temporal -> rol authenticated.)
-- ============================================================================
alter table sucursales            enable row level security;
alter table usuarios_pos          enable row level security;
alter table configuracion_negocio enable row level security;
alter table categorias_producto   enable row level security;
alter table productos             enable row level security;
alter table cortes_caja           enable row level security;
alter table ventas                enable row level security;
alter table detalle_venta         enable row level security;
alter table pedidos               enable row level security;
alter table abonos                enable row level security;
alter table folio_contador        enable row level security;
alter table gastos_operativos     enable row level security;

-- ---- POS (authenticated): acceso amplio TEMPORAL (Fase 4 lo restringe) -------
create policy pos_all_sucursales            on sucursales            for all to authenticated using (true) with check (true);
create policy pos_all_usuarios_pos          on usuarios_pos          for all to authenticated using (true) with check (true);
create policy pos_all_configuracion_negocio on configuracion_negocio for all to authenticated using (true) with check (true);
create policy pos_all_categorias_producto   on categorias_producto   for all to authenticated using (true) with check (true);
create policy pos_all_productos             on productos             for all to authenticated using (true) with check (true);
create policy pos_all_cortes_caja           on cortes_caja           for all to authenticated using (true) with check (true);
create policy pos_all_ventas                on ventas                for all to authenticated using (true) with check (true);
create policy pos_all_detalle_venta         on detalle_venta         for all to authenticated using (true) with check (true);
create policy pos_all_pedidos               on pedidos               for all to authenticated using (true) with check (true);
create policy pos_all_abonos                on abonos                for all to authenticated using (true) with check (true);
create policy pos_all_folio_contador        on folio_contador        for all to authenticated using (true) with check (true);
create policy pos_all_gastos_operativos     on gastos_operativos     for all to authenticated using (true) with check (true);

-- ---- ANON (web pública): SOLO lo permitido --------------------------------
-- Catálogo / config: vía VISTAS (no las tablas). Sucursales y categorías activas
-- se pueden leer directo (no traen datos internos).
create policy anon_select_sucursales on sucursales          for select to anon using (activa = true);
create policy anon_select_categorias on categorias_producto for select to anon using (activo = true);

-- Pedidos: SOLO INSERT, forzado a web/pendiente. Sin SELECT/UPDATE/DELETE.
create policy anon_insert_pedidos on pedidos
  for insert to anon
  with check (origen = 'web' and estado = 'pendiente');

-- (Sin políticas anon para: ventas, cortes_caja, abonos, detalle_venta,
--  usuarios_pos, folio_contador, gastos_operativos, productos, configuracion_negocio
--  -> RLS default-deny. Además revocamos GRANTs como defensa en profundidad.)

-- ============================================================================
-- GRANTS / REVOKES  (defensa en profundidad sobre el default de Supabase)
-- ============================================================================
-- Vistas públicas legibles por anon y authenticated:
grant select on catalogo_publico to anon, authenticated;
grant select on config_publica   to anon, authenticated;

-- Quitar a anon todo acceso a tablas sensibles (RLS ya deniega; esto lo hace explícito):
revoke all on ventas            from anon;
revoke all on cortes_caja       from anon;
revoke all on abonos            from anon;
revoke all on detalle_venta     from anon;
revoke all on usuarios_pos      from anon;
revoke all on folio_contador    from anon;
revoke all on gastos_operativos from anon;
revoke all on productos         from anon;   -- la web usa catalogo_publico
revoke all on configuracion_negocio from anon; -- la web usa config_publica

-- ============================================================================
-- PRUEBAS ADVERSARIALES (para correr DESPUÉS de aplicar, con luz verde)
--   set role anon;
--   select * from ventas;                    -- debe FALLAR / 0 filas (sin acceso)
--   insert into pedidos(folio,sucursal_id,cliente_nombre,cliente_telefono,
--     origen,estado) values ('X', '<uuid>','x','x','web','pagada'); -- debe FALLAR (WITH CHECK)
--   insert into pedidos(...,origen,estado) values (...,'web','pendiente'); -- debe PASAR
--   reset role;
-- ============================================================================

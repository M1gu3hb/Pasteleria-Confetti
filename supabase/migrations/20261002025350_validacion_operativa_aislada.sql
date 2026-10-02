create schema confetti_validacion_20261002; revoke all on schema confetti_validacion_20261002 from public,anon,authenticated; set local search_path=confetti_validacion_20261002,pg_catalog;
create function confetti_validacion_20261002.auth_uid() returns uuid language sql stable as $$ select nullif(current_setting('confetti_test.uid',true),'')::uuid $$;
create table confetti_validacion_20261002.sucursales ("id" uuid default gen_random_uuid() not null, "activa" boolean default true not null, "orden_visual" numeric, "created_at" timestamp with time zone default now() not null, "nombre" text not null, "direccion" text, "telefono" text, "folio_prefijo" text not null, "notas" text, "google_maps_url" text, "whatsapp_numero" text);
create table confetti_validacion_20261002.usuarios_pos ("created_at" timestamp with time zone default now() not null, "id" uuid default gen_random_uuid() not null, "auth_user_id" uuid, "activo" boolean default true not null, "sucursal_id" uuid, "permisos_extra" jsonb, "sucursal_nombre" text, "nombre" text not null, "rol" text not null, "pin_hash" text, "color" text, "telefono" text, "correo" text);
create table confetti_validacion_20261002.configuracion_negocio ("id" uuid default gen_random_uuid() not null, "precio_kilo_global" numeric, "precio_kilo_es_global" boolean default true, "ratio_personas_por_kilo" numeric default 10, "ratio_personas_es_global" boolean default true, "created_at" timestamp with time zone default now() not null, "background_opacity" numeric, "colorear_importes_monetarios" boolean, "iva_porcentaje" numeric, "usa_mesas" boolean, "usa_cocina" boolean, "usa_barra" boolean, "permitir_venta_sin_stock" boolean, "mostrar_costos_a_caja" boolean, "mostrar_logo_ticket" boolean, "descargar_pdf_corte_auto" boolean, "modo_presentacion_activo" boolean, "propinas_activas" boolean default false, "sonidos_activos" boolean default true, "background_fit" text, "propina_porcentajes_sugeridos" text, "color_secundario" text, "formato_export_default" text, "simbolo_moneda" text, "ancho_impresora" text default '58'::text not null, "paquete_modo" text, "hora_inicio_dia_operativo" text, "direccion" text, "telefono" text, "whatsapp" text, "correo" text, "nombre_negocio" text not null, "logo_url" text, "color_primario" text, "color_acento" text, "moneda" text default 'MXN'::text, "base_rangos" text, "mensaje_ticket" text, "precio_kilo_por_sucursal" text, "ticket_footer" text, "pdf_footer" text, "ratio_personas_por_sucursal" text, "extras_pastel" text, "rellenos_pastel" text, "presentacion_password" text, "footer_text" text, "nombre_sistema" text, "platform_brand" text, "logo_ticket_url" text, "logo_pdf_url" text, "background_logo_url" text, "background_image_url" text);
create table confetti_validacion_20261002.productos ("id" uuid default gen_random_uuid() not null, "categoria_id" uuid, "sucursal_ids" uuid[], "precio_venta" numeric not null, "orden" numeric, "activo" boolean default true not null, "visible_en_pos" boolean default true not null, "visible_en_web" boolean default false not null, "created_at" timestamp with time zone default now() not null, "nombre" text not null, "categoria_nombre" text, "descripcion" text, "descripcion_web" text, "imagen_url" text, "notas" text);
create table confetti_validacion_20261002.categorias_producto ("id" uuid default gen_random_uuid() not null, "orden" numeric, "activo" boolean default true not null, "created_at" timestamp with time zone default now() not null, "nombre" text not null, "descripcion" text, "color" text, "icono" text);
create table confetti_validacion_20261002.ventas ("id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "fecha_apertura" timestamp with time zone, "fecha_cierre" timestamp with time zone, "subtotal" numeric default 0, "descuentos" numeric default 0, "impuestos" numeric default 0, "total" numeric default 0, "monto_efectivo" numeric default 0, "monto_tarjeta" numeric default 0, "monto_transferencia" numeric default 0, "cambio" numeric default 0, "corte_caja_id" uuid, "monto_devuelto" numeric default 0 not null, "fecha_cancelacion" timestamp with time zone, "created_at" timestamp with time zone default now() not null, "folio" text not null, "sucursal_nombre" text, "tipo_venta" text default 'mostrador'::text not null, "cliente_nombre" text, "cliente_id" text, "codigo_caja" text, "usuario_cajero_id" text, "usuario_cajero_nombre" text, "estado" text default 'abierta'::text not null, "metodo_pago" text, "notas" text, "motivo_cancelacion" text, "tipo_cancelacion" text, "cancelado_por_id" text, "cancelado_por_nombre" text, "idempotency_key" text);
create table confetti_validacion_20261002.detalle_venta ("id" uuid default gen_random_uuid() not null, "venta_id" uuid not null, "producto_id" uuid, "cantidad" numeric not null, "precio_unitario_snapshot" numeric, "costo_unitario_snapshot" numeric, "subtotal" numeric, "created_at" timestamp with time zone default now() not null, "producto_nombre" text, "notas_producto" text, "estado_preparacion" text default 'pendiente'::text);
create table confetti_validacion_20261002.cortes_caja ("id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "fecha_inicio" timestamp with time zone, "fecha_apertura" timestamp with time zone, "fecha_cierre" timestamp with time zone, "efectivo_inicial_contado" numeric default 0, "fondo_esperado_apertura" numeric default 0, "diferencia_apertura" numeric default 0, "total_efectivo" numeric default 0, "total_tarjeta" numeric default 0, "total_transferencia" numeric default 0, "total_general" numeric default 0, "total_descuentos" numeric default 0, "total_cancelaciones" numeric default 0, "numero_ventas" numeric default 0, "ticket_promedio" numeric default 0, "efectivo_esperado" numeric default 0, "efectivo_contado" numeric default 0, "diferencia_efectivo" numeric default 0, "dinero_dejado_en_caja" numeric default 0, "total_gastos" numeric default 0, "created_at" timestamp with time zone default now() not null, "estado" text default 'abierto'::text not null, "notas" text, "folio" text not null, "tipo_corte" text default 'cierre_diario'::text not null, "sucursal_nombre" text, "usuario_cajero_id" text, "usuario_cajero_nombre" text, "usuario_apertura_id" text, "usuario_apertura_nombre" text);
create table confetti_validacion_20261002.pedidos ("requiere_entrega" boolean default false not null, "fecha_entrega" date, "kilos" numeric default 0 not null, "personas_estimadas" numeric, "incluye_base" boolean default false, "precio_base" numeric default 0, "incluye_oblea" boolean default false, "precio_oblea" numeric default 0, "incluye_muneca" boolean default false, "precio_muneca" numeric default 0, "incluye_velas" boolean default false, "precio_velas" numeric default 0, "precio_kilo_usado" numeric, "subtotal_pastel" numeric default 0, "subtotal_extras" numeric default 0, "total_calculado" numeric default 0, "total_final" numeric default 0, "a_cuenta" numeric default 0, "resta" numeric default 0, "total_abonado" numeric default 0 not null, "saldo_pendiente" numeric default 0 not null, "fecha_confirmacion" timestamp with time zone, "fecha_anticipo" timestamp with time zone, "fecha_pago_completo" timestamp with time zone, "fecha_entrega_real" timestamp with time zone, "created_at" timestamp with time zone default now() not null, "fecha_cancelacion" timestamp with time zone, "monto_devuelto" numeric default 0, "extras_seleccionados" jsonb, "id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "folio" text not null, "sucursal_nombre" text, "origen" text default 'pos_interno'::text not null, "tipo_pedido" text default 'pastel_personalizado'::text not null, "estado" text default 'pendiente'::text not null, "cliente_nombre" text not null, "cliente_telefono" text not null, "cliente_email" text, "cliente_direccion" text, "hora_entrega" text, "decorado" text, "concepto" text, "rellenos" text, "leyenda_pastel" text, "nota_interna" text, "imagen_referencia_url" text, "notas_generales" text, "creado_por_id" text, "creado_por_nombre" text, "tipo_cancelacion" text, "motivo_cancelacion" text, "cancelado_por_id" text, "cancelado_por_nombre" text, "nota_voz_url" text, "nota_voz_transcripcion" text, "atendido_por" text);
create table confetti_validacion_20261002.abonos ("id" uuid default gen_random_uuid() not null, "pedido_id" uuid not null, "sucursal_id" uuid not null, "monto" numeric not null, "afecta_caja" boolean default true not null, "corte_caja_id" uuid, "fecha_abono" timestamp with time zone default now(), "created_at" timestamp with time zone default now() not null, "monto_efectivo" numeric default 0, "monto_tarjeta" numeric default 0, "monto_transferencia" numeric default 0, "sucursal_nombre" text, "metodo_pago" text not null, "registrado_por_id" text, "registrado_por_nombre" text, "notas" text);
create table confetti_validacion_20261002.folio_contador ("id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "ultimo_numero" numeric default 0 not null, "created_at" timestamp with time zone default now() not null, "tipo" text not null, "prefijo" text not null);
create table confetti_validacion_20261002.gastos_operativos ("id" uuid default gen_random_uuid() not null, "fecha" date not null, "monto" numeric not null, "sucursal_id" uuid, "created_at" timestamp with time zone default now() not null, "corte_caja_id" uuid, "categoria" text, "descripcion" text not null, "metodo_pago" text, "sucursal_nombre" text, "usuario_id" text, "usuario_nombre" text, "notas" text);
alter table sucursales add constraint sucursales_pkey PRIMARY KEY (id);
alter table sucursales add constraint sucursales_folio_prefijo_key UNIQUE (folio_prefijo);
alter table usuarios_pos add constraint usuarios_pos_pkey PRIMARY KEY (id);
alter table usuarios_pos add constraint usuarios_pos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table configuracion_negocio add constraint configuracion_negocio_pkey PRIMARY KEY (id);
alter table categorias_producto add constraint categorias_producto_pkey PRIMARY KEY (id);
alter table productos add constraint productos_pkey PRIMARY KEY (id);
alter table productos add constraint productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias_producto(id);
alter table cortes_caja add constraint cortes_caja_tipo_corte_check CHECK ((tipo_corte = ANY (ARRAY['cierre_diario'::text, 'turno'::text])));
alter table cortes_caja add constraint cortes_caja_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'registrado'::text])));
alter table cortes_caja add constraint cortes_caja_pkey PRIMARY KEY (id);
alter table cortes_caja add constraint cortes_caja_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table ventas add constraint ventas_tipo_venta_check CHECK ((tipo_venta = ANY (ARRAY['mesa'::text, 'mostrador'::text, 'para_llevar'::text, 'delivery'::text])));
alter table ventas add constraint ventas_estado_check CHECK ((estado = ANY (ARRAY['abierta'::text, 'enviada'::text, 'en_preparacion'::text, 'lista'::text, 'cuenta_solicitada'::text, 'pagada'::text, 'cancelada'::text])));
alter table ventas add constraint ventas_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'transferencia'::text, 'mixto'::text])));
alter table ventas add constraint ventas_tipo_cancelacion_check CHECK ((tipo_cancelacion = ANY (ARRAY['cancelacion'::text, 'devolucion'::text])));
alter table ventas add constraint ventas_pkey PRIMARY KEY (id);
alter table ventas add constraint ventas_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table ventas add constraint ventas_corte_caja_id_fkey FOREIGN KEY (corte_caja_id) REFERENCES cortes_caja(id);
alter table detalle_venta add constraint detalle_venta_pkey PRIMARY KEY (id);
alter table detalle_venta add constraint detalle_venta_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
alter table pedidos add constraint pedidos_origen_check CHECK ((origen = ANY (ARRAY['pos_interno'::text, 'web'::text])));
alter table pedidos add constraint pedidos_tipo_pedido_check CHECK ((tipo_pedido = ANY (ARRAY['pastel_personalizado'::text, 'productos_catalogo'::text])));
alter table pedidos add constraint pedidos_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text, 'con_anticipo'::text, 'pagado'::text, 'entregado'::text, 'cancelado'::text])));
alter table pedidos add constraint pedidos_pkey PRIMARY KEY (id);
alter table pedidos add constraint pedidos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table abonos add constraint abonos_pkey PRIMARY KEY (id);
alter table abonos add constraint abonos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id);
alter table abonos add constraint abonos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table abonos add constraint abonos_corte_caja_id_fkey FOREIGN KEY (corte_caja_id) REFERENCES cortes_caja(id);
alter table folio_contador add constraint folio_contador_pkey PRIMARY KEY (id);
alter table folio_contador add constraint folio_contador_tipo_sucursal_id_key UNIQUE (tipo, sucursal_id);
alter table folio_contador add constraint folio_contador_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table gastos_operativos add constraint gastos_operativos_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'transferencia'::text])));
alter table gastos_operativos add constraint gastos_operativos_pkey PRIMARY KEY (id);
alter table gastos_operativos add constraint gastos_operativos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
alter table abonos add constraint abonos_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'transferencia'::text, 'mixto'::text])));
alter table usuarios_pos add constraint usuarios_pos_rol_check CHECK ((rol = ANY (ARRAY['administrador'::text, 'caja'::text, 'dueño'::text, 'mesero'::text, 'cocina'::text, 'barra'::text, 'pastelero'::text])));
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.siguiente_folio(p_tipo text, p_sucursal_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002'
AS $function$
declare
  v_prefijo text;
  v_num     bigint;
begin
  select folio_prefijo into v_prefijo from sucursales where id = p_sucursal_id;
  if v_prefijo is null then
    raise exception 'Sucursal % inexistente o sin folio_prefijo', p_sucursal_id;
  end if;

  insert into folio_contador (tipo, sucursal_id, prefijo, ultimo_numero)
  values (p_tipo, p_sucursal_id, v_prefijo, 0)
  on conflict (tipo, sucursal_id) do nothing;

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
$function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.set_web_pedido_folio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002'
AS $function$
begin
  if new.origen = 'web' and new.folio is null then
    new.folio := siguiente_folio('pedido_pastel', new.sucursal_id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.pos_sucursal()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002'
AS $function$
  select sucursal_id from usuarios_pos where auth_user_id = confetti_validacion_20261002.auth_uid() limit 1
$function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.pos_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002'
AS $function$
  select coalesce((select rol in ('dueño','administrador') from usuarios_pos where auth_user_id = confetti_validacion_20261002.auth_uid() limit 1), false)
$function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.pos_is_pastelero()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002'
AS $function$
  select coalesce((select rol = 'pastelero' from usuarios_pos where auth_user_id = confetti_validacion_20261002.auth_uid() limit 1), false)
$function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.guard_cierre_en_cero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002', 'pg_catalog'
AS $function$
declare v_ventas integer; v_suma numeric;
begin
  -- Sólo en la transición a 'cerrado'.
  if new.estado is distinct from 'cerrado' then return new; end if;
  if old.estado = 'cerrado' then return new; end if;   -- reescrituras/recálculos

  if coalesce(new.total_general, 0) <> 0 then return new; end if;

  select count(*), coalesce(sum(total), 0)
    into v_ventas, v_suma
    from confetti_validacion_20261002.ventas
   where corte_caja_id = new.id and estado = 'pagada';

  if v_ventas > 0 then
    raise exception
      'CIERRE_EN_CERO: el corte % tiene % ventas pagadas por % pero se intentó cerrar con total 0. No se guardó. Actualiza la aplicación (cierra y vuelve a abrirla) e intenta de nuevo.',
      coalesce(new.folio, new.id::text), v_ventas, v_suma
      using errcode = 'check_violation';
  end if;

  return new;
end $function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.guard_pastelero_alcance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002', 'pg_temp'
AS $function$
declare
  k_permitidas constant text[] := array[
    'nota_voz_transcripcion', 'estado', 'fecha_confirmacion', 'fecha_entrega_real'
  ];
  v_saldo numeric;
begin
  if not (select confetti_validacion_20261002.pos_is_pastelero()) then
    return new;
  end if;

  if (to_jsonb(new) - k_permitidas) is distinct from (to_jsonb(old) - k_permitidas) then
    raise exception
      'PASTELERO_FUERA_DE_ALCANCE: este usuario solo puede editar la nota y avanzar el estado del pedido.'
      using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'confirmado' and old.estado = 'pendiente' then
      null;
    elsif new.estado = 'entregado' and old.estado not in ('entregado', 'cancelado') then
      v_saldo := coalesce(old.saldo_pendiente, old.resta, 0);
      if old.estado <> 'pagado' and v_saldo > 0 then
        raise exception
          'PASTELERO_SALDO_PENDIENTE: no se puede marcar entregado un pedido con saldo pendiente.'
          using errcode = '42501';
      end if;
    else
      raise exception
        'PASTELERO_TRANSICION_NO_PERMITIDA: de % a % no esta permitido para este usuario.',
        coalesce(old.estado, '(null)'), coalesce(new.estado, '(null)')
        using errcode = '42501';
    end if;
  end if;

  if (new.fecha_confirmacion is distinct from old.fecha_confirmacion)
     and not (new.estado = 'confirmado' and old.estado is distinct from 'confirmado') then
    raise exception
      'PASTELERO_FECHA_SUELTA: fecha_confirmacion solo se sella al confirmar.'
      using errcode = '42501';
  end if;
  if (new.fecha_entrega_real is distinct from old.fecha_entrega_real)
     and not (new.estado = 'entregado' and old.estado is distinct from 'entregado') then
    raise exception
      'PASTELERO_FECHA_SUELTA: fecha_entrega_real solo se sella al entregar.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.guard_cierre_incompleto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002', 'pg_catalog'
AS $function$
declare
  v_n_bd  integer;
  v_t_bd  numeric;
  v_n_cli numeric;
  v_t_cli numeric;
begin
  -- Sólo en la TRANSICIÓN a 'cerrado'.
  if new.estado is distinct from 'cerrado' then return new; end if;
  -- Reescrituras y recálculos de un corte ya cerrado (migraciones de
  -- reparación) pasan sin comprobación, igual que en 0058.
  if old.estado = 'cerrado' then return new; end if;

  select count(*), coalesce(sum(total), 0)
    into v_n_bd, v_t_bd
    from confetti_validacion_20261002.ventas
   where corte_caja_id = new.id and estado = 'pagada';

  -- Sin ventas ligadas no hay nada contra qué comparar: puede ser una caja
  -- legítimamente vacía, o un corte cuyas ventas están todas "en tránsito".
  if v_n_bd = 0 then return new; end if;

  -- OJO: -1, no 0. NULL tiene que fallar CERRADO.
  v_n_cli := coalesce(new.numero_ventas, -1);
  v_t_cli := coalesce(new.total_general,  -1);

  if v_n_cli < v_n_bd or v_t_cli < v_t_bd - 0.50 then
    raise exception
      'CIERRE_INCOMPLETO: la caja % tiene % ventas por $% registradas, pero la pantalla sólo mostró % por $%. No se guardó el corte.',
      coalesce(new.folio, new.id::text), v_n_bd, v_t_bd, new.numero_ventas, new.total_general
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$
;
create trigger trg_guard_pastelero_alcance before update on pedidos for each row execute function guard_pastelero_alcance();
create trigger trg_guard_cierre_en_cero before update on cortes_caja for each row execute function guard_cierre_en_cero();
create trigger trg_guard_cierre_incompleto before update on cortes_caja for each row execute function guard_cierre_incompleto();
-- F05/F06/F07. Additive rollout; previous clients remain compatible until the
-- separate legacy-write guard is enabled. No new money is manufactured.
set local lock_timeout = '5s';

create table if not exists confetti_validacion_20261002.operaciones_pedido (
  clave text primary key,
  sucursal_id uuid not null references confetti_validacion_20261002.sucursales(id),
  solicitud jsonb not null,
  resultado jsonb not null,
  actor uuid,
  created_at timestamptz not null default now()
);
revoke all on confetti_validacion_20261002.operaciones_pedido from public, anon, authenticated;
alter table confetti_validacion_20261002.operaciones_pedido enable row level security;
create table if not exists confetti_validacion_20261002.reparacion_saldos_20261001 (
  pedido_id uuid primary key,
  antes jsonb not null,
  despues jsonb,
  motivo text not null,
  created_at timestamptz not null default now()
);
revoke all on confetti_validacion_20261002.reparacion_saldos_20261001 from public, anon, authenticated;
alter table confetti_validacion_20261002.reparacion_saldos_20261001 enable row level security;

alter table confetti_validacion_20261002.pedidos add column if not exists credito_historico numeric not null default 0;
alter table confetti_validacion_20261002.abonos add column if not exists venta_id uuid references confetti_validacion_20261002.ventas(id);
create unique index if not exists abonos_venta_unica on confetti_validacion_20261002.abonos(venta_id) where venta_id is not null;
create index if not exists abonos_pedido_libro on confetti_validacion_20261002.abonos(pedido_id);
-- Attach historical pairs only when both ends are unique, including cancelled
-- sales. A cancelled sale is not a missing payment and must not be recreated.
with candidatos as (
 select a.id as abono_id,v.id as venta_id,count(*) over(partition by a.id) as por_abono,
 count(*) over(partition by v.id) as por_venta
 from confetti_validacion_20261002.abonos a join confetti_validacion_20261002.pedidos p on p.id=a.pedido_id join confetti_validacion_20261002.ventas v
 on v.sucursal_id=a.sucursal_id and v.corte_caja_id=a.corte_caja_id and v.total=a.monto
 and v.monto_efectivo=a.monto_efectivo and v.monto_tarjeta=a.monto_tarjeta and v.monto_transferencia=a.monto_transferencia
 and v.notas like 'Pago de pedido '||p.folio||'%'
 and abs(extract(epoch from v.fecha_cierre-a.fecha_abono))<60
 where a.monto>0 and a.afecta_caja and a.venta_id is null
)
update confetti_validacion_20261002.abonos a set venta_id=c.venta_id from candidatos c where a.id=c.abono_id and c.por_abono=1 and c.por_venta=1;


-- Capture the recognized credit that predates the ledger. Do not insert an
-- Abono or Venta: these amounts must never be charged again or enter a cut.
insert into confetti_validacion_20261002.reparacion_saldos_20261001(pedido_id, antes, motivo)
select p.id, to_jsonb(p), 'Crédito histórico reconocido sin libro; preservar sin ingreso nuevo'
from confetti_validacion_20261002.pedidos p
where coalesce(p.total_abonado,0) > coalesce((select sum(a.monto) from confetti_validacion_20261002.abonos a where a.pedido_id=p.id),0)
on conflict do nothing;
update confetti_validacion_20261002.pedidos p set credito_historico = greatest(0,
 coalesce(p.total_abonado,0)-coalesce((select sum(a.monto) from confetti_validacion_20261002.abonos a where a.pedido_id=p.id),0));

-- The commercial total changes independently from the payment ledger. This
-- BEFORE trigger also protects old clients editing prices; it never alters a
-- cut or discards a recognized payment.
create or replace function confetti_validacion_20261002.derivar_saldo_pedido()
returns trigger language plpgsql security definer set search_path = '' as $$
declare neto numeric;
begin
  if TG_OP = 'INSERT' then
    if confetti_validacion_20261002.auth_uid() is not null and (coalesce(NEW.total_abonado,0)<>0 or coalesce(NEW.credito_historico,0)<>0) then
      raise exception 'ACTUALIZAR_POS: crea el pedido y su anticipo en una operación; no se guardó el pedido.';
    end if;
    return NEW;
  end if;
  if confetti_validacion_20261002.auth_uid() is not null and NEW.credito_historico is distinct from OLD.credito_historico then
    raise exception 'CREDITO_HISTORICO_PROTEGIDO';
  end if;
  if NEW.total_final is distinct from OLD.total_final or NEW.total_abonado is distinct from OLD.total_abonado
     or NEW.saldo_pendiente is distinct from OLD.saldo_pendiente or NEW.credito_historico is distinct from OLD.credito_historico then
    if NEW.total_final < 0 then raise exception 'TOTAL_INVALIDO'; end if;
    select round(coalesce(sum(a.monto),0)+NEW.credito_historico,2) into neto
      from confetti_validacion_20261002.abonos a where a.pedido_id=NEW.id;
    NEW.total_abonado := neto;
    NEW.saldo_pendiente := greatest(0,round(coalesce(NEW.total_final,0)-neto,2));
    NEW.resta := NEW.saldo_pendiente;
    if NEW.estado not in ('cancelado','entregado') then
      if NEW.saldo_pendiente=0 then NEW.estado := 'pagado';
      elsif OLD.estado='pagado' then NEW.estado := case when neto>0 then 'con_anticipo' else 'confirmado' end;
      elsif neto>0 and NEW.estado in ('pendiente','confirmado') then NEW.estado := 'con_anticipo'; end if;
    end if;
  end if;
  return NEW;
end $$;
revoke all on function confetti_validacion_20261002.derivar_saldo_pedido() from public,anon,authenticated;
create trigger trg_derivar_saldo_pedido before insert or update on confetti_validacion_20261002.pedidos
for each row execute function confetti_validacion_20261002.derivar_saldo_pedido();

-- Five independently verified arithmetic inconsistencies. Selection is by
-- values and ledger, not generated IDs. Abort if the evidence changed.
do $$
declare r record; p confetti_validacion_20261002.pedidos; neto numeric;
begin
 for r in select * from (values
  ('PP-A-0074',1090::numeric,500::numeric,440::numeric),
  ('PP-A-0133',2370,500,1720), ('PP-A-0175',1450,0,1300),
  ('PP-A-0185',470,200,440), ('PP-A-0203',1250,100,330)
 ) x(folio,total,abonado,saldo) loop
  select * into p from confetti_validacion_20261002.pedidos where folio=r.folio for update;
  -- Empty isolated fixture databases deliberately have no historical rows.
  if not found then continue; end if;
  select coalesce(sum(a.monto),0) into neto from confetti_validacion_20261002.abonos a where a.pedido_id=p.id;
  if p.total_final<>r.total or p.total_abonado<>r.abonado or p.saldo_pendiente<>r.saldo or neto<>r.abonado
     or p.total_calculado<>r.total or coalesce(p.subtotal_pastel,0)+coalesce(p.subtotal_extras,0)+coalesce(p.precio_base,0)<>r.total
     or p.estado in ('cancelado','entregado') then raise exception 'REVALIDAR_SALDO: %',r.folio; end if;
  insert into confetti_validacion_20261002.reparacion_saldos_20261001(pedido_id,antes,motivo)
   values(p.id,to_jsonb(p),'F06: total comercial verificado menos abonos reconocidos; no cambia ingresos') on conflict do nothing;
  update confetti_validacion_20261002.pedidos set saldo_pendiente=greatest(0,r.total-r.abonado),resta=greatest(0,r.total-r.abonado) where id=p.id;
 end loop;
 update confetti_validacion_20261002.reparacion_saldos_20261001 b set despues=to_jsonb(cur) from confetti_validacion_20261002.pedidos cur where cur.id=b.pedido_id;
end $$;

create or replace function confetti_validacion_20261002.operacion_pedido_tx(p_intencion jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
<<op>>
declare
 clave text := p_intencion->>'clave'; accion text := p_intencion->>'accion';
 suc uuid := (p_intencion->>'sucursal_id')::uuid; corte uuid := nullif(p_intencion->>'corte_id','')::uuid;
 pid uuid := nullif(p_intencion->>'pedido_id','')::uuid;
 c confetti_validacion_20261002.cortes_caja; p confetti_validacion_20261002.pedidos; previo confetti_validacion_20261002.operaciones_pedido;
 solicitud jsonb := p_intencion-'clave'; payload jsonb; pago jsonb := coalesce(p_intencion->'pago','{}');
 monto numeric := round(coalesce((p_intencion->>'monto')::numeric,0),2);
 ef numeric; ta numeric; tr numeric; neto numeric; saldo numeric; vid uuid; aid uuid;
 motivo text := btrim(coalesce(p_intencion->>'motivo','')); resultado jsonb;
 usuario_id text := p_intencion->>'usuario_id'; usuario_nombre text := p_intencion->>'usuario_nombre';
begin
 if confetti_validacion_20261002.auth_uid() is null then raise exception 'SIN_SESION'; end if;
 if suc is null or (not confetti_validacion_20261002.pos_is_admin() and suc is distinct from confetti_validacion_20261002.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 if clave is null or length(clave)<8 or length(clave)>200 then raise exception 'CLAVE_REQUERIDA'; end if;
 if accion not in ('pago','devolucion','crear') then raise exception 'ACCION_INVALIDA'; end if;
 -- Serialize both successful retries and simultaneous requests for one intent.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(clave,0));
 select * into previo from confetti_validacion_20261002.operaciones_pedido where operaciones_pedido.clave=op.clave;
 if found then
  if previo.sucursal_id is distinct from suc or previo.solicitud is distinct from solicitud then raise exception 'INTENCION_DISTINTA'; end if;
  return previo.resultado || jsonb_build_object('idempotentHit',true);
 end if;
 -- Common order: intent -> cut -> order. Closing a cut takes this same row lock.
 if corte is not null then
  select * into c from confetti_validacion_20261002.cortes_caja where id=corte for update;
  if not found or c.estado<>'abierto' then raise exception 'CORTE_NO_ABIERTO'; end if;
  if c.sucursal_id is distinct from suc then raise exception 'CORTE_SUCURSAL_NO_COINCIDE'; end if;
  if (coalesce(c.fecha_apertura,c.fecha_inicio,c.created_at) at time zone 'America/Mexico_City')::date < (now() at time zone 'America/Mexico_City')::date then raise exception 'CORTE_ATRASADO'; end if;
 elsif accion<>'crear' or monto>0 then raise exception 'SIN_CAJA'; end if;
 if accion='crear' then
  payload := coalesce(p_intencion->'pedido','{}') - array['id','folio','estado','origen','created_at','total_abonado','saldo_pendiente','credito_historico','a_cuenta','resta','monto_devuelto'];
  payload := payload || jsonb_build_object('id',gen_random_uuid(),'folio',confetti_validacion_20261002.siguiente_folio('pedido_pastel',suc),
    'sucursal_id',suc,'estado','pendiente','origen','pos_interno','created_at',now(),'total_abonado',0,'credito_historico',0,
    'a_cuenta',monto,'resta',coalesce((payload->>'total_final')::numeric,0),'saldo_pendiente',coalesce((payload->>'total_final')::numeric,0),
    'requiere_entrega',coalesce((payload->>'requiere_entrega')::boolean,false),'tipo_pedido',coalesce(payload->>'tipo_pedido','pastel_personalizado'));
  p := jsonb_populate_record(null::confetti_validacion_20261002.pedidos,payload);
  if p.total_final is null or p.total_final<0 or monto<0 or monto>p.total_final then raise exception 'TOTAL_INVALIDO'; end if;
  insert into confetti_validacion_20261002.pedidos select p.* returning * into p;
  pid := p.id;
 else
  select * into p from confetti_validacion_20261002.pedidos where id=pid for update;
  if not found or p.sucursal_id is distinct from suc then raise exception 'PEDIDO_SUCURSAL_NO_COINCIDE'; end if;
  if p.estado in ('cancelado','entregado') then raise exception 'PEDIDO_NO_COBRABLE'; end if;
 end if;
 select round(coalesce(sum(a.monto),0)+coalesce(p.credito_historico,0),2) into neto from confetti_validacion_20261002.abonos a where a.pedido_id=pid;
 saldo := greatest(0,p.total_final-neto);
 if accion='devolucion' then
  if motivo='' then raise exception 'MOTIVO_REQUERIDO'; end if;
  -- Credit with no recorded original payment method cannot safely be refunded
  -- automatically. Preserve it and require historical reconciliation.
  if p.credito_historico>0 then raise exception 'CONCILIAR_ANTICIPO_HISTORICO'; end if;
  select round(coalesce(sum(a.monto_efectivo),0),2),round(coalesce(sum(a.monto_tarjeta),0),2),round(coalesce(sum(a.monto_transferencia),0),2)
    into ef,ta,tr from confetti_validacion_20261002.abonos a where a.pedido_id=pid;
  monto := ef+ta+tr;
  if ef<0 or ta<0 or tr<0 or monto<>neto or neto<0 then raise exception 'CONCILIAR_DEVOLUCION'; end if;
  ef:=-ef;ta:=-ta;tr:=-tr;
 else
  ef:=round(coalesce((pago->>'monto_efectivo')::numeric,0),2);
  ta:=round(coalesce((pago->>'monto_tarjeta')::numeric,0),2);
  tr:=round(coalesce((pago->>'monto_transferencia')::numeric,0),2);
  if monto<0 or (accion='pago' and monto<=0) or monto>saldo then raise exception 'MONTO_EXCEDE_SALDO'; end if;
  if ef<0 or ta<0 or tr<0 or ef+ta+tr<>monto then raise exception 'DESGLOSE_NO_CUADRA'; end if;
  if monto>0 and pago->>'metodo_pago' is null then raise exception 'METODO_REQUERIDO'; end if;
 end if;
 perform pg_catalog.set_config('confetti.operacion_pedido',clave,true);
 if monto>0 then
  if accion<>'devolucion' then
   insert into confetti_validacion_20261002.ventas(folio,sucursal_id,sucursal_nombre,estado,tipo_venta,cliente_nombre,subtotal,total,metodo_pago,monto_efectivo,monto_tarjeta,monto_transferencia,corte_caja_id,fecha_apertura,fecha_cierre,usuario_cajero_id,usuario_cajero_nombre,notas)
   values(confetti_validacion_20261002.siguiente_folio('venta',suc),suc,p.sucursal_nombre,'pagada','mostrador',p.cliente_nombre,monto,monto,pago->>'metodo_pago',ef,ta,tr,corte,now(),now(),usuario_id,usuario_nombre,'Pago de pedido '||p.folio) returning id into vid;
   insert into confetti_validacion_20261002.detalle_venta(venta_id,producto_nombre,cantidad,precio_unitario_snapshot,subtotal,costo_unitario_snapshot,estado_preparacion)
   values(vid,'Anticipo pedido '||p.folio,1,monto,monto,0,'entregado');
  end if;
  insert into confetti_validacion_20261002.abonos(pedido_id,sucursal_id,sucursal_nombre,monto,metodo_pago,monto_efectivo,monto_tarjeta,monto_transferencia,afecta_caja,corte_caja_id,registrado_por_id,registrado_por_nombre,fecha_abono,notas,venta_id)
  values(pid,suc,p.sucursal_nombre,case when accion='devolucion' then -monto else monto end,
   case when accion='devolucion' then case when (ef<>0)::int+(ta<>0)::int+(tr<>0)::int>1 then 'mixto' when ef<>0 then 'efectivo' when ta<>0 then 'tarjeta' else 'transferencia' end else pago->>'metodo_pago' end,
   ef,ta,tr,true,corte,usuario_id,usuario_nombre,now(),case when accion='devolucion' then 'Devolución de anticipo — '||motivo else p_intencion->>'notas' end,vid) returning id into aid;
 end if;
 if accion='devolucion' then
  update confetti_validacion_20261002.pedidos set estado='cancelado',tipo_cancelacion='devolucion',motivo_cancelacion=motivo,fecha_cancelacion=now(),
   cancelado_por_id=usuario_id,cancelado_por_nombre=usuario_nombre,monto_devuelto=coalesce(monto_devuelto,0)+monto,
   total_abonado=neto-monto,saldo_pendiente=greatest(0,total_final-neto+monto) where id=pid returning * into p;
 else
  update confetti_validacion_20261002.pedidos set total_abonado=neto+monto,saldo_pendiente=greatest(0,total_final-neto-monto),
   fecha_anticipo=case when monto>0 then coalesce(fecha_anticipo,now()) else fecha_anticipo end,
   fecha_pago_completo=case when total_final<=neto+monto then now() else null end where id=pid returning * into p;
 end if;
 resultado:=jsonb_build_object('pedido',to_jsonb(p),'abonoId',aid,'ventaId',vid,'totalAbonado',p.total_abonado,
  'saldoPendiente',p.saldo_pendiente,'nuevoEstado',p.estado,'ventaError',null,'montoDevuelto',case when accion='devolucion' then monto else 0 end,
  'devEfectivo',-ef,'devTarjeta',-ta,'devTransferencia',-tr,'idempotentHit',false);
 insert into confetti_validacion_20261002.operaciones_pedido(clave,sucursal_id,solicitud,resultado,actor) values(clave,suc,solicitud,resultado,confetti_validacion_20261002.auth_uid());
 return resultado;
end $$;
revoke all on function confetti_validacion_20261002.operacion_pedido_tx(jsonb) from public,anon;
grant execute on function confetti_validacion_20261002.operacion_pedido_tx(jsonb) to authenticated;

create or replace function confetti_validacion_20261002.guard_libro_abonos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if confetti_validacion_20261002.auth_uid() is not null then
  if TG_OP<>'INSERT' or coalesce(current_setting('confetti.operacion_pedido',true),'')='' then
   raise exception 'ACTUALIZAR_POS: el pago requiere la versión transaccional. Cierra y vuelve a abrir la aplicación; no se registró ningún movimiento.';
  end if;
  if NEW.monto>0 and NEW.afecta_caja and NEW.venta_id is null then raise exception 'VENTA_DE_ABONO_REQUERIDA'; end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function confetti_validacion_20261002.guard_libro_abonos() from public,anon,authenticated;
create trigger trg_guard_libro_abonos before insert or update or delete on confetti_validacion_20261002.abonos
for each row execute function confetti_validacion_20261002.guard_libro_abonos();

set local lock_timeout = '5s';
create unique index if not exists ventas_folio_unico on confetti_validacion_20261002.ventas(sucursal_id,folio);
create unique index if not exists pedidos_folio_unico on confetti_validacion_20261002.pedidos(sucursal_id,folio);
create unique index if not exists cortes_folio_unico on confetti_validacion_20261002.cortes_caja(sucursal_id,folio);
create or replace function confetti_validacion_20261002.siguiente_folio(p_tipo text,p_sucursal_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare pref text; n bigint; maximo bigint;
begin
 if p_tipo not in ('venta','corte','pedido_pastel') then raise exception 'TIPO_FOLIO_INVALIDO'; end if;
 select folio_prefijo into pref from confetti_validacion_20261002.sucursales where id=p_sucursal_id;
 if pref is null then raise exception 'SUCURSAL_INVALIDA'; end if;
 insert into confetti_validacion_20261002.folio_contador(tipo,sucursal_id,prefijo,ultimo_numero) values(p_tipo,p_sucursal_id,pref,0) on conflict(tipo,sucursal_id) do nothing;
 perform 1 from confetti_validacion_20261002.folio_contador where tipo=p_tipo and sucursal_id=p_sucursal_id for update;
 -- Reconcile the complete historical namespace, including padded/unpadded forms.
 if p_tipo='venta' then select coalesce(max(substring(folio from '-V([0-9]+)$')::bigint),0) into maximo from confetti_validacion_20261002.ventas where sucursal_id=p_sucursal_id;
 elsif p_tipo='corte' then select coalesce(max(substring(folio from '-C([0-9]+)$')::bigint),0) into maximo from confetti_validacion_20261002.cortes_caja where sucursal_id=p_sucursal_id;
 else select coalesce(max(substring(folio from '^PP-[^-]+-([0-9]+)$')::bigint),0) into maximo from confetti_validacion_20261002.pedidos where sucursal_id=p_sucursal_id; end if;
 update confetti_validacion_20261002.folio_contador set ultimo_numero=greatest(ultimo_numero,maximo)+1 where tipo=p_tipo and sucursal_id=p_sucursal_id returning ultimo_numero into n;
 -- Do not lpad a number longer than the minimum width: lpad would truncate it.
 return case p_tipo when 'venta' then 'CONF-'||pref||'-V'||case when n<10000 then lpad(n::text,4,'0') else n::text end
 when 'corte' then 'CONF-'||pref||'-C'||case when n<1000 then lpad(n::text,3,'0') else n::text end
 else 'PP-'||pref||'-'||case when n<10000 then lpad(n::text,4,'0') else n::text end end;
end $$;
revoke all on function confetti_validacion_20261002.siguiente_folio(text,uuid) from public,anon,authenticated;
create or replace function confetti_validacion_20261002.reservar_folio_pos(p_tipo text,p_sucursal_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
 if confetti_validacion_20261002.auth_uid() is null then raise exception 'SIN_SESION'; end if;
 if not confetti_validacion_20261002.pos_is_admin() and p_sucursal_id is distinct from confetti_validacion_20261002.pos_sucursal() then raise exception 'SUCURSAL_AJENA'; end if;
 return confetti_validacion_20261002.siguiente_folio(p_tipo,p_sucursal_id);
end $$;
revoke all on function confetti_validacion_20261002.reservar_folio_pos(text,uuid) from public,anon;
grant execute on function confetti_validacion_20261002.reservar_folio_pos(text,uuid) to authenticated;
-- Closing the counter's client write channel prevents stale bundles from
-- overwriting a reservation made in PostgreSQL. RLS identities are unchanged.
revoke insert,update,delete on confetti_validacion_20261002.folio_contador from authenticated;

create or replace function confetti_validacion_20261002.guard_operacion_corte()
returns trigger language plpgsql security definer set search_path = '' as $$
declare corte uuid; suc uuid; c confetti_validacion_20261002.cortes_caja;
begin
 if TG_OP='DELETE' then corte:=OLD.corte_caja_id;suc:=OLD.sucursal_id;
 else corte:=NEW.corte_caja_id;suc:=NEW.sucursal_id; end if;
 -- A financial row may not be moved away from a closed original cut.
 if TG_TABLE_NAME='ventas' and TG_OP<>'INSERT' and confetti_validacion_20261002.auth_uid() is not null then
  if exists(select 1 from confetti_validacion_20261002.abonos a where a.venta_id=OLD.id) then
   raise exception 'PAGO_DE_PEDIDO: cancela o devuelve desde el pedido para conservar su libro de pagos.';
  end if;
 end if;
 if TG_OP='UPDATE' and OLD.corte_caja_id is distinct from corte and OLD.corte_caja_id is not null then
  select * into c from confetti_validacion_20261002.cortes_caja where id=OLD.corte_caja_id for update;
  if c.estado='cerrado' and confetti_validacion_20261002.auth_uid() is not null then raise exception 'CORTE_CERRADO: se requiere una corrección contable auditada'; end if;
 end if;
 if corte is not null then
  select * into c from confetti_validacion_20261002.cortes_caja where id=corte for update;
  if not found or c.sucursal_id is distinct from suc then raise exception 'CORTE_SUCURSAL_NO_COINCIDE'; end if;
  if c.estado<>'abierto' and confetti_validacion_20261002.auth_uid() is not null then raise exception 'CORTE_CERRADO: no se modificó el corte'; end if;
 else
  if TG_TABLE_NAME='ventas' and TG_OP<>'DELETE' then
   if NEW.estado='pagada' then raise exception 'CORTE_REQUERIDO'; end if;
  elsif TG_TABLE_NAME in ('abonos','gastos_operativos') and confetti_validacion_20261002.auth_uid() is not null then
   raise exception 'CORTE_REQUERIDO';
  end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function confetti_validacion_20261002.guard_operacion_corte() from public,anon,authenticated;
create trigger trg_guard_venta_corte before insert or update or delete on confetti_validacion_20261002.ventas for each row execute function confetti_validacion_20261002.guard_operacion_corte();
create trigger trg_guard_abono_corte before insert or update or delete on confetti_validacion_20261002.abonos for each row execute function confetti_validacion_20261002.guard_operacion_corte();
create trigger trg_guard_gasto_corte before insert or update or delete on confetti_validacion_20261002.gastos_operativos for each row execute function confetti_validacion_20261002.guard_operacion_corte();

create or replace function confetti_validacion_20261002.guard_cierre_transaccional()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n numeric; total numeric; ef numeric; ta numeric; tr numeric; gasto numeric; gastoef numeric; dev numeric;
begin
 if OLD.estado='cerrado' and NEW is distinct from OLD and confetti_validacion_20261002.auth_uid() is not null then raise exception 'CORTE_CERRADO: se requiere una corrección contable auditada'; end if;
 if OLD.estado<>'abierto' or NEW.estado<>'cerrado' then return NEW; end if;
 if NEW.fecha_cierre is null then raise exception 'FECHA_CIERRE_REQUERIDA'; end if;
 -- UPDATE already holds the cut row lock. All financial writers acquire it
 -- before committing, so these queries see the winning operations.
 update confetti_validacion_20261002.ventas set corte_caja_id=OLD.id where corte_caja_id is null and estado='pagada' and sucursal_id=OLD.sucursal_id
  and fecha_cierre>=coalesce(OLD.fecha_apertura,OLD.fecha_inicio,OLD.created_at) and fecha_cierre<=NEW.fecha_cierre;
 select count(*),coalesce(sum(v.total),0),coalesce(sum(monto_efectivo),0),coalesce(sum(monto_tarjeta),0),coalesce(sum(monto_transferencia),0)
 into n,total,ef,ta,tr from confetti_validacion_20261002.ventas v where v.corte_caja_id=OLD.id and v.sucursal_id=OLD.sucursal_id and v.estado='pagada';
 select coalesce(sum(monto),0),coalesce(sum(monto) filter(where metodo_pago='efectivo'),0) into gasto,gastoef from confetti_validacion_20261002.gastos_operativos
 where sucursal_id=OLD.sucursal_id and (corte_caja_id=OLD.id or (corte_caja_id is null and created_at>=coalesce(OLD.fecha_apertura,OLD.fecha_inicio,OLD.created_at) and created_at<=NEW.fecha_cierre));
 select coalesce(sum(monto_efectivo),0) into dev from confetti_validacion_20261002.abonos where corte_caja_id=OLD.id and monto<0;
 if NEW.numero_ventas is distinct from n or abs(coalesce(NEW.total_general,-1)-total)>0.005
 or abs(coalesce(NEW.total_efectivo,-1)-ef)>0.005 or abs(coalesce(NEW.total_tarjeta,-1)-ta)>0.005
 or abs(coalesce(NEW.total_transferencia,-1)-tr)>0.005 or abs(coalesce(NEW.total_gastos,-1)-gasto)>0.005
 or abs(coalesce(NEW.efectivo_esperado,-1)-(ef+dev-gastoef))>0.005 then
  raise exception 'CIERRE_CAMBIO: hubo movimientos nuevos o el resumen está incompleto. Actualiza el resumen e intenta cerrar; no se guardó el corte.' using errcode='23514';
 end if;
 return NEW;
end $$;
revoke all on function confetti_validacion_20261002.guard_cierre_transaccional() from public,anon,authenticated;
create trigger aaa_guard_cierre_transaccional before update on confetti_validacion_20261002.cortes_caja for each row execute function confetti_validacion_20261002.guard_cierre_transaccional();

create or replace function confetti_validacion_20261002.datos_corte_pos(p_corte_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c confetti_validacion_20261002.cortes_caja; ventas jsonb; cancelaciones jsonb; detalles jsonb; detalles_cancel jsonb; gastos jsonb; abonos jsonb; entregas jsonb;
begin
 select * into c from confetti_validacion_20261002.cortes_caja where id=p_corte_id;
 if confetti_validacion_20261002.auth_uid() is null or not found or (not confetti_validacion_20261002.pos_is_admin() and c.sucursal_id is distinct from confetti_validacion_20261002.pos_sucursal()) then raise exception 'CORTE_NO_AUTORIZADO'; end if;
 -- Explicit links are authoritative. No fallback can accept a linked row
 -- from a different cut merely because dates overlap.
 select coalesce(jsonb_agg(to_jsonb(v) order by v.fecha_cierre,v.id) filter(where v.estado='pagada'),'[]'),
 coalesce(jsonb_agg(to_jsonb(v) order by v.fecha_cierre,v.id) filter(where v.estado='cancelada'),'[]') into ventas,cancelaciones
 from confetti_validacion_20261002.ventas v where v.corte_caja_id=c.id and v.sucursal_id=c.sucursal_id;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id) filter(where v.estado='pagada'),'[]'),
 coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id) filter(where v.estado='cancelada'),'[]') into detalles,detalles_cancel
 from confetti_validacion_20261002.detalle_venta d join confetti_validacion_20261002.ventas v on v.id=d.venta_id where v.corte_caja_id=c.id and v.sucursal_id=c.sucursal_id;
 select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('created_date',g.created_at) order by g.created_at,g.id),'[]') into gastos from confetti_validacion_20261002.gastos_operativos g
 where g.sucursal_id=c.sucursal_id and (g.corte_caja_id=c.id or (g.corte_caja_id is null and g.created_at>=coalesce(c.fecha_apertura,c.fecha_inicio,c.created_at) and g.created_at<=coalesce(c.fecha_cierre,now())));
 select coalesce(jsonb_agg(to_jsonb(a) order by a.fecha_abono,a.id),'[]') into abonos from confetti_validacion_20261002.abonos a where a.corte_caja_id=c.id and a.sucursal_id=c.sucursal_id;
 select coalesce(jsonb_agg(jsonb_build_object('folio',p.folio,'nombre',coalesce(p.cliente_nombre,p.concepto,'Pastel'),
  'hora',to_char(p.fecha_entrega_real at time zone 'America/Mexico_City','HH24:MI'),'fechaMs',extract(epoch from p.fecha_entrega_real)*1000) order by p.fecha_entrega_real,p.id),'[]') into entregas
 from confetti_validacion_20261002.pedidos p where p.sucursal_id=c.sucursal_id and p.estado='entregado' and p.fecha_entrega_real>=coalesce(c.fecha_apertura,c.fecha_inicio,c.created_at) and p.fecha_entrega_real<=coalesce(c.fecha_cierre,now());
 return jsonb_build_object('corte',to_jsonb(c),'ventas',ventas,'cancelaciones',cancelaciones,'detalles',detalles,'detallesCancel',detalles_cancel,'gastos',gastos,'abonos',abonos,'entregas',entregas);
end $$;
revoke all on function confetti_validacion_20261002.datos_corte_pos(uuid) from public,anon;
grant execute on function confetti_validacion_20261002.datos_corte_pos(uuid) to authenticated;

create or replace function confetti_validacion_20261002.ventas_cajas_activas_pos(p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if confetti_validacion_20261002.auth_uid() is null then raise exception 'SIN_SESION'; end if;
 if not confetti_validacion_20261002.pos_is_admin() and (p_sucursal is null or p_sucursal is distinct from confetti_validacion_20261002.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.fecha_cierre,v.id) from confetti_validacion_20261002.ventas v join confetti_validacion_20261002.cortes_caja c on c.id=v.corte_caja_id
  where c.estado='abierto' and v.estado='pagada' and c.sucursal_id=v.sucursal_id and (p_sucursal is null or v.sucursal_id=p_sucursal)),'[]');
end $$;
revoke all on function confetti_validacion_20261002.ventas_cajas_activas_pos(uuid) from public,anon;
grant execute on function confetti_validacion_20261002.ventas_cajas_activas_pos(uuid) to authenticated;

set local lock_timeout = '5s';
alter table confetti_validacion_20261002.ventas add column if not exists intencion_datos jsonb;
CREATE OR REPLACE FUNCTION confetti_validacion_20261002.crear_venta_directa_tx(p_cabecera jsonb, p_detalle jsonb, p_metodo_pago text, p_monto_efectivo numeric, p_monto_tarjeta numeric, p_monto_transferencia numeric, p_cambio numeric, p_corte_caja_id uuid, p_sucursal_id uuid, p_sucursal_nombre text, p_usuario_id text, p_usuario_nombre text, p_idempotency_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'confetti_validacion_20261002'
AS $function$
declare
  v_caller_suc   uuid;
  v_es_admin     boolean;
  v_corte_estado text;
  v_corte_suc    uuid;
  v_ef  numeric; v_ta numeric; v_tr numeric; v_camb numeric;
  v_total numeric; v_subtotal numeric; v_suma_desg numeric; v_suma_det numeric;
  v_folio text; v_venta_id uuid; v_exist uuid;
  v_intencion jsonb; v_guardada jsonb;
  v_det jsonb; v_det_ids uuid[] := '{}'; v_new_det uuid;
begin
  if p_corte_caja_id is null then raise exception 'SIN_CAJA'; end if;
  if p_sucursal_id is null then raise exception 'SIN_SUCURSAL'; end if;

  -- Normaliza a centavos (round EXACTO sobre numeric) + sin negativos.
  v_ef   := round(coalesce(p_monto_efectivo,0), 2);
  v_ta   := round(coalesce(p_monto_tarjeta,0), 2);
  v_tr   := round(coalesce(p_monto_transferencia,0), 2);
  v_camb := round(coalesce(p_cambio,0), 2);
  if v_ef < 0 or v_ta < 0 or v_tr < 0 then raise exception 'DESGLOSE_NEGATIVO'; end if;

  -- Autorización server-side (sesión, no params).
  if confetti_validacion_20261002.auth_uid() is null then raise exception 'SIN_SESION'; end if;
  v_caller_suc := pos_sucursal();
  v_es_admin   := pos_is_admin();
  if not v_es_admin and (v_caller_suc is null or p_sucursal_id is distinct from v_caller_suc) then
    raise exception 'SUCURSAL_AJENA';
  end if;

  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128 then raise exception 'INTENCION_INVALIDA'; end if;
  v_intencion := jsonb_build_object('cabecera',p_cabecera,'detalle',p_detalle,'metodo',p_metodo_pago,
    'efectivo',v_ef,'tarjeta',v_ta,'transferencia',v_tr,'cambio',v_camb,'corte',p_corte_caja_id,'sucursal',p_sucursal_id,'usuario',p_usuario_id);
  perform pg_advisory_xact_lock(hashtextextended('venta-intencion:'||p_idempotency_key,0));
  select id, intencion_datos into v_exist,v_guardada from ventas where idempotency_key=p_idempotency_key;
  if v_exist is not null then
    if (select sucursal_id from ventas where id=v_exist) is distinct from p_sucursal_id
      or (select corte_caja_id from ventas where id=v_exist) is distinct from p_corte_caja_id
      or v_guardada is null or v_guardada is distinct from v_intencion then raise exception 'INTENCION_NO_COINCIDE'; end if;
    return json_build_object('venta_id',v_exist,'folio',(select folio from ventas where id=v_exist),
      'idempotent_hit',true,'detalle_ids',(select json_agg(id order by id) from detalle_venta where venta_id=v_exist),
      'venta',(select row_to_json(v) from ventas v where id=v_exist),'detalles',(select coalesce(json_agg(d order by d.created_at,d.id),'[]'::json) from detalle_venta d where venta_id=v_exist));
  end if;

  -- Corte: existe + abierto + de la sucursal de la venta.
  select estado, sucursal_id into v_corte_estado, v_corte_suc from cortes_caja where id = p_corte_caja_id for update;
  if not found then raise exception 'CORTE_INEXISTENTE'; end if;
  if v_corte_estado <> 'abierto' then raise exception 'CORTE_NO_ABIERTO'; end if;
  if v_corte_suc is distinct from p_sucursal_id then raise exception 'CORTE_SUCURSAL_NO_COINCIDE'; end if;

  -- Totales de la cabecera (redondeados a centavos).
  v_total    := round(coalesce((p_cabecera->>'total')::numeric, 0), 2);
  v_subtotal := round(coalesce((p_cabecera->>'subtotal')::numeric, (p_cabecera->>'total')::numeric, 0), 2);

  -- Doble conteo (a): el desglose por método suma el total (SIN propina), al centavo.
  v_suma_desg := v_ef + v_ta + v_tr;
  if abs(v_suma_desg - v_total) > 0.005 then raise exception 'DESGLOSE_NO_CUADRA'; end if;

  -- Doble conteo (b): la suma de subtotales de detalle cuadra el subtotal de la cabecera.
  select coalesce(sum(round(coalesce((d->>'subtotal')::numeric,0),2)),0) into v_suma_det
    from jsonb_array_elements(coalesce(p_detalle, '[]'::jsonb)) d;
  if abs(v_suma_det - v_subtotal) > 0.005 then raise exception 'DETALLE_NO_CUADRA'; end if;

  -- ===== FIX 0059 -- guards de integridad de LINEA/TOTAL (cierran los huecos de Codex) =====
  -- Con estos 5 + los invariantes de 0049 la cadena queda cerrada:
  --   Sum(desglose) = total = subtotal = Sum(detalle) = Sum(cantidad*precio), todo >= 0 y total > 0.
  --
  -- SIN_DETALLE: una venta directa de mostrador SIEMPRE tiene >=1 línea (bloquea la venta $0 sin detalle).
  if jsonb_array_length(coalesce(p_detalle,'[]'::jsonb)) = 0 then
    raise exception 'SIN_DETALLE';
  end if;
  -- TOTAL_NO_CUADRA (ronda 2): el total debe igualar el subtotal. Propina apagada por 0010 y el front
  -- SIEMPRE manda subtotal=total (crearVentaDirecta: cabecera {subtotal: total, total}). Cierra el hueco
  -- total=100 con subtotal=0. tol 0.005 (centavos).
  if abs(v_total - v_subtotal) > 0.005 then
    raise exception 'TOTAL_NO_CUADRA';
  end if;
  -- LINEA_INVALIDA: ninguna línea con cantidad<=0, precio<0, subtotal<0 o costo<0. Mata la compensación
  -- de negativos (una -X ya no pasa aunque otra +X cuadre la suma). Permite 0 (no <0) para una eventual
  -- cortesía (precio 0) dentro de una venta con total>0.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_detalle,'[]'::jsonb)) d
    where coalesce((d->>'cantidad')::numeric,0) <= 0
       or coalesce((d->>'precio_unitario_snapshot')::numeric,0) < 0
       or coalesce((d->>'subtotal')::numeric,0) < 0
       or coalesce((d->>'costo_unitario_snapshot')::numeric,0) < 0
  ) then
    raise exception 'LINEA_INVALIDA';
  end if;
  -- LINEA_NO_CUADRA (ronda 2): el subtotal de cada línea debe ser cantidad x precio_unitario (a centavos).
  -- Cierra el hueco cantidad 1 / precio 0 / subtotal 100. Cumplen los 5 tipos del front: precio_fijo
  -- (subtotal=precio*cantidad), variable (cantidad=1, precio_unitario=subtotal=precio_total_línea,
  -- POS.jsx:207/210/223), venta libre (1*monto=monto), cortesía (1*0=0). round a 2 en ambos lados absorbe
  -- el float (p.ej. 3x33.33=99.99); tol 0.005.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_detalle,'[]'::jsonb)) d
    where abs( round(coalesce((d->>'subtotal')::numeric,0),2)
             - round(coalesce((d->>'cantidad')::numeric,0) * coalesce((d->>'precio_unitario_snapshot')::numeric,0),2)
         ) > 0.005
  ) then
    raise exception 'LINEA_NO_CUADRA';
  end if;
  -- TOTAL_INVALIDO: una venta pagada es > 0 (verificado: el POS no permite total $0; ver cabecera).
  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;
  -- ===== fin FIX 0059 =====

  -- Folio atómico (solo al crear).
  v_folio := siguiente_folio('venta', p_sucursal_id);

  -- INSERT cabecera (SOLO columnas reales; sin propina/snapshots). Carrera de doble-clic con la
  -- MISMA idempotency_key -> el índice único rechaza la 2a (unique_violation) -> se devuelve la ganadora.
  begin
    insert into ventas(
      folio, tipo_venta, sucursal_id, sucursal_nombre, estado, fecha_apertura, fecha_cierre,
      subtotal, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, cambio,
      usuario_cajero_id, usuario_cajero_nombre, corte_caja_id, idempotency_key, intencion_datos)
    values (
      v_folio, coalesce(p_cabecera->>'tipo_venta','mostrador'), p_sucursal_id, p_sucursal_nombre, 'pagada', now(), now(),
      v_subtotal, v_total, p_metodo_pago, v_ef, v_ta, v_tr, v_camb,
      p_usuario_id, p_usuario_nombre, p_corte_caja_id, p_idempotency_key, v_intencion)
    returning id into v_venta_id;
  end;

  -- INSERT de cada línea (SOLO columnas reales). Si una falla, TODA la tx revierte.
  for v_det in select * from jsonb_array_elements(coalesce(p_detalle, '[]'::jsonb)) loop
    insert into detalle_venta(
      venta_id, producto_id, producto_nombre, cantidad,
      precio_unitario_snapshot, costo_unitario_snapshot, subtotal, notas_producto, estado_preparacion)
    values (
      v_venta_id,
      (v_det->>'producto_id')::uuid,
      v_det->>'producto_nombre',
      (v_det->>'cantidad')::numeric,
      (v_det->>'precio_unitario_snapshot')::numeric,
      (v_det->>'costo_unitario_snapshot')::numeric,
      round(coalesce((v_det->>'subtotal')::numeric,0),2),
      v_det->>'notas_producto',
      coalesce(v_det->>'estado_preparacion','pendiente'))
    returning id into v_new_det;
    v_det_ids := array_append(v_det_ids, v_new_det);
  end loop;

  return json_build_object('venta_id', v_venta_id, 'folio', v_folio,
    'idempotent_hit', false, 'detalle_ids', to_json(v_det_ids),
    'venta',(select row_to_json(v) from ventas v where id=v_venta_id),
    'detalles',(select coalesce(json_agg(d order by d.created_at,d.id),'[]'::json) from detalle_venta d where venta_id=v_venta_id));
end $function$
;


create or replace function confetti_validacion_20261002.resumen_periodo_pos(p_desde timestamptz,p_hasta timestamptz,p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if confetti_validacion_20261002.auth_uid() is null then raise exception 'SIN_SESION'; end if;
 if p_desde is null or p_hasta is null or p_desde>p_hasta then raise exception 'RANGO_INVALIDO'; end if;
 if not confetti_validacion_20261002.pos_is_admin() and (p_sucursal is null or p_sucursal is distinct from confetti_validacion_20261002.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 return (select jsonb_build_object('ingresos',coalesce(sum(v.total),0),'nVentas',count(*),'utilidad',0,
 'gastos',coalesce((select sum(g.monto) from confetti_validacion_20261002.gastos_operativos g where (p_sucursal is null or g.sucursal_id=p_sucursal)
  and g.fecha >= (p_desde at time zone 'America/Mexico_City')::date and g.fecha <= (p_hasta at time zone 'America/Mexico_City')::date),0))
 from confetti_validacion_20261002.ventas v where v.estado='pagada' and v.fecha_cierre>=p_desde and v.fecha_cierre<=p_hasta and (p_sucursal is null or v.sucursal_id=p_sucursal));
end $$;
revoke all on function confetti_validacion_20261002.resumen_periodo_pos(timestamptz,timestamptz,uuid) from public,anon;
grant execute on function confetti_validacion_20261002.resumen_periodo_pos(timestamptz,timestamptz,uuid) to authenticated;

revoke all on all tables in schema confetti_validacion_20261002 from public,anon,authenticated;
revoke all on all functions in schema confetti_validacion_20261002 from public,anon,authenticated;

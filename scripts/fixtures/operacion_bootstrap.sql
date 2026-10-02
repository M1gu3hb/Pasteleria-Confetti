create schema auth;
create role anon; create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.sucursales ("id" uuid default gen_random_uuid() not null, "activa" boolean default true not null, "orden_visual" numeric, "created_at" timestamp with time zone default now() not null, "nombre" text not null, "direccion" text, "telefono" text, "folio_prefijo" text not null, "notas" text, "google_maps_url" text, "whatsapp_numero" text);
create table public.usuarios_pos ("created_at" timestamp with time zone default now() not null, "id" uuid default gen_random_uuid() not null, "auth_user_id" uuid, "activo" boolean default true not null, "sucursal_id" uuid, "permisos_extra" jsonb, "sucursal_nombre" text, "nombre" text not null, "rol" text not null, "pin_hash" text, "color" text, "telefono" text, "correo" text);
create table public.configuracion_negocio ("id" uuid default gen_random_uuid() not null, "precio_kilo_global" numeric, "precio_kilo_es_global" boolean default true, "ratio_personas_por_kilo" numeric default 10, "ratio_personas_es_global" boolean default true, "created_at" timestamp with time zone default now() not null, "background_opacity" numeric, "colorear_importes_monetarios" boolean, "iva_porcentaje" numeric, "usa_mesas" boolean, "usa_cocina" boolean, "usa_barra" boolean, "permitir_venta_sin_stock" boolean, "mostrar_costos_a_caja" boolean, "mostrar_logo_ticket" boolean, "descargar_pdf_corte_auto" boolean, "modo_presentacion_activo" boolean, "propinas_activas" boolean default false, "sonidos_activos" boolean default true, "background_fit" text, "propina_porcentajes_sugeridos" text, "color_secundario" text, "formato_export_default" text, "simbolo_moneda" text, "ancho_impresora" text default '58'::text not null, "paquete_modo" text, "hora_inicio_dia_operativo" text, "direccion" text, "telefono" text, "whatsapp" text, "correo" text, "nombre_negocio" text not null, "logo_url" text, "color_primario" text, "color_acento" text, "moneda" text default 'MXN'::text, "base_rangos" text, "mensaje_ticket" text, "precio_kilo_por_sucursal" text, "ticket_footer" text, "pdf_footer" text, "ratio_personas_por_sucursal" text, "extras_pastel" text, "rellenos_pastel" text, "presentacion_password" text, "footer_text" text, "nombre_sistema" text, "platform_brand" text, "logo_ticket_url" text, "logo_pdf_url" text, "background_logo_url" text, "background_image_url" text);
create table public.productos ("id" uuid default gen_random_uuid() not null, "categoria_id" uuid, "sucursal_ids" uuid[], "precio_venta" numeric not null, "orden" numeric, "activo" boolean default true not null, "visible_en_pos" boolean default true not null, "visible_en_web" boolean default false not null, "created_at" timestamp with time zone default now() not null, "nombre" text not null, "categoria_nombre" text, "descripcion" text, "descripcion_web" text, "imagen_url" text, "notas" text);
create table public.categorias_producto ("id" uuid default gen_random_uuid() not null, "orden" numeric, "activo" boolean default true not null, "created_at" timestamp with time zone default now() not null, "nombre" text not null, "descripcion" text, "color" text, "icono" text);
create table public.ventas ("id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "fecha_apertura" timestamp with time zone, "fecha_cierre" timestamp with time zone, "subtotal" numeric default 0, "descuentos" numeric default 0, "impuestos" numeric default 0, "total" numeric default 0, "monto_efectivo" numeric default 0, "monto_tarjeta" numeric default 0, "monto_transferencia" numeric default 0, "cambio" numeric default 0, "corte_caja_id" uuid, "monto_devuelto" numeric default 0 not null, "fecha_cancelacion" timestamp with time zone, "created_at" timestamp with time zone default now() not null, "folio" text not null, "sucursal_nombre" text, "tipo_venta" text default 'mostrador'::text not null, "cliente_nombre" text, "cliente_id" text, "codigo_caja" text, "usuario_cajero_id" text, "usuario_cajero_nombre" text, "estado" text default 'abierta'::text not null, "metodo_pago" text, "notas" text, "motivo_cancelacion" text, "tipo_cancelacion" text, "cancelado_por_id" text, "cancelado_por_nombre" text, "idempotency_key" text);
create table public.detalle_venta ("id" uuid default gen_random_uuid() not null, "venta_id" uuid not null, "producto_id" uuid, "cantidad" numeric not null, "precio_unitario_snapshot" numeric, "costo_unitario_snapshot" numeric, "subtotal" numeric, "created_at" timestamp with time zone default now() not null, "producto_nombre" text, "notas_producto" text, "estado_preparacion" text default 'pendiente'::text);
create table public.cortes_caja ("id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "fecha_inicio" timestamp with time zone, "fecha_apertura" timestamp with time zone, "fecha_cierre" timestamp with time zone, "efectivo_inicial_contado" numeric default 0, "fondo_esperado_apertura" numeric default 0, "diferencia_apertura" numeric default 0, "total_efectivo" numeric default 0, "total_tarjeta" numeric default 0, "total_transferencia" numeric default 0, "total_general" numeric default 0, "total_descuentos" numeric default 0, "total_cancelaciones" numeric default 0, "numero_ventas" numeric default 0, "ticket_promedio" numeric default 0, "efectivo_esperado" numeric default 0, "efectivo_contado" numeric default 0, "diferencia_efectivo" numeric default 0, "dinero_dejado_en_caja" numeric default 0, "total_gastos" numeric default 0, "created_at" timestamp with time zone default now() not null, "estado" text default 'abierto'::text not null, "notas" text, "folio" text not null, "tipo_corte" text default 'cierre_diario'::text not null, "sucursal_nombre" text, "usuario_cajero_id" text, "usuario_cajero_nombre" text, "usuario_apertura_id" text, "usuario_apertura_nombre" text);
create table public.pedidos ("requiere_entrega" boolean default false not null, "fecha_entrega" date, "kilos" numeric default 0 not null, "personas_estimadas" numeric, "incluye_base" boolean default false, "precio_base" numeric default 0, "incluye_oblea" boolean default false, "precio_oblea" numeric default 0, "incluye_muneca" boolean default false, "precio_muneca" numeric default 0, "incluye_velas" boolean default false, "precio_velas" numeric default 0, "precio_kilo_usado" numeric, "subtotal_pastel" numeric default 0, "subtotal_extras" numeric default 0, "total_calculado" numeric default 0, "total_final" numeric default 0, "a_cuenta" numeric default 0, "resta" numeric default 0, "total_abonado" numeric default 0 not null, "saldo_pendiente" numeric default 0 not null, "fecha_confirmacion" timestamp with time zone, "fecha_anticipo" timestamp with time zone, "fecha_pago_completo" timestamp with time zone, "fecha_entrega_real" timestamp with time zone, "created_at" timestamp with time zone default now() not null, "fecha_cancelacion" timestamp with time zone, "monto_devuelto" numeric default 0, "extras_seleccionados" jsonb, "id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "folio" text not null, "sucursal_nombre" text, "origen" text default 'pos_interno'::text not null, "tipo_pedido" text default 'pastel_personalizado'::text not null, "estado" text default 'pendiente'::text not null, "cliente_nombre" text not null, "cliente_telefono" text not null, "cliente_email" text, "cliente_direccion" text, "hora_entrega" text, "decorado" text, "concepto" text, "rellenos" text, "leyenda_pastel" text, "nota_interna" text, "imagen_referencia_url" text, "notas_generales" text, "creado_por_id" text, "creado_por_nombre" text, "tipo_cancelacion" text, "motivo_cancelacion" text, "cancelado_por_id" text, "cancelado_por_nombre" text, "nota_voz_url" text, "nota_voz_transcripcion" text, "atendido_por" text);
create table public.abonos ("id" uuid default gen_random_uuid() not null, "pedido_id" uuid not null, "sucursal_id" uuid not null, "monto" numeric not null, "afecta_caja" boolean default true not null, "corte_caja_id" uuid, "fecha_abono" timestamp with time zone default now(), "created_at" timestamp with time zone default now() not null, "monto_efectivo" numeric default 0, "monto_tarjeta" numeric default 0, "monto_transferencia" numeric default 0, "sucursal_nombre" text, "metodo_pago" text not null, "registrado_por_id" text, "registrado_por_nombre" text, "notas" text);
create table public.folio_contador ("id" uuid default gen_random_uuid() not null, "sucursal_id" uuid not null, "ultimo_numero" numeric default 0 not null, "created_at" timestamp with time zone default now() not null, "tipo" text not null, "prefijo" text not null);
create table public.gastos_operativos ("id" uuid default gen_random_uuid() not null, "fecha" date not null, "monto" numeric not null, "sucursal_id" uuid, "created_at" timestamp with time zone default now() not null, "corte_caja_id" uuid, "categoria" text, "descripcion" text not null, "metodo_pago" text, "sucursal_nombre" text, "usuario_id" text, "usuario_nombre" text, "notas" text);
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
CREATE OR REPLACE FUNCTION public.siguiente_folio(p_tipo text, p_sucursal_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
CREATE OR REPLACE FUNCTION public.set_web_pedido_folio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.origen = 'web' and new.folio is null then
    new.folio := siguiente_folio('pedido_pastel', new.sucursal_id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.pos_sucursal()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sucursal_id from usuarios_pos where auth_user_id = auth.uid() limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.pos_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select rol in ('dueño','administrador') from usuarios_pos where auth_user_id = auth.uid() limit 1), false)
$function$
;
CREATE OR REPLACE FUNCTION public.pos_is_pastelero()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select rol = 'pastelero' from usuarios_pos where auth_user_id = auth.uid() limit 1), false)
$function$
;
CREATE OR REPLACE FUNCTION public.guard_cierre_en_cero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_ventas integer; v_suma numeric;
begin
  -- Sólo en la transición a 'cerrado'.
  if new.estado is distinct from 'cerrado' then return new; end if;
  if old.estado = 'cerrado' then return new; end if;   -- reescrituras/recálculos

  if coalesce(new.total_general, 0) <> 0 then return new; end if;

  select count(*), coalesce(sum(total), 0)
    into v_ventas, v_suma
    from public.ventas
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
CREATE OR REPLACE FUNCTION public.guard_pastelero_alcance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  k_permitidas constant text[] := array[
    'nota_voz_transcripcion', 'estado', 'fecha_confirmacion', 'fecha_entrega_real'
  ];
  v_saldo numeric;
begin
  if not (select public.pos_is_pastelero()) then
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
CREATE OR REPLACE FUNCTION public.guard_cierre_incompleto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
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
    from public.ventas
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
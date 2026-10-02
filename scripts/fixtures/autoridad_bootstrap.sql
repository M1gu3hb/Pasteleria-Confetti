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
create role service_role; create schema extensions; create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,instance_id uuid,aud text,role text,email text,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,confirmation_token text,recovery_token text,email_change text,email_change_token_new text);
create table auth.identities(id uuid,user_id uuid,provider text,provider_id text,identity_data jsonb,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);
-- pgcrypto is loaded by the PGlite extension in the harness.



alter table usuarios_pos enable row level security; create policy pos_all_usuarios_pos on usuarios_pos for all to authenticated using(true) with check(true); grant all on usuarios_pos to authenticated;
alter table sucursales enable row level security; create policy pos_all_sucursales on sucursales for all to authenticated using(true) with check(true); grant all on sucursales to authenticated;
alter table configuracion_negocio enable row level security; create policy pos_all_configuracion_negocio on configuracion_negocio for all to authenticated using(true) with check(true); grant all on configuracion_negocio to authenticated;
alter table categorias_producto enable row level security; create policy pos_all_categorias_producto on categorias_producto for all to authenticated using(true) with check(true); grant all on categorias_producto to authenticated;
alter table productos enable row level security; create policy pos_all_productos on productos for all to authenticated using(true) with check(true); grant all on productos to authenticated;
alter table folio_contador enable row level security; create policy pos_all_folio_contador on folio_contador for all to authenticated using(true) with check(true); grant all on folio_contador to authenticated;
create policy anon_insert_pedidos on pedidos for insert to anon with check(origen='web' and estado='pendiente'); grant insert on pedidos to anon;
CREATE OR REPLACE FUNCTION public.login_pos(p_pin text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, email text, nombre text, rol text, sucursal_id uuid, sucursal_nombre text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select u.id, lower(u.id::text)||'@pos.confetti.local', u.nombre, u.rol, u.sucursal_id, u.sucursal_nombre
  from usuarios_pos u
  where u.activo = true and u.pin_hash is not null
    and extensions.crypt(p_pin, u.pin_hash) = u.pin_hash
    and (p_user_id is null or u.id = p_user_id)
  order by u.created_at asc
  limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.crear_pedido_web(payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sucursal_id uuid;
  v_origen text := coalesce(nullif(payload->>'origen', ''), 'web');
  v_estado text := coalesce(nullif(payload->>'estado', ''), 'pendiente');
  v_tipo   text := coalesce(nullif(payload->>'tipo_pedido', ''), 'pastel_personalizado');
  v_total_final numeric := coalesce(nullif(payload->>'total_final', '')::numeric, 0);
  v_folio  text;
begin
  if v_origen <> 'web' then
    raise exception 'origen invalido (%): la web solo crea pedidos con origen=web', v_origen;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'estado invalido (%): la web solo crea pedidos con estado=pendiente', v_estado;
  end if;
  if v_tipo not in ('pastel_personalizado', 'productos_catalogo') then
    raise exception 'tipo_pedido invalido (%): debe ser pastel_personalizado o productos_catalogo', v_tipo;
  end if;

  if coalesce(btrim(payload->>'cliente_nombre'), '') = '' then
    raise exception 'cliente_nombre es requerido';
  end if;
  if coalesce(btrim(payload->>'cliente_telefono'), '') = '' then
    raise exception 'cliente_telefono es requerido';
  end if;
  if coalesce(btrim(payload->>'fecha_entrega'), '') = '' then
    raise exception 'fecha_entrega es requerida';
  end if;
  if coalesce(btrim(payload->>'sucursal_id'), '') = '' then
    raise exception 'sucursal_id es requerido';
  end if;

  v_sucursal_id := (payload->>'sucursal_id')::uuid;

  if not exists (select 1 from sucursales where id = v_sucursal_id and activa) then
    raise exception 'sucursal_id % inexistente o inactiva', v_sucursal_id;
  end if;

  insert into pedidos (
    origen, estado, tipo_pedido,
    sucursal_id, sucursal_nombre,
    cliente_nombre, cliente_telefono, cliente_email, cliente_direccion,
    requiere_entrega, fecha_entrega, hora_entrega,
    kilos, personas_estimadas,
    concepto, decorado, rellenos, leyenda_pastel,
    incluye_base, precio_base, incluye_oblea, precio_oblea,
    incluye_muneca, precio_muneca, incluye_velas, precio_velas,
    precio_kilo_usado, subtotal_pastel, subtotal_extras,
    total_calculado, total_final,
    total_abonado, a_cuenta, saldo_pendiente,
    imagen_referencia_url, notas_generales,
    creado_por_nombre,
    extras_seleccionados
  ) values (
    'web', 'pendiente', v_tipo,
    v_sucursal_id, nullif(payload->>'sucursal_nombre', ''),
    btrim(payload->>'cliente_nombre'), btrim(payload->>'cliente_telefono'),
    nullif(payload->>'cliente_email', ''), nullif(payload->>'cliente_direccion', ''),
    coalesce((nullif(payload->>'requiere_entrega', ''))::boolean, false),
    (payload->>'fecha_entrega')::date, nullif(payload->>'hora_entrega', ''),
    coalesce(nullif(payload->>'kilos', '')::numeric, 0),
    nullif(payload->>'personas_estimadas', '')::numeric,
    nullif(payload->>'concepto', ''), nullif(payload->>'decorado', ''),
    nullif(payload->>'rellenos', ''), nullif(payload->>'leyenda_pastel', ''),
    coalesce((nullif(payload->>'incluye_base',  ''))::boolean, false), coalesce(nullif(payload->>'precio_base',  '')::numeric, 0),
    coalesce((nullif(payload->>'incluye_oblea', ''))::boolean, false), coalesce(nullif(payload->>'precio_oblea', '')::numeric, 0),
    coalesce((nullif(payload->>'incluye_muneca',''))::boolean, false), coalesce(nullif(payload->>'precio_muneca','')::numeric, 0),
    coalesce((nullif(payload->>'incluye_velas', ''))::boolean, false), coalesce(nullif(payload->>'precio_velas', '')::numeric, 0),
    nullif(payload->>'precio_kilo_usado', '')::numeric,
    coalesce(nullif(payload->>'subtotal_pastel', '')::numeric, 0),
    coalesce(nullif(payload->>'subtotal_extras', '')::numeric, 0),
    coalesce(nullif(payload->>'total_calculado', '')::numeric, 0),
    v_total_final,
    0, 0, greatest(0, v_total_final),
    nullif(payload->>'imagen_referencia_url', ''), nullif(payload->>'notas_generales', ''),
    'Web Confetti',
    case when jsonb_typeof(payload->'extras_seleccionados') = 'array'
         then payload->'extras_seleccionados' else null end
  )
  returning folio into v_folio;

  return v_folio;
end;
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
CREATE OR REPLACE FUNCTION public._pos_provision_auth(p_auth_id uuid, p_email text, p_pin text, p_rol text, p_pos_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth'
AS $function$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    p_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt('POS-' || p_pin, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', p_rol, 'pos_user_id', p_pos_id::text), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_auth_id, 'email', p_auth_id::text,
    jsonb_build_object('sub', p_auth_id::text, 'email', p_email), now(), now(), now()
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.actualizar_pin_usuario(p_user_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth'
AS $function$
declare
  v_pin   text := nullif(trim(coalesce(p_pin, '')), '');
  v_email text := lower(p_user_id::text) || '@pos.confetti.local';
  v_auth  uuid;
  v_rol   text;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.usuarios_pos where auth_user_id = auth.uid() and rol = 'dueño'
  ) then
    raise exception 'Solo el dueño puede cambiar PINs';
  end if;
  if v_pin is null or v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos numéricos';
  end if;

  select auth_user_id, rol into v_auth, v_rol from public.usuarios_pos where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  update public.usuarios_pos
    set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf'))
  where id = p_user_id;

  if v_auth is null then
    v_auth := gen_random_uuid();
    perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, p_user_id);
    update public.usuarios_pos set auth_user_id = v_auth where id = p_user_id;
  elsif exists (select 1 from auth.users where id = v_auth) then
    update auth.users
      set encrypted_password = extensions.crypt('POS-' || v_pin, extensions.gen_salt('bf')),
          updated_at = now()
    where id = v_auth;
  else
    perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, p_user_id);
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crear_usuario_pos(p_nombre text, p_rol text, p_pin text, p_sucursal_id uuid DEFAULT NULL::uuid, p_sucursal_nombre text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_correo text DEFAULT NULL::text, p_permisos_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth'
AS $function$
declare
  v_id    uuid := gen_random_uuid();
  v_auth  uuid := gen_random_uuid();
  v_email text := lower(v_id::text) || '@pos.confetti.local';
  v_pin   text := nullif(trim(coalesce(p_pin, '')), '');
  v_rol   text := case when p_rol = 'dueno' then 'dueño' else p_rol end;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.usuarios_pos where auth_user_id = auth.uid() and rol = 'dueño'
  ) then
    raise exception 'Solo el dueño puede crear usuarios';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if v_pin is null or v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos numéricos';
  end if;
  if v_rol not in ('dueño','administrador','pastelero') then
    raise exception 'Rol inválido: usa dueño, administrador o pastelero';
  end if;

  insert into public.usuarios_pos(
    id, nombre, rol, pin_hash, auth_user_id, activo, color, telefono, correo,
    sucursal_id, sucursal_nombre, permisos_extra
  ) values (
    v_id, trim(p_nombre), v_rol, extensions.crypt(v_pin, extensions.gen_salt('bf')), v_auth, true,
    nullif(p_color,''), nullif(p_telefono,''), nullif(p_correo,''),
    p_sucursal_id, nullif(p_sucursal_nombre,''), coalesce(p_permisos_extra, '{}'::jsonb)
  );

  perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, v_id);
  return v_id;
end;
$function$
;
create function rl_pin_verificar(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
create function rl_pin_handle(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
create function rl_pin_precheck(text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
create function rl_pin_fallo(text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
create function rl_pin_exito(text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
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
create trigger trg_set_web_pedido_folio before insert on pedidos for each row when (new.origen='web' and new.folio is null) execute function set_web_pedido_folio();

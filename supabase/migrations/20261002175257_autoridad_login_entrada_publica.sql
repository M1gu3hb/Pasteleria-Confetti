-- F01/F03/F04/F16: autoridad del servidor; no se cambian movimientos de caja.
set local lock_timeout='5s';
create table app_private.terminales_pos (
 auth_user_id uuid primary key, sucursal_id uuid not null references public.sucursales(id), habilitada boolean not null default true
);
insert into app_private.terminales_pos(auth_user_id,sucursal_id)
select u.auth_user_id,u.sucursal_id from public.usuarios_pos u join auth.users a on a.id=u.auth_user_id
where u.rol='caja' and a.email='terminal-'||u.sucursal_id::text||'@pos.confetti.local';
revoke all on app_private.terminales_pos from public,anon,authenticated;
alter table app_private.terminales_pos enable row level security;
create or replace function public.pos_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.usuarios_pos where auth_user_id=auth.uid() and activo and rol='dueño')
$$;
create or replace function public.pos_sucursal() returns uuid language sql stable security definer set search_path='' as $$
 select u.sucursal_id from public.usuarios_pos u join public.sucursales s on s.id=u.sucursal_id
 where u.auth_user_id=auth.uid() and s.activa and (u.activo or exists(select 1 from app_private.terminales_pos t where t.auth_user_id=u.auth_user_id and t.habilitada and t.sucursal_id=u.sucursal_id)) limit 1
$$;
create or replace function public.pos_is_pastelero() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.usuarios_pos where auth_user_id=auth.uid() and activo and rol='pastelero')
$$;
create function public.pos_is_manager() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.usuarios_pos where auth_user_id=auth.uid() and activo and rol in ('dueño','administrador'))
$$;
create function public.pos_tiene_sesion() returns boolean language sql stable security definer set search_path='' as $$
 select public.pos_is_admin() or public.pos_is_pastelero() or public.pos_sucursal() is not null
$$;
revoke all on function public.pos_is_admin(),public.pos_sucursal(),public.pos_is_pastelero(),public.pos_is_manager(),public.pos_tiene_sesion() from public,anon;
grant execute on function public.pos_is_admin(),public.pos_sucursal(),public.pos_is_pastelero(),public.pos_is_manager(),public.pos_tiene_sesion() to authenticated,service_role;

-- Table grants are checked before RLS; even an owner uses controlled RPCs for identity.
revoke all on public.usuarios_pos from anon,authenticated;
grant select(id,created_at,nombre,rol,activo,color,telefono,correo,sucursal_id,sucursal_nombre,permisos_extra) on public.usuarios_pos to authenticated;
drop policy pos_all_usuarios_pos on public.usuarios_pos;
create policy pos_select_usuarios on public.usuarios_pos for select to authenticated using ((select public.pos_is_admin()) or ((select public.pos_tiene_sesion()) and activo and sucursal_id=(select public.pos_sucursal())));
create table app_private.auditoria_usuarios_pos (
 id uuid primary key default gen_random_uuid(), usuario_id uuid, actor uuid, accion text not null, motivo text not null,
 anterior jsonb, posterior jsonb, creado_en timestamptz not null default now()
);
revoke all on app_private.auditoria_usuarios_pos from public,anon,authenticated;
alter table app_private.auditoria_usuarios_pos enable row level security;
create function public.guard_ultimo_dueno() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'INSERT' and OLD.activo and OLD.rol='dueño' and (TG_OP='DELETE' or not NEW.activo or NEW.rol<>'dueño') then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:duenos',0));
  if not exists(select 1 from public.usuarios_pos where activo and rol='dueño' and id<>OLD.id) then raise exception 'ULTIMO_DUENO: conserva al menos un dueño activo'; end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
create trigger trg_guard_ultimo_dueno before update or delete on public.usuarios_pos for each row execute function public.guard_ultimo_dueno();
create function public.auditar_usuario_pos() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.auditoria_usuarios_pos(usuario_id,actor,accion,motivo,anterior,posterior)
 values(coalesce(NEW.id,OLD.id),auth.uid(),TG_OP,coalesce(nullif(current_setting('confetti.usuario_motivo',true),''),'Cambio administrativo SQL'),
 case when TG_OP<>'INSERT' then to_jsonb(OLD)-'pin_hash' end,case when TG_OP<>'DELETE' then to_jsonb(NEW)-'pin_hash' end);
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
create trigger trg_auditar_usuario_pos after insert or update or delete on public.usuarios_pos for each row execute function public.auditar_usuario_pos();
revoke all on function public.guard_ultimo_dueno(),public.auditar_usuario_pos() from public,anon,authenticated;
create function public.actualizar_usuario_pos(p_user_id uuid,p_cambios jsonb,p_pin text default null,p_motivo text default 'Gestión de usuario desde POS') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.usuarios_pos; k text; cambios jsonb; nuevo public.usuarios_pos;
begin
 if auth.uid() is null or not public.pos_is_admin() then raise exception 'SOLO_DUENO'; end if;
 if coalesce(btrim(p_motivo),'')='' then raise exception 'MOTIVO_REQUERIDO'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:duenos',0));
 select * into u from public.usuarios_pos where id=p_user_id for update;
 if not found then raise exception 'USUARIO_NO_ENCONTRADO'; end if;
 if exists(select 1 from app_private.terminales_pos where auth_user_id=u.auth_user_id) then raise exception 'TERMINAL_PROTEGIDA'; end if;
 for k in select jsonb_object_keys(p_cambios) loop
  if k not in ('nombre','rol','activo','color','telefono','correo','sucursal_id','sucursal_nombre','permisos_extra') then raise exception 'CAMPO_USUARIO_PROTEGIDO'; end if;
 end loop;
 cambios:=to_jsonb(u)||p_cambios;
 nuevo:=jsonb_populate_record(null::public.usuarios_pos,cambios);
 if nuevo.activo is null or nuevo.nombre is null or btrim(nuevo.nombre)='' or nuevo.rol not in ('dueño','administrador','pastelero') then raise exception 'USUARIO_INVALIDO'; end if;
 if nuevo.rol='administrador' and not exists(select 1 from public.sucursales where id=nuevo.sucursal_id and activa) then raise exception 'SUCURSAL_REQUERIDA'; end if;
 perform set_config('confetti.usuario_motivo',p_motivo,true);
 if p_pin is not null then perform public.actualizar_pin_usuario(p_user_id,p_pin); end if;
 update public.usuarios_pos set nombre=btrim(nuevo.nombre),rol=nuevo.rol,activo=nuevo.activo,color=nuevo.color,telefono=nuevo.telefono,correo=nuevo.correo,sucursal_id=nuevo.sucursal_id,sucursal_nombre=nuevo.sucursal_nombre,permisos_extra=nuevo.permisos_extra where id=p_user_id;
 select * into u from public.usuarios_pos where id=p_user_id;
 return to_jsonb(u)-array['pin_hash','auth_user_id'];
end $$;
revoke all on function public.actualizar_usuario_pos(uuid,jsonb,text,text) from public,anon;
grant execute on function public.actualizar_usuario_pos(uuid,jsonb,text,text) to authenticated;
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
    p_email, extensions.crypt(encode(extensions.gen_random_bytes(32),'hex'), extensions.gen_salt('bf')),
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
  if auth.uid() is null or not public.pos_is_admin() then
    raise exception 'Solo el dueño puede cambiar PINs';
  end if;
  if v_pin is null or v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos numéricos';
  end if;

  select auth_user_id, rol into v_auth, v_rol from public.usuarios_pos where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if exists(select 1 from app_private.terminales_pos where auth_user_id=v_auth) then raise exception 'TERMINAL_PROTEGIDA'; end if;
  perform set_config('confetti.usuario_motivo','Cambio de PIN desde POS',true);
  update public.usuarios_pos
    set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf'))
  where id = p_user_id;

  if v_auth is null then
    v_auth := gen_random_uuid();
    perform public._pos_provision_auth(v_auth, v_email, v_pin, v_rol, p_user_id);
    update public.usuarios_pos set auth_user_id = v_auth where id = p_user_id;
  elsif exists (select 1 from auth.users where id = v_auth) then
    update auth.users
      set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32),'hex'), extensions.gen_salt('bf')),
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
  if auth.uid() is null or not public.pos_is_admin() then
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

  if v_rol='administrador' and not exists(select 1 from public.sucursales where id=p_sucursal_id and activa) then raise exception 'SUCURSAL_REQUERIDA'; end if;
  perform set_config('confetti.usuario_motivo','Alta desde POS',true);
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

-- Read permission stays available to legitimate terminals. Shared catalog and
-- business configuration may not be rewritten by a terminal account.
drop policy pos_all_sucursales on public.sucursales;
create policy pos_read_sucursales on public.sucursales for select to authenticated using ((select public.pos_tiene_sesion()));
create policy pos_write_sucursales on public.sucursales for all to authenticated using ((select public.pos_is_admin())) with check ((select public.pos_is_admin()));
revoke truncate,references,trigger on public.sucursales from anon,authenticated;
drop policy pos_all_configuracion_negocio on public.configuracion_negocio;
create policy pos_read_configuracion_negocio on public.configuracion_negocio for select to authenticated using ((select public.pos_tiene_sesion()));
create policy pos_write_configuracion_negocio on public.configuracion_negocio for all to authenticated using ((select public.pos_is_admin())) with check ((select public.pos_is_admin()));
revoke truncate,references,trigger on public.configuracion_negocio from anon,authenticated;
drop policy pos_all_categorias_producto on public.categorias_producto;
create policy pos_read_categorias_producto on public.categorias_producto for select to authenticated using ((select public.pos_tiene_sesion()));
create policy pos_write_categorias_producto on public.categorias_producto for all to authenticated using ((select public.pos_is_manager())) with check ((select public.pos_is_manager()));
revoke truncate,references,trigger on public.categorias_producto from anon,authenticated;
drop policy pos_all_productos on public.productos;
create policy pos_read_productos on public.productos for select to authenticated using ((select public.pos_tiene_sesion()));
create policy pos_write_productos on public.productos for all to authenticated using ((select public.pos_is_manager())) with check ((select public.pos_is_manager()));
revoke truncate,references,trigger on public.productos from anon,authenticated;
drop policy pos_all_folio_contador on public.folio_contador;
create policy pos_read_folio_contador on public.folio_contador for select to authenticated using ((select public.pos_tiene_sesion()));
revoke truncate,references,trigger on public.folio_contador from anon,authenticated;

create table app_private.login_pin_estado (clave text primary key, fallos integer not null default 0, ventana timestamptz not null default now(), bloqueado_hasta timestamptz);
revoke all on app_private.login_pin_estado from public,anon,authenticated;
alter table app_private.login_pin_estado enable row level security;
create function public.autenticar_pin_pos(p_pin text,p_user_id uuid default null,p_ip text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text; ipk text; r app_private.login_pin_estado; u jsonb; espera integer:=0;
begin
 -- Only the Edge service role can choose an IP bucket. Account/selector keys
 -- never depend on a browser's localStorage or a claimed terminal identity.
 k:='principal:'||coalesce(p_user_id::text,'selector'); ipk:='ip:'||coalesce(p_ip,'sin-ip');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(ipk,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(k,0));
 insert into app_private.login_pin_estado(clave) values(ipk),(k) on conflict do nothing;
 select greatest(0,coalesce(ceil(extract(epoch from (max(bloqueado_hasta)-now())))::integer,0)) into espera from app_private.login_pin_estado where clave in (ipk,k);
 if espera>0 then return jsonb_build_object('ok',false,'espera_segundos',espera); end if;
 if p_pin ~ '^[0-9]{4}$' then
  select jsonb_build_object('id',x.id,'nombre',x.nombre,'rol',x.rol,'sucursal_id',x.sucursal_id,'sucursal_nombre',x.sucursal_nombre,'email',a.email) into u from public.usuarios_pos x join auth.users a on a.id=x.auth_user_id
  where x.activo and x.rol in ('dueño','administrador','pastelero') and x.pin_hash is not null and (p_user_id is null or x.id=p_user_id)
    and extensions.crypt(p_pin,x.pin_hash)=x.pin_hash order by x.created_at limit 1;
 end if;
 if u->>'id' is not null then
  delete from app_private.login_pin_estado where clave=k;
  return jsonb_build_object('ok',true,'operador',u);
 end if;
 update app_private.login_pin_estado set
  fallos=case when ventana<now()-interval '15 minutes' then 1 else fallos+1 end,
  bloqueado_hasta=case when ventana<now()-interval '15 minutes' then null
   when clave=k and fallos+1>=10 or clave=ipk and fallos+1>=30 then now()+interval '5 minutes'
   when clave=k and fallos+1>=5 then now()+interval '30 seconds' else null end,
  ventana=case when ventana<now()-interval '15 minutes' then now() else ventana end
 where clave in (ipk,k);
 select greatest(0,coalesce(ceil(extract(epoch from (max(bloqueado_hasta)-now())))::integer,0)) into espera from app_private.login_pin_estado where clave in (ipk,k);
 return jsonb_build_object('ok',false,'espera_segundos',espera);
end $$;
revoke all on function public.autenticar_pin_pos(text,uuid,text) from public,anon,authenticated;
grant execute on function public.autenticar_pin_pos(text,uuid,text) to service_role;
-- All PIN verification routes exposed to browsers are removed. The only
-- public credential verification is the rate-limited Edge function.
revoke all on function public.login_pos(text,uuid),public.rl_pin_verificar(uuid,text),public.rl_pin_handle(uuid),public.rl_pin_precheck(text,text,text),public.rl_pin_fallo(text,text,text),public.rl_pin_exito(text,text) from public,anon,authenticated;

-- F16: no alternative anonymous INSERT. The controlled RPC fixes credit and
-- state and rejects supplied financial/identity fields outside its contract.
revoke insert on public.pedidos from anon;
drop policy anon_insert_pedidos on public.pedidos;
alter function public.crear_pedido_web(jsonb) set schema app_private;
alter function app_private.crear_pedido_web(jsonb) rename to crear_pedido_web_validado_base;
revoke all on function app_private.crear_pedido_web_validado_base(jsonb) from public,anon,authenticated;
create function public.crear_pedido_web(payload jsonb) returns text language plpgsql security definer set search_path='' as $$
declare k text; n numeric; minimo date; tipo text:=coalesce(payload->>'tipo_pedido','pastel_personalizado');
begin
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>40000 then raise exception 'PEDIDO_INVALIDO'; end if;
 for k in select jsonb_object_keys(payload) loop
  if k not in ('sucursal_id','sucursal_nombre','origen','estado','tipo_pedido','cliente_nombre','cliente_telefono','cliente_email','cliente_direccion','requiere_entrega','fecha_entrega','hora_entrega','kilos','personas_estimadas','concepto','decorado','rellenos','leyenda_pastel','incluye_base','precio_base','incluye_oblea','precio_oblea','incluye_muneca','precio_muneca','incluye_velas','precio_velas','extras_seleccionados','precio_kilo_usado','subtotal_pastel','subtotal_extras','total_calculado','total_final','imagen_referencia_url','notas_generales','devolver_base','creado_por_nombre','a_cuenta','total_abonado','saldo_pendiente') then raise exception 'CAMPO_PEDIDO_PROTEGIDO'; end if;
 end loop;
 if coalesce((payload->>'total_abonado')::numeric,0)<>0 or coalesce((payload->>'a_cuenta')::numeric,0)<>0 or coalesce(payload->>'creado_por_nombre','Web Confetti')<>'Web Confetti' then raise exception 'PAGO_WEB_PROHIBIDO'; end if;
 if length(btrim(payload->>'cliente_nombre')) not between 1 and 150 or length(regexp_replace(payload->>'cliente_telefono','[^0-9]','','g')) not between 10 and 15 then raise exception 'CLIENTE_INVALIDO'; end if;
 foreach k in array array['total_final','total_calculado','subtotal_pastel','subtotal_extras','precio_base','precio_oblea','precio_muneca','precio_velas','precio_kilo_usado','kilos','personas_estimadas'] loop
  if nullif(payload->>k,'') is not null then
   n:=(payload->>k)::numeric;
   if n::text in ('NaN','Infinity','-Infinity') or n<0 or n>1000000 then raise exception 'IMPORTE_WEB_INVALIDO'; end if;
  end if;
 end loop;
 if payload ? 'saldo_pendiente' and (payload->>'saldo_pendiente')::numeric is distinct from coalesce((payload->>'total_final')::numeric,0) then raise exception 'SALDO_WEB_INVALIDO'; end if;
 minimo:=(now() at time zone 'America/Mexico_City')::date+case when tipo='pastel_personalizado' then 1 else 0 end;
 if (payload->>'fecha_entrega')::date<minimo then raise exception 'FECHA_ENTREGA_INVALIDA'; end if;
 return app_private.crear_pedido_web_validado_base(payload);
end $$;
revoke all on function public.crear_pedido_web(jsonb) from public,authenticated;
grant execute on function public.crear_pedido_web(jsonb) to anon,service_role;

create function public.terminal_pos_autorizada(p_sucursal uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',a.email) from app_private.terminales_pos t join auth.users a on a.id=t.auth_user_id join public.sucursales s on s.id=t.sucursal_id where t.sucursal_id=p_sucursal and t.habilitada and s.activa limit 1
$$;
revoke all on function public.terminal_pos_autorizada(uuid) from public,anon,authenticated;
grant execute on function public.terminal_pos_autorizada(uuid) to service_role;

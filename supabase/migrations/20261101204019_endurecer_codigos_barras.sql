-- Comprueba alcance original y destino, sin reescribir códigos ni dinero.
set local lock_timeout='5s';
create or replace function app_private.proteger_codigo_producto() returns trigger
language plpgsql security definer set search_path='' as $$
declare reservado app_private.codigos_producto_reservados;
begin
 if TG_OP='UPDATE' and NEW.codigo_barras is not distinct from OLD.codigo_barras and NEW.codigo_origen is not distinct from OLD.codigo_origen then return NEW; end if;
 if TG_OP='INSERT' and NEW.codigo_barras is null and NEW.codigo_origen is null then return NEW; end if;
 if auth.uid() is null or not public.pos_is_manager() then raise exception 'SOLO_ADMINISTRACION'; end if;
 if not public.pos_is_admin() and (public.pos_sucursal() is null or
   (coalesce(cardinality(NEW.sucursal_ids),0)>0 and not coalesce(public.pos_sucursal()=any(NEW.sucursal_ids),false))) then raise exception 'SUCURSAL_AJENA'; end if;
 if TG_OP='UPDATE' and not public.pos_is_admin() and
   (coalesce(cardinality(OLD.sucursal_ids),0)>0 and not coalesce(public.pos_sucursal()=any(OLD.sucursal_ids),false)) then raise exception 'SUCURSAL_AJENA'; end if;
 NEW.codigo_barras:=public.normalizar_codigo_producto(NEW.codigo_barras);
 if NEW.codigo_barras is null then NEW.codigo_origen:=null; return NEW; end if;
 if NEW.codigo_barras !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$' then raise exception 'CODIGO_INVALIDO'; end if;
 select * into reservado from app_private.codigos_producto_reservados where codigo=NEW.codigo_barras;
 if found then
   if reservado.producto_id<>NEW.id then raise exception 'CODIGO_YA_RESERVADO'; end if;
   NEW.codigo_origen:=reservado.origen;
 else
   if NEW.codigo_barras like 'CF%' then raise exception 'PREFIJO_INTERNO_RESERVADO'; end if;
   NEW.codigo_origen:='asignado';
   insert into app_private.codigos_producto_reservados(codigo,producto_id,origen) values(NEW.codigo_barras,NEW.id,'asignado');
 end if;
 return NEW;
end $$;
revoke all on function app_private.proteger_codigo_producto() from public,anon,authenticated;

create or replace function public.asignar_codigo_producto_pos(p_producto uuid,p_codigo text default null,p_generar boolean default false)
returns public.productos language plpgsql security definer set search_path='' as $$
declare producto public.productos; v_codigo text; origen text;
begin
 if auth.uid() is null or not public.pos_is_manager() then raise exception 'SOLO_ADMINISTRACION'; end if;
 -- Mismo orden para todas las asignaciones: reserva global antes de producto.
 perform pg_advisory_xact_lock(hashtextextended('confetti:codigos-producto',0));
 select * into producto from public.productos where id=p_producto for update;
 if not found then raise exception 'PRODUCTO_NO_EXISTE'; end if;
 if not public.pos_is_admin() and (public.pos_sucursal() is null or
   (coalesce(cardinality(producto.sucursal_ids),0)>0 and not coalesce(public.pos_sucursal()=any(producto.sucursal_ids),false))) then raise exception 'SUCURSAL_AJENA'; end if;
 if p_generar then
   if producto.codigo_barras is not null then return producto; end if;
   loop
    v_codigo:='CF'||lpad(nextval('app_private.codigo_producto_seq')::text,8,'0');
    exit when not exists(select 1 from app_private.codigos_producto_reservados where codigos_producto_reservados.codigo=v_codigo);
   end loop;
   insert into app_private.codigos_producto_reservados(codigo,producto_id,origen) values(v_codigo,p_producto,'generado');
   origen:='generado';
 else
   v_codigo:=public.normalizar_codigo_producto(p_codigo);
   origen:=case when v_codigo is null then null else 'asignado' end;
 end if;
 update public.productos set codigo_barras=v_codigo,codigo_origen=origen where id=p_producto returning * into producto;
 return producto;
end $$;
revoke all on function public.asignar_codigo_producto_pos(uuid,text,boolean) from public,anon;
grant execute on function public.asignar_codigo_producto_pos(uuid,text,boolean) to authenticated;


notify pgrst, 'reload schema';

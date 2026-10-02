-- F11: count-before/count-after cannot detect an equal-size exchange of rows.
-- Financial lists are read in one SELECT snapshot, preserving caller RLS and
-- returning a JSON array in one API row. There is no finite row window.
create function public.historial_operativo_pos(p_tabla text,p_filtro jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare campo text; valor jsonb; operador text; dato jsonb; tipo text; condicion text:='true'; expresion text; resultado jsonb;
begin
 if auth.uid() is null or not public.pos_tiene_sesion() then raise exception 'SIN_SESION_ACTIVA'; end if;
 if p_tabla not in ('ventas','detalle_venta','abonos','gastos_operativos','pedidos','cortes_caja') then raise exception 'TABLA_NO_PERMITIDA'; end if;
 if jsonb_typeof(p_filtro)<>'object' or octet_length(p_filtro::text)>20000 then raise exception 'FILTRO_INVALIDO'; end if;
 for campo,valor in select * from jsonb_each(p_filtro) loop
  select pg_catalog.format_type(a.atttypid,a.atttypmod) into tipo from pg_catalog.pg_attribute a
  where a.attrelid=pg_catalog.to_regclass('public.'||p_tabla) and a.attname=campo and a.attnum>0 and not a.attisdropped;
  if tipo is null then raise exception 'CAMPO_NO_PERMITIDO'; end if;
  if valor='null'::jsonb then condicion:=condicion||format(' and t.%I is null',campo);
  elsif jsonb_typeof(valor)='object' then
   for operador,dato in select * from jsonb_each(valor) loop
    if operador in ('$in','$nin') then
     if jsonb_typeof(dato)<>'array' then raise exception 'FILTRO_INVALIDO'; end if;
     condicion:=condicion||format(' and t.%I %s (select jsonb_array_elements_text(%L::jsonb)::%s)',campo,case when operador='$in' then 'in' else 'not in' end,dato::text,tipo);
    elsif operador='$exists' then
     condicion:=condicion||format(' and t.%I is %snull',campo,case when (dato#>>'{}')::boolean then 'not ' else '' end);
    elsif operador in ('$eq','$ne','$gt','$gte','$lt','$lte') then
     if dato='null'::jsonb and operador in ('$eq','$ne') then
      condicion:=condicion||format(' and t.%I is %snull',campo,case when operador='$ne' then 'not ' else '' end);
     else
      expresion:=case operador when '$eq' then '=' when '$ne' then '<>' when '$gt' then '>' when '$gte' then '>=' when '$lt' then '<' when '$lte' then '<=' end;
      condicion:=condicion||format(' and t.%I %s %L::%s',campo,expresion,dato#>>'{}',tipo);
     end if;
    else raise exception 'OPERADOR_NO_PERMITIDO'; end if;
   end loop;
  else condicion:=condicion||format(' and t.%I = %L::%s',campo,valor#>>'{}',tipo); end if;
 end loop;
 execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id),''[]''::jsonb) from public.%I t where %s',p_tabla,condicion) into resultado;
 return resultado;
end $$;
revoke all on function public.historial_operativo_pos(text,jsonb) from public,anon;
grant execute on function public.historial_operativo_pos(text,jsonb) to authenticated,service_role;

-- Close selector-reset bypass and bound account/IP bucket growth.
create or replace function public.autenticar_pin_pos(p_pin text,p_user_id uuid default null,p_ip text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text; ipk text; global record; u jsonb; espera integer:=0;
begin
 -- Only the Edge service role can choose an IP bucket. Account/selector keys
 -- never depend on a browser's localStorage or a claimed terminal identity.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:pin:trafico',0));
 insert into app_private.login_pin_estado(clave) values('trafico:pin') on conflict do nothing;
 select * into global from app_private.login_pin_estado where clave='trafico:pin';
 if global.ventana>=now()-interval '1 minute' and global.fallos>=60 then
  return jsonb_build_object('ok',false,'espera_segundos',greatest(1,ceil(extract(epoch from (global.ventana+interval '1 minute'-now())))::integer));
 end if;
 update app_private.login_pin_estado set fallos=case when ventana<now()-interval '1 minute' then 1 else fallos+1 end,ventana=case when ventana<now()-interval '1 minute' then now() else ventana end where clave='trafico:pin';
 delete from app_private.login_pin_estado where ventana<now()-interval '2 days' and clave<>'trafico:pin';
 k:='principal:'||case when p_user_id is null then 'selector' when exists(select 1 from public.usuarios_pos where id=p_user_id and activo) then p_user_id::text else 'inexistente' end; ipk:='ip:'||coalesce(p_ip,'sin-ip');
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
  -- A known low-privilege PIN must not reset the shared unknown-user selector
  -- and enable enumeration of another operator. Only a targeted success resets
  -- its own account; selector cooldown expires without extending on a retry.
  if p_user_id is not null then delete from app_private.login_pin_estado where clave=k; end if;
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

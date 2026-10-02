-- Keep the validated legacy contract for old open browsers, but route every
-- accepted new public order through the same durable creation budget.
alter function public.crear_pedido_web(jsonb) set schema app_private;
alter function app_private.crear_pedido_web(jsonb) rename to crear_pedido_web_validado;
revoke all on function app_private.crear_pedido_web_validado(jsonb) from public,anon,authenticated;
create table app_private.intenciones_pedido_web(clave uuid primary key,payload_hash text not null,folio text not null,created_at timestamptz not null default now());
create table app_private.cuotas_pedido_web(clave text primary key,ventana timestamptz not null default now(),solicitudes integer not null default 0);
alter table app_private.intenciones_pedido_web enable row level security;
alter table app_private.cuotas_pedido_web enable row level security;
revoke all on app_private.intenciones_pedido_web,app_private.cuotas_pedido_web from public,anon,authenticated;
create function public.crear_pedido_web_idempotente(p_intencion uuid,payload jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare huella text; anterior app_private.intenciones_pedido_web; folio_nuevo text; k text; ventana_n timestamptz; maximo integer; q app_private.cuotas_pedido_web;
begin
 if p_intencion is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>40000 then raise exception 'PEDIDO_WEB_INVALIDO'; end if;
 huella:=encode(extensions.digest(payload::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:web:intencion:'||p_intencion::text,0));
 select * into anterior from app_private.intenciones_pedido_web where clave=p_intencion;
 if found then
  if anterior.payload_hash<>huella then raise exception 'INTENCION_DISTINTA: recupera el pedido original antes de enviar otro'; end if;
  return anterior.folio;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:web:cuota',0));
 -- These are abuse budgets for accepted creations, not storage/list limits.
 -- Retry of the same intent never consumes another slot.
 for k,ventana_n,maximo in select 'global',date_trunc('minute',now()),120 union all
  select 'telefono:'||encode(extensions.digest(regexp_replace(coalesce(payload->>'cliente_telefono',''),'[^0-9]','','g'),'sha256'),'hex'),date_trunc('hour',now()),20 loop
  insert into app_private.cuotas_pedido_web(clave) values(k) on conflict do nothing;
  select * into q from app_private.cuotas_pedido_web where clave=k;
  if q.ventana=ventana_n and q.solicitudes>=maximo then raise exception 'LIMITE_PEDIDOS_WEB: espera unos minutos y recupera el mismo envío'; end if;
  update app_private.cuotas_pedido_web set ventana=ventana_n,solicitudes=case when ventana=ventana_n then solicitudes+1 else 1 end where clave=k;
 end loop;
 -- Validation and creation are part of this transaction. Invalid payloads
 -- leave no quota, intent, order or folio counter changes behind.
 folio_nuevo:=app_private.crear_pedido_web_validado(payload);
 insert into app_private.intenciones_pedido_web(clave,payload_hash,folio) values(p_intencion,huella,folio_nuevo);
 delete from app_private.cuotas_pedido_web where ventana<now()-interval '2 days';
 return folio_nuevo;
end $$;
revoke all on function public.crear_pedido_web_idempotente(uuid,jsonb) from public;
grant execute on function public.crear_pedido_web_idempotente(uuid,jsonb) to anon,authenticated,service_role;
create function public.crear_pedido_web(payload jsonb) returns text
language sql security definer set search_path='' as $$ select public.crear_pedido_web_idempotente(gen_random_uuid(),payload) $$;
revoke all on function public.crear_pedido_web(jsonb) from public,authenticated;
grant execute on function public.crear_pedido_web(jsonb) to anon,service_role;

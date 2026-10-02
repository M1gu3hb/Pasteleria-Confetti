-- Cache/lease/budgets remain private; a public JWT is not a POS identity.
create table app_private.transcripciones_voz(clave text primary key,archivo text not null,estado text not null check(estado in ('pendiente','completa','error')),transcripcion text,lease uuid not null,lease_hasta timestamptz not null,intentos integer not null default 1,created_at timestamptz not null default now());
create table app_private.cuotas_voz(clave text primary key,ventana timestamptz not null default now(),solicitudes integer not null default 0);
alter table app_private.transcripciones_voz enable row level security;
alter table app_private.cuotas_voz enable row level security;
revoke all on app_private.transcripciones_voz,app_private.cuotas_voz from public,anon,authenticated;
create function public.solicitar_transcripcion_pos(p_archivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare objeto storage.objects; k text; cache app_private.transcripciones_voz; q app_private.cuotas_voz; b text; limite integer; l uuid; ventana_n timestamptz:=date_trunc('hour',now());
begin
 if auth.uid() is null or not public.pos_tiene_sesion() then raise exception 'SIN_SESION_ACTIVA'; end if;
 if p_archivo is null or length(p_archivo)>240 or p_archivo !~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(webm|mp4|ogg)$' or p_archivo like '%..%' then raise exception 'AUDIO_INVALIDO'; end if;
 select * into objeto from storage.objects where bucket_id='notas-voz' and name=p_archivo;
 if not found then raise exception 'AUDIO_NO_DISPONIBLE'; end if;
 if coalesce(objeto.owner_id,objeto.owner::text,'')<>auth.uid()::text and not exists(
  select 1 from public.pedidos p where split_part(p.nota_voz_url,'/storage/v1/object/public/notas-voz/',2)=p_archivo
  and (public.pos_is_admin() or public.pos_is_pastelero() or p.sucursal_id=public.pos_sucursal())
 ) then raise exception 'AUDIO_NO_AUTORIZADO'; end if;
 k:=md5(objeto.name||':'||extract(epoch from objeto.updated_at)::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confetti:voz:cuota',0));
 select * into cache from app_private.transcripciones_voz where clave=k;
 if found then
  if cache.estado='completa' then return jsonb_build_object('estado','completa','transcript',cache.transcripcion); end if;
  if cache.lease_hasta>now() then return jsonb_build_object('estado','pendiente'); end if;
  if cache.intentos>=3 then return jsonb_build_object('estado','agotada'); end if;
 end if;
 for b,limite in select 'global',600 union all select 'actor:'||auth.uid()::text,120 loop
  insert into app_private.cuotas_voz(clave) values(b) on conflict do nothing;
  select * into q from app_private.cuotas_voz where clave=b;
  if q.ventana=ventana_n and q.solicitudes>=limite then return jsonb_build_object('estado','limite'); end if;
 end loop;
 for b in select 'global' union all select 'actor:'||auth.uid()::text loop
  update app_private.cuotas_voz set ventana=ventana_n,solicitudes=case when ventana=ventana_n then solicitudes+1 else 1 end where clave=b;
 end loop;
 l:=gen_random_uuid();
 insert into app_private.transcripciones_voz(clave,archivo,estado,lease,lease_hasta) values(k,p_archivo,'pendiente',l,now()+interval '2 minutes')
 on conflict(clave) do update set estado='pendiente',lease=excluded.lease,lease_hasta=excluded.lease_hasta,intentos=app_private.transcripciones_voz.intentos+1;
 delete from app_private.cuotas_voz where ventana<now()-interval '2 days';
 return jsonb_build_object('estado','nueva','clave',k,'lease',l);
end $$;
revoke all on function public.solicitar_transcripcion_pos(text) from public,anon;
grant execute on function public.solicitar_transcripcion_pos(text) to authenticated;

create function public.completar_transcripcion_pos(p_clave text,p_lease uuid,p_texto text,p_ok boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if length(coalesce(p_texto,''))>40000 then raise exception 'TRANSCRIPCION_INVALIDA'; end if;
 update app_private.transcripciones_voz set estado=case when p_ok then 'completa' else 'error' end,transcripcion=case when p_ok then coalesce(p_texto,'') else null end,lease_hasta=now()+interval '2 minutes'
 where clave=p_clave and lease=p_lease and estado='pendiente';
 return found;
end $$;
revoke all on function public.completar_transcripcion_pos(text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.completar_transcripcion_pos(text,uuid,text,boolean) to service_role;

-- No client feature replaces/deletes stored voice. Removing a recording from
-- an unsaved form only clears its reference; existing bytes stay untouched.
drop policy notas_voz_auth_update on storage.objects;
drop policy notas_voz_auth_delete on storage.objects;
alter policy notas_voz_auth_insert on storage.objects with check(bucket_id='notas-voz' and public.pos_tiene_sesion() and coalesce(owner_id,owner::text)=auth.uid()::text);
alter policy uploads_auth_insert on storage.objects with check(bucket_id='uploads' and public.pos_tiene_sesion() and coalesce(owner_id,owner::text)=auth.uid()::text);
drop policy uploads_auth_update on storage.objects;
-- audio/* also preserves older WebView codec parameters; the Edge validates
-- the exact webm/mp4/ogg container before calling the transcription provider.
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['audio/*'] where id='notas-voz';
-- Public read is retained temporarily to preserve open tablets/legacy URLs.
-- Switching this to private requires the signed-media reader rollout; this
-- migration does not claim that public references/audio are confidential.

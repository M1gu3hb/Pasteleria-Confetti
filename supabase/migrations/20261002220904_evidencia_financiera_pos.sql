-- Evidence is generated in the SAME transaction as the financial write.
-- OBSERVADO is a present-day baseline, never a fabricated historical event.
-- No business money rows are changed and no historical cut is reopened.
set local lock_timeout='5s';
lock table public.ventas,public.detalle_venta,public.pedidos,public.abonos,
 public.cortes_caja,public.gastos_operativos in share row exclusive mode;

create function app_private.snapshot_financiero_pos(r jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) || case when r ? 'intencion_datos' then jsonb_build_object('intencion_hash',md5((r->'intencion_datos')::text)) else '{}'::jsonb end from jsonb_each(r)
 where key=any(array['id','folio','estado','sucursal_id','sucursal_nombre','corte_caja_id',
 'pedido_id','venta_id','subtotal','descuentos','impuestos','total','metodo_pago',
 'monto','monto_efectivo','monto_tarjeta','monto_transferencia','cambio','afecta_caja',
 'total_final','total_calculado','total_abonado','saldo_pendiente','credito_historico',
 'a_cuenta','resta','cantidad','producto_id','producto_nombre','precio_unitario_snapshot',
 'costo_unitario_snapshot','tipo_cancelacion','motivo_cancelacion','monto_devuelto',
 'fecha_cancelacion','cancelado_por_id','cancelado_por_nombre','usuario_cajero_id',
 'usuario_cajero_nombre','registrado_por_id','registrado_por_nombre','usuario_id',
 'usuario_nombre','usuario_apertura_id','usuario_apertura_nombre','fecha','fecha_abono',
 'fecha_apertura','fecha_inicio','fecha_cierre','fecha_anticipo','fecha_pago_completo',
 'fecha_entrega_real','created_at','total_efectivo','total_tarjeta','total_transferencia',
 'total_general','total_descuentos','total_cancelaciones','numero_ventas','ticket_promedio',
 'total_gastos','efectivo_inicial_contado','fondo_esperado_apertura','diferencia_apertura',
 'efectivo_esperado','efectivo_contado','diferencia_efectivo','dinero_dejado_en_caja',
 'descripcion','categoria','idempotency_key'])
$$;
revoke all on function app_private.snapshot_financiero_pos(jsonb) from public,anon,authenticated;

create table app_private.eventos_financieros_pos (
 id bigint generated always as identity primary key,
 entidad text not null check(entidad in ('ventas','detalle_venta','pedidos','abonos','cortes_caja','gastos_operativos')),
 registro_id uuid not null, sucursal_id uuid, corte_id uuid, pedido_id uuid, venta_id uuid,
 accion text not null check(accion in ('OBSERVADO','INSERT','UPDATE','DELETE')),
 registrado_en timestamptz not null default clock_timestamp(), transaccion text not null,
 actor_auth uuid, actor_pos_id uuid, actor_pos_nombre text,
 origen text not null check(origen in ('observacion_inicial','sql_privilegiado','terminal','humano','publico')),
 anterior jsonb, posterior jsonb,
 check(anterior is not null or posterior is not null)
);
alter table app_private.eventos_financieros_pos enable row level security;
revoke all on app_private.eventos_financieros_pos from public,anon,authenticated,service_role;
revoke all on sequence app_private.eventos_financieros_pos_id_seq from public,anon,authenticated,service_role;
create index eventos_financieros_registro on app_private.eventos_financieros_pos(entidad,registro_id,id desc);
create index eventos_financieros_pedido on app_private.eventos_financieros_pos(pedido_id,id desc) where pedido_id is not null;
create index eventos_financieros_corte on app_private.eventos_financieros_pos(corte_id,id desc) where corte_id is not null;
create index eventos_financieros_sucursal on app_private.eventos_financieros_pos(sucursal_id,id desc);

create function app_private.guard_eventos_financieros_pos() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'EVIDENCIA_SOLO_ANEXAR'; end $$;
revoke all on function app_private.guard_eventos_financieros_pos() from public,anon,authenticated,service_role;
create trigger guard_eventos_financieros_pos before update or delete on app_private.eventos_financieros_pos
for each row execute function app_private.guard_eventos_financieros_pos();
create trigger guard_truncate_eventos_financieros_pos before truncate on app_private.eventos_financieros_pos
for each statement execute function app_private.guard_eventos_financieros_pos();

create function app_private.auditar_finanzas_pos() returns trigger
language plpgsql security definer set search_path='' as $$
declare viejo jsonb; nuevo jsonb; r jsonb; suc uuid; corte uuid; pid uuid; vid uuid;
 actor uuid:=auth.uid(); perfil public.usuarios_pos; origen text;
begin
 if TG_OP<>'INSERT' then viejo:=app_private.snapshot_financiero_pos(to_jsonb(OLD)); end if;
 if TG_OP<>'DELETE' then nuevo:=app_private.snapshot_financiero_pos(to_jsonb(NEW)); end if;
 if TG_OP='UPDATE' and viejo is not distinct from nuevo then return NEW; end if;
 r:=coalesce(nuevo,viejo);
 suc:=nullif(r->>'sucursal_id','')::uuid;
 corte:=nullif(r->>'corte_caja_id','')::uuid;
 pid:=case when TG_TABLE_NAME='pedidos' then (r->>'id')::uuid else nullif(r->>'pedido_id','')::uuid end;
 vid:=case when TG_TABLE_NAME='ventas' then (r->>'id')::uuid else nullif(r->>'venta_id','')::uuid end;
 if TG_TABLE_NAME='cortes_caja' then corte:=(r->>'id')::uuid; end if;
 if TG_TABLE_NAME='detalle_venta' then
  select v.sucursal_id,v.corte_caja_id into suc,corte from public.ventas v where v.id=vid;
  if not found then
   select e.sucursal_id,e.corte_id into suc,corte from app_private.eventos_financieros_pos e
   where e.entidad='ventas' and e.registro_id=vid order by e.id desc limit 1;
  end if;
 end if;
 if actor is not null then select * into perfil from public.usuarios_pos where auth_user_id=actor limit 1; end if;
 origen:=case when actor is null then case when current_setting('role',true)='anon' then 'publico' else 'sql_privilegiado' end
  when exists(select 1 from app_private.terminales_pos t where t.auth_user_id=actor) then 'terminal' else 'humano' end;
 insert into app_private.eventos_financieros_pos(entidad,registro_id,sucursal_id,corte_id,pedido_id,venta_id,
  accion,transaccion,actor_auth,actor_pos_id,actor_pos_nombre,origen,anterior,posterior)
 values(TG_TABLE_NAME,(r->>'id')::uuid,suc,corte,pid,vid,TG_OP,txid_current()::text,
  actor,perfil.id,perfil.nombre,origen,viejo,nuevo);
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function app_private.auditar_finanzas_pos() from public,anon,authenticated,service_role;

-- Capture the actual pre/post state, not a client-supplied success log.
do $$ declare tabla text; begin
 foreach tabla in array array['ventas','detalle_venta','pedidos','abonos','cortes_caja','gastos_operativos'] loop
  execute format('create trigger zzz_auditar_finanzas_pos after insert or update or delete on public.%I for each row execute function app_private.auditar_finanzas_pos()',tabla);
  execute format($q$
   insert into app_private.eventos_financieros_pos(entidad,registro_id,sucursal_id,corte_id,pedido_id,venta_id,accion,transaccion,origen,posterior)
   select %L,t.id,
    case when %L='detalle_venta' then v.sucursal_id else nullif(to_jsonb(t)->>'sucursal_id','')::uuid end,
    case when %L='cortes_caja' then t.id when %L='detalle_venta' then v.corte_caja_id else nullif(to_jsonb(t)->>'corte_caja_id','')::uuid end,
    case when %L='pedidos' then t.id else nullif(to_jsonb(t)->>'pedido_id','')::uuid end,
    case when %L='ventas' then t.id else nullif(to_jsonb(t)->>'venta_id','')::uuid end,
    'OBSERVADO',txid_current()::text,'observacion_inicial',app_private.snapshot_financiero_pos(to_jsonb(t))
   from public.%I t left join public.ventas v on v.id=nullif(to_jsonb(t)->>'venta_id','')::uuid
  $q$,tabla,tabla,tabla,tabla,tabla,tabla,tabla);
 end loop;
end $$;

-- Close two holes found during re-audit: mutable cancellation evidence and
-- mutable money/product detail after cancellation. Privileged corrections
-- remain possible and are now automatically recorded by the same audit.
create function public.guard_evidencia_cancelacion_pos() returns trigger
language plpgsql security definer set search_path='' as $$
declare estado_cancelado text; perfil public.usuarios_pos;
begin
 if auth.uid() is null then return NEW; end if;
 estado_cancelado:=case when TG_TABLE_NAME='ventas' then 'cancelada' else 'cancelado' end;
 if TG_TABLE_NAME='ventas' then
  if OLD.estado in ('pagada','cancelada') and OLD.total>0 and
   (NEW.idempotency_key,NEW.intencion_datos,NEW.created_at,NEW.fecha_apertura,NEW.usuario_cajero_id,NEW.usuario_cajero_nombre)
   is distinct from
   (OLD.idempotency_key,OLD.intencion_datos,OLD.created_at,OLD.fecha_apertura,OLD.usuario_cajero_id,OLD.usuario_cajero_nombre) then
   raise exception 'EVIDENCIA_COBRO_PROTEGIDA: conserva intención, fecha e identidad del cobro';
  end if;
 end if;
 if OLD.estado=estado_cancelado and
  (NEW.estado,NEW.tipo_cancelacion,NEW.motivo_cancelacion,NEW.monto_devuelto,NEW.fecha_cancelacion,NEW.cancelado_por_id,NEW.cancelado_por_nombre)
  is distinct from
  (OLD.estado,OLD.tipo_cancelacion,OLD.motivo_cancelacion,OLD.monto_devuelto,OLD.fecha_cancelacion,OLD.cancelado_por_id,OLD.cancelado_por_nombre) then
  raise exception 'CANCELACION_PROTEGIDA: la evidencia no se sobrescribe';
 end if;
 if TG_TABLE_NAME='pedidos' and NEW.monto_devuelto is distinct from OLD.monto_devuelto and
  coalesce(current_setting('confetti.operacion_pedido',true),'')='' then
  raise exception 'DEVOLUCION_TRANSACCIONAL_REQUERIDA';
 end if;
 if OLD.estado<>estado_cancelado and NEW.estado=estado_cancelado then
  if TG_TABLE_NAME='pedidos' and (NEW.tipo_cancelacion is null or NEW.tipo_cancelacion not in ('cancelacion','devolucion') or nullif(btrim(NEW.motivo_cancelacion),'') is null) then raise exception 'CANCELACION_INVALIDA'; end if;
  NEW.fecha_cancelacion:=clock_timestamp();
  select * into perfil from public.usuarios_pos where auth_user_id=auth.uid() and activo limit 1;
  if found then NEW.cancelado_por_id:=perfil.id::text; NEW.cancelado_por_nombre:=perfil.nombre; end if;
 end if;
 return NEW;
end $$;
revoke all on function public.guard_evidencia_cancelacion_pos() from public,anon,authenticated;
create trigger aab_guard_evidencia_cancelacion before update on public.ventas for each row execute function public.guard_evidencia_cancelacion_pos();
create trigger aab_guard_evidencia_cancelacion before update on public.pedidos for each row execute function public.guard_evidencia_cancelacion_pos();
revoke delete on public.pedidos from authenticated;

-- Protect anomalous old orders without modifying historical money. A replay
-- of an already confirmed intent remains available. Lock order: cut -> order.
alter function public.operacion_pedido_tx(jsonb) rename to operacion_pedido_tx_base;
alter function public.operacion_pedido_tx_base(jsonb) set schema app_private;
revoke all on function app_private.operacion_pedido_tx_base(jsonb) from public,anon,authenticated;
create function public.operacion_pedido_tx(p_intencion jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=nullif(p_intencion->>'pedido_id','')::uuid;
 suc uuid:=(p_intencion->>'sucursal_id')::uuid; corte uuid:=nullif(p_intencion->>'corte_id','')::uuid;
 intencion_clave text:=p_intencion->>'clave';
begin
 if auth.uid() is null or not public.pos_tiene_sesion() then raise exception 'SIN_SESION'; end if;
 if suc is null or (not public.pos_is_admin() and suc is distinct from public.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 if intencion_clave is null or length(intencion_clave)<8 or length(intencion_clave)>200 then raise exception 'CLAVE_REQUERIDA'; end if;
 perform pg_advisory_xact_lock(hashtextextended(intencion_clave,0));
 if exists(select 1 from app_private.operaciones_pedido o where o.clave=intencion_clave) then
  return app_private.operacion_pedido_tx_base(p_intencion);
 end if;
 if pid is not null and p_intencion->>'accion' in ('pago','devolucion') then
  if corte is not null then perform 1 from public.cortes_caja where id=corte for update; end if;
  perform 1 from public.pedidos where id=pid and sucursal_id=suc for update;
  if exists(select 1 from public.abonos a join public.ventas v on v.id=a.venta_id where a.pedido_id=pid and a.monto>0 and v.estado='cancelada') then
   raise exception 'CONCILIAR_PAGO_CANCELADO: el POS conserva un pago cuya venta se canceló; revisa su evidencia antes de cobrar o devolver. No se registró dinero.';
  end if;
 end if;
 return app_private.operacion_pedido_tx_base(p_intencion);
end $$;
revoke all on function public.operacion_pedido_tx(jsonb) from public,anon;
grant execute on function public.operacion_pedido_tx(jsonb) to authenticated;

create function public.guard_entrega_conciliacion_pos() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and NEW.estado='entregado' and OLD.estado<>'entregado' and
  exists(select 1 from public.abonos a join public.ventas v on v.id=a.venta_id where a.pedido_id=OLD.id and a.monto>0 and v.estado='cancelada') then
  raise exception 'CONCILIAR_PAGO_CANCELADO: revisa la evidencia del pago antes de entregar';
 end if;
 return NEW;
end $$;
revoke all on function public.guard_entrega_conciliacion_pos() from public,anon,authenticated;
create trigger aaa_guard_entrega_conciliacion before update on public.pedidos for each row execute function public.guard_entrega_conciliacion_pos();

create or replace function public.guard_detalle_financiero()
returns trigger language plpgsql security definer set search_path='' as $$
declare vid uuid; corte uuid; v public.ventas; c public.cortes_caja;
begin
 if auth.uid() is null then return case when TG_OP='DELETE' then OLD else NEW end; end if;
 vid:=case when TG_OP='DELETE' then OLD.venta_id else NEW.venta_id end;
 if TG_OP='UPDATE' and NEW.venta_id is distinct from OLD.venta_id then raise exception 'DETALLE_VENTA_PROTEGIDO'; end if;
 select corte_caja_id into corte from public.ventas where id=vid;
 if corte is not null then
  select * into c from public.cortes_caja where id=corte for update;
  if c.estado='cerrado' then raise exception 'CORTE_CERRADO: detalle histórico protegido'; end if;
 end if;
 select * into v from public.ventas where id=vid for update;
 if v.corte_caja_id is distinct from corte then raise exception 'VENTA_CAMBIO: vuelve a consultar'; end if;
 if TG_OP<>'INSERT' and v.estado in ('pagada','cancelada') then
  if TG_OP='DELETE' then raise exception 'DETALLE_VENTA_PROTEGIDO'; end if;
  if (to_jsonb(NEW)-array['estado_preparacion','notas_producto']) is distinct from (to_jsonb(OLD)-array['estado_preparacion','notas_producto']) then raise exception 'DETALLE_VENTA_PROTEGIDO'; end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;

-- Exact evidence for the cancellation/ledger discrepancy. It does not claim
-- the physical refund happened, and does not create an outgoing cash entry.
alter function public.conciliacion_operativa_pos(uuid) rename to conciliacion_operativa_pos_base;
alter function public.conciliacion_operativa_pos_base(uuid) set schema app_private;
revoke all on function app_private.conciliacion_operativa_pos_base(uuid) from public,anon,authenticated;
create function public.conciliacion_operativa_pos(p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resultado jsonb; evidencia jsonb;
begin
 resultado:=app_private.conciliacion_operativa_pos_base(p_sucursal);
 select coalesce(jsonb_agg(jsonb_build_object(
  'pedido_id',p.id,'pedido',p.folio,'venta_id',v.id,'venta',v.folio,'monto',a.monto,'metodo',a.metodo_pago,
  'estado_pedido',p.estado,'saldo_pedido',p.saldo_pendiente,'abonado_pedido',p.total_abonado,
  'tipo_cancelacion',v.tipo_cancelacion,'motivo',v.motivo_cancelacion,'devuelto_registrado',v.monto_devuelto,
  'cobrado_en',a.fecha_abono,'cancelado_en',v.fecha_cancelacion,'cancelado_por',v.cancelado_por_nombre,
  'corte',c.folio,'corte_estado',c.estado,'sucursal',p.sucursal_nombre,
  'devoluciones_libro',coalesce((select -sum(x.monto) from public.abonos x where x.pedido_id=p.id and x.monto<0),0),
  'pedidos_relacionados',coalesce((select jsonb_agg(jsonb_build_object('folio',q.folio,'estado',q.estado,'total',q.total_final,'abonado',q.total_abonado) order by q.created_at)
   from public.pedidos q where q.id<>p.id and q.sucursal_id=p.sucursal_id and nullif(btrim(p.cliente_telefono),'') is not null
    and q.cliente_telefono=p.cliente_telefono and q.created_at between p.created_at-interval '2 days' and p.created_at+interval '2 days'),'[]'::jsonb)
 ) order by p.folio,v.folio),'[]'::jsonb) into evidencia
 from public.abonos a join public.ventas v on v.id=a.venta_id join public.pedidos p on p.id=a.pedido_id
 left join public.cortes_caja c on c.id=v.corte_caja_id
 where a.monto>0 and v.estado='cancelada' and (p_sucursal is null or a.sucursal_id=p_sucursal);
 return resultado||jsonb_build_object('pagos_con_venta_cancelada',evidencia);
end $$;
revoke all on function public.conciliacion_operativa_pos(uuid) from public,anon;
grant execute on function public.conciliacion_operativa_pos(uuid) to authenticated;

-- Seek pagination has a fixed upper bound captured on page one. Concurrent
-- newer events cannot displace older pages or masquerade as complete history.
create function public.historial_evidencia_pos(p_entidad text,p_registro uuid,p_antes bigint default null,p_hasta bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tope bigint; ultimo bigint; filas jsonb; mas boolean; ventas_pedido uuid[];
begin
 if auth.uid() is null or not public.pos_is_admin() then raise exception 'SOLO_DUENO'; end if;
 if p_entidad is null or p_entidad not in ('ventas','detalle_venta','pedidos','abonos','cortes_caja','gastos_operativos') or p_registro is null then raise exception 'REGISTRO_INVALIDO'; end if;
 if p_entidad='pedidos' then
  select array_agg(distinct vid) into ventas_pedido from (
   select a.venta_id vid from public.abonos a where a.pedido_id=p_registro and a.venta_id is not null
   union select e.venta_id from app_private.eventos_financieros_pos e where e.pedido_id=p_registro and e.venta_id is not null
  ) vinculadas;
 end if;
 select coalesce(p_hasta,max(e.id),0) into tope from app_private.eventos_financieros_pos e;
 select coalesce(jsonb_agg(to_jsonb(pagina)-'id'||jsonb_build_object('id',pagina.id::text) order by pagina.id desc),'[]'::jsonb),min(pagina.id)
 into filas,ultimo from (
  select e.* from app_private.eventos_financieros_pos e where e.id<=tope and (p_antes is null or e.id<p_antes) and
  ((e.entidad=p_entidad and e.registro_id=p_registro) or (p_entidad='pedidos' and (e.pedido_id=p_registro or e.venta_id=any(ventas_pedido)))
   or (p_entidad='ventas' and e.venta_id=p_registro) or (p_entidad='cortes_caja' and e.corte_id=p_registro))
  order by e.id desc limit 100
 ) pagina;
 select exists(select 1 from app_private.eventos_financieros_pos e where e.id<=tope and e.id<ultimo and
  ((e.entidad=p_entidad and e.registro_id=p_registro) or (p_entidad='pedidos' and (e.pedido_id=p_registro or e.venta_id=any(ventas_pedido)))
   or (p_entidad='ventas' and e.venta_id=p_registro) or (p_entidad='cortes_caja' and e.corte_id=p_registro))) into mas;
 return jsonb_build_object('eventos',filas,'hasta',tope::text,'siguiente',case when mas then ultimo::text end,'consultado_en',now());
end $$;
revoke all on function public.historial_evidencia_pos(text,uuid,bigint,bigint) from public,anon;
grant execute on function public.historial_evidencia_pos(text,uuid,bigint,bigint) to authenticated;

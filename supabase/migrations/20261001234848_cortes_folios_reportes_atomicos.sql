set local lock_timeout = '5s';
create unique index if not exists ventas_folio_unico on public.ventas(sucursal_id,folio);
create unique index if not exists pedidos_folio_unico on public.pedidos(sucursal_id,folio);
create unique index if not exists cortes_folio_unico on public.cortes_caja(sucursal_id,folio);
create or replace function public.siguiente_folio(p_tipo text,p_sucursal_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare pref text; n bigint; maximo bigint;
begin
 if p_tipo not in ('venta','corte','pedido_pastel') then raise exception 'TIPO_FOLIO_INVALIDO'; end if;
 select folio_prefijo into pref from public.sucursales where id=p_sucursal_id;
 if pref is null then raise exception 'SUCURSAL_INVALIDA'; end if;
 insert into public.folio_contador(tipo,sucursal_id,prefijo,ultimo_numero) values(p_tipo,p_sucursal_id,pref,0) on conflict(tipo,sucursal_id) do nothing;
 perform 1 from public.folio_contador where tipo=p_tipo and sucursal_id=p_sucursal_id for update;
 -- Reconcile the complete historical namespace, including padded/unpadded forms.
 if p_tipo='venta' then select coalesce(max(substring(folio from '-V([0-9]+)$')::bigint),0) into maximo from public.ventas where sucursal_id=p_sucursal_id;
 elsif p_tipo='corte' then select coalesce(max(substring(folio from '-C([0-9]+)$')::bigint),0) into maximo from public.cortes_caja where sucursal_id=p_sucursal_id;
 else select coalesce(max(substring(folio from '^PP-[^-]+-([0-9]+)$')::bigint),0) into maximo from public.pedidos where sucursal_id=p_sucursal_id; end if;
 update public.folio_contador set ultimo_numero=greatest(ultimo_numero,maximo)+1 where tipo=p_tipo and sucursal_id=p_sucursal_id returning ultimo_numero into n;
 -- Do not lpad a number longer than the minimum width: lpad would truncate it.
 return case p_tipo when 'venta' then 'CONF-'||pref||'-V'||case when n<10000 then lpad(n::text,4,'0') else n::text end
 when 'corte' then 'CONF-'||pref||'-C'||case when n<1000 then lpad(n::text,3,'0') else n::text end
 else 'PP-'||pref||'-'||case when n<10000 then lpad(n::text,4,'0') else n::text end end;
end $$;
revoke all on function public.siguiente_folio(text,uuid) from public,anon,authenticated;
create or replace function public.reservar_folio_pos(p_tipo text,p_sucursal_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'SIN_SESION'; end if;
 if not public.pos_is_admin() and p_sucursal_id is distinct from public.pos_sucursal() then raise exception 'SUCURSAL_AJENA'; end if;
 return public.siguiente_folio(p_tipo,p_sucursal_id);
end $$;
revoke all on function public.reservar_folio_pos(text,uuid) from public,anon;
grant execute on function public.reservar_folio_pos(text,uuid) to authenticated;
-- Closing the counter's client write channel prevents stale bundles from
-- overwriting a reservation made in PostgreSQL. RLS identities are unchanged.
revoke insert,update,delete on public.folio_contador from authenticated;

create or replace function public.guard_operacion_corte()
returns trigger language plpgsql security definer set search_path = '' as $$
declare corte uuid; suc uuid; c public.cortes_caja;
begin
 if TG_OP='DELETE' then corte:=OLD.corte_caja_id;suc:=OLD.sucursal_id;
 else corte:=NEW.corte_caja_id;suc:=NEW.sucursal_id; end if;
 -- A financial row may not be moved away from a closed original cut.
 if TG_TABLE_NAME='ventas' and TG_OP<>'INSERT' and auth.uid() is not null then
  if exists(select 1 from public.abonos a where a.venta_id=OLD.id) then
   raise exception 'PAGO_DE_PEDIDO: cancela o devuelve desde el pedido para conservar su libro de pagos.';
  end if;
 end if;
 if TG_OP='UPDATE' and OLD.corte_caja_id is distinct from corte and OLD.corte_caja_id is not null then
  select * into c from public.cortes_caja where id=OLD.corte_caja_id for update;
  if c.estado='cerrado' and auth.uid() is not null then raise exception 'CORTE_CERRADO: se requiere una corrección contable auditada'; end if;
 end if;
 if corte is not null then
  select * into c from public.cortes_caja where id=corte for update;
  if not found or c.sucursal_id is distinct from suc then raise exception 'CORTE_SUCURSAL_NO_COINCIDE'; end if;
  if c.estado<>'abierto' and auth.uid() is not null then raise exception 'CORTE_CERRADO: no se modificó el corte'; end if;
 else
  if TG_TABLE_NAME='ventas' and TG_OP<>'DELETE' then
   if NEW.estado='pagada' then raise exception 'CORTE_REQUERIDO'; end if;
  elsif TG_TABLE_NAME in ('abonos','gastos_operativos') and auth.uid() is not null then
   raise exception 'CORTE_REQUERIDO';
  end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function public.guard_operacion_corte() from public,anon,authenticated;
create trigger trg_guard_venta_corte before insert or update or delete on public.ventas for each row execute function public.guard_operacion_corte();
create trigger trg_guard_abono_corte before insert or update or delete on public.abonos for each row execute function public.guard_operacion_corte();
create trigger trg_guard_gasto_corte before insert or update or delete on public.gastos_operativos for each row execute function public.guard_operacion_corte();

create or replace function public.guard_cierre_transaccional()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n numeric; total numeric; ef numeric; ta numeric; tr numeric; gasto numeric; gastoef numeric; dev numeric;
begin
 if OLD.estado='cerrado' and NEW is distinct from OLD and auth.uid() is not null then raise exception 'CORTE_CERRADO: se requiere una corrección contable auditada'; end if;
 if OLD.estado<>'abierto' or NEW.estado<>'cerrado' then return NEW; end if;
 if NEW.fecha_cierre is null then raise exception 'FECHA_CIERRE_REQUERIDA'; end if;
 -- UPDATE already holds the cut row lock. All financial writers acquire it
 -- before committing, so these queries see the winning operations.
 update public.ventas set corte_caja_id=OLD.id where corte_caja_id is null and estado='pagada' and sucursal_id=OLD.sucursal_id
  and fecha_cierre>=coalesce(OLD.fecha_apertura,OLD.fecha_inicio,OLD.created_at) and fecha_cierre<=NEW.fecha_cierre;
 select count(*),coalesce(sum(v.total),0),coalesce(sum(monto_efectivo),0),coalesce(sum(monto_tarjeta),0),coalesce(sum(monto_transferencia),0)
 into n,total,ef,ta,tr from public.ventas v where v.corte_caja_id=OLD.id and v.sucursal_id=OLD.sucursal_id and v.estado='pagada';
 select coalesce(sum(monto),0),coalesce(sum(monto) filter(where metodo_pago='efectivo'),0) into gasto,gastoef from public.gastos_operativos
 where sucursal_id=OLD.sucursal_id and (corte_caja_id=OLD.id or (corte_caja_id is null and created_at>=coalesce(OLD.fecha_apertura,OLD.fecha_inicio,OLD.created_at) and created_at<=NEW.fecha_cierre));
 select coalesce(sum(monto_efectivo),0) into dev from public.abonos where corte_caja_id=OLD.id and monto<0;
 if NEW.numero_ventas is distinct from n or abs(coalesce(NEW.total_general,-1)-total)>0.005
 or abs(coalesce(NEW.total_efectivo,-1)-ef)>0.005 or abs(coalesce(NEW.total_tarjeta,-1)-ta)>0.005
 or abs(coalesce(NEW.total_transferencia,-1)-tr)>0.005 or abs(coalesce(NEW.total_gastos,-1)-gasto)>0.005
 or abs(coalesce(NEW.efectivo_esperado,-1)-(ef+dev-gastoef))>0.005 then
  raise exception 'CIERRE_CAMBIO: hubo movimientos nuevos o el resumen está incompleto. Actualiza el resumen e intenta cerrar; no se guardó el corte.' using errcode='23514';
 end if;
 return NEW;
end $$;
revoke all on function public.guard_cierre_transaccional() from public,anon,authenticated;
create trigger aaa_guard_cierre_transaccional before update on public.cortes_caja for each row execute function public.guard_cierre_transaccional();

create or replace function public.datos_corte_pos(p_corte_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.cortes_caja; ventas jsonb; cancelaciones jsonb; detalles jsonb; detalles_cancel jsonb; gastos jsonb; abonos jsonb; entregas jsonb;
begin
 select * into c from public.cortes_caja where id=p_corte_id;
 if auth.uid() is null or not found or (not public.pos_is_admin() and c.sucursal_id is distinct from public.pos_sucursal()) then raise exception 'CORTE_NO_AUTORIZADO'; end if;
 -- Explicit links are authoritative. No fallback can accept a linked row
 -- from a different cut merely because dates overlap.
 select coalesce(jsonb_agg(to_jsonb(v) order by v.fecha_cierre,v.id) filter(where v.estado='pagada'),'[]'),
 coalesce(jsonb_agg(to_jsonb(v) order by v.fecha_cierre,v.id) filter(where v.estado='cancelada'),'[]') into ventas,cancelaciones
 from public.ventas v where v.corte_caja_id=c.id and v.sucursal_id=c.sucursal_id;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id) filter(where v.estado='pagada'),'[]'),
 coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id) filter(where v.estado='cancelada'),'[]') into detalles,detalles_cancel
 from public.detalle_venta d join public.ventas v on v.id=d.venta_id where v.corte_caja_id=c.id and v.sucursal_id=c.sucursal_id;
 select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('created_date',g.created_at) order by g.created_at,g.id),'[]') into gastos from public.gastos_operativos g
 where g.sucursal_id=c.sucursal_id and (g.corte_caja_id=c.id or (g.corte_caja_id is null and g.created_at>=coalesce(c.fecha_apertura,c.fecha_inicio,c.created_at) and g.created_at<=coalesce(c.fecha_cierre,now())));
 select coalesce(jsonb_agg(to_jsonb(a) order by a.fecha_abono,a.id),'[]') into abonos from public.abonos a where a.corte_caja_id=c.id and a.sucursal_id=c.sucursal_id;
 select coalesce(jsonb_agg(jsonb_build_object('folio',p.folio,'nombre',coalesce(p.cliente_nombre,p.concepto,'Pastel'),
  'hora',to_char(p.fecha_entrega_real at time zone 'America/Mexico_City','HH24:MI'),'fechaMs',extract(epoch from p.fecha_entrega_real)*1000) order by p.fecha_entrega_real,p.id),'[]') into entregas
 from public.pedidos p where p.sucursal_id=c.sucursal_id and p.estado='entregado' and p.fecha_entrega_real>=coalesce(c.fecha_apertura,c.fecha_inicio,c.created_at) and p.fecha_entrega_real<=coalesce(c.fecha_cierre,now());
 return jsonb_build_object('corte',to_jsonb(c),'ventas',ventas,'cancelaciones',cancelaciones,'detalles',detalles,'detallesCancel',detalles_cancel,'gastos',gastos,'abonos',abonos,'entregas',entregas);
end $$;
revoke all on function public.datos_corte_pos(uuid) from public,anon;
grant execute on function public.datos_corte_pos(uuid) to authenticated;

create or replace function public.ventas_cajas_activas_pos(p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'SIN_SESION'; end if;
 if not public.pos_is_admin() and (p_sucursal is null or p_sucursal is distinct from public.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.fecha_cierre,v.id) from public.ventas v join public.cortes_caja c on c.id=v.corte_caja_id
  where c.estado='abierto' and v.estado='pagada' and c.sucursal_id=v.sucursal_id and (p_sucursal is null or v.sucursal_id=p_sucursal)),'[]');
end $$;
revoke all on function public.ventas_cajas_activas_pos(uuid) from public,anon;
grant execute on function public.ventas_cajas_activas_pos(uuid) to authenticated;

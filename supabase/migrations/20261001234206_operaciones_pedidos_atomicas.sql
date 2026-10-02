-- F05/F06/F07. Additive rollout; previous clients remain compatible until the
-- separate legacy-write guard is enabled. No new money is manufactured.
set local lock_timeout = '5s';
create schema if not exists app_private;
create table if not exists app_private.operaciones_pedido (
  clave text primary key,
  sucursal_id uuid not null references public.sucursales(id),
  solicitud jsonb not null,
  resultado jsonb not null,
  actor uuid,
  created_at timestamptz not null default now()
);
revoke all on app_private.operaciones_pedido from public, anon, authenticated;
alter table app_private.operaciones_pedido enable row level security;
create table if not exists app_private.reparacion_saldos_20261001 (
  pedido_id uuid primary key,
  antes jsonb not null,
  despues jsonb,
  motivo text not null,
  created_at timestamptz not null default now()
);
revoke all on app_private.reparacion_saldos_20261001 from public, anon, authenticated;
alter table app_private.reparacion_saldos_20261001 enable row level security;

alter table public.pedidos add column if not exists credito_historico numeric not null default 0;
alter table public.abonos add column if not exists venta_id uuid references public.ventas(id);
create unique index if not exists abonos_venta_unica on public.abonos(venta_id) where venta_id is not null;
create index if not exists abonos_pedido_libro on public.abonos(pedido_id);
-- Attach historical pairs only when both ends are unique, including cancelled
-- sales. A cancelled sale is not a missing payment and must not be recreated.
with candidatos as (
 select a.id as abono_id,v.id as venta_id,count(*) over(partition by a.id) as por_abono,
 count(*) over(partition by v.id) as por_venta
 from public.abonos a join public.pedidos p on p.id=a.pedido_id join public.ventas v
 on v.sucursal_id=a.sucursal_id and v.corte_caja_id=a.corte_caja_id and v.total=a.monto
 and v.monto_efectivo=a.monto_efectivo and v.monto_tarjeta=a.monto_tarjeta and v.monto_transferencia=a.monto_transferencia
 and v.notas like 'Pago de pedido '||p.folio||'%'
 and abs(extract(epoch from v.fecha_cierre-a.fecha_abono))<60
 where a.monto>0 and a.afecta_caja and a.venta_id is null
)
update public.abonos a set venta_id=c.venta_id from candidatos c where a.id=c.abono_id and c.por_abono=1 and c.por_venta=1;


-- Capture the recognized credit that predates the ledger. Do not insert an
-- Abono or Venta: these amounts must never be charged again or enter a cut.
insert into app_private.reparacion_saldos_20261001(pedido_id, antes, motivo)
select p.id, to_jsonb(p), 'Crédito histórico reconocido sin libro; preservar sin ingreso nuevo'
from public.pedidos p
where coalesce(p.total_abonado,0) > coalesce((select sum(a.monto) from public.abonos a where a.pedido_id=p.id),0)
on conflict do nothing;
update public.pedidos p set credito_historico = greatest(0,
 coalesce(p.total_abonado,0)-coalesce((select sum(a.monto) from public.abonos a where a.pedido_id=p.id),0));

-- The commercial total changes independently from the payment ledger. This
-- BEFORE trigger also protects old clients editing prices; it never alters a
-- cut or discards a recognized payment.
create or replace function public.derivar_saldo_pedido()
returns trigger language plpgsql security definer set search_path = '' as $$
declare neto numeric;
begin
  if TG_OP = 'INSERT' then
    if auth.uid() is not null and (coalesce(NEW.total_abonado,0)<>0 or coalesce(NEW.credito_historico,0)<>0) then
      raise exception 'ACTUALIZAR_POS: crea el pedido y su anticipo en una operación; no se guardó el pedido.';
    end if;
    return NEW;
  end if;
  if auth.uid() is not null and NEW.credito_historico is distinct from OLD.credito_historico then
    raise exception 'CREDITO_HISTORICO_PROTEGIDO';
  end if;
  if NEW.total_final is distinct from OLD.total_final or NEW.total_abonado is distinct from OLD.total_abonado
     or NEW.saldo_pendiente is distinct from OLD.saldo_pendiente or NEW.credito_historico is distinct from OLD.credito_historico then
    if NEW.total_final < 0 then raise exception 'TOTAL_INVALIDO'; end if;
    select round(coalesce(sum(a.monto),0)+NEW.credito_historico,2) into neto
      from public.abonos a where a.pedido_id=NEW.id;
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
revoke all on function public.derivar_saldo_pedido() from public,anon,authenticated;
create trigger trg_derivar_saldo_pedido before insert or update on public.pedidos
for each row execute function public.derivar_saldo_pedido();

-- Five independently verified arithmetic inconsistencies. Selection is by
-- values and ledger, not generated IDs. Abort if the evidence changed.
do $$
declare r record; p public.pedidos; neto numeric;
begin
 for r in select * from (values
  ('PP-A-0074',1090::numeric,500::numeric,440::numeric),
  ('PP-A-0133',2370,500,1720), ('PP-A-0175',1450,0,1300),
  ('PP-A-0185',470,200,440), ('PP-A-0203',1250,100,330)
 ) x(folio,total,abonado,saldo) loop
  select * into p from public.pedidos where folio=r.folio for update;
  -- Empty isolated fixture databases deliberately have no historical rows.
  if not found then continue; end if;
  select coalesce(sum(a.monto),0) into neto from public.abonos a where a.pedido_id=p.id;
  if p.total_final<>r.total or p.total_abonado<>r.abonado or p.saldo_pendiente<>r.saldo or neto<>r.abonado
     or p.total_calculado<>r.total or coalesce(p.subtotal_pastel,0)+coalesce(p.subtotal_extras,0)+coalesce(p.precio_base,0)<>r.total
     or p.estado in ('cancelado','entregado') then raise exception 'REVALIDAR_SALDO: %',r.folio; end if;
  insert into app_private.reparacion_saldos_20261001(pedido_id,antes,motivo)
   values(p.id,to_jsonb(p),'F06: total comercial verificado menos abonos reconocidos; no cambia ingresos') on conflict do nothing;
  update public.pedidos set saldo_pendiente=greatest(0,r.total-r.abonado),resta=greatest(0,r.total-r.abonado) where id=p.id;
 end loop;
 update app_private.reparacion_saldos_20261001 b set despues=to_jsonb(cur) from public.pedidos cur where cur.id=b.pedido_id;
end $$;

create or replace function public.operacion_pedido_tx(p_intencion jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
<<op>>
declare
 clave text := p_intencion->>'clave'; accion text := p_intencion->>'accion';
 suc uuid := (p_intencion->>'sucursal_id')::uuid; corte uuid := nullif(p_intencion->>'corte_id','')::uuid;
 pid uuid := nullif(p_intencion->>'pedido_id','')::uuid;
 c public.cortes_caja; p public.pedidos; previo app_private.operaciones_pedido;
 solicitud jsonb := p_intencion-'clave'; payload jsonb; pago jsonb := coalesce(p_intencion->'pago','{}');
 monto numeric := round(coalesce((p_intencion->>'monto')::numeric,0),2);
 ef numeric; ta numeric; tr numeric; neto numeric; saldo numeric; vid uuid; aid uuid;
 motivo text := btrim(coalesce(p_intencion->>'motivo','')); resultado jsonb;
 usuario_id text := p_intencion->>'usuario_id'; usuario_nombre text := p_intencion->>'usuario_nombre';
begin
 if auth.uid() is null then raise exception 'SIN_SESION'; end if;
 if suc is null or (not public.pos_is_admin() and suc is distinct from public.pos_sucursal()) then raise exception 'SUCURSAL_AJENA'; end if;
 if clave is null or length(clave)<8 or length(clave)>200 then raise exception 'CLAVE_REQUERIDA'; end if;
 if accion not in ('pago','devolucion','crear') then raise exception 'ACCION_INVALIDA'; end if;
 -- Serialize both successful retries and simultaneous requests for one intent.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(clave,0));
 select * into previo from app_private.operaciones_pedido where operaciones_pedido.clave=op.clave;
 if found then
  if previo.sucursal_id is distinct from suc or previo.solicitud is distinct from solicitud then raise exception 'INTENCION_DISTINTA'; end if;
  return previo.resultado || jsonb_build_object('idempotentHit',true);
 end if;
 -- Common order: intent -> cut -> order. Closing a cut takes this same row lock.
 if corte is not null then
  select * into c from public.cortes_caja where id=corte for update;
  if not found or c.estado<>'abierto' then raise exception 'CORTE_NO_ABIERTO'; end if;
  if c.sucursal_id is distinct from suc then raise exception 'CORTE_SUCURSAL_NO_COINCIDE'; end if;
  if (coalesce(c.fecha_apertura,c.fecha_inicio,c.created_at) at time zone 'America/Mexico_City')::date < (now() at time zone 'America/Mexico_City')::date then raise exception 'CORTE_ATRASADO'; end if;
 elsif accion<>'crear' or monto>0 then raise exception 'SIN_CAJA'; end if;
 if accion='crear' then
  payload := coalesce(p_intencion->'pedido','{}') - array['id','folio','estado','origen','created_at','total_abonado','saldo_pendiente','credito_historico','a_cuenta','resta','monto_devuelto'];
  payload := payload || jsonb_build_object('id',gen_random_uuid(),'folio',public.siguiente_folio('pedido_pastel',suc),
    'sucursal_id',suc,'estado','pendiente','origen','pos_interno','created_at',now(),'total_abonado',0,'credito_historico',0,
    'a_cuenta',monto,'resta',coalesce((payload->>'total_final')::numeric,0),'saldo_pendiente',coalesce((payload->>'total_final')::numeric,0),
    'requiere_entrega',coalesce((payload->>'requiere_entrega')::boolean,false),'tipo_pedido',coalesce(payload->>'tipo_pedido','pastel_personalizado'));
  p := jsonb_populate_record(null::public.pedidos,payload);
  if p.total_final is null or p.total_final<0 or monto<0 or monto>p.total_final then raise exception 'TOTAL_INVALIDO'; end if;
  insert into public.pedidos select p.* returning * into p;
  pid := p.id;
 else
  select * into p from public.pedidos where id=pid for update;
  if not found or p.sucursal_id is distinct from suc then raise exception 'PEDIDO_SUCURSAL_NO_COINCIDE'; end if;
  if p.estado in ('cancelado','entregado') then raise exception 'PEDIDO_NO_COBRABLE'; end if;
 end if;
 select round(coalesce(sum(a.monto),0)+coalesce(p.credito_historico,0),2) into neto from public.abonos a where a.pedido_id=pid;
 saldo := greatest(0,p.total_final-neto);
 if accion='devolucion' then
  if motivo='' then raise exception 'MOTIVO_REQUERIDO'; end if;
  -- Credit with no recorded original payment method cannot safely be refunded
  -- automatically. Preserve it and require historical reconciliation.
  if p.credito_historico>0 then raise exception 'CONCILIAR_ANTICIPO_HISTORICO'; end if;
  select round(coalesce(sum(a.monto_efectivo),0),2),round(coalesce(sum(a.monto_tarjeta),0),2),round(coalesce(sum(a.monto_transferencia),0),2)
    into ef,ta,tr from public.abonos a where a.pedido_id=pid;
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
   insert into public.ventas(folio,sucursal_id,sucursal_nombre,estado,tipo_venta,cliente_nombre,subtotal,total,metodo_pago,monto_efectivo,monto_tarjeta,monto_transferencia,corte_caja_id,fecha_apertura,fecha_cierre,usuario_cajero_id,usuario_cajero_nombre,notas)
   values(public.siguiente_folio('venta',suc),suc,p.sucursal_nombre,'pagada','mostrador',p.cliente_nombre,monto,monto,pago->>'metodo_pago',ef,ta,tr,corte,now(),now(),usuario_id,usuario_nombre,'Pago de pedido '||p.folio) returning id into vid;
   insert into public.detalle_venta(venta_id,producto_nombre,cantidad,precio_unitario_snapshot,subtotal,costo_unitario_snapshot,estado_preparacion)
   values(vid,'Anticipo pedido '||p.folio,1,monto,monto,0,'entregado');
  end if;
  insert into public.abonos(pedido_id,sucursal_id,sucursal_nombre,monto,metodo_pago,monto_efectivo,monto_tarjeta,monto_transferencia,afecta_caja,corte_caja_id,registrado_por_id,registrado_por_nombre,fecha_abono,notas,venta_id)
  values(pid,suc,p.sucursal_nombre,case when accion='devolucion' then -monto else monto end,
   case when accion='devolucion' then case when (ef<>0)::int+(ta<>0)::int+(tr<>0)::int>1 then 'mixto' when ef<>0 then 'efectivo' when ta<>0 then 'tarjeta' else 'transferencia' end else pago->>'metodo_pago' end,
   ef,ta,tr,true,corte,usuario_id,usuario_nombre,now(),case when accion='devolucion' then 'Devolución de anticipo — '||motivo else p_intencion->>'notas' end,vid) returning id into aid;
 end if;
 if accion='devolucion' then
  update public.pedidos set estado='cancelado',tipo_cancelacion='devolucion',motivo_cancelacion=motivo,fecha_cancelacion=now(),
   cancelado_por_id=usuario_id,cancelado_por_nombre=usuario_nombre,monto_devuelto=coalesce(monto_devuelto,0)+monto,
   total_abonado=neto-monto,saldo_pendiente=greatest(0,total_final-neto+monto) where id=pid returning * into p;
 else
  update public.pedidos set total_abonado=neto+monto,saldo_pendiente=greatest(0,total_final-neto-monto),
   fecha_anticipo=case when monto>0 then coalesce(fecha_anticipo,now()) else fecha_anticipo end,
   fecha_pago_completo=case when total_final<=neto+monto then now() else null end where id=pid returning * into p;
 end if;
 resultado:=jsonb_build_object('pedido',to_jsonb(p),'abonoId',aid,'ventaId',vid,'totalAbonado',p.total_abonado,
  'saldoPendiente',p.saldo_pendiente,'nuevoEstado',p.estado,'ventaError',null,'montoDevuelto',case when accion='devolucion' then monto else 0 end,
  'devEfectivo',-ef,'devTarjeta',-ta,'devTransferencia',-tr,'idempotentHit',false);
 insert into app_private.operaciones_pedido(clave,sucursal_id,solicitud,resultado,actor) values(clave,suc,solicitud,resultado,auth.uid());
 return resultado;
end $$;
revoke all on function public.operacion_pedido_tx(jsonb) from public,anon;
grant execute on function public.operacion_pedido_tx(jsonb) to authenticated;

create or replace function public.guard_libro_abonos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is not null then
  if TG_OP<>'INSERT' or coalesce(current_setting('confetti.operacion_pedido',true),'')='' then
   raise exception 'ACTUALIZAR_POS: el pago requiere la versión transaccional. Cierra y vuelve a abrir la aplicación; no se registró ningún movimiento.';
  end if;
  if NEW.monto>0 and NEW.afecta_caja and NEW.venta_id is null then raise exception 'VENTA_DE_ABONO_REQUERIDA'; end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function public.guard_libro_abonos() from public,anon,authenticated;
create trigger trg_guard_libro_abonos before insert or update or delete on public.abonos
for each row execute function public.guard_libro_abonos();

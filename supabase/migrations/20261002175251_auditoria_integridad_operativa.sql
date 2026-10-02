-- Reauditoría: evitar saldo nulo/manipulado y preservar detalle histórico.
set local lock_timeout='5s';
create or replace function public.derivar_saldo_pedido()
returns trigger language plpgsql security definer set search_path = '' as $$
declare neto numeric;
begin
  if NEW.total_final is null or NEW.total_final::text in ('NaN','Infinity','-Infinity') or NEW.total_final<0 then raise exception 'TOTAL_INVALIDO'; end if;
  if TG_OP = 'INSERT' then
    if auth.uid() is not null and (coalesce(NEW.total_abonado,0)<>0 or coalesce(NEW.credito_historico,0)<>0) then
      raise exception 'ACTUALIZAR_POS: crea el pedido y su anticipo en una operación; no se guardó el pedido.';
    end if;
    NEW.total_abonado := coalesce(NEW.credito_historico,0);
    NEW.saldo_pendiente := greatest(0,NEW.total_final-NEW.total_abonado);
    NEW.resta := NEW.saldo_pendiente;
    return NEW;
  end if;
  if auth.uid() is not null and NEW.credito_historico is distinct from OLD.credito_historico then
    raise exception 'CREDITO_HISTORICO_PROTEGIDO';
  end if;
  if NEW.total_final is distinct from OLD.total_final or NEW.total_abonado is distinct from OLD.total_abonado
     or NEW.saldo_pendiente is distinct from OLD.saldo_pendiente or NEW.credito_historico is distinct from OLD.credito_historico or NEW.estado is distinct from OLD.estado then
    if NEW.total_final < 0 then raise exception 'TOTAL_INVALIDO'; end if;
    select round(coalesce(sum(a.monto),0)+NEW.credito_historico,2) into neto
      from public.abonos a where a.pedido_id=NEW.id;
    NEW.total_abonado := neto;
    NEW.saldo_pendiente := greatest(0,round(coalesce(NEW.total_final,0)-neto,2));
    NEW.resta := NEW.saldo_pendiente;
    if NEW.estado='entregado' and NEW.saldo_pendiente>0 and OLD.estado<>'entregado' then raise exception 'SALDO_PENDIENTE: registra el pago antes de entregar'; end if;
    if NEW.estado not in ('cancelado','entregado') then
      if NEW.saldo_pendiente=0 then NEW.estado := 'pagado';
      elsif NEW.estado='pagado' or OLD.estado='pagado' then NEW.estado := case when neto>0 then 'con_anticipo' else 'confirmado' end;
      elsif neto>0 and NEW.estado in ('pendiente','confirmado') then NEW.estado := 'con_anticipo'; end if;
    end if;
  end if;
  return NEW;
end $$;

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
 if TG_OP<>'INSERT' and v.estado='pagada' then
  if TG_OP='DELETE' then raise exception 'DETALLE_VENTA_PROTEGIDO'; end if;
  if (to_jsonb(NEW)-array['estado_preparacion','notas_producto']) is distinct from (to_jsonb(OLD)-array['estado_preparacion','notas_producto']) then raise exception 'DETALLE_VENTA_PROTEGIDO'; end if;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function public.guard_detalle_financiero() from public,anon,authenticated;
create trigger trg_guard_detalle_financiero before insert or update or delete on public.detalle_venta for each row execute function public.guard_detalle_financiero();
-- Paid sales are generated only through the atomic operation, whose owner can
-- insert details despite this table privilege. No standalone paid detail can
-- be appended to a historical receipt by a browser.
revoke insert,delete on public.detalle_venta from authenticated;
revoke delete on public.cortes_caja from authenticated;

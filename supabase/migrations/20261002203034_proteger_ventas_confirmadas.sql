-- Preserve the monetary snapshot of a confirmed receipt. Cancellation changes
-- status/motive only; original payment amounts remain evidence. RPC creators
-- insert the final snapshot and are unaffected. No historical rows are edited.
create function public.guard_venta_confirmada() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return case when TG_OP='DELETE' then OLD else NEW end; end if;
 if TG_OP='DELETE' then
  if OLD.estado in ('pagada','cancelada') and OLD.total>0 then raise exception 'VENTA_CONFIRMADA: conserva el historial del cobro y su cancelación'; end if;
  return OLD;
 end if;
 if OLD.estado in ('pagada','cancelada') and OLD.total>0 and
  (NEW.subtotal,NEW.descuentos,NEW.impuestos,NEW.total,NEW.metodo_pago,NEW.monto_efectivo,NEW.monto_tarjeta,NEW.monto_transferencia,NEW.cambio,NEW.folio,NEW.sucursal_id,NEW.corte_caja_id,NEW.fecha_cierre)
  is distinct from
  (OLD.subtotal,OLD.descuentos,OLD.impuestos,OLD.total,OLD.metodo_pago,OLD.monto_efectivo,OLD.monto_tarjeta,OLD.monto_transferencia,OLD.cambio,OLD.folio,OLD.sucursal_id,OLD.corte_caja_id,OLD.fecha_cierre) then
  raise exception 'VENTA_CONFIRMADA: no se alteran los importes, folio o corte de un ticket confirmado';
 end if;
 if OLD.estado='cancelada' and NEW.estado<>'cancelada' then raise exception 'VENTA_CANCELADA: requiere corrección auditada'; end if;
 if OLD.estado='pagada' and NEW.estado not in ('pagada','cancelada') then raise exception 'VENTA_CONFIRMADA: no se reabre un cobro'; end if;
 if NEW.estado='cancelada' and OLD.total>0 and (NEW.tipo_cancelacion not in ('cancelacion','devolucion') or NEW.tipo_cancelacion is null or nullif(btrim(NEW.motivo_cancelacion),'') is null) then raise exception 'CANCELACION_INVALIDA'; end if;
 if NEW.estado='cancelada' and OLD.total>0 and NEW.monto_devuelto is distinct from (case when NEW.tipo_cancelacion='devolucion' then OLD.total else 0 end) then raise exception 'DEVOLUCION_INVALIDA: el importe debe coincidir con el ticket'; end if;
 return NEW;
end $$;
revoke all on function public.guard_venta_confirmada() from public,anon,authenticated;
create trigger aaa_guard_venta_confirmada before update or delete on public.ventas for each row execute function public.guard_venta_confirmada();

create function public.conciliacion_operativa_pos(p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saldos bigint; enlaces bigint; cortes bigint; faltantes bigint; cancelados jsonb;
begin
 if auth.uid() is null or not public.pos_is_admin() then raise exception 'SOLO_DUENO'; end if;
 select count(*) into saldos from public.pedidos p where p.estado<>'cancelado' and (p_sucursal is null or p.sucursal_id=p_sucursal) and
 (p.total_abonado is distinct from round(coalesce(p.credito_historico,0)+coalesce((select sum(a.monto) from public.abonos a where a.pedido_id=p.id),0),2)
 or p.saldo_pendiente is distinct from greatest(0,round(p.total_final-coalesce(p.total_abonado,0),2)));
 select count(*) into enlaces from public.abonos a join public.ventas v on v.id=a.venta_id where (p_sucursal is null or a.sucursal_id=p_sucursal) and
 (a.monto is distinct from v.total or a.sucursal_id is distinct from v.sucursal_id or a.corte_caja_id is distinct from v.corte_caja_id);
 select count(*) into cortes from public.ventas v join public.cortes_caja c on c.id=v.corte_caja_id where (p_sucursal is null or v.sucursal_id=p_sucursal) and v.sucursal_id is distinct from c.sucursal_id;
 select count(*) into faltantes from public.abonos a where a.monto>0 and a.venta_id is null and (p_sucursal is null or a.sucursal_id=p_sucursal);
 select coalesce(jsonb_agg(jsonb_build_object('pedido',p.folio,'venta',v.folio,'monto',a.monto,'metodo',a.metodo_pago,'estado_pedido',p.estado,'tipo_cancelacion',v.tipo_cancelacion) order by p.folio),'[]'::jsonb) into cancelados
 from public.abonos a join public.ventas v on v.id=a.venta_id join public.pedidos p on p.id=a.pedido_id
 where a.monto>0 and v.estado='cancelada' and (p_sucursal is null or a.sucursal_id=p_sucursal);
 return jsonb_build_object('saldos_inconsistentes',saldos,'enlaces_inconsistentes',enlaces,'ventas_corte_cruzadas',cortes,'abonos_sin_venta',faltantes,'pagos_con_venta_cancelada',cancelados,'consultado_en',now());
end $$;
revoke all on function public.conciliacion_operativa_pos(uuid) from public,anon;
grant execute on function public.conciliacion_operativa_pos(uuid) to authenticated;

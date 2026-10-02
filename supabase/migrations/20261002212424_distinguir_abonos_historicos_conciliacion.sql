-- 2026-10-02: four legacy backfill ledger entries explicitly have
-- afecta_caja=false and no cut. They preserve recognized customer credit and
-- must not be reported as missing cash receipts. Retain/display their count;
-- no folio exclusion and no business row is changed. Null/ambiguous flags or
-- a cut still count as needing a receipt. Cancelled linked sales remain visible.
create or replace function public.conciliacion_operativa_pos(p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saldos bigint; enlaces bigint; cortes bigint; faltantes bigint; historicos bigint; cancelados jsonb;
begin
 if auth.uid() is null or not public.pos_is_admin() then raise exception 'SOLO_DUENO'; end if;
 select count(*) into saldos from public.pedidos p where p.estado<>'cancelado' and (p_sucursal is null or p.sucursal_id=p_sucursal) and
 (p.total_abonado is distinct from round(coalesce(p.credito_historico,0)+coalesce((select sum(a.monto) from public.abonos a where a.pedido_id=p.id),0),2)
 or p.saldo_pendiente is distinct from greatest(0,round(p.total_final-coalesce(p.total_abonado,0),2)));
 select count(*) into enlaces from public.abonos a join public.ventas v on v.id=a.venta_id where (p_sucursal is null or a.sucursal_id=p_sucursal) and
 (a.monto is distinct from v.total or a.sucursal_id is distinct from v.sucursal_id or a.corte_caja_id is distinct from v.corte_caja_id);
 select count(*) into cortes from public.ventas v join public.cortes_caja c on c.id=v.corte_caja_id where (p_sucursal is null or v.sucursal_id=p_sucursal) and v.sucursal_id is distinct from c.sucursal_id;
 select count(*) into faltantes from public.abonos a where a.monto>0 and a.venta_id is null and (a.afecta_caja is not false or a.corte_caja_id is not null) and (p_sucursal is null or a.sucursal_id=p_sucursal);
 select count(*) into historicos from public.abonos a where a.monto>0 and a.venta_id is null and a.afecta_caja is false and a.corte_caja_id is null and (p_sucursal is null or a.sucursal_id=p_sucursal);
 select coalesce(jsonb_agg(jsonb_build_object('pedido',p.folio,'venta',v.folio,'monto',a.monto,'metodo',a.metodo_pago,'estado_pedido',p.estado,'tipo_cancelacion',v.tipo_cancelacion) order by p.folio),'[]'::jsonb) into cancelados
 from public.abonos a join public.ventas v on v.id=a.venta_id join public.pedidos p on p.id=a.pedido_id
 where a.monto>0 and v.estado='cancelada' and (p_sucursal is null or a.sucursal_id=p_sucursal);
 return jsonb_build_object('saldos_inconsistentes',saldos,'enlaces_inconsistentes',enlaces,'ventas_corte_cruzadas',cortes,'abonos_sin_venta',faltantes,'abonos_historicos_sin_venta',historicos,'pagos_con_venta_cancelada',cancelados,'consultado_en',now());
end $$;
revoke all on function public.conciliacion_operativa_pos(uuid) from public,anon;
grant execute on function public.conciliacion_operativa_pos(uuid) to authenticated;

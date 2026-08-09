-- 0059 — Segunda ronda de recálculo: cortes que volvieron a cerrarse en 0.
-- APLICADA en producción el 2026-08-09.
--
-- CONF-A-C042 (Xochimilco): cerrado el 2026-08-09 15:12 con total_general=0
-- teniendo 45 ventas pagadas por 12,870. Ocurrió un día DESPUÉS de desplegar el
-- arreglo del frontend porque la tablet seguía con el bundle anterior; por eso
-- la 0058 mueve la red de seguridad a la BASE.
--
-- Mismas fórmulas y validaciones que la 0057. No se toca nada tecleado por el
-- personal ni ninguna venta.
-- Verificado tras aplicar: CONF-A-C042 = 45 ventas / 12,870 = suma real;
-- 0 cortes con el defecto en toda la tabla.
--
-- Rollback: restaurar desde app_private.cortes_backup_20260809.

create table if not exists app_private.cortes_backup_20260809 as
select c.*, now() as respaldado_en
from public.cortes_caja c
where c.estado = 'cerrado'
  and c.total_general::numeric = 0
  and (select coalesce(sum(v.total),0) from public.ventas v
        where v.corte_caja_id = c.id and v.estado='pagada') > 0;

revoke all on app_private.cortes_backup_20260809 from public, anon, authenticated;

with objetivo as (
  select c.id,
    (select coalesce(sum(v.total),0)               from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') tg,
    (select coalesce(sum(v.monto_efectivo),0)      from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') ef,
    (select coalesce(sum(v.monto_tarjeta),0)       from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') ta,
    (select coalesce(sum(v.monto_transferencia),0) from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') tr,
    (select count(*)                               from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') nv,
    (select coalesce(sum(g.monto),0)               from public.gastos_operativos g where g.corte_caja_id=c.id) gas,
    (select coalesce(sum(case when g.metodo_pago='efectivo' then g.monto else 0 end),0)
       from public.gastos_operativos g where g.corte_caja_id=c.id) gas_ef,
    (select coalesce(sum(case when a.monto<0 then a.monto_efectivo else 0 end),0)
       from public.abonos a where a.corte_caja_id=c.id) dev_ef
  from public.cortes_caja c
  join app_private.cortes_backup_20260809 b on b.id = c.id
)
update public.cortes_caja c set
  total_general       = o.tg,
  total_efectivo      = o.ef,
  total_tarjeta       = o.ta,
  total_transferencia = o.tr,
  numero_ventas       = o.nv,
  ticket_promedio     = case when o.nv > 0 then round(o.tg / o.nv, 2) else 0 end,
  total_gastos        = o.gas,
  efectivo_esperado   = o.ef + o.dev_ef - o.gas_ef,
  diferencia_efectivo = coalesce(c.efectivo_contado::numeric,0) - (o.ef + o.dev_ef - o.gas_ef)
from objetivo o
where c.id = o.id;

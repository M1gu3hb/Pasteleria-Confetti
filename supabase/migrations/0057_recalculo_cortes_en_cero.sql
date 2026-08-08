-- 0057 — Recálculo de los 10 cortes que quedaron con totales en 0.
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-08.
--
-- CONTEXTO: ver docs/INCIDENTE_CIERRE_EN_CERO_2026-08-08.md. El bug NO perdió
-- ninguna venta: las 2,314 pagadas están íntegras y todas ligadas a su corte
-- (0 huérfanas). Lo único incorrecto eran los AGREGADOS de cortes_caja.
--
-- FÓRMULAS: replican Caja.jsx + tipsUtils.js + efectivoEsperado.js. `ventas` no
-- tiene columnas de propina ni de costo (verificado en information_schema), así
-- que esos términos valen 0 en la app.
--
-- VALIDACIÓN PREVIA (antes de tocar dinero):
--   90/92 cortes SANOS se reproducen EXACTAMENTE con estas fórmulas
--   (tarjeta y gastos: 92/92). Los 2 restantes (CONF-C-C002, CONF-A-C032) son
--   descuadres PREVIOS y ajenos a este bug: NO se tocan.
--   82/82 cortes con conteo confirman diferencia = contado - esperado.
--
-- NO se toca lo tecleado por el personal (efectivo_contado,
-- dinero_dejado_en_caja, notas, fechas, usuarios) ni ninguna venta.
--
-- Idempotente: sólo afecta a las filas respaldadas en 0056.
-- Rollback:
--   update public.cortes_caja c set
--     total_general=b.total_general, total_efectivo=b.total_efectivo,
--     total_tarjeta=b.total_tarjeta, total_transferencia=b.total_transferencia,
--     numero_ventas=b.numero_ventas, ticket_promedio=b.ticket_promedio,
--     total_gastos=b.total_gastos, efectivo_esperado=b.efectivo_esperado,
--     diferencia_efectivo=b.diferencia_efectivo
--   from app_private.cortes_backup_20260808 b where b.id=c.id;

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
  join app_private.cortes_backup_20260808 b on b.id = c.id
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

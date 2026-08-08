-- 0056 — Respaldo íntegro de los cortes ANTES de recalcular los que quedaron en 0.
-- APLICADA en producción el 2026-08-08. Copia completa (10 filas) para revertir
-- al valor exacto. No modifica nada.
-- Rollback del recálculo 0057 = restaurar columnas desde esta tabla.
create schema if not exists app_private;
create table if not exists app_private.cortes_backup_20260808 as
select c.*, now() as respaldado_en
from public.cortes_caja c
where c.estado = 'cerrado'
  and c.total_general::numeric = 0
  and (select coalesce(sum(v.total),0) from public.ventas v
        where v.corte_caja_id = c.id and v.estado='pagada') > 0;
revoke all on app_private.cortes_backup_20260808 from public, anon, authenticated;

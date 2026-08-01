-- 0050 — Índices faltantes (ADITIVO, reversible, sin cambio de comportamiento).
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-01.
-- Rollback: DROP INDEX <nombre>;
--
-- NOTA HONESTA DE RESULTADO (medido, no asumido):
--   idx_usuarios_pos_auth_user_id NO reduce los 411M de tuplas leídas.
--   usuarios_pos son 6 filas en UNA sola página: el planner sigue eligiendo
--   Seq Scan (2 buffers) porque es más barato que el índice. Verificado con
--   EXPLAIN (ANALYZE, BUFFERS). Se conserva por higiene/crecimiento futuro,
--   pero la causa raíz real la ataca la 0051 (InitPlan), no este índice.

create index if not exists idx_usuarios_pos_auth_user_id
  on public.usuarios_pos (auth_user_id);

-- FKs sin índice de cobertura (advisor 0001_unindexed_foreign_keys).
create index if not exists idx_abonos_sucursal
  on public.abonos (sucursal_id);
create index if not exists idx_folio_contador_sucursal
  on public.folio_contador (sucursal_id);
create index if not exists idx_gastos_sucursal
  on public.gastos_operativos (sucursal_id);
create index if not exists idx_usuarios_pos_sucursal
  on public.usuarios_pos (sucursal_id);

-- Caja por sucursal: soporta la consulta mínima objetivo de la Fase 5
-- (sucursal + estado='abierto', order by created_at desc, limit 1).
-- idx_cortes_sucursal_estado no cubre el orden por fecha.
create index if not exists idx_cortes_sucursal_estado_created
  on public.cortes_caja (sucursal_id, estado, created_at desc);

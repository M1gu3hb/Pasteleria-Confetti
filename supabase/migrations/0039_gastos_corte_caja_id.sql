-- 0039 — Amarrar cada gasto al corte abierto (CAMBIOS_V2 · Fase 07)
-- ADITIVO: nueva columna nullable. Los gastos viejos quedan en NULL (siguen
-- contándose por fecha+sucursal como hoy). No altera ningún objeto en vivo.
alter table public.gastos_operativos
  add column if not exists corte_caja_id uuid;

comment on column public.gastos_operativos.corte_caja_id is
  'Corte de caja al que pertenece el gasto (CAMBIOS_V2 Fase 07). NULL = gasto legacy (se asocia por fecha+sucursal).';

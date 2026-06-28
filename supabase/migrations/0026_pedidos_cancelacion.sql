-- 0026 — Cancelación de pedidos con tipo/motivo/sello (Fase 3 #5) + monto_devuelto (gancho #4)
-- Espejo del set de cancelación que ya tiene `ventas`. Idempotente.
-- Candado 5: cancelar = cambio de estado (estado='cancelado'), NUNCA borrado físico.
-- Estas columnas solo SELLAN el porqué/quién/cuándo; el movimiento de dinero de la
-- devolución del anticipo (monto_devuelto) lo registra #4 en el corte ABIERTO.

alter table pedidos add column if not exists tipo_cancelacion      text;
alter table pedidos add column if not exists motivo_cancelacion    text;
alter table pedidos add column if not exists cancelado_por_id       text;
alter table pedidos add column if not exists cancelado_por_nombre   text;
alter table pedidos add column if not exists fecha_cancelacion      timestamptz;
alter table pedidos add column if not exists monto_devuelto         numeric default 0;

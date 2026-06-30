-- 0035 — "¿Quién te atendió?" en el pedido (CAMBIOS_V2 · Fase 04)
-- ADITIVO: nueva columna de texto, nullable. Los pedidos web nacen sin ella
-- (la web no la manda). No altera ningún objeto en vivo.
alter table public.pedidos
  add column if not exists atendido_por text;

comment on column public.pedidos.atendido_por is
  'Nombre del empleado que llenó el formulario en el POS (CAMBIOS_V2 Fase 04). Vacío en pedidos web.';

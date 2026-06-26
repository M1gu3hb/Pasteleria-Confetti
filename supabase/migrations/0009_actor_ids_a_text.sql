-- Las columnas de "actor" (quién hizo la acción) y cliente_id reciben ids
-- centinela string del POS (p. ej. 'empleado_terminal' del empleado virtual).
-- En Base44 los ids eran strings; no son FK estrictas (guardan snapshot/centinela)
-- -> deben ser text, no uuid. (Detectado en el smoke test de Fase 2.)
alter table cortes_caja
  alter column usuario_cajero_id   type text,
  alter column usuario_apertura_id type text;
alter table ventas
  alter column usuario_cajero_id type text,
  alter column cancelado_por_id  type text,
  alter column cliente_id        type text;
alter table abonos
  alter column registrado_por_id type text;
alter table gastos_operativos
  alter column usuario_id type text;
alter table pedidos
  alter column creado_por_id type text;

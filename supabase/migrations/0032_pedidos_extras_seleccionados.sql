-- 0032 — Extras genéricos del pedido de pastel (CAMBIOS_V2 · Fase 01)
-- ADITIVO y retro-compatible: nueva columna jsonb que guarda la lista de extras
-- elegidos como [{ id, nombre, precio }]. Los pedidos viejos quedan con NULL y
-- siguen mostrando sus extras desde las 4 columnas fijas (incluye_*/precio_*).
-- No altera ningún objeto en vivo: solo agrega una columna nullable.
alter table public.pedidos
  add column if not exists extras_seleccionados jsonb;

comment on column public.pedidos.extras_seleccionados is
  'Lista de extras elegidos [{id,nombre,precio}] (CAMBIOS_V2 Fase 01). NULL = pedido viejo (usa columnas incluye_*/precio_*).';

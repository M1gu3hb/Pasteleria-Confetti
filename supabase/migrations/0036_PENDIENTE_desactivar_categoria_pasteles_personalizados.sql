-- 0036 — PREPARADA / PENDIENTE (CAMBIOS_V2 · Fase 05)
-- 🔴 NO aplicada por Claude. Aplicar JUNTO con el deploy (autoriza Miguel).
-- Motivo: desactivar la categoría "Pasteles Personalizados" altera el front EN VIVO
-- (le quita un tab vacío a la pantalla de venta). Por la regla dura 2, los cambios
-- que alteran el comportamiento en vivo se dejan PREPARADOS, no se aplican antes del deploy.
--
-- Es DESACTIVAR (no borrar): la categoría sigue en la BD, solo deja de mostrarse.
-- La categoría está VACÍA (0 productos), así que no deja productos huérfanos.
-- Reversible: update ... set activo = true.
update public.categorias_producto
set activo = false
where nombre = 'Pasteles Personalizados' and activo = true;

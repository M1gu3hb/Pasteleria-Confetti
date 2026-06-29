-- 0029 — Exponer extras_pastel y rellenos_pastel en config_publica (para la web).
-- La web lee la config por la vista pública `config_publica` (anon). Esa vista NO incluía
-- extras_pastel ni rellenos_pastel → el formulario de pastel de la web mostraba los extras
-- "A consultar" (precio 0) y el selector de rellenos VACÍO, aunque la config del POS sí los
-- tiene poblados. Se agregan a la vista (aditivo, idempotente).
create or replace view config_publica as
  select nombre_negocio, logo_url, color_primario, color_acento,
         precio_kilo_global, ratio_personas_por_kilo,
         extras_pastel, rellenos_pastel
  from configuracion_negocio;

grant select on config_publica to anon, authenticated;

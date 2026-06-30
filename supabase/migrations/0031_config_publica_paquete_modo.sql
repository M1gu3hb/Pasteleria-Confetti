-- 0031 — Exponer paquete_modo en config_publica.
-- BUG: al cambiar de sucursal en modo dueño, el fetch de config caía a la vista pública
-- `config_publica`, que NO incluía `paquete_modo` → en el front quedaba undefined → el fallback
-- (antes 'restaurante_pro') hacía aparecer mesas/mesero/cocina y Caja perdía el botón de venta.
-- Confetti es 'esencial'. Se agrega la columna a la vista (aditivo) para que el camino anon ya
-- traiga 'esencial'. (El front además ya usa 'esencial' como fallback seguro.)
create or replace view config_publica as
  select nombre_negocio, logo_url, color_primario, color_acento,
         precio_kilo_global, ratio_personas_por_kilo,
         extras_pastel, rellenos_pastel,
         paquete_modo
  from configuracion_negocio;

grant select on config_publica to anon, authenticated;

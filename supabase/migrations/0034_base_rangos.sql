-- 0034 — Importe de base por rangos de kilos (CAMBIOS_V2 · Fase 02)
-- ADITIVO y retro-compatible:
--   * Nueva columna `base_rangos` (JSON string, igual patrón que extras_pastel).
--   * Seed con el ejemplo de Abel (editable desde Configuración → Pasteles).
--   * `config_publica` gana la columna base_rangos AL FINAL (no rompe la web vieja:
--     ignora columnas extra; la web nueva la usa). Ningún objeto en vivo cambia
--     su comportamiento: el front desplegado no lee base_rangos.

alter table public.configuracion_negocio
  add column if not exists base_rangos text;

comment on column public.configuracion_negocio.base_rangos is
  'Rangos de importe de base [{min_kg,max_kg,precio}] (CAMBIOS_V2 Fase 02). JSON string.';

-- Seed inicial (solo si está vacío). Valores de ejemplo dados por Abel.
update public.configuracion_negocio
set base_rangos = '[{"min_kg":4,"max_kg":5,"precio":80},{"min_kg":6,"max_kg":8,"precio":100},{"min_kg":9,"max_kg":15,"precio":120}]'
where base_rangos is null;

-- Vista pública: agregar base_rangos al final (aditivo). Resto idéntico.
create or replace view public.config_publica as
  select
    nombre_negocio,
    logo_url,
    color_primario,
    color_acento,
    precio_kilo_global,
    ratio_personas_por_kilo,
    extras_pastel,
    rellenos_pastel,
    paquete_modo,
    base_rangos
  from public.configuracion_negocio;

-- 0043 — Config: ancho del papel de impresora térmica (aditivo, no toca dinero/RLS)
-- ---------------------------------------------------------------------------
-- Nueva columna en configuracion_negocio para elegir 58mm (default) u 80mm.
-- print.js lo lee para el @page y el ancho del contenido. Retro-compatible:
-- si es NULL, el front usa 58 por default.

alter table public.configuracion_negocio
  add column if not exists ancho_impresora text not null default '58';

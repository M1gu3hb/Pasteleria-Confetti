-- 0040 — Seed corregido de base_rangos (CAMBIOS_V2 · FIX 2)
-- Nuevo default: 1–3 kg = $0 (no cobra base), 4–5→80, 6–8→100, 9–15→120.
-- Fuera de rango (bajo el mínimo o en hueco) = sin base; arriba del máximo = "se cotiza aparte".
-- ADITIVO/seguro: el front EN VIVO no lee base_rangos, así que actualizar este dato NO
-- cambia el comportamiento del front desplegado. Solo actualiza si sigue en el seed
-- viejo del 0034 (o null): NO pisa ninguna personalización de Abel.
update public.configuracion_negocio
set base_rangos = '[{"min_kg":1,"max_kg":3,"precio":0},{"min_kg":4,"max_kg":5,"precio":80},{"min_kg":6,"max_kg":8,"precio":100},{"min_kg":9,"max_kg":15,"precio":120}]'
where base_rangos is null
   or base_rangos::jsonb = '[{"min_kg":4,"max_kg":5,"precio":80},{"min_kg":6,"max_kg":8,"precio":100},{"min_kg":9,"max_kg":15,"precio":120}]'::jsonb;

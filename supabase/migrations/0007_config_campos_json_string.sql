-- En Base44 estos campos son strings JSON (el front hace JSON.stringify/parse).
-- text preserva el contrato y evita que JSON.parse reciba un objeto nativo.
alter table configuracion_negocio
  alter column extras_pastel type text using extras_pastel::text,
  alter column rellenos_pastel type text using rellenos_pastel::text,
  alter column precio_kilo_por_sucursal type text using precio_kilo_por_sucursal::text,
  alter column ratio_personas_por_sucursal type text using ratio_personas_por_sucursal::text;

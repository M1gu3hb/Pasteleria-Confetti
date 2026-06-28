-- 0028 — Policy DELETE para el bucket `notas-voz` (cierre de cabo suelto Fase 5).
-- Faltaba la policy de borrado (la migración 0027 solo creó insert/update/select),
-- así que un objeto subido no se podía limpiar. Espejo de `notas_voz_auth_*`.
-- Permite que "Quitar" en el recorder pueda, en el futuro, borrar también el archivo.
-- Idempotente.

drop policy if exists "notas_voz_auth_delete" on storage.objects;
create policy "notas_voz_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notas-voz');

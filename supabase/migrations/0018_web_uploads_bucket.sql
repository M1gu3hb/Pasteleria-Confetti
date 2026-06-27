-- WEB-1 / GAP 2 — Bucket dedicado para la imagen de referencia de la web pública.
-- Separado del bucket 'uploads' del POS (que SIGUE authenticated-only; no se toca).
--   * public=true  → lectura por URL pública (objeto servido sin RLS).
--   * SIN policy SELECT para web-uploads → NO listable vía API (solo por URL directa).
--   * file_size_limit 5MB + allowed_mime_types solo imágenes → enforced por Storage.
--   * anon puede INSERT SOLO en web-uploads (no en 'uploads' ni otros).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('web-uploads', 'web-uploads', true, 5242880,
        array['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "web_uploads_anon_insert" on storage.objects;
create policy "web_uploads_anon_insert" on storage.objects
  for insert to anon with check (bucket_id = 'web-uploads');

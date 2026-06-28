-- 0027 — Notas de voz en pastel personalizado (Fase 4)
-- Bucket dedicado `notas-voz` (espejo de `uploads`: público, insert autenticado,
-- lectura pública) + columnas en `pedidos` para la URL del audio y su transcripción.
-- Idempotente.

-- Bucket (público como `uploads`/`web-uploads`).
insert into storage.buckets (id, name, public)
values ('notas-voz', 'notas-voz', true)
on conflict (id) do nothing;

-- Policies de storage.objects acotadas al bucket (espejo de uploads_*).
drop policy if exists "notas_voz_auth_insert" on storage.objects;
create policy "notas_voz_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notas-voz');

drop policy if exists "notas_voz_auth_update" on storage.objects;
create policy "notas_voz_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'notas-voz');

drop policy if exists "notas_voz_public_read" on storage.objects;
create policy "notas_voz_public_read" on storage.objects
  for select to public
  using (bucket_id = 'notas-voz');

-- Campos en el pedido: URL del audio + transcripción (dictado de voz, editable).
alter table pedidos add column if not exists nota_voz_url            text;
alter table pedidos add column if not exists nota_voz_transcripcion  text;

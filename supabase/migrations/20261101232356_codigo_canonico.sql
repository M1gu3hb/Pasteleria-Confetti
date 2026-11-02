-- Preserve barcode identity: only clipboard padding at the edges may be trimmed.
-- Internal whitespace/control bytes must fail validation, never alias another SKU.
create or replace function public.normalizar_codigo_producto(p_codigo text) returns text
language sql immutable set search_path='' as $$
 select nullif(regexp_replace(coalesce(p_codigo,''),'^[[:space:][:cntrl:]]+|[[:space:][:cntrl:]]+$','','g'),'')
$$;
revoke all on function public.normalizar_codigo_producto(text) from public,anon;
grant execute on function public.normalizar_codigo_producto(text) to authenticated;

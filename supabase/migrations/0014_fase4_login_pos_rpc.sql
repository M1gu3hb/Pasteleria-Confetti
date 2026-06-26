-- Login por PIN server-side: valida contra pin_hash (bcrypt) y devuelve el operador
-- (sin exponer hashes). El cliente luego hace signInWithPassword(email,'POS-'||pin).
-- Preserva la UX de PIN del POS. PINs duplicados -> el más antiguo (como el find() original).
create or replace function login_pos(p_pin text, p_user_id uuid default null)
returns table(id uuid, email text, nombre text, rol text, sucursal_id uuid, sucursal_nombre text)
language sql stable security definer set search_path = public, extensions as $$
  select u.id, lower(u.id::text)||'@pos.confetti.local', u.nombre, u.rol, u.sucursal_id, u.sucursal_nombre
  from usuarios_pos u
  where u.activo = true and u.pin_hash is not null
    and extensions.crypt(p_pin, u.pin_hash) = u.pin_hash
    and (p_user_id is null or u.id = p_user_id)
  order by u.created_at asc
  limit 1
$$;
revoke execute on function login_pos(text, uuid) from public;
grant execute on function login_pos(text, uuid) to anon, authenticated;

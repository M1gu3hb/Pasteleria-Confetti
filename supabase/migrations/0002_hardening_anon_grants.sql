-- Endurece los GRANTs de anon al mínimo exacto (defensa en profundidad sobre RLS).
-- Supabase, por defecto, otorga a `anon` TODOS los privilegios sobre tablas nuevas.
-- La RLS ya deniega lo no permitido, pero el brief exige que anon "no tenga nada más".
-- Resultado: anon -> SELECT en vistas/sucursales/categorias, INSERT en pedidos. Nada más.
revoke all on pedidos             from anon;  grant insert on pedidos             to anon;
revoke all on sucursales          from anon;  grant select on sucursales          to anon;
revoke all on categorias_producto from anon;  grant select on categorias_producto to anon;
revoke all on catalogo_publico    from anon;  grant select on catalogo_publico    to anon;
revoke all on config_publica      from anon;  grant select on config_publica      to anon;

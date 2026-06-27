-- WEB-2 / Hardening de 0019: crear_pedido_web debe ser ejecutable SOLO por anon.
-- Supabase aplica ALTER DEFAULT PRIVILEGES que otorga EXECUTE a `authenticated`
-- (además de `public`) en funciones nuevas. 0019 ya revoca `public` y otorga `anon`,
-- pero `authenticated` quedaba con EXECUTE heredado del default → un usuario POS
-- (p. ej. rol `caja`) podría crear, vía esta función SECURITY DEFINER, un pedido
-- web/pendiente para CUALQUIER sucursal, saltándose el scope `pos_sucursal()` de la
-- RLS. La RPC es la ÚNICA superficie de escritura NUEVA y es exclusiva de la web (anon);
-- el POS escribe `pedidos` por INSERT directo con su RLS scoped, NO por esta función.
-- Mismo patrón que 0003/0004 (endurecer grants de funciones ya creadas).
revoke execute on function crear_pedido_web(jsonb) from authenticated;

-- Reafirma el estado deseado (idempotente): solo anon ejecuta.
revoke execute on function crear_pedido_web(jsonb) from public;
grant  execute on function crear_pedido_web(jsonb) to anon;

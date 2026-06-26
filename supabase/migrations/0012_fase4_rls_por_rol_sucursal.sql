-- Fase 4: RLS real por rol/sucursal. Reemplaza las políticas amplias temporales.
-- Helpers SECURITY DEFINER: mapean auth.uid() -> usuarios_pos.
create or replace function pos_sucursal() returns uuid language sql stable security definer set search_path=public as $$
  select sucursal_id from usuarios_pos where auth_user_id = auth.uid() limit 1
$$;
create or replace function pos_is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select rol in ('dueño','administrador') from usuarios_pos where auth_user_id = auth.uid() limit 1), false)
$$;
revoke execute on function pos_sucursal() from anon, public;
revoke execute on function pos_is_admin() from anon, public;
grant execute on function pos_sucursal() to authenticated;
grant execute on function pos_is_admin() to authenticated;

-- Tablas de dinero: dueño/admin ven todo; caja/encargado solo su sucursal.
drop policy pos_all_ventas on ventas;
create policy pos_scope_ventas on ventas for all to authenticated
  using (pos_is_admin() or sucursal_id = pos_sucursal()) with check (pos_is_admin() or sucursal_id = pos_sucursal());
drop policy pos_all_cortes_caja on cortes_caja;
create policy pos_scope_cortes on cortes_caja for all to authenticated
  using (pos_is_admin() or sucursal_id = pos_sucursal()) with check (pos_is_admin() or sucursal_id = pos_sucursal());
drop policy pos_all_abonos on abonos;
create policy pos_scope_abonos on abonos for all to authenticated
  using (pos_is_admin() or sucursal_id = pos_sucursal()) with check (pos_is_admin() or sucursal_id = pos_sucursal());
drop policy pos_all_pedidos on pedidos;
create policy pos_scope_pedidos on pedidos for all to authenticated
  using (pos_is_admin() or sucursal_id = pos_sucursal()) with check (pos_is_admin() or sucursal_id = pos_sucursal());
drop policy pos_all_gastos_operativos on gastos_operativos;
create policy pos_scope_gastos on gastos_operativos for all to authenticated
  using (pos_is_admin() or sucursal_id = pos_sucursal()) with check (pos_is_admin() or sucursal_id = pos_sucursal());
drop policy pos_all_detalle_venta on detalle_venta;
create policy pos_scope_detalle on detalle_venta for all to authenticated
  using (exists (select 1 from ventas v where v.id = detalle_venta.venta_id and (pos_is_admin() or v.sucursal_id = pos_sucursal())))
  with check (exists (select 1 from ventas v where v.id = detalle_venta.venta_id and (pos_is_admin() or v.sucursal_id = pos_sucursal())));

-- Vista de login (anon): lista operadores SIN exponer pin_hash.
create view usuarios_login with (security_invoker = false) as
  select id, nombre, rol, sucursal_id, sucursal_nombre, color, activo
  from usuarios_pos where activo = true;
grant select on usuarios_login to anon, authenticated;

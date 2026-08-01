-- 0051 — Envolver los helpers de RLS en subconsulta escalar (InitPlan).
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-01.
--
-- CAUSA RAÍZ (medida):
--   usuarios_pos = 6 filas, y sin embargo acumulaba 62.5M seq_scan y 411M
--   tuplas leídas. Ratio: ~53 llamadas a los helpers POR PETICIÓN REST.
--   pos_is_admin()/pos_sucursal() son STABLE, pero una llamada STABLE sin
--   argumentos NO se pliega en tiempo de plan: el ejecutor la evalúa POR FILA.
--   Envolverla en (select f()) la convierte en InitPlan -> 1 vez por statement.
--
-- EQUIVALENCIA SEMÁNTICA: el booleano resultante es idéntico (los helpers sólo
-- dependen de auth.uid(), constante dentro del statement). NO cambia quién ve
-- ni quién escribe qué; sólo CUÁNTAS VECES se evalúa.
--
-- Se usa ALTER POLICY (no DROP+CREATE): la tabla nunca queda sin política.
--
-- FUERA DE ALCANCE AQUÍ (a propósito): las políticas "always true" de
-- usuarios_pos, productos, categorias_producto, configuracion_negocio,
-- sucursales y folio_contador. Eso es un cambio de AUTORIZACIÓN real y va en
-- su propia fase, con matriz de permisos y validación en la app.
--
-- Rollback: repetir estos ALTER POLICY quitando los (select ...).

alter policy pos_scope_ventas on public.ventas
  using ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())))
  with check ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())));

alter policy pos_scope_pedidos on public.pedidos
  using ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())))
  with check ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())));

alter policy pos_scope_cortes on public.cortes_caja
  using ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())))
  with check ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())));

alter policy pos_scope_abonos on public.abonos
  using ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())))
  with check ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())));

alter policy pos_scope_gastos on public.gastos_operativos
  using ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())))
  with check ((select public.pos_is_admin()) or (sucursal_id = (select public.pos_sucursal())));

alter policy pos_pastelero_select_pedidos on public.pedidos
  using ((select public.pos_is_pastelero()));

alter policy pos_scope_detalle on public.detalle_venta
  using (exists (select 1 from public.ventas v
                 where v.id = detalle_venta.venta_id
                   and ((select public.pos_is_admin()) or (v.sucursal_id = (select public.pos_sucursal())))))
  with check (exists (select 1 from public.ventas v
                 where v.id = detalle_venta.venta_id
                   and ((select public.pos_is_admin()) or (v.sucursal_id = (select public.pos_sucursal())))));

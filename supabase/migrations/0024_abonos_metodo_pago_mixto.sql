-- FASE 3 #3 — habilitar 'mixto' en el método de pago del ABONO.
-- El esquema ya soportaba metodo_pago='mixto' en `ventas` (ventas_metodo_pago_check),
-- pero `abonos` tenía un CHECK que solo permitía efectivo/tarjeta/transferencia → al
-- registrar un anticipo MIXTO de pedido, el Abono fallaba con
-- "violates check constraint abonos_metodo_pago_check". (La venta paralela del anticipo
-- sí aceptaba 'mixto'; el corte cuadra por monto_efectivo/tarjeta/transferencia de la venta.)
--
-- FIX: recrear el check de abonos incluyendo 'mixto' (espejo del de ventas). Las filas
-- existentes (métodos únicos) siguen válidas; solo se AMPLÍA el conjunto permitido.

alter table abonos drop constraint if exists abonos_metodo_pago_check;
alter table abonos add constraint abonos_metodo_pago_check
  check (metodo_pago = any (array['efectivo'::text, 'tarjeta'::text, 'transferencia'::text, 'mixto'::text]));

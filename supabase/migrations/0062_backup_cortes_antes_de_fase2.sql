-- 0062 — RESPALDO de cortes_caja ANTES del recálculo de la Fase 2.
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-09.
--
-- NO TOCA cortes_caja. Sólo crea una copia. Se aplica y se VERIFICA (recuento
-- de filas) ANTES de ejecutar 0063.
--
-- POR QUÉ EL NOMBRE LLEVA _fase2:
--   Ya existen app_private.cortes_backup_20260808 (creado por 0056) y
--   app_private.cortes_backup_20260809 (creado por 0059, el mismo día que este).
--   Un tercer respaldo del 2026-08-09 colisionaría, así que se sufija.
--
-- POR QUÉ SE RESPALDAN LOS 108 CERRADOS Y NO SÓLO LOS 2 QUE SE REPARAN:
--   0056 respaldó únicamente las filas afectadas. Aquí se respaldan TODOS los
--   cortes cerrados a propósito, para poder demostrar después —fila por fila y
--   columna por columna— que 0063 no movió ningún corte SANO. Cuesta nada y
--   convierte "no toqué nada más" en algo comprobable en vez de en una promesa.
--
-- NO se respaldan los cortes ABIERTOS: las 3 cajas están operando ahora mismo y
--   sus filas cambian legítimamente con cada venta. Incluirlas haría que la
--   comparación posterior diera falsos positivos.
--
-- Rollback de este archivo: drop table app_private.cortes_backup_20260809_fase2;

create table if not exists app_private.cortes_backup_20260809_fase2 as
  select * from public.cortes_caja where estado = 'cerrado';

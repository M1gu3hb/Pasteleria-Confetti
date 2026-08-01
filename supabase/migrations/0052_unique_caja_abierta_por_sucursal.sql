-- 0052 — Garantía transaccional: UNA sola caja abierta por sucursal.
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-01.
--
-- POR QUÉ: `useCorteAtrasado` deriva el corte atrasado de la caja abierta, y
-- `handleAbrirCaja` valida con un read-then-create (TOCTOU). Hasta ahora NADA
-- en PostgreSQL impedía dos cortes 'abierto'/cierre_diario en la misma
-- sucursal: sólo existían PK, FK y dos CHECK. El invariante era una convención
-- del frontend, no una garantía.
--
-- ALCANCE DELIBERADO: sólo cubre cierre_diario (y los registros antiguos con
-- tipo_corte NULL, que el POS trata como cierre_diario). Los cortes de 'turno'
-- NO quedan afectados.
--
-- APLICACIÓN: se creó con CREATE UNIQUE INDEX CONCURRENTLY (lock
-- ShareUpdateExclusive: no bloquea lecturas ni escrituras) porque las tres
-- sucursales estaban vendiendo. Este archivo usa IF NOT EXISTS para quedar
-- registrado en el historial sin volver a construirlo.
--
-- VERIFICADO ANTES:   0 sucursales con más de un corte abierto.
-- VERIFICADO DESPUÉS (transacción revertida): insertar una segunda caja
-- abierta en la misma sucursal falla con SQLSTATE 23505; un corte de 'turno'
-- sigue permitido; no quedó ninguna fila de prueba (86 cortes, 3 abiertos).
-- Índice comprobado indisvalid=true, indisready=true, indisunique=true.
--
-- Rollback: DROP INDEX CONCURRENTLY ux_cortes_una_caja_abierta_por_sucursal;

create unique index if not exists ux_cortes_una_caja_abierta_por_sucursal
  on public.cortes_caja (sucursal_id)
  where estado = 'abierto' and (tipo_corte = 'cierre_diario' or tipo_corte is null);

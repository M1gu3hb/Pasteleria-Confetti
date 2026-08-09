-- 0063 — Recálculo de los DOS cortes que quedaron por debajo de su valor real.
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-09.
-- Firmada por Miguel. Dinero real: se reflejan $1,490.00 que estaban sin registrar.
--
-- =====================================================================
-- LOS DOS CORTES TIENEN CAUSAS DISTINTAS. SE DECLARAN POR SEPARADO.
-- (El error que se repara aquí NO es sólo el dinero: es haber clasificado
--  un corte sin demostrar su causa. Ver la nota sobre CONF-C-C035 abajo.)
-- =====================================================================
--
-- ── CONF-A-C032 · Xochimilco · cerrado 2026-07-30 · $1,420.00 ──────────
-- CAUSA: TRUNCACIÓN PARCIAL. Es el MISMO bug del incidente del cierre en cero,
-- en su forma parcial. El resumen se calculaba con
--     Venta.filter({ estado: 'pagada' })
-- que NO lleva filtro de sucursal, ni ORDER BY, ni LIMIT. La sucursal la impone
-- la RLS (pos_scope_ventas: pos_is_admin() OR sucursal_id = pos_sucursal()), y
-- el tope de 1.000 filas de PostgREST se aplica DESPUÉS de la RLS. Por eso, en
-- una sesión de TERMINAL (rol 'caja', que es quien cerró este corte), la ventana
-- efectiva son "las 1.000 ventas pagadas más antiguas DE ESA SUCURSAL".
--
-- En el instante del cierre, Xochimilco tenía 1.008 ventas pagadas: cruzó el
-- tope por 8. Las 31 ventas de este corte ocupan los puestos 978 a 1008:
--     puestos  978-1000 → 23 ventas → $4,995.00  (lo que se guardó)
--     puestos 1001-1008 →  8 ventas → $1,420.00  (lo que se perdió)
-- Las dos magnitudes coinciden a la vez con lo guardado (23 y $4,995), así que
-- no es una coincidencia numérica: es el mecanismo.
--
-- ── CONF-C-C002 · San Gregorio · cerrado 2026-07-06 · $70.00 ──────────
-- CAUSA: CARRERA DE REFRESCO. **NO es truncación**, y está demostrado: en el
-- instante del cierre esa sucursal tenía 11 ventas pagadas EN TOTAL. Con 11
-- filas, un tope de 1.000 no puede dejar nada fuera.
-- Lo que pasó, con los tiempos reales:
--     CONF-C-V0009  $230  cobrada 17:14:21   (366 s antes del cierre)
--     CONF-C-V0010  $140  cobrada 17:14:58   (329 s antes del cierre)
--     CONF-C-V0011  $ 70  cobrada 17:19:39   ( 48 s antes del cierre)  <-- ésta
--     caja cerrada         17:20:27
-- La consulta del resumen tenía staleTime: 5000 y caché de React Query, así que
-- al calcular el cierre aún no había refrescado la tercera venta. Se guardó lo
-- que se conocía en ese instante.
-- NOTA HUMANA: tras este recálculo, diferencia_efectivo pasa de 0 a -70. NO es
-- un faltante demostrado: lo más probable es que la caja se contara ANTES de esa
-- última venta de $70. Se corrige igual porque un corte que afirma "cuadra"
-- mientras su propio efectivo_esperado dice lo contrario es un dato falso.
-- Miguel se lo explica a Abel; NO se toca el campo `notas`.
--
-- ── CONSTANCIA: CONF-C-C035 ESTABA MAL CLASIFICADO ────────────────────
-- CONF-C-C035 (San Gregorio, reparado por 0057) se trató como truncación, pero
-- NO pudo serlo: en su cierre esa sucursal tenía 477 ventas pagadas, muy por
-- debajo del tope de 1.000. Su causa real es el otro camino ya documentado
--     Array.isArray(ventasHoy) ? ventasHoy : []
-- que confunde "no cargó" con "no hubo ventas".
-- SU REPARACIÓN FUE CORRECTA (se recalculó desde las ventas reales) — lo que
-- estuvo mal fue la CLASIFICACIÓN. Se deja escrito para no repetir el patrón de
-- declarar una causa sin demostrarla, que es exactamente lo que dejó a
-- CONF-A-C032 sin reparar durante 10 días.
--
-- =====================================================================
-- FÓRMULA
-- =====================================================================
-- La misma de 0057, RE-VALIDADA el 2026-08-09 contra los 108 cortes cerrados:
-- reproduce EXACTAMENTE los 9 campos en los 106 cortes sanos (106/106). Los dos
-- únicos que no reproducía son precisamente estos dos.
--
-- DIFERENCIA DELIBERADA CON 0057: ticket_promedio se escribe SIN REDONDEAR,
-- porque es lo que hace la app (Caja.jsx:379 -> sum/length, sin round). El
-- objetivo es que la fila reparada quede idéntica a lo que la app habría
-- escrito si hubiera visto todas las ventas. Se usa la división en float8 para
-- reproducir el mismo valor que calcula JavaScript.
-- CONSTANCIA: los 10 cortes que reparó 0057 SÍ quedaron con el promedio
-- redondeado. NO se vuelven a tocar: la diferencia es <= $0.01 y es cosmética;
-- tocar dinero por un centavo tiene más riesgo que dejarlo.
--
-- NO SE TOCA: `notas`, `efectivo_contado`, `dinero_dejado_en_caja`,
-- `efectivo_inicial_contado`, `fondo_esperado_apertura`, `diferencia_apertura`,
-- fechas, usuarios, estado, sucursal. Ni una venta, ni un gasto, ni un abono.
--
-- El trigger trg_guard_cierre_en_cero (0058) NO estorba: hace
--     if old.estado = 'cerrado' then return new; end if;
-- así que los recálculos de cortes ya cerrados pasan sin comprobación.
--
-- =====================================================================
-- ROLLBACK EXACTO
-- =====================================================================
--   update public.cortes_caja c set
--     total_general=b.total_general, total_efectivo=b.total_efectivo,
--     total_tarjeta=b.total_tarjeta, total_transferencia=b.total_transferencia,
--     numero_ventas=b.numero_ventas, ticket_promedio=b.ticket_promedio,
--     total_gastos=b.total_gastos, efectivo_esperado=b.efectivo_esperado,
--     diferencia_efectivo=b.diferencia_efectivo
--   from app_private.cortes_backup_20260809_fase2 b
--   where b.id = c.id and c.folio in ('CONF-A-C032','CONF-C-C002');
--
-- Idempotente: re-ejecutarla deja los mismos valores.
-- =====================================================================

with objetivo as (
  select c.id,
    (select coalesce(sum(v.total),0)               from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') tg,
    (select coalesce(sum(v.monto_efectivo),0)      from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') ef,
    (select coalesce(sum(v.monto_tarjeta),0)       from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') ta,
    (select coalesce(sum(v.monto_transferencia),0) from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') tr,
    (select count(*)                               from public.ventas v where v.corte_caja_id=c.id and v.estado='pagada') nv,
    (select coalesce(sum(g.monto),0)               from public.gastos_operativos g where g.corte_caja_id=c.id) gas,
    (select coalesce(sum(case when g.metodo_pago='efectivo' then g.monto else 0 end),0)
       from public.gastos_operativos g where g.corte_caja_id=c.id) gas_ef,
    (select coalesce(sum(case when a.monto<0 then a.monto_efectivo else 0 end),0)
       from public.abonos a where a.corte_caja_id=c.id) dev_ef
  from public.cortes_caja c
  where c.folio in ('CONF-A-C032','CONF-C-C002')
)
update public.cortes_caja c set
  total_general       = o.tg,
  total_efectivo      = o.ef,
  total_tarjeta       = o.ta,
  total_transferencia = o.tr,
  numero_ventas       = o.nv,
  ticket_promedio     = case when o.nv > 0 then (o.tg::float8 / o.nv::float8)::numeric else 0 end,
  total_gastos        = o.gas,
  efectivo_esperado   = o.ef + o.dev_ef - o.gas_ef,
  diferencia_efectivo = coalesce(c.efectivo_contado::numeric,0) - (o.ef + o.dev_ef - o.gas_ef)
from objetivo o
where c.id = o.id;

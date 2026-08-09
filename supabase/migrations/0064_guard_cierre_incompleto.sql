-- 0064 — Guard contra el cierre de caja INCOMPLETO (truncación PARCIAL).
-- APLICADA en producción (ivqcxdpqxwjxfohiswqb) el 2026-08-09. Firmada por Miguel.
--
-- =====================================================================
-- QUÉ AGUJERO CIERRA
-- =====================================================================
-- 0058 (`guard_cierre_en_cero`) sólo rechaza `total_general = 0`. Su cuerpo hace
--     if coalesce(new.total_general, 0) <> 0 then return new; end if;
-- así que CUALQUIER total distinto de cero pasa sin comprobar nada. Un cierre
-- con un total "creíble pero incompleto" —la truncación PARCIAL— entraba sin
-- resistencia. Caso real: CONF-A-C032, cerrado con $4,995 cuando lo real eran
-- $6,415. $1,420 sin reflejar durante 10 días.
--
-- =====================================================================
-- EL CRITERIO, Y POR QUÉ ES ASIMÉTRICO
-- =====================================================================
-- En el instante en que dispara este trigger, la base ve SÓLO las ventas ya
-- ligadas (`corte_caja_id = new.id`). Verificado en el orden real de
-- `handleCerrarCaja` (Caja.jsx): cuenta en servidor -> hace el UPDATE del corte
-- -> y SÓLO DESPUÉS liga las ventas "en tránsito" que aún tienen
-- corte_caja_id = NULL (CANDADO 1).
--
-- Por eso la comparación es asimétrica y TIENE que serlo:
--
--     el cliente puede traer MÁS que la base   (las ventas en tránsito)  -> OK
--     el cliente NUNCA puede traer MENOS       (eso es truncación)       -> RECHAZAR
--
-- Un guard simétrico bloquearía cierres legítimos y dejaría a una sucursal sin
-- poder cerrar, que es exactamente el problema del que venimos.
--
-- MARGEN. El recuento va SIN margen: es un entero exacto y el desvío medido
-- sobre los 108 cortes cerrados es 0. El total lleva 0.50 sólo para absorber
-- ruido de coma flotante entre el `sum` de JavaScript y el de Postgres (desvío
-- medido: 0.00). La venta más barata registrada en todo el histórico es $1.00,
-- así que 0.50 no puede enmascarar ni la pérdida de un solo ticket — y de todos
-- modos el recuento la cazaría por su cuenta.
--
-- NULL FALLA CERRADO. Se usa `coalesce(..., -1)`, NO `coalesce(..., 0)`. Si un
-- NULL se tratara como cero, un cierre sin totales pasaría por "caja vacía".
-- Es exactamente el modo de fallo de `Number(null) === 0` que costó 11 cortes.
--
-- =====================================================================
-- POR QUÉ SE AÑADE Y NO SE SUSTITUYE A 0058
-- =====================================================================
-- Este guard subsume al de 0058 (un cierre en ceros con ventas ligadas también
-- trae "menos que la base"). Aun así 0058 se DEJA en su sitio: si este resultara
-- tener un falso positivo, el rollback es UNA línea
--     drop trigger trg_guard_cierre_incompleto on public.cortes_caja;
-- y volvemos exactamente al comportamiento probado de hoy, sin quedarnos sin
-- protección ni un minuto.
--
-- Si ambos disparan, gana el mensaje de 0058 (orden alfabético de triggers), que
-- ya está redactado para ese caso. Los dos llevan un MARCADOR al principio
-- (CIERRE_EN_CERO / CIERRE_INCOMPLETO) para que el frontend los reconozca y
-- muestre el texto amable en vez del genérico.
--
-- SÓLO comprueba `numero_ventas` y `total_general`: son las dos magnitudes que
-- definen el corte. Menos superficie, menos falsos positivos.
--
-- =====================================================================
-- EVIDENCIA (2026-08-09)
-- =====================================================================
-- Simulado sobre los 108 cortes cerrados: 0 bloqueados (desvío máx. 0.00).
-- Simulado sobre los 12 valores rotos (respaldos pre-reparación): 12 BLOQUEADOS,
--   incluidos CONF-A-C032 (23 vs 31) y CONF-C-C002 (2 vs 3).
-- Probado en transacción revertida, 7 de 7:
--   legítimo -> pasa · legítimo con ventas en tránsito -> pasa · parcial ->
--   bloquea · total -> bloquea · NULL -> bloquea · caja vacía -> pasa ·
--   recálculo de corte ya cerrado -> pasa.
--
-- ROLLBACK: drop trigger trg_guard_cierre_incompleto on public.cortes_caja;
--           drop function public.guard_cierre_incompleto();
-- =====================================================================

create or replace function public.guard_cierre_incompleto()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_n_bd  integer;
  v_t_bd  numeric;
  v_n_cli numeric;
  v_t_cli numeric;
begin
  -- Sólo en la TRANSICIÓN a 'cerrado'.
  if new.estado is distinct from 'cerrado' then return new; end if;
  -- Reescrituras y recálculos de un corte ya cerrado (migraciones de
  -- reparación) pasan sin comprobación, igual que en 0058.
  if old.estado = 'cerrado' then return new; end if;

  select count(*), coalesce(sum(total), 0)
    into v_n_bd, v_t_bd
    from public.ventas
   where corte_caja_id = new.id and estado = 'pagada';

  -- Sin ventas ligadas no hay nada contra qué comparar: puede ser una caja
  -- legítimamente vacía, o un corte cuyas ventas están todas "en tránsito".
  if v_n_bd = 0 then return new; end if;

  -- OJO: -1, no 0. NULL tiene que fallar CERRADO.
  v_n_cli := coalesce(new.numero_ventas, -1);
  v_t_cli := coalesce(new.total_general,  -1);

  if v_n_cli < v_n_bd or v_t_cli < v_t_bd - 0.50 then
    raise exception
      'CIERRE_INCOMPLETO: la caja % tiene % ventas por $% registradas, pero la pantalla sólo mostró % por $%. No se guardó el corte.',
      coalesce(new.folio, new.id::text), v_n_bd, v_t_bd, new.numero_ventas, new.total_general
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$;

drop trigger if exists trg_guard_cierre_incompleto on public.cortes_caja;
create trigger trg_guard_cierre_incompleto
  before update on public.cortes_caja
  for each row execute function public.guard_cierre_incompleto();

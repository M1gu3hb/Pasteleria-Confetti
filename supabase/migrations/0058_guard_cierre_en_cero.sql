-- 0058 — Red de seguridad EN LA BASE contra el cierre de caja en cero.
-- APLICADA en producción el 2026-08-09.
--
-- POR QUÉ NO BASTA EL ARREGLO DEL FRONTEND:
--   El 2026-08-09, un día DESPUÉS de desplegar el arreglo, CONF-A-C042 volvió a
--   cerrarse con total_general=0 teniendo 45 ventas y 12,870 reales. La tablet
--   de Xochimilco llevaba ~22 h con la app abierta (corte abierto el 08-08 a las
--   17:00, cerrado el 09-08 a las 15:12) y seguía ejecutando el bundle ANTERIOR:
--   las tablets cargan la web viva y sólo toman el código nuevo al recargar.
--   Una guarda que vive en el cliente no puede protegerse a sí misma.
--
-- QUÉ HACE: rechaza pasar un corte a 'cerrado' con total_general=0 cuando ese
-- corte SÍ tiene ventas pagadas ligadas. Independiente del frontend, así que
-- protege también a tablets con código viejo.
--
-- QUÉ NO HACE: no bloquea cortes sin ventas (CONF-B-C001 y CONF-B-C021 cierran
-- en 0 legítimamente), no modifica importes, y no afecta a UPDATEs que no
-- cierran (apertura, notas) ni a los recálculos sobre cortes ya cerrados.
--
-- VERIFICADO (transacción revertida):
--   (1) cerrar en 0 un corte con 3 ventas -> BLOQUEADO con CIERRE_EN_CERO
--   (2) cerrar con el total correcto        -> permitido
--   (3) cerrar en 0 un corte sin ventas     -> permitido
--
-- Rollback:
--   drop trigger if exists trg_guard_cierre_en_cero on public.cortes_caja;
--   drop function if exists public.guard_cierre_en_cero();

create or replace function public.guard_cierre_en_cero()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_ventas integer; v_suma numeric;
begin
  if new.estado is distinct from 'cerrado' then return new; end if;
  if old.estado = 'cerrado' then return new; end if;   -- reescrituras/recálculos
  if coalesce(new.total_general, 0) <> 0 then return new; end if;

  select count(*), coalesce(sum(total), 0)
    into v_ventas, v_suma
    from public.ventas
   where corte_caja_id = new.id and estado = 'pagada';

  if v_ventas > 0 then
    raise exception
      'CIERRE_EN_CERO: el corte % tiene % ventas pagadas por % pero se intentó cerrar con total 0. No se guardó. Actualiza la aplicación (cierra y vuelve a abrirla) e intenta de nuevo.',
      coalesce(new.folio, new.id::text), v_ventas, v_suma
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_cierre_en_cero on public.cortes_caja;
create trigger trg_guard_cierre_en_cero
  before update on public.cortes_caja
  for each row
  execute function public.guard_cierre_en_cero();

revoke all on function public.guard_cierre_en_cero() from public, anon, authenticated;

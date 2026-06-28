-- FASE 3 A-FIX (Opción A, aprobada por Miguel) — desglose por método en ABONOS.
-- Objetivo: que la porción por método de un abono MIXTO entre a los buckets de abonos
-- IGUAL que un abono de método único, para que efectivo_esperado trate el efectivo del
-- mixto idéntico a cualquier efectivo (incluido el doble conteo, ahora CONSISTENTE — el
-- quirk NO se elimina, se hace uniforme) y el abono aparezca en ResumenDelDia.
-- Antes: `abonos` solo tenía metodo_pago+monto; el desglose por método vivía solo en
-- `ventas`. Un abono 'mixto' aportaba $0 a abonosEfectivo/Tarjeta/Transferencia. Ver
-- BUGS_PENDING (k).

alter table abonos add column if not exists monto_efectivo      numeric default 0;
alter table abonos add column if not exists monto_tarjeta        numeric default 0;
alter table abonos add column if not exists monto_transferencia  numeric default 0;

-- BACKFILL de filas existentes desde metodo_pago + monto. Los abonos heredados de Base44
-- son todos de método ÚNICO → el CASE los cubre EXACTO (ningún abono queda con desglose
-- null; el add-column con default 0 ya dejó 0 a todas y este UPDATE asigna la porción).
-- (Si hubiera abonos 'mixto' preexistentes habría que derivar el split de su venta
--  paralela; en la práctica no existen: staging limpio y prod single-método.)
update abonos set
  monto_efectivo      = case when metodo_pago = 'efectivo'      then monto else 0 end,
  monto_tarjeta       = case when metodo_pago = 'tarjeta'       then monto else 0 end,
  monto_transferencia = case when metodo_pago = 'transferencia' then monto else 0 end;

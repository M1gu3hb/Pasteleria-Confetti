-- =====================================================================
-- 0060 — el rol `pastelero` puede EDITAR LA NOTA y AVANZAR ESTADOS
-- ---------------------------------------------------------------------
-- PROBLEMA (verificado en producción 2026-08-09, transacción revertida):
--   pos_is_pastelero()=true, pos_sucursal()=NULL, LEE 229 pedidos,
--   UPDATE de nota_voz_transcripcion -> 0 filas.
--
-- CAUSA RAÍZ:
--   public.pedidos sólo tenía dos políticas relevantes:
--     pos_scope_pedidos            ALL    authenticated
--       USING/WITH CHECK: pos_is_admin() OR sucursal_id = pos_sucursal()
--     pos_pastelero_select_pedidos SELECT authenticated
--       USING: pos_is_pastelero()
--   El pastelero tiene sucursal_id = NULL, así que `sucursal_id = pos_sucursal()`
--   evalúa a NULL (no a TRUE) y pos_is_admin() es false: NINGUNA política de
--   escritura lo admite. La lectura funcionaba por su política propia.
--   Origen: 0037_rol_pastelero.sql (2026-06-30, commit 17a3210), cuyo comentario
--   asumía "los INSERT/UPDATE/DELETE siguen bajo pos_scope_pedidos" — cierto para
--   caja (que sí tiene sucursal), falso para un rol sin sucursal.
--
-- ALCANCE AUTORIZADO POR MIGUEL (2026-08-09): "nota más avanzar estados".
--   PUEDE:  nota_voz_transcripcion; estado pendiente->confirmado;
--           estado ->entregado (sólo sin saldo pendiente), con su fecha.
--   NO PUEDE: precios, kilos, extras, cliente, sucursal, anticipos/saldos,
--           cancelar, devolver, crear ni borrar pedidos.
--
-- CÓMO SE IMPONE:
--   RLS no distingue columnas y el POS usa un único rol de base
--   (`authenticated`), así que el permiso se abre con una política FOR UPDATE
--   y el alcance por columna/transición lo impone un trigger BEFORE UPDATE que
--   compara OLD contra NEW. El trigger es NO-OP para cualquier otro rol: si no
--   es pastelero, devuelve NEW sin mirar nada.
--
-- ADITIVO: no se modifica ni se borra ninguna política existente, así que la
--   tabla no queda en ningún instante sin RLS. Reversión al final del archivo.
-- =====================================================================

-- ── 1) Permiso de escritura, acotado al pastelero ────────────────────────
-- Sin filtro de sucursal a propósito: el pastelero YA lee todas las sucursales
-- (pos_pastelero_select_pedidos) porque produce para las tres. Su sucursal_id
-- es NULL, así que cualquier condición contra pos_sucursal() lo dejaría fuera.
-- Idempotente: si se re-aplica el archivo, `create policy` a secas abortaría con
-- 42710 y dejaría el trigger de abajo sin crear. Se hace en el MISMO statement
-- lógico que el create, así que la tabla no queda sin la política existente por
-- ninguna ventana observable: dentro de la transacción de la migración.
drop policy if exists pos_pastelero_update_pedidos on public.pedidos;
create policy pos_pastelero_update_pedidos
  on public.pedidos
  for update
  to authenticated
  using      ((select public.pos_is_pastelero()))
  with check ((select public.pos_is_pastelero()));

-- ── 2) Candado de alcance (columnas + transiciones) ──────────────────────
create or replace function public.guard_pastelero_alcance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Únicas columnas que el pastelero puede tocar.
  k_permitidas constant text[] := array[
    'nota_voz_transcripcion', 'estado', 'fecha_confirmacion', 'fecha_entrega_real'
  ];
  v_saldo numeric;
begin
  -- NO-OP para caja, administrador y dueño: se comportan exactamente igual que
  -- antes de esta migración.
  if not (select public.pos_is_pastelero()) then
    return new;
  end if;

  -- (a) Ninguna columna fuera de la lista puede cambiar.
  if (to_jsonb(new) - k_permitidas) is distinct from (to_jsonb(old) - k_permitidas) then
    raise exception
      'PASTELERO_FUERA_DE_ALCANCE: este usuario sólo puede editar la nota y avanzar el estado del pedido.'
      using errcode = '42501';
  end if;

  -- (b) Transiciones de estado permitidas.
  if new.estado is distinct from old.estado then
    if new.estado = 'confirmado' and old.estado = 'pendiente' then
      -- Confirmar un pedido pendiente: permitido.
      null;
    elsif new.estado = 'entregado' and old.estado not in ('entregado', 'cancelado') then
      -- Entregar: sólo si NO queda saldo. Misma regla que ya aplica la pantalla
      -- (`tieneSaldo`), pero impuesta también aquí para que no dependa del cliente.
      -- MISMA precedencia que la pantalla (`saldo_pendiente != null ? saldo_pendiente
      -- : resta`). Hoy saldo_pendiente es NOT NULL DEFAULT 0, así que en la práctica
      -- manda saldo_pendiente y el fallback a `resta` no se alcanza — importa porque
      -- hay 68 pedidos con saldo_pendiente=0 y resta>0 (saldados por abonos, con el
      -- campo legacy sin actualizar) y esos SÍ se pueden entregar, igual que hoy.
      -- El coalesce se conserva para no divergir de la pantalla si algún día la
      -- columna admitiera NULL otra vez.
      v_saldo := coalesce(old.saldo_pendiente, old.resta, 0);
      if old.estado <> 'pagado' and v_saldo > 0 then
        raise exception
          'PASTELERO_SALDO_PENDIENTE: no se puede marcar entregado un pedido con saldo pendiente.'
          using errcode = '42501';
      end if;
    else
      raise exception
        'PASTELERO_TRANSICION_NO_PERMITIDA: de % a % no está permitido para este usuario.',
        coalesce(old.estado, '(null)'), coalesce(new.estado, '(null)')
        using errcode = '42501';
    end if;
  end if;

  -- (c) Las fechas sólo se pueden sellar EN su transición, no reescribir sueltas.
  if (new.fecha_confirmacion is distinct from old.fecha_confirmacion)
     and not (new.estado = 'confirmado' and old.estado is distinct from 'confirmado') then
    raise exception
      'PASTELERO_FECHA_SUELTA: fecha_confirmacion sólo se sella al confirmar.'
      using errcode = '42501';
  end if;
  if (new.fecha_entrega_real is distinct from old.fecha_entrega_real)
     and not (new.estado = 'entregado' and old.estado is distinct from 'entregado') then
    raise exception
      'PASTELERO_FECHA_SUELTA: fecha_entrega_real sólo se sella al entregar.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_pastelero_alcance() is
  'Acota lo que el rol pastelero puede modificar en public.pedidos (0060). NO-OP para el resto de roles.';

drop trigger if exists trg_guard_pastelero_alcance on public.pedidos;
create trigger trg_guard_pastelero_alcance
  before update on public.pedidos
  for each row execute function public.guard_pastelero_alcance();

-- ── REVERSIÓN ────────────────────────────────────────────────────────────
--   drop trigger if exists trg_guard_pastelero_alcance on public.pedidos;
--   drop function if exists public.guard_pastelero_alcance();
--   drop policy   if exists pos_pastelero_update_pedidos on public.pedidos;

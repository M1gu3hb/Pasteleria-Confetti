-- WEB-1 / GAP 1 — Folio de pedidos web sin exponer siguiente_folio a anon.
-- La web pública (anon) hace INSERT directo en `pedidos` (origen='web') pero NO
-- puede ejecutar siguiente_folio (authenticated-only) y `folio` es NOT NULL.
-- Solución: trigger BEFORE INSERT SECURITY DEFINER (owned por postgres, que sí
-- puede ejecutar siguiente_folio) que asigna el folio cuando el pedido viene de
-- la web sin folio. anon NUNCA obtiene execute directo sobre siguiente_folio.
-- Usa el MISMO contador atómico ('pedido_pastel' por sucursal) → sin colisión web↔POS.

create or replace function set_web_pedido_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo auto-folia pedidos web sin folio. Un pedido con folio ya provisto
  -- (p. ej. del POS) NO se re-folia.
  if new.origen = 'web' and new.folio is null then
    new.folio := siguiente_folio('pedido_pastel', new.sucursal_id);
  end if;
  return new;
end;
$$;

revoke execute on function set_web_pedido_folio() from anon, public;

drop trigger if exists trg_set_web_pedido_folio on pedidos;
create trigger trg_set_web_pedido_folio
  before insert on pedidos
  for each row
  when (new.origen = 'web' and new.folio is null)
  execute function set_web_pedido_folio();

-- =====================================================================
-- EVIDENCIA de la migración 0060 contra la BASE REAL de producción.
-- Sólo LECTURA efectiva: TODO va dentro de un bloque DO que termina en
-- RAISE, así que la transacción se REVIERTE entera y no persiste nada.
-- (Comprobado después: 229 pedidos, 25 pendientes, 0 filas de prueba.)
--
-- Uso: pegar en el SQL editor de Supabase. El resultado sale como el
-- mensaje de la excepción final.
--
-- Salida obtenida el 2026-08-09 (12 PASS, 0 FALLOS):
--   [1]  pastelero EDITA la nota -> 1 fila
--   [2]  NO puede cambiar total_final (bloqueado)
--   [3]  pendiente -> confirmado -> 1 fila
--   [4]  NO entrega con saldo pendiente (bloqueado)
--   [5]  entregado SIN saldo -> 1 fila
--   [6]  NO puede cancelar (bloqueado)
--   [7]  NO puede marcar pagado (bloqueado)
--   [8]  NO puede sellar fechas sueltas (bloqueado)
--   [9]  DELETE sigue rechazado -> 0 filas
--   [10] INSERT rechazado por RLS (42501)
--   [11] administrador SIGUE pudiendo cambiar total_final -> 1 fila
--   [12] administrador SIGUE pudiendo cancelar -> 1 fila
--
-- ANTES de 0060 la misma sonda daba:
--   es_pastelero=true pos_sucursal=NULL | LEE 229 pedidos | UPDATE nota -> 0 filas
-- =====================================================================
do $$
declare
  PAST constant text := '{"sub":"6df2ad7e-d345-40ed-a427-d610cd42473a","role":"authenticated"}';
  ADMI constant text := '{"sub":"3b7ae634-b42f-423a-a50c-ab90257153da","role":"authenticated"}';
  id_nota uuid; id_pend uuid; id_saldo uuid; id_sin uuid;
  n int; r text := E'\n'; fallos int := 0;
begin
  select id into id_nota  from pedidos where nota_voz_transcripcion is not null order by created_at desc limit 1;
  select id into id_pend  from pedidos where estado='pendiente' order by created_at desc limit 1;
  select id into id_saldo from pedidos where estado not in ('entregado','cancelado') and coalesce(saldo_pendiente,resta,0)>0 order by created_at desc limit 1;
  select id into id_sin   from pedidos where estado not in ('entregado','cancelado') and estado<>'pagado' and coalesce(saldo_pendiente,resta,0)<=0 order by created_at desc limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims', PAST, true);

  begin
    update pedidos set nota_voz_transcripcion='PRUEBA_REVERTIDA_0060' where id=id_nota;
    get diagnostics n = row_count;
    if n=1 then r := r||'PASS  [1] pastelero EDITA la nota -> 1 fila'||E'\n';
    else r := r||'FAIL  [1] -> '||n||' filas'||E'\n'; fallos:=fallos+1; end if;
  exception when others then r := r||'FAIL  [1] '||sqlerrm||E'\n'; fallos:=fallos+1; end;

  begin
    update pedidos set total_final = coalesce(total_final,0)+1 where id=id_nota;
    r := r||'FAIL  [2] pudo cambiar total_final'||E'\n'; fallos:=fallos+1;
  exception when others then
    if sqlerrm like 'PASTELERO_FUERA_DE_ALCANCE%' then r := r||'PASS  [2] NO puede cambiar total_final'||E'\n';
    else r := r||'FAIL  [2] '||sqlerrm||E'\n'; fallos:=fallos+1; end if; end;

  begin
    update pedidos set estado='confirmado', fecha_confirmacion=now() where id=id_pend;
    get diagnostics n = row_count;
    if n=1 then r := r||'PASS  [3] pendiente -> confirmado -> 1 fila'||E'\n';
    else r := r||'FAIL  [3] -> '||n||' filas'||E'\n'; fallos:=fallos+1; end if;
  exception when others then r := r||'FAIL  [3] '||sqlerrm||E'\n'; fallos:=fallos+1; end;

  begin
    update pedidos set estado='entregado', fecha_entrega_real=now() where id=id_saldo;
    r := r||'FAIL  [4] entrego un pedido CON saldo'||E'\n'; fallos:=fallos+1;
  exception when others then
    if sqlerrm like 'PASTELERO_SALDO_PENDIENTE%' then r := r||'PASS  [4] NO entrega con saldo pendiente'||E'\n';
    else r := r||'FAIL  [4] '||sqlerrm||E'\n'; fallos:=fallos+1; end if; end;

  begin
    update pedidos set estado='entregado', fecha_entrega_real=now() where id=id_sin;
    get diagnostics n = row_count;
    if n=1 then r := r||'PASS  [5] entregado SIN saldo -> 1 fila'||E'\n';
    else r := r||'FAIL  [5] -> '||n||' filas'||E'\n'; fallos:=fallos+1; end if;
  exception when others then r := r||'FAIL  [5] '||sqlerrm||E'\n'; fallos:=fallos+1; end;

  begin
    update pedidos set estado='cancelado' where id=id_pend;
    r := r||'FAIL  [6] pudo cancelar'||E'\n'; fallos:=fallos+1;
  exception when others then
    if sqlerrm like 'PASTELERO_TRANSICION%' then r := r||'PASS  [6] NO puede cancelar'||E'\n';
    else r := r||'FAIL  [6] '||sqlerrm||E'\n'; fallos:=fallos+1; end if; end;

  begin
    update pedidos set estado='pagado' where id=id_pend;
    r := r||'FAIL  [7] pudo marcar pagado'||E'\n'; fallos:=fallos+1;
  exception when others then
    if sqlerrm like 'PASTELERO_TRANSICION%' then r := r||'PASS  [7] NO puede marcar pagado'||E'\n';
    else r := r||'FAIL  [7] '||sqlerrm||E'\n'; fallos:=fallos+1; end if; end;

  begin
    update pedidos set fecha_entrega_real=now() where id=id_pend;
    r := r||'FAIL  [8] pudo sellar fecha suelta'||E'\n'; fallos:=fallos+1;
  exception when others then
    if sqlerrm like 'PASTELERO_FECHA_SUELTA%' then r := r||'PASS  [8] NO puede sellar fechas sueltas'||E'\n';
    else r := r||'FAIL  [8] '||sqlerrm||E'\n'; fallos:=fallos+1; end if; end;

  -- [9] RLS niega el DELETE devolviendo 0 filas (no lanza excepcion). Cualquier
  -- excepcion aqui seria OTRA cosa (p.ej. una FK) y NO prueba lo que queremos:
  -- por eso se cuenta como FALLO, no como PASS.
  begin
    delete from pedidos where id=id_pend;
    get diagnostics n = row_count;
    if n=0 then r := r||'PASS  [9] DELETE sigue rechazado -> 0 filas'||E'\n';
    else r := r||'FAIL  [9] borro '||n||' filas'||E'\n'; fallos:=fallos+1; end if;
  exception when others then
    r := r||'FAIL  [9] excepcion inesperada ('||sqlstate||'): '||sqlerrm||E'\n'; fallos:=fallos+1; end;

  -- [10] El INSERT lleva TODAS las columnas NOT NULL (folio, estado,
  -- cliente_nombre, cliente_telefono, sucursal_id) a proposito: si faltara
  -- alguna moriria con 23502 (not-null) y el rechazo no probaria la RLS.
  -- Se exige SQLSTATE 42501 exactamente.
  begin
    insert into pedidos (folio, estado, cliente_nombre, cliente_telefono, sucursal_id)
    values ('PRUEBA_0060', 'pendiente', 'x', '0000000000',
            (select sucursal_id from pedidos where id = id_nota));
    r := r||'FAIL  [10] pudo INSERTAR'||E'\n'; fallos:=fallos+1;
  exception when others then
    if sqlstate = '42501' then r := r||'PASS  [10] INSERT rechazado por RLS (42501)'||E'\n';
    else r := r||'FAIL  [10] rechazado por OTRA causa ('||sqlstate||'): '||sqlerrm||E'\n'; fallos:=fallos+1; end if; end;

  -- El trigger debe ser NO-OP para el resto de roles.
  perform set_config('request.jwt.claims', ADMI, true);
  begin
    update pedidos set total_final = coalesce(total_final,0)+1 where id=id_nota;
    get diagnostics n = row_count;
    if n=1 then r := r||'PASS  [11] administrador SIGUE pudiendo cambiar total_final'||E'\n';
    else r := r||'FAIL  [11] -> '||n||' filas'||E'\n'; fallos:=fallos+1; end if;
  exception when others then r := r||'FAIL  [11] '||sqlerrm||E'\n'; fallos:=fallos+1; end;

  begin
    update pedidos set estado='cancelado' where id=id_pend;
    get diagnostics n = row_count;
    if n=1 then r := r||'PASS  [12] administrador SIGUE pudiendo cancelar'||E'\n';
    else r := r||'FAIL  [12] -> '||n||' filas'||E'\n'; fallos:=fallos+1; end if;
  exception when others then r := r||'FAIL  [12] '||sqlerrm||E'\n'; fallos:=fallos+1; end;

  reset role;
  raise exception '%', r || fallos || ' FALLOS  (transaccion revertida, nada persiste)';
end $$;

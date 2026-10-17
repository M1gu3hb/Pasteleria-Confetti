-- Sólo lectura. No actualiza estados, pagos, entrega real ni filas históricas.
-- Dos días de margen; treinta días en Anteriores desde que se cumplen ambas condiciones.
create or replace function public.listar_pedidos_pastel_pos(
 p_sucursal uuid default null, p_vista text default 'actuales',
 p_filtros jsonb default '{}'::jsonb, p_limite integer default 50,
 p_cursor jsonb default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 hoy date := (statement_timestamp() at time zone 'America/Mexico_City')::date;
 limite_creacion timestamptz := statement_timestamp();
 despues_fecha date; despues_hora integer; despues_id uuid;
 resultado jsonb;
begin
 if auth.uid() is null or not public.pos_tiene_sesion() then raise exception 'SIN_SESION_ACTIVA'; end if;
 -- Aun con RLS, rechazar explícitamente una sucursal ajena. Dueño/pastelero
 -- conservan el alcance global deliberado y pueden reducirlo por tab.
 if not public.pos_is_admin() and not public.pos_is_pastelero()
    and (p_sucursal is null or p_sucursal is distinct from public.pos_sucursal()) then
  raise exception 'SUCURSAL_AJENA';
 end if;
 if p_vista not in ('actuales','anteriores','historial') or p_vista is null
    or p_limite is null or p_limite not between 1 and 100
    or p_filtros is null or jsonb_typeof(p_filtros)<>'object'
    or octet_length(p_filtros::text)>2000 then raise exception 'FILTRO_INVALIDO'; end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or p_cursor->>'sucursal' is distinct from coalesce(p_sucursal::text,'todas')
     or p_cursor->>'vista' is distinct from p_vista or p_cursor->'filtros' is distinct from p_filtros then raise exception 'CURSOR_INVALIDO'; end if;
  limite_creacion := (p_cursor->>'hasta')::timestamptz;
  despues_fecha := (p_cursor->>'fecha')::date;
  despues_hora := (p_cursor->>'hora')::integer;
  despues_id := (p_cursor->>'id')::uuid;
  if limite_creacion is null or despues_fecha is null or despues_hora is null or despues_id is null then raise exception 'CURSOR_INVALIDO'; end if;
 end if;
 with base as materialized (
  select p.*, coalesce(p.saldo_pendiente,p.resta) saldo_lista,
   greatest(p.fecha_entrega+2,coalesce((p.fecha_pago_completo at time zone 'America/Mexico_City')::date,p.fecha_entrega+2)) paso_anterior,
   coalesce(p.fecha_entrega,'9999-12-31'::date) orden_fecha,
   case when btrim(p.hora_entrega) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        then extract(epoch from btrim(p.hora_entrega)::time)::integer else 86400 end orden_hora
  from public.pedidos p
  where (p_sucursal is null or p.sucursal_id=p_sucursal)
    and p.created_at<=limite_creacion
    and coalesce(p.tipo_pedido,'pastel_personalizado')='pastel_personalizado'
 ), clasificados as materialized (
  select b.*,case when estado='cancelado' then 'historial'
   when fecha_entrega is not null and total_final>0 and saldo_lista is not null and saldo_lista<=0.005
        and paso_anterior<=hoy then case when paso_anterior+30<=hoy then 'historial' else 'anteriores' end
   else 'actuales' end seccion_lista
  from base b
 ), filtrados as materialized (
  select c.* from clasificados c
  where (p_vista='historial' or seccion_lista=p_vista)
   and (coalesce(p_filtros->>'estado','todos')='todos' or estado=p_filtros->>'estado')
   and (coalesce(p_filtros->>'origen','todos')='todos' or origen=p_filtros->>'origen')
   and (coalesce(p_filtros->>'pago','todos')='todos'
    or (p_filtros->>'pago'='con_abono' and coalesce(total_abonado,a_cuenta,0)>0)
    or (p_filtros->>'pago'='sin_abono' and coalesce(total_abonado,a_cuenta,0)<=0))
   and (nullif(p_filtros->>'desde','') is null or fecha_entrega>=(p_filtros->>'desde')::date)
   and (nullif(p_filtros->>'hasta','') is null or fecha_entrega<=(p_filtros->>'hasta')::date)
   and (coalesce(p_filtros->>'hora','todos')='todos'
    or (p_filtros->>'hora'='sin_hora' and orden_hora=86400)
    or (p_filtros->>'hora'='manana' and orden_hora<43200)
    or (p_filtros->>'hora'='tarde' and orden_hora>=43200 and orden_hora<64800)
    or (p_filtros->>'hora'='noche' and orden_hora>=64800 and orden_hora<86400))
   and (coalesce(btrim(p_filtros->>'busqueda'),'')='' or
    position(lower(btrim(p_filtros->>'busqueda')) in lower(concat_ws(' ',folio,cliente_nombre,cliente_telefono,nota_interna)))>0)
 ), pagina as materialized (
  select f.* from filtrados f
  where despues_id is null or (orden_fecha,orden_hora,id)>(despues_fecha,despues_hora,despues_id)
  order by orden_fecha,orden_hora,id limit p_limite
 ), ultimo as (select * from pagina order by orden_fecha desc,orden_hora desc,id desc limit 1)
 select jsonb_build_object(
  'pedidos',coalesce((select jsonb_agg(to_jsonb(p)-'saldo_lista'-'orden_fecha'-'orden_hora' order by orden_fecha,orden_hora,id) from pagina p),'[]'::jsonb),
  'total',(select count(*) from filtrados),
  'hoy',hoy,
  'conteos',jsonb_build_object('actuales',(select count(*) from clasificados where seccion_lista='actuales'),
    'anteriores',(select count(*) from clasificados where seccion_lista='anteriores'),
    'historial',(select count(*) from clasificados)),
  'hay_mas',exists(select 1 from filtrados f,ultimo u where (f.orden_fecha,f.orden_hora,f.id)>(u.orden_fecha,u.orden_hora,u.id)),
  'siguiente',(select jsonb_build_object('fecha',orden_fecha,'hora',orden_hora,'id',id,'hasta',limite_creacion,
    'sucursal',coalesce(p_sucursal::text,'todas'),'vista',p_vista,'filtros',p_filtros) from ultimo)
 ) into resultado;
 return resultado;
end $$;
revoke all on function public.listar_pedidos_pastel_pos(uuid,text,jsonb,integer,jsonb) from public,anon;
grant execute on function public.listar_pedidos_pastel_pos(uuid,text,jsonb,integer,jsonb) to authenticated;

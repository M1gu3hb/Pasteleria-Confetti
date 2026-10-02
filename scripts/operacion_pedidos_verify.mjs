import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=new PGlite();
try {
 await db.exec(fs.readFileSync(new URL('./fixtures/operacion_bootstrap.sql',import.meta.url),'utf8'));
 for (const name of ['20261001234206_operaciones_pedidos_atomicas.sql','20261001234848_cortes_folios_reportes_atomicos.sql','20261001235227_venta_intencion_resumen_periodo.sql','20261002175251_auditoria_integridad_operativa.sql']) {
  await db.exec('BEGIN;'+fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')+'COMMIT;');
  console.log('MIGRATION OK',name);
 }
 await db.exec(`INSERT INTO sucursales(id,nombre,folio_prefijo) VALUES ('00000000-0000-4000-8000-000000000001','Sucursal prueba A','A'),('00000000-0000-4000-8000-000000000002','Sucursal prueba B','B');
 INSERT INTO usuarios_pos(auth_user_id,nombre,rol,sucursal_id,activo) VALUES('00000000-0000-4000-8000-000000000010','Terminal prueba','caja','00000000-0000-4000-8000-000000000001',false);
 SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false);
 INSERT INTO cortes_caja(id,folio,sucursal_id,fecha_inicio,fecha_apertura) VALUES('00000000-0000-4000-8000-000000000100','CONF-A-C001','00000000-0000-4000-8000-000000000001',now(),now());`);
 const intent={clave:'test-new-order-0001',accion:'crear',sucursal_id:'00000000-0000-4000-8000-000000000001',corte_id:'00000000-0000-4000-8000-000000000100',monto:100,pago:{metodo_pago:'efectivo',monto_efectivo:100,monto_tarjeta:0,monto_transferencia:0},pedido:{cliente_nombre:'Fixture',cliente_telefono:'0000000000',kilos:1,total_final:300,subtotal_pastel:300,total_calculado:300}};
 const call=async(x)=>(await db.query('select public.operacion_pedido_tx($1::jsonb) as resultado',[JSON.stringify(x)])).rows[0].resultado;
 const a=await call(intent); console.log('CREATE RESULT',a.pedido.folio,a.totalAbonado,a.saldoPendiente);
 const b=await call(intent);if(!b.idempotentHit||b.pedido.id!==a.pedido.id)throw Error('Retry failed');
 console.log('RETRY OK');
 const pid=a.pedido.id;
 await assert.rejects(()=>db.query('update pedidos set total_final=null where id=$1',[pid]),/TOTAL_INVALIDO/);
 await assert.rejects(()=>db.query("update pedidos set total_final='NaN'::numeric where id=$1",[pid]),/TOTAL_INVALIDO/);
 await db.query("update pedidos set estado='pagado',saldo_pendiente=0 where id=$1",[pid]);
 assert.equal(Number((await db.query('select saldo_pendiente from pedidos where id=$1',[pid])).rows[0].saldo_pendiente),200);
 await assert.rejects(()=>db.query("update pedidos set estado='entregado' where id=$1",[pid]),/SALDO_PENDIENTE/);
 await assert.rejects(()=>db.query('update detalle_venta set cantidad=20 where venta_id=$1',[a.ventaId]),/DETALLE_VENTA_PROTEGIDO/);
 console.log('NULL/NAN/FAKE PAID STATE/DELIVERY/PAID DETAIL REJECTED OK');
 await db.query('update pedidos set total_final=200 where id=$1',[pid]);
 const c=(await db.query('select total_abonado,saldo_pendiente from pedidos where id=$1',[pid])).rows[0];
 if(Number(c.saldo_pendiente)!==100||Number(c.total_abonado)!==100)throw Error('Price edit lost payment');console.log('PRICE EDIT OK');
 const refund={clave:'test-refund-0001',accion:'devolucion',sucursal_id:intent.sucursal_id,corte_id:intent.corte_id,pedido_id:pid,monto:0,motivo:'Fixture cancelación'};
 const d=await call(refund),e=await call(refund); if(d.montoDevuelto!==100||!e.idempotentHit)throw Error('Refund retry failed');console.log('REFUND OK');
 const cut=(await db.query('select datos_corte_pos($1) as x',[intent.corte_id])).rows[0].x;
 if(cut.ventas.length!==1||cut.detalles.length!==1||cut.abonos.length!==2)throw Error('Cut source mismatch');console.log('CUT SOURCE OK');
 await db.query(`update cortes_caja set estado='cerrado',fecha_cierre=now(),numero_ventas=1,total_general=100,total_efectivo=100,efectivo_esperado=0 where id=$1`,[intent.corte_id]);
 console.log('CLOSE OK');
 await assert.rejects(()=>db.query('update detalle_venta set subtotal=999 where venta_id=$1',[a.ventaId]),/CORTE_CERRADO/);
 console.log('CLOSED CUT DETAIL IMMUTABLE OK');
 try {await call({...intent,clave:'test-new-order-0002'});throw Error('Closed cut accepted');}catch(err){if(!err.message.includes('CORTE_NO_ABIERTO'))throw err;}
 console.log('CLOSED CUT REJECTS NEW PAYMENT OK');

 // Fail AFTER each write, including the final durable-intent write. All
 // business rows and counters must roll back together, then retry once.
 await db.exec(`CREATE FUNCTION inject_operation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('confetti_test.fail',true)=TG_TABLE_NAME||':'||TG_OP THEN RAISE EXCEPTION 'INJECTED'; END IF; RETURN NEW; END $$;`);
 for(const table of ['pedidos','ventas','detalle_venta','abonos']) {
  await db.exec(`CREATE TRIGGER zz_inject_failure AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION inject_operation_failure();`);
 }
 await db.exec(`CREATE TRIGGER zz_inject_failure AFTER INSERT ON app_private.operaciones_pedido FOR EACH ROW EXECUTE FUNCTION inject_operation_failure();
 INSERT INTO cortes_caja(id,folio,sucursal_id,fecha_inicio,fecha_apertura) VALUES('00000000-0000-4000-8000-000000000300','CONF-A-C300','00000000-0000-4000-8000-000000000001',now(),now());`);
 const fingerprint=async()=>(await db.query(`select jsonb_build_object('pedidos',(select count(*) from pedidos),'ventas',(select count(*) from ventas),'detalles',(select count(*) from detalle_venta),'abonos',(select count(*) from abonos),'intenciones',(select count(*) from app_private.operaciones_pedido),'contador',(select jsonb_agg(to_jsonb(c) order by tipo) from folio_contador c)) as x`)).rows[0].x;
 for(const point of ['pedidos:INSERT','ventas:INSERT','detalle_venta:INSERT','abonos:INSERT','pedidos:UPDATE','operaciones_pedido:INSERT']) {
  const x={...intent,clave:'fault-test-'+point,corte_id:'00000000-0000-4000-8000-000000000300'};
  const before=await fingerprint();
  await db.query("select set_config('confetti_test.fail',$1,false)",[point]);
  await assert.rejects(()=>call(x),/INJECTED/);
  assert.deepEqual(await fingerprint(),before,'Partial financial write at '+point);
  await db.query("select set_config('confetti_test.fail','',false)");
  const confirmed=await call(x),retry=await call(x);
  assert.equal(confirmed.totalAbonado,100);assert.equal(retry.idempotentHit,true);assert.equal(retry.pedido.id,confirmed.pedido.id);
  console.log('ATOMIC FAILURE AND RETRY OK',point);
 }
 // Bound payloads reject key reuse with a different amount.
 await assert.rejects(()=>call({...intent,monto:50}),/INTENCION_DISTINTA/);
 // A recognized historical credit is kept distinct from new cash receipts.
 await db.exec(`select set_config('request.jwt.claim.sub','',false);
 INSERT INTO pedidos(id,folio,sucursal_id,cliente_nombre,cliente_telefono,kilos,total_final,total_abonado,saldo_pendiente,credito_historico) VALUES('00000000-0000-4000-8000-000000000400','PP-A-0400','00000000-0000-4000-8000-000000000001','Fixture histórico','0000000000',1,500,250,250,250);
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false);
 UPDATE pedidos SET total_final=600 WHERE id='00000000-0000-4000-8000-000000000400';`);
 const historical=await call({clave:'historical-credit-new-payment',accion:'pago',pedido_id:'00000000-0000-4000-8000-000000000400',sucursal_id:intent.sucursal_id,corte_id:'00000000-0000-4000-8000-000000000300',monto:100,pago:intent.pago});
 assert.equal(historical.totalAbonado,350);assert.equal(historical.saldoPendiente,250);
 await assert.rejects(()=>call({...refund,clave:'historical-credit-refund',pedido_id:historical.pedido.id,corte_id:'00000000-0000-4000-8000-000000000300'}),/CONCILIAR_ANTICIPO_HISTORICO/);
 await db.query('select reservar_folio_pos($1,$2)',['corte',intent.sucursal_id]);
 await db.exec("update folio_contador set ultimo_numero=9999 where tipo='venta'; update folio_contador set ultimo_numero=999 where tipo='corte';");
 const boundaries=(await db.query('select reservar_folio_pos($1,$2) as venta,reservar_folio_pos($3,$2) as corte',['venta',intent.sucursal_id,'corte'])).rows[0];
 assert.equal(boundaries.venta,'CONF-A-V10000');assert.equal(boundaries.corte,'CONF-A-C1000');
 console.log('HISTORICAL CREDIT AND UNTRUNCATED FOLIOS OK');
 await db.exec(`select set_config('request.jwt.claim.sub','',false);
 INSERT INTO usuarios_pos(auth_user_id,nombre,rol,activo) VALUES('00000000-0000-4000-8000-000000000030','Dueño fixture','dueño',true);
 INSERT INTO cortes_caja(id,folio,sucursal_id,fecha_inicio,fecha_apertura) VALUES('00000000-0000-4000-8000-000000000500','CONF-B-C001','00000000-0000-4000-8000-000000000002',now(),now());
 INSERT INTO ventas(folio,sucursal_id,corte_caja_id,estado,total,monto_efectivo,metodo_pago,fecha_cierre) SELECT 'CONF-B-V'||n,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000500','pagada',1,1,'efectivo',now() FROM generate_series(1,60001) n;
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000030',false);`);
 await db.exec("create role service_role; create function pos_tiene_sesion() returns boolean language sql as $$select auth.uid() is not null$$");
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261002182241_historial_operativo_consistente.sql',import.meta.url),'utf8'));
 const history=(await db.query('select historial_operativo_pos($1,$2::jsonb) as x',['ventas',JSON.stringify({sucursal_id:'00000000-0000-4000-8000-000000000002',total:{$gte:1}})])).rows[0].x;
 assert.equal(history.length,60001);
 await assert.rejects(()=>db.query('select historial_operativo_pos($1,$2::jsonb)', ['usuarios_pos','{}']),/TABLA_NO_PERMITIDA/);
 await assert.rejects(()=>db.query('select historial_operativo_pos($1,$2::jsonb)', ['ventas',JSON.stringify({'id;drop table ventas':1})]),/CAMPO_NO_PERMITIDO/);
 console.log('FINANCIAL SNAPSHOT INCLUDES ALL 60001 ROWS AND REJECTS UNKNOWN TABLE/FILTER OK');
 const stress=(await db.query("select resumen_periodo_pos(now()-interval '1 hour',now()+interval '1 hour','00000000-0000-4000-8000-000000000002') as r")).rows[0].r;
 assert.equal(stress.nVentas,60001);assert.equal(stress.ingresos,60001);
 const canonical=(await db.query("select datos_corte_pos('00000000-0000-4000-8000-000000000500') as r")).rows[0].r;
 assert.equal(canonical.ventas.length,60001);assert(canonical.ventas.every(v=>v.sucursal_id==='00000000-0000-4000-8000-000000000002'));
 console.log('PERIOD AGGREGATE AND CANONICAL CUT INCLUDE ALL 60001 ROWS OK');


}catch(e){console.error(e.message,e.detail,e.where,'position',e.position);console.error(e.query?.slice(Math.max(0,Number(e.position)-100),Number(e.position)+100));process.exitCode=1;}
await db.close();

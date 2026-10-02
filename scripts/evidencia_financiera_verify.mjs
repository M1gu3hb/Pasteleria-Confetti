import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const db=new PGlite({extensions:{pgcrypto}});
const migration='20261002220904_evidencia_financiera_pos.sql';
try {
 await db.exec(read('scripts/fixtures/autoridad_bootstrap.sql'));
 for(const n of ['20261001234206_operaciones_pedidos_atomicas.sql','20261001234848_cortes_folios_reportes_atomicos.sql','20261001235227_venta_intencion_resumen_periodo.sql','20261002175251_auditoria_integridad_operativa.sql','20261002175257_autoridad_login_entrada_publica.sql','20261002182241_historial_operativo_consistente.sql','20261002203034_proteger_ventas_confirmadas.sql','20261002212424_distinguir_abonos_historicos_conciliacion.sql'])await db.exec('begin;'+read('supabase/migrations/'+n)+'commit;');
 const A=randomUUID(),B=randomUUID(),OWNER=randomUUID(),TERM=randomUUID(),CUT=randomUUID(),SALE=randomUUID(),D=randomUUID(),PID=randomUUID();
 await db.query("insert into sucursales(id,nombre,folio_prefijo) values($1,'A','A'),($2,'B','B')",[A,B]);
 await db.query("insert into auth.users(id,email) values($1,'owner@fixture.local'),($2,'terminal@fixture.local')",[OWNER,TERM]);
 await db.query("insert into usuarios_pos(id,auth_user_id,nombre,rol,activo,sucursal_id) values($1,$1,'Owner','dueño',true,$3),($2,$2,'Terminal','caja',false,$3)",[OWNER,TERM,A]);
 await db.query('insert into app_private.terminales_pos(auth_user_id,sucursal_id) values($1,$2)',[TERM,A]);
 const who=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 await db.query("insert into cortes_caja(id,folio,sucursal_id,fecha_inicio,fecha_apertura) values($1,'CONF-A-C001',$2,now(),now())",[CUT,A]);
 await db.query("insert into ventas(id,folio,sucursal_id,corte_caja_id,estado,total,subtotal,monto_efectivo,metodo_pago) values($1,'CONF-A-V0001',$2,$3,'cancelada',100,100,100,'efectivo')",[SALE,A,CUT]);
 await db.query("insert into detalle_venta(id,venta_id,producto_nombre,cantidad,subtotal,precio_unitario_snapshot) values($1,$2,'Original',1,100,100)",[D,SALE]);
 await db.query("insert into pedidos(id,folio,sucursal_id,cliente_nombre,cliente_telefono,total_final) values($1,'PP-A-0001',$2,'Private name','0000000000',100)",[PID,A]);
 await who(OWNER);
 await db.query("update ventas set motivo_cancelacion='Original',tipo_cancelacion='devolucion',monto_devuelto=100,fecha_cancelacion='2000-01-01' where id=$1",[SALE]);
 await db.query('update detalle_venta set subtotal=999 where id=$1',[D]);
 assert.equal((await db.query('select subtotal from detalle_venta where id=$1',[D])).rows[0].subtotal,'999');
 await db.query('update detalle_venta set subtotal=100 where id=$1',[D]);
 console.log('WITNESS: previous SQL permits rewriting cancellation evidence and cancelled receipt subtotal');
 await db.exec('begin;'+read('supabase/migrations/'+migration)+'commit;');
 assert.equal((await db.query("select count(*)::int n from app_private.eventos_financieros_pos where accion='OBSERVADO'")).rows[0].n,4);
 assert.equal((await db.query("select posterior ? 'cliente_telefono' as pii from app_private.eventos_financieros_pos where entidad='pedidos'")).rows[0].pii,false);
 for(const q of ["update ventas set motivo_cancelacion='Changed' where id=$1","update ventas set tipo_cancelacion='cancelacion',monto_devuelto=0 where id=$1","update ventas set cancelado_por_nombre='Fake' where id=$1","update ventas set fecha_cancelacion=now() where id=$1"])await assert.rejects(()=>db.query(q,[SALE]),/CANCELACION_PROTEGIDA/);
 await assert.rejects(()=>db.query('update detalle_venta set subtotal=999 where id=$1',[D]),/DETALLE_VENTA_PROTEGIDO/);
 await assert.rejects(()=>db.query("update ventas set idempotency_key='changed' where id=$1",[SALE]),/EVIDENCIA_COBRO_PROTEGIDA/);
 await assert.rejects(()=>db.query("update ventas set intencion_datos='{}' where id=$1",[SALE]),/EVIDENCIA_COBRO_PROTEGIDA/);
 await assert.rejects(()=>db.query("update ventas set created_at='2000-01-01' where id=$1",[SALE]),/EVIDENCIA_COBRO_PROTEGIDA/);
 await db.exec('grant update on pedidos to authenticated;');
 await db.exec('SET ROLE authenticated');await assert.rejects(()=>db.query('delete from pedidos where id=$1',[PID]),/permission denied/);await db.exec('RESET ROLE');
 await db.query("update pedidos set estado='cancelado',tipo_cancelacion='cancelacion',motivo_cancelacion='Fixture',fecha_cancelacion='2000-01-01',cancelado_por_nombre='Fake' where id=$1",[PID]);
 const stamp=(await db.query('select fecha_cancelacion,cancelado_por_nombre from pedidos where id=$1',[PID])).rows[0];assert.notEqual(new Date(stamp.fecha_cancelacion).getUTCFullYear(),2000);assert.equal(stamp.cancelado_por_nombre,'Owner');
 await assert.rejects(()=>db.query("update pedidos set motivo_cancelacion='Changed' where id=$1",[PID]),/CANCELACION_PROTEGIDA/);
 await assert.rejects(()=>db.query('update pedidos set monto_devuelto=100 where id=$1',[PID]),/CANCELACION_PROTEGIDA|DEVOLUCION_TRANSACCIONAL/);
 await assert.rejects(()=>db.exec("update app_private.eventos_financieros_pos set origen='humano'"),/EVIDENCIA_SOLO_ANEXAR/);
 await assert.rejects(()=>db.exec('delete from app_private.eventos_financieros_pos'),/EVIDENCIA_SOLO_ANEXAR/);
 await assert.rejects(()=>db.exec('truncate app_private.eventos_financieros_pos'),/EVIDENCIA_SOLO_ANEXAR/);
 console.log('PASS: cancellation actor/date server stamped, cancellation evidence and cancelled detail protected, orders cannot disappear, journal cannot be rewritten/deleted/truncated');

 // A real money RPC still succeeds, and replay creates no business/audit rows.
 await who(TERM);
 const intent={clave:'evidence-create-'+randomUUID(),accion:'crear',sucursal_id:A,corte_id:CUT,monto:100,pago:{metodo_pago:'efectivo',monto_efectivo:100,monto_tarjeta:0,monto_transferencia:0},pedido:{cliente_nombre:'Private','cliente_telefono':'0000000000',kilos:1,total_final:300}};
 const call=async p=>(await db.query('select operacion_pedido_tx($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
 const result=await call(intent);
 const count=async()=>(await db.query('select count(*)::int n from app_private.eventos_financieros_pos')).rows[0].n;
 const n=await count();assert((await call(intent)).idempotentHit);assert.equal(await count(),n);
 const ledger=(await db.query("select * from app_private.eventos_financieros_pos where entidad='abonos' and registro_id=$1",[result.abonoId])).rows[0];assert.equal(ledger.actor_auth,TERM);assert.equal(ledger.origen,'terminal');assert.equal(ledger.posterior.monto,100);assert.equal(ledger.posterior.venta_id,result.ventaId);
 const refund={clave:'evidence-refund-'+randomUUID(),accion:'devolucion',sucursal_id:A,corte_id:CUT,pedido_id:result.pedido.id,monto:0,motivo:'Fixture refund'};
 const returned=await call(refund);assert.equal(returned.montoDevuelto,100);const afterRefund=await count();assert((await call(refund)).idempotentHit);assert.equal(await count(),afterRefund);
 await who(OWNER);await db.exec('SET ROLE authenticated');
 const timeline=(await db.query('select historial_evidencia_pos($1,$2) r',['pedidos',result.pedido.id])).rows[0].r;
 assert(timeline.eventos.some(e=>e.entidad==='ventas'&&e.registro_id===result.ventaId));assert(timeline.eventos.some(e=>e.entidad==='detalle_venta'));assert(timeline.eventos.some(e=>e.posterior?.monto===-100));assert(timeline.eventos.every(e=>typeof e.id==='string'));
 await assert.rejects(()=>db.query('select * from app_private.eventos_financieros_pos'),/permission denied/);await db.exec('RESET ROLE');
 console.log('PASS: actual payment/refund RPC and idempotent replay; authenticated actor separate from reported cashier; order timeline includes linked receipt/product/payment/refund; no private PII copy');

 await who(TERM);
 const directa=async key=>(await db.query('select crear_venta_directa_tx($1::jsonb,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',[
  JSON.stringify({total:75,subtotal:75}),JSON.stringify([{producto_nombre:'Fixture direct',cantidad:1,precio_unitario_snapshot:75,subtotal:75,costo_unitario_snapshot:0}]),'efectivo',75,0,0,0,CUT,A,'A','empleado_terminal','Employee',key])).rows[0].r;
 const directKey='direct-evidence-'+randomUUID(),direct=await directa(directKey);const directCount=await count();assert.equal((await directa(directKey)).venta_id,direct.venta_id);assert.equal(await count(),directCount);
 const directAudit=(await db.query("select posterior from app_private.eventos_financieros_pos where entidad='ventas' and registro_id=$1",[direct.venta_id])).rows[0].posterior;assert.equal(directAudit.total,75);assert.equal(directAudit.idempotency_key,directKey);assert.equal(typeof directAudit.intencion_hash,'string');
 console.log('PASS: actual direct sale RPC keeps canonical idempotent receipt and audit payload fingerprint without new events on replay');

 // Failure of the audit write rolls back the entire financial RPC, not just log.
 await who(TERM);
 await db.exec("create function test_audit_failure() returns trigger language plpgsql as $$begin if current_setting('test.audit_fail',true)='yes' then raise exception 'AUDIT_INJECTED'; end if; return NEW; end $$; create trigger test_audit_failure after insert on app_private.eventos_financieros_pos for each row execute function test_audit_failure();");
 const fingerprint=async()=>(await db.query("select jsonb_build_object('p',(select count(*) from pedidos),'a',(select count(*) from abonos),'v',(select count(*) from ventas),'d',(select count(*) from detalle_venta),'e',(select count(*) from app_private.eventos_financieros_pos),'i',(select count(*) from app_private.operaciones_pedido)) r")).rows[0].r;
 const before=await fingerprint();await db.exec("select set_config('test.audit_fail','yes',false)");await assert.rejects(()=>call({...intent,clave:'audit-failure-'+randomUUID()}),/AUDIT_INJECTED/);assert.deepEqual(await fingerprint(),before);await db.exec("select set_config('test.audit_fail','',false)");
 console.log('PASS: audit failure rolls back all money/business/intent rows');

 // Existing privileged correction is journaled with its real before/after.
 await who('');await db.query("update ventas set motivo_cancelacion='Privileged correction' where id=$1",[SALE]);
 const corrected=(await db.query("select * from app_private.eventos_financieros_pos where entidad='ventas' and registro_id=$1 order by id desc limit 1",[SALE])).rows[0];assert.equal(corrected.origen,'sql_privilegiado');assert.equal(corrected.anterior.motivo_cancelacion,'Original');assert.equal(corrected.posterior.motivo_cancelacion,'Privileged correction');
 // Historical cancelled pair: evidence reconstruction changes ZERO balances.
 await db.query("insert into abonos(pedido_id,sucursal_id,monto,metodo_pago,afecta_caja,corte_caja_id,venta_id,monto_efectivo) values($1,$2,100,'efectivo',true,$3,$4,100)",[PID,A,CUT,SALE]);
 await who(OWNER);await db.exec('SET ROLE authenticated');
 const e=(await db.query('select conciliacion_operativa_pos() r')).rows[0].r.pagos_con_venta_cancelada[0];assert.equal(e.motivo,'Privileged correction');assert.equal(e.devuelto_registrado,100);assert.equal(e.devoluciones_libro,0);assert.equal(e.venta_id,SALE);
 await db.exec('RESET ROLE');await who(TERM);await db.exec('SET ROLE authenticated');await assert.rejects(()=>db.query('select historial_evidencia_pos($1,$2)',['ventas',SALE]),/SOLO_DUENO/);await db.exec('RESET ROLE');await who('');await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('select historial_evidencia_pos($1,$2)',['ventas',SALE]),/permission denied/);await db.exec('RESET ROLE');
 await who(OWNER);
 // >100 events, cursor boundary, concurrent newer insert, each existing id once.
 for(let i=0;i<205;i++){await who('');await db.query('update ventas set motivo_cancelacion=$1 where id=$2',['Historical audited change '+i,SALE]);}
 await who(OWNER);const page1=(await db.query('select historial_evidencia_pos($1,$2) r',['ventas',SALE])).rows[0].r;assert.equal(page1.eventos.length,100);assert(page1.siguiente);
 await who('');await db.query("update ventas set motivo_cancelacion='New concurrent' where id=$1",[SALE]);await who(OWNER);
 let all=[...page1.eventos],page=page1;while(page.siguiente){page=(await db.query('select historial_evidencia_pos($1,$2,$3,$4) r',['ventas',SALE,page.siguiente,page1.hasta])).rows[0].r;all.push(...page.eventos);}
 assert.equal(new Set(all.map(e=>e.id)).size,all.length);assert(all.every(e=>BigInt(e.id)<=BigInt(page1.hasta)));assert.equal(all.length,(await db.query("select count(*)::int n from app_private.eventos_financieros_pos where (registro_id=$1 or venta_id=$1) and id<=$2",[SALE,page1.hasta])).rows[0].n);
 console.log('PASS: owner-only internal evidence reconstructs historical refund without modifying money; 100-row seek pages complete, unique and bounded under newer events');

 // The historical contradiction used to enable a second refund/cash charge.
 // Keep a confirmed replay recoverable even if its receipt is later anomalous.
 await who(TERM);const historical=await call({...intent,clave:'historical-contradiction-'+randomUUID()});
 await who('');await db.query("update ventas set estado='cancelada',tipo_cancelacion='devolucion',monto_devuelto=100,motivo_cancelacion='Old contradictory route' where id=$1",[historical.ventaId]);
 const conflicted={accion:'devolucion',pedido_id:historical.pedido.id,sucursal_id:A,corte_id:CUT,monto:0,motivo:'Try second refund',clave:'second-refund-'+randomUUID()};
 // Invoke the old function directly only in this isolated database as witness.
 await who(TERM);await db.exec('begin');const oldRefund=(await db.query('select app_private.operacion_pedido_tx_base($1::jsonb) r',[JSON.stringify(conflicted)])).rows[0].r;assert.equal(oldRefund.montoDevuelto,100);await db.exec('rollback');
 const beforeConflict=await fingerprint();await assert.rejects(()=>call(conflicted),/CONCILIAR_PAGO_CANCELADO/);
 await assert.rejects(()=>call({...conflicted,accion:'pago',monto:50,pago:{metodo_pago:'efectivo',monto_efectivo:50},clave:'charge-conflict-'+randomUUID()}),/CONCILIAR_PAGO_CANCELADO/);
 await assert.rejects(()=>db.query("update pedidos set estado='entregado' where id=$1",[historical.pedido.id]),/CONCILIAR_PAGO_CANCELADO/);
 assert.deepEqual(await fingerprint(),beforeConflict);assert((await call({...intent,clave:(await db.query('select clave from app_private.operaciones_pedido where resultado->\'pedido\'->>\'id\'=$1',[historical.pedido.id])).rows[0].clave})).idempotentHit);
 console.log('WITNESS/PASS: previous RPC refunds cancelled payment again; wrapper blocks new cash/refund/delivery, preserves confirmed retry and all historical money');
} catch(e){console.error(e.message,e.where,e.detail);process.exitCode=1;}finally{await db.close();}

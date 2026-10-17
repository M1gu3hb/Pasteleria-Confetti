import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(read('scripts/fixtures/autoridad_bootstrap.sql'));
  for (const file of ['20261001234206_operaciones_pedidos_atomicas.sql', '20261001234848_cortes_folios_reportes_atomicos.sql',
    '20261001235227_venta_intencion_resumen_periodo.sql', '20261002175251_auditoria_integridad_operativa.sql',
    '20261002175257_autoridad_login_entrada_publica.sql', '20261002182241_historial_operativo_consistente.sql',
    '20261017181425_pedidos_anteriores_historial_lectura.sql']) {
    await db.exec('begin;' + read('supabase/migrations/' + file) + 'commit;');
  }
  const A = randomUUID(), B = randomUUID(), OWNER = randomUUID(), TERM = randomUUID(), BAKER = randomUUID(), MANAGER = randomUUID();
  await db.query("insert into sucursales(id,nombre,folio_prefijo) values($1,'A','A'),($2,'B','B')", [A,B]);
  await db.query("insert into auth.users(id,email) values($1,'owner@test.local'),($2,'terminal@test.local'),($3,'baker@test.local'),($4,'manager@test.local')",[OWNER,TERM,BAKER,MANAGER]);
  await db.query("insert into usuarios_pos(id,auth_user_id,nombre,rol,activo,sucursal_id) values($1,$1,'Owner','dueño',true,null),($2,$2,'Technical','caja',false,$5),($3,$3,'Baker','pastelero',true,null),($4,$4,'Manager','administrador',true,$6)",[OWNER,TERM,BAKER,MANAGER,A,B]);
  await db.query('insert into app_private.terminales_pos(auth_user_id,sucursal_id) values($1,$2)',[TERM,A]);
  const identity = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
  const today = (await db.query("select (now() at time zone 'America/Mexico_City')::date::text d")).rows[0].d;
  const date = n => new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const insert = async (tag, { days = -3, paid = true, paidDays = -4, state = paid ? 'pagado' : 'con_anticipo', branch = A, hour = '15:00', type = 'pastel_personalizado' } = {}) => {
    const id = randomUUID();
    await db.query(`insert into pedidos(id,folio,sucursal_id,cliente_nombre,cliente_telefono,kilos,total_final,credito_historico,estado,fecha_entrega,hora_entrega,fecha_pago_completo,tipo_pedido)
      values($1,$2,$3,'Fixture','5500000000',1,100,$4,$5,$6,$7,$8,$9)`,
      [id,tag,branch,paid?100:0,state,days===null?null:date(days),hour,paidDays===null?null:date(paidDays)+'T12:00:00-06:00',type]);
    return id;
  };
  const oldPaid = await insert('OLD-PAID');
  const lateUnpaid = await insert('LATE-UNPAID',{paid:false});
  const futurePaid = await insert('FUTURE-PAID',{days:4});
  const grace = await insert('GRACE',{days:-1});
  const boundary = await insert('BOUNDARY',{days:-2});
  const archive = await insert('ARCHIVE',{days:-32,paidDays:-40});
  const recentLatePayment = await insert('LATE-PAYMENT',{days:-80,paidDays:0});
  const oldDeliveredFuture = await insert('ACCIDENTAL-DELIVERY',{days:4,state:'entregado'});
  const noDate = await insert('NO-DATE',{days:null});
  const legacy = await insert('LEGACY',{paidDays:null});
  const cancelled = await insert('CANCELLED',{state:'cancelado'});
  const foreign = await insert('FOREIGN',{branch:B});
  await insert('CATALOGUE',{type:'productos_catalogo'});
  const snapshot = async () => (await db.query('select jsonb_agg(to_jsonb(p) order by id) x from pedidos p')).rows[0].x;
  const original = await snapshot();
  const call = async (vista='actuales',filters={},cursor=null,branch=A,size=50) => (await db.query('select listar_pedidos_pastel_pos($1,$2,$3::jsonb,$4,$5::jsonb) x',[branch,vista,JSON.stringify(filters),size,cursor===null?null:JSON.stringify(cursor)])).rows[0].x;
  await identity(TERM);
  const current = await call(), previous = await call('anteriores'), history = await call('historial');
  const ids = r => r.pedidos.map(p=>p.id);
  assert.deepEqual(new Set(ids(current)),new Set([lateUnpaid,futurePaid,grace,oldDeliveredFuture,noDate]));
  assert.deepEqual(new Set(ids(previous)),new Set([oldPaid,boundary,recentLatePayment,legacy]));
  assert(ids(history).includes(archive)); assert(ids(history).includes(cancelled)); assert(!ids(history).includes(foreign));
  assert.equal(current.conteos.actuales,5); assert.equal(current.conteos.anteriores,4); assert.equal(history.total,11);
  assert.equal((await call('historial',{busqueda:'ARCHIVE'})).pedidos[0].id,archive);
  assert.equal((await call('actuales',{busqueda:'FOREIGN'})).total,0);
  assert.equal((await call('actuales',{desde:date(4),hasta:date(4)})).total,2);
  assert.equal((await call('anteriores',{hora:'noche'})).total,0);
  await assert.rejects(()=>call('historial',{},null,B),/SUCURSAL_AJENA/);
  await assert.rejects(()=>call('historial',{},null,null),/SUCURSAL_AJENA/);
  await identity(MANAGER); assert.equal((await call('historial',{},null,B)).total,1);
  await assert.rejects(()=>call(),/SUCURSAL_AJENA/);
  await identity(BAKER); assert.equal((await call('historial',{},null,null)).total,12);
  assert.equal((await call('historial',{},null,A)).total,11);
  await identity(OWNER); assert.equal((await call('historial',{},null,null)).total,12);
  await db.exec('reset role'); assert.deepEqual(await snapshot(),original,'Read/classification must never modify financial rows');
  console.log('PASS: both conditions, grace/30-day boundaries, late payment, legacy delivered/unknown dates, global baker/owner, branch terminals/managers, search and zero data mutations');

  // 1,201 requests of the same date, beyond both old thresholds. Cursor order is
  // date/hour/id, independent of UUID randomness; pages are bounded but history is not.
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.query(`insert into pedidos(id,folio,sucursal_id,cliente_nombre,cliente_telefono,kilos,total_final,credito_historico,estado,fecha_entrega,hora_entrega)
   select gen_random_uuid(),'MANY-'||i,$1,'Many','5500000000',1,100,100,'pagado',$2,'15:00' from generate_series(1,1201)i`,[A,date(-3)]);
  await identity(TERM);
  let page = await call('historial'), found = [], pages = 0;
  const firstCursor = page.siguiente;
  await assert.rejects(()=>call('actuales',{},firstCursor),/CURSOR_INVALIDO/);
  while (true) {
    found.push(...ids(page)); pages++;
    if (!page.hay_mas) break;
    const next = await call('historial',{},page.siguiente);
    assert.notDeepEqual(next.siguiente,page.siguiente);
    page = next;
  }
  assert.equal(found.length,1212); assert.equal(new Set(found).size,1212); assert(pages>24);
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role anon');
  await assert.rejects(()=>call(),/permission denied/);
  await db.exec('reset role'); await db.query('update usuarios_pos set activo=false where id=$1',[BAKER]); await identity(BAKER);
  await assert.rejects(()=>call('historial',{},null,null),/SIN_SESION_ACTIVA/);
  console.log('PASS: all 1,212 branch records reached without duplicate/missing IDs; mismatched cursor, anonymous and disabled session rejected');
} finally { await db.close(); }

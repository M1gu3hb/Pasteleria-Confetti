import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const migration = fs.readdirSync('supabase/migrations').filter(p=>p.endsWith('_codigos_barras_producto.sql'));
assert.equal(migration.length,1);
const db = new PGlite();
try {
 await db.exec(`create schema auth; create schema app_private; create role anon; create role authenticated; create role service_role;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.sucursales(id uuid primary key,activa boolean);
 create table public.usuarios_pos(auth_user_id uuid primary key,activo boolean,rol text,sucursal_id uuid);
 create table app_private.terminales_pos(auth_user_id uuid primary key,sucursal_id uuid,habilitada boolean);
 insert into sucursales values('00000000-0000-4000-8000-000000000001',true),('00000000-0000-4000-8000-000000000002',true);
 insert into usuarios_pos values
 ('00000000-0000-4000-8000-000000000010',true,'dueño',null),
 ('00000000-0000-4000-8000-000000000011',true,'administrador','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012',false,'caja','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000013',false,'dueño',null);
 insert into app_private.terminales_pos values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',true);
 create table productos(id uuid primary key default gen_random_uuid(),nombre text not null,precio_venta numeric not null default 10,activo boolean not null default true,visible_en_pos boolean not null default true,sucursal_ids uuid[]);
 grant usage on schema auth to authenticated; grant select,insert,update,delete on productos to authenticated;
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false);`);
 // Use the shipped identity helpers and product RLS, not invented role logic.
 const authority=fs.readFileSync('supabase/migrations/20261002175257_autoridad_login_entrada_publica.sql','utf8');
 await db.exec(authority.slice(authority.indexOf('create or replace function public.pos_is_admin()'),authority.indexOf('-- Table grants')));
 await db.exec(`alter table productos enable row level security;
 create policy pos_read_productos on productos for select to authenticated using(public.pos_tiene_sesion());
 create policy pos_write_productos on productos for all to authenticated using(public.pos_is_manager()) with check(public.pos_is_manager());`);
 await db.exec('BEGIN;'+fs.readFileSync('supabase/migrations/'+migration[0],'utf8')+'COMMIT;');
 if(!process.argv.includes('--baseline')) for(const p of fs.readdirSync('supabase/migrations').filter(p=>p.endsWith('_endurecer_codigos_barras.sql'))) await db.exec('BEGIN;'+fs.readFileSync('supabase/migrations/'+p,'utf8')+'COMMIT;');
 if(!process.argv.includes('--baseline')) for(const p of fs.readdirSync('supabase/migrations').filter(p=>p.endsWith('_codigo_canonico.sql'))) await db.exec('BEGIN;'+fs.readFileSync('supabase/migrations/'+p,'utf8')+'COMMIT;');
 const a=(await db.query("insert into productos(nombre) values('A') returning id")).rows[0].id;
 const b=(await db.query("insert into productos(nombre) values('B') returning id")).rows[0].id;
 const assign=async(id,code=null,gen=false)=>(await db.query('select (asignar_codigo_producto_pos($1,$2,$3)).*',[id,code,gen])).rows[0];
 await db.exec('SET ROLE authenticated');
 const first=await assign(a,null,true);assert.match(first.codigo_barras,/^CF\d{8}$/);assert.equal((await assign(a,null,true)).codigo_barras,first.codigo_barras);
 assert.notEqual((await assign(b,null,true)).codigo_barras,first.codigo_barras);
 await assert.rejects(()=>assign(b,first.codigo_barras),/CODIGO_YA_RESERVADO/);
 const external=await assign(a,' 0012345678905\r\n');assert.equal(external.codigo_barras,'0012345678905');
 await assert.rejects(()=>assign(b,first.codigo_barras),/CODIGO_YA_RESERVADO/);
 await assert.rejects(()=>assign(b,'CF99999999'),/PREFIJO_INTERNO_RESERVADO/);
 await assert.rejects(()=>assign(b,'bad<code'),/CODIGO_INVALIDO/);
 await assert.rejects(()=>assign(b,'00 12345'),/CODIGO_INVALIDO/);
 assert.equal((await db.query("select * from buscar_producto_codigo_pos('00123 45678905','00000000-0000-4000-8000-000000000001')")).rows.length,0,'raw internal whitespace must not alias another product');
 await db.query('delete from productos where id=$1',[a]);
 await assert.rejects(()=>assign(b,'0012345678905'),/CODIGO_YA_RESERVADO/);
 // Manager can assign its branch/global products, but never a foreign product.
 const foreign=(await db.query("insert into productos(nombre,sucursal_ids) values('Foreign',array['00000000-0000-4000-8000-000000000002'::uuid]) returning id")).rows[0].id;
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false)");
 await assert.rejects(()=>assign(foreign,null,true),/SUCURSAL_AJENA/);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false)");
 const nullScope=(await db.query("insert into productos(nombre,sucursal_ids) values('Foreign null',array['00000000-0000-4000-8000-000000000002'::uuid,null]) returning id")).rows[0].id;
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false)");
 await assert.rejects(()=>assign(nullScope,null,true),/SUCURSAL_AJENA/,'NULL array members cannot bypass branch checks');
 await assert.rejects(()=>db.query("update productos set codigo_barras='NULLSCOPE' where id=$1",[nullScope]),/SUCURSAL_AJENA/);

 await assert.rejects(()=>db.query("update productos set sucursal_ids=array['00000000-0000-4000-8000-000000000001'::uuid],codigo_barras='FOREIGN123' where id=$1",[foreign]),/SUCURSAL_AJENA/,'manager cannot steal a foreign barcode by moving its branch in the same update');
 await assign(b,'0045678');
 await db.exec('BEGIN');await assign(b,'TEMP123');await db.exec('ROLLBACK');assert.equal((await assign(b,null,true)).codigo_barras,'0045678','rollback retains previous code');
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false)");
 await assert.rejects(()=>assign(b,null,true),/SOLO_ADMINISTRACION/);
 await assert.rejects(()=>db.query("select * from buscar_producto_codigo_pos('1234','00000000-0000-4000-8000-000000000002')"),/SUCURSAL_AJENA/);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false)");
 assert.equal((await db.query("select * from buscar_producto_codigo_pos($1,'00000000-0000-4000-8000-000000000001')",[(await assign(b,'9876543210123')).codigo_barras])).rows.length,1);
 await db.query('update productos set activo=false where id=$1',[b]);assert.equal((await db.query("select * from buscar_producto_codigo_pos('9876543210123','00000000-0000-4000-8000-000000000001')")).rows.length,0);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000013',false)");await assert.rejects(()=>db.query("select * from buscar_producto_codigo_pos('1234','00000000-0000-4000-8000-000000000001')"),/SIN_SESION_ACTIVA/);
 await assert.rejects(()=>db.query('select * from app_private.codigos_producto_reservados'),/permission denied/);
 await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(()=>db.query('select asignar_codigo_producto_pos($1,null,true)',[b]),/permission denied/);
 console.log('PASS: real SQL generation, replay, uniqueness, immutable reservations after replacement/deletion, real identity helpers/RLS, role/branch checks, rollback, inactive lookup and private registry.');
} finally { await db.close(); }

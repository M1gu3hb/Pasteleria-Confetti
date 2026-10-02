import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
let rows=[],cap=100,mutate=null;
class Query {
  constructor(){this.filters=[];this.sorts=[];this.start=0;this.end=Infinity;this.options={};}
  select(_cols,options={}){this.options=options;return this;}
  eq(f,v){this.filters.push(r=>r[f]===v);return this;}
  neq(f,v){this.filters.push(r=>r[f]!==v);return this;}
  gt(f,v){this.filters.push(r=>r[f]>v);return this;}
  gte(f,v){this.filters.push(r=>r[f]>=v);return this;}
  lte(f,v){this.filters.push(r=>r[f]<=v);return this;}
  in(f,v){this.filters.push(r=>v.includes(r[f]));return this;}
  order(f,o){this.sorts.push([f,o.ascending]);return this;}
  limit(n){this.end=n-1;return this;}
  range(a,b){this.start=a;this.end=b;return this;}
  then(resolve,reject){
    let arr=rows.filter(r=>this.filters.every(test=>test(r)));
    const count=arr.length;
    arr.sort((a,b)=>{for(const [f,asc] of this.sorts){if(a[f]!==b[f])return (a[f]<b[f]?-1:1)*(asc?1:-1);}return 0;});
    const data=this.options.head?null:arr.slice(this.start,Math.min(this.end+1,this.start+cap)).map(r=>({...r}));
    if(!this.options.head && mutate){const fn=mutate;mutate=null;fn();}
    return Promise.resolve({data,count:this.options.count?count:null,error:null}).then(resolve,reject);
  }
}
const context=vm.createContext({supabase:{from:()=>new Query()},ensureSession:async()=>{}});
vm.runInContext(read('src/api/entitiesAdapter.js').replace(/^import .*;$/gm,'').replace('export const entities','const entities')+'\nglobalThis.entities=entities;',context);
for (const n of [199,200,201,499,500,501,999,1000,1001,4999,5000,5001,9999,10000,10001]){
 rows=Array.from({length:n},(_,i)=>({id:String(i).padStart(8,'0'),created_at:'2026-10-01T18:00:00Z',sucursal_id:'A'}));
 for(const apiCap of [73,1000]){
  cap=apiCap;
  const all=await context.entities.Venta.listAll('-created_date');
  assert.equal(all.length,n);assert.equal(new Set(all.map(r=>r.id)).size,n);
 }
}
cap=1000;
rows=Array.from({length:501},(_,i)=>({id:String(i).padStart(8,'0'),sucursal_id:'A'}));
const first=await context.entities.Venta.list('id',200,0),second=await context.entities.Venta.list('id',200,200);
assert.equal(first[0].id,'00000000');assert.equal(second[0].id,'00000200');
assert.equal((await context.entities.Venta.filter({sucursal_id:'A'},'id',200,200))[0].id,second[0].id);
cap=73;mutate=()=>rows.pop();
await assert.rejects(()=>context.entities.Venta.listAll('id'),/datos cambiaron/);
console.log('PAGINATION THRESHOLDS, GLOBAL/BRANCH OFFSET, API CAPS AND MUTATION OK');
const fechaCode=read('src/utils/pedidoPastelUtils.js').split('export function fechaCDMX')[1].split('\nfunction parseJsonObj')[0];
const rangeCode=read('src/lib/useResumenPeriodo.js').split('export function rangoDesdePeriodo')[1].split('\n/**')[0];
const dates=vm.createContext({Intl,Date});
vm.runInContext('function fechaCDMX'+fechaCode+'\nfunction rangoDesdePeriodo'+rangeCode+'\nglobalThis.range=rangoDesdePeriodo;',dates);
const priorTZ=process.env.TZ;
for(const tz of ['UTC','America/Mexico_City','America/Los_Angeles','Asia/Tokyo']){
 process.env.TZ=tz;
 const x=dates.range('custom','2026-10-01','2026-10-01',new Date('2026-10-02T02:00:00Z'));
 assert.equal(x.fromIso,'2026-10-01T06:00:00.000Z');assert.equal(x.toIso,'2026-10-02T05:59:59.999Z');
 assert.equal(dates.range('today',null,null,new Date('2026-10-02T02:00:00Z')).fromIso,x.fromIso);
 assert.equal(dates.range('7d',null,null,new Date('2027-01-01T02:00:00Z')).fromIso,'2026-12-25T06:00:00.000Z');
}
if(priorTZ===undefined) delete process.env.TZ;else process.env.TZ=priorTZ;
console.log('CDMX CUSTOM/TODAY/YEAR BOUNDARIES IN FOUR DEVICE TIMEZONES OK');
const store=new Map();
const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const session=()=>{const ctx=vm.createContext({localStorage,crypto:{randomUUID}});vm.runInContext(read('src/utils/intencionPersistente.js').replace(/export /g,'')+'\nglobalThis.run=ejecutarIntencion;',ctx);return ctx;};
let committed=0;const keys=new Map();
const execute=async x=>{if(!keys.has(x.clave)){committed++;keys.set(x.clave,{folio:'CANONICAL',total:x.monto});}return keys.get(x.clave);};
await assert.rejects(()=>session().run('pago:A:1',{monto:100},async x=>{await execute(x);throw new Error('Response lost AFTER COMMIT');}),/Response lost/);
assert.equal(committed,1);
const recovered=await session().run('pago:A:1',{monto:250},execute);
assert.equal(committed,1);assert.equal(recovered.total,100);assert.equal(recovered.montoRegistrado,100);assert.equal(recovered.intencionRecuperada,true);assert.equal(store.size,0);
const ctx=session();await Promise.all([ctx.run('sale:A',{monto:50},execute),ctx.run('sale:A',{monto:50},execute)]);assert.equal(committed,2);
console.log('LOST RESPONSE, RELOAD, CHANGED INPUT AND DOUBLE TAP KEEP ONE CANONICAL RECEIPT OK');
// Render the actual PDF and thermal components; both expose the same refund.
const { build } = await import('esbuild');
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { fileURLToPath } = await import('node:url');
const srcRoot = fileURLToPath(new URL('../src',import.meta.url));
for(const component of ['CorteTicket','CorteTicketTermico']) {
 const compiled=await build({entryPoints:[srcRoot+'/components/tickets/'+component+'.jsx'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',alias:{'@':srcRoot},logLevel:'silent'});
 const box={exports:{}};const sandbox=vm.createContext({module:box,exports:box.exports,require,console});
 vm.runInContext(compiled.outputFiles[0].text,sandbox);
 const html=renderToStaticMarkup(React.createElement(box.exports.default,{corte:{folio:'CORTE-A',total_general:100},config:{},isEsencial:true,ventas:[],detalles:[],abonos:[{id:'refund-A',monto:-100,monto_efectivo:-100,metodo_pago:'efectivo',notas:'Devolución fixture A'}]}));
 assert(html.includes('Devolución fixture A'));assert(html.includes('Devoluciones de anticipos'));assert(html.includes('Efectivo'));
 assert(!html.includes('Sucursal fixture B'));
}
console.log('ACTUAL PDF AND THERMAL COMPONENTS RENDER REFUND AMOUNT/METHOD OK');

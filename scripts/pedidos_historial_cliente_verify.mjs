import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { situacionPedido } from '../src/utils/situacionPedido.js';
const read = p => fs.readFileSync(
  p==='src/lib/useListaPaginada.js' && process.env.CONFETTI_HOOK_SOURCE ? process.env.CONFETTI_HOOK_SOURCE :
  p==='src/components/pedidos/RegistrarPagoDialog.jsx' && process.env.CONFETTI_PAGO_SOURCE ? process.env.CONFETTI_PAGO_SOURCE :
  new URL('../'+p,import.meta.url),'utf8');
const strip = s => s.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/export default /g,'').replace(/export /g,'');
const today='2026-10-17', row={id:'A-1',sucursal_id:'A',estado:'con_anticipo',total_final:100,saldo_pendiente:40,fecha_entrega:'2026-10-15'};
assert.equal(situacionPedido(row,today).texto,'Fecha pasada · saldo pendiente');
assert.equal(situacionPedido({...row,saldo_pendiente:0,fecha_entrega:'2026-10-19'},today).texto,'Pagado · entrega próxima');
assert.equal(situacionPedido({...row,saldo_pendiente:null,resta:null},today).texto,'Revisar saldo');
assert.equal(situacionPedido({...row,saldo_pendiente:0},today).texto,'Pagado · fecha pasada');
let response, args;
const c=vm.createContext({ensureSession:async()=>{},supabase:{rpc:async(name,p)=>{assert.equal(name,'listar_pedidos_pastel_pos');args=p;return response;}}});
vm.runInContext(strip(read('src/lib/pedidosAnteriores.js'))+'\nglobalThis.load=cargarPaginaPedidos;',c);
response={data:{pedidos:[row],conteos:{actuales:1},hay_mas:false,total:1}};
await c.load({sucursal:'A',vista:'actuales',filtros:{}});assert.equal(args.p_sucursal,'A');assert.equal(args.p_limite,50);
response={data:{pedidos:[{...row,sucursal_id:'B'}],conteos:{},hay_mas:false,total:1}};
await assert.rejects(()=>c.load({sucursal:'A',vista:'historial',filtros:{}}),/sucursal/);
for(const broken of [{pedidos:[],conteos:{},hay_mas:true,total:5},{pedidos:[row],conteos:{},hay_mas:true,siguiente:{id:'A-1'},total:5},{pedidos:[],hay_mas:false,total:0}]){
 response={data:broken};await assert.rejects(()=>c.load({sucursal:'A',vista:'actuales',filtros:{},cursor:{id:'A-1'}}),/incompleta/);
}
response={error:{message:'offline'}};await assert.rejects(()=>c.load({sucursal:'A',vista:'actuales',filtros:{}}),/offline/);
console.log('PASS: labels distinguish overdue debt/future paid/unknown balance; real page reader validates scope, shape, cursor progress and network errors');

// Ejecuta el hook real entre renders, incluso el render previo a useEffect.
const hooks=[];let cursor=0,effects=[],scope='A',delay=null;
const useRef=v=>{const i=cursor++;if(!hooks[i])hooks[i]={current:v};return hooks[i];};
const useState=v=>{const i=cursor++;if(!hooks[i])hooks[i]={value:v};return[hooks[i].value,n=>hooks[i].value=typeof n==='function'?n(hooks[i].value):n];};
const useEffect=(fn,deps)=>{const i=cursor++;const old=hooks[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){hooks[i]={deps};effects.push(fn);}};
const useCallback=(fn,deps)=>{const i=cursor++;const old=hooks[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))hooks[i]={deps,fn};return hooks[i].fn;};
const hc=vm.createContext({useRef,useState,useEffect,useCallback,console});
vm.runInContext(strip(read('src/lib/useListaPaginada.js'))+'\nglobalThis.hook=useListaPaginada;',hc);
const render=()=>{cursor=0;const branch=scope;return hc.hook(async()=>{if(delay)await delay;return[{id:branch,sucursal_id:branch}];},50,[scope]);};
const settle=async()=>{effects.splice(0).forEach(fn=>fn());for(let i=0;i<8;i++)await Promise.resolve();};
render();await settle();let result=render();assert.equal(result.items[0].id,'A');
scope='B';result=render();assert.equal(result.items.length,0,'Previously loaded branch must disappear before effects run');
await settle();result=render();assert.equal(result.items[0].id,'B');
let release;delay=new Promise(r=>release=r);result.recargar();scope='A';result=render();assert.equal(result.items.length,0,'Old branch must be hidden before effects run');
release();delay=null;await settle();result=render();assert.equal(result.items[0].id,'A');assert.equal(result.items.length,1);
console.log('PASS: actual incremental hook hides old branch on the very first render and discards a late response from the previous branch');

// Render del diálogo de pago real: un pago completo cierra sin otra mutación
// de estado ni segunda pregunta. El test falla con el flujo anterior.
let opts, calls=0,closed=0,notified=0;const hs=[];cursor=0;
const React={createElement:(type,props,...children)=>({type,props:props||{},children})};
const pc=vm.createContext({React,useRef:v=>({current:v}),useState:v=>{const i=cursor++;if(!(i in hs))hs[i]=v;return[hs[i],n=>hs[i]=n];},useEffect:fn=>fn(),
 Dialog:'Dialog',DialogContent:'Content',DialogHeader:'Header',DialogTitle:'Title',Button:'Button',Input:'Input',Label:'Label',MetodoPagoSelector:'Method',
 tieneIntencionPendiente:()=>false,construirPago:()=>({pago:{},valido:true}),navigator:{onLine:true},toast:{success:()=>{},error:e=>{throw Error(e);}},console,
 registrarPagoPedido:async()=>{calls++;return{montoRegistrado:40,saldoPendiente:0};},recuperarOperacionPedido:()=>{throw Error('Unexpected recovery');},mensajeOperacion:e=>e.message});
vm.runInContext(ts.transpileModule(strip(read('src/components/pedidos/RegistrarPagoDialog.jsx'))+'\nglobalThis.component=RegistrarPagoDialog;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,pc);
const walk=(n,p)=>{if(Array.isArray(n))return n.flatMap(x=>walk(x,p));if(!n||typeof n!=='object')return[];return[...(p(n)?[n]:[]),...(n.children||[]).flatMap(x=>walk(x,p))];};
const renderPay=()=>{cursor=0;return pc.component({pedido:row,cajaAbierta:{id:'cut'},posUser:{id:'owner'},sucursalEfectiva:{sucursal_id:'A'},hayCorteAtrasado:false,open:true,onPagoRegistrado:()=>notified++,onClose:()=>closed++});};
renderPay();const tree=renderPay();const buttons=walk(tree,n=>n.type==='Button');assert.equal(buttons.length,1);await buttons[0].props.onClick();assert.equal(calls,1);assert.equal(notified,1);assert.equal(closed,1);assert(!JSON.stringify(renderPay()).includes('marcar entregado'));
const detail=read('src/components/pedidos/PedidoPastelDetalleDialog.jsx');assert(detail.includes('!finalizado && esCatalogo &&'));assert(detail.includes('open={esCatalogo && confirmarEntrega}'));
console.log('PASS: real custom payment dialog confirms once and closes without a delivery mutation; manual delivery exists only under the catalogue guard');

// Lista de cortes real: el servidor puede responder menos del límite pedido.
// Debe seguir desde la longitud recibida, sin saltar a 100 ni detenerse en 100.
let cutOptions,cutPages=[],nextPage=0;const offsets=[];
const cutRows=Array.from({length:205},(_,i)=>({id:'C'+i,folio:'CORTE-'+i,sucursal_id:'A',estado:'cerrado',tipo_corte:'cierre_diario',total_general:100,numero_ventas:1}));
const cutContext=vm.createContext({React,useState:v=>[v,()=>{}],useMemo:fn=>fn(),useEffect:()=>{},useTerminal:()=>({sucursalEfectiva:{sucursal_id:'A'}}),
 useInfiniteQuery:o=>{cutOptions=o;return{data:{pages:cutPages},hasNextPage:nextPage!==undefined,isPending:false,isError:false,fetchNextPage:()=>{},refetch:()=>{}};},
 base44:{entities:{CorteCaja:{filter:async(f,sort,limit,skip)=>{assert.equal(f.sucursal_id,'A');assert.equal(sort,'-fecha_cierre');assert.equal(limit,100);offsets.push(skip);return cutRows.slice(skip,skip+73);}}}},
 Card:'Card',Button:'Button',Input:'Input',CorteViewerDialog:'Viewer',FileText:'File',Eye:'Eye',Calendar:'Calendar',DoorOpen:'Door',Scissors:'Scissors',Lock:'Lock',format:()=>'',es:{},formatCurrency:n=>'$'+n});
vm.runInContext(ts.transpileModule(strip(read('src/components/cortes/CorteHistorialList.jsx'))+'\nglobalThis.component=CorteHistorialList;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,cutContext);
cutContext.component({limit:100});
while(nextPage!==undefined){const chunk=await cutOptions.queryFn({pageParam:nextPage});cutPages.push(chunk);nextPage=cutOptions.getNextPageParam(chunk,cutPages);}
assert.deepEqual(offsets,[0,73,146,205]);assert.equal(new Set(cutPages.flat().map(c=>c.id)).size,205);
const cutTree=cutContext.component({limit:100});assert.equal(walk(cutTree,n=>n.type==='Card').length,205);
cutPages=[cutPages[0]];nextPage=73;const partialTree=cutContext.component({limit:100});
assert(walk(partialTree,n=>n.type==='Button'&&JSON.stringify(n.children).includes('Cargar más cortes de caja')).length===1);
console.log('PASS: actual Caja/Dashboard cut list reaches 205 records despite a 73-row server cap, advances by received rows and labels the incremental button explicitly');

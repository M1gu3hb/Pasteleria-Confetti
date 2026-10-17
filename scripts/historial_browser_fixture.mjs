// Servidor LOCAL de QA con componentes reales y datos sintéticos. Sin credenciales
// ni conexión al negocio. Nunca se incorpora a src ni al build de producción.
import { build } from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = '/tmp/confetti-historial-qa'; fs.mkdirSync(out,{recursive:true});
const mock = `
import React from 'react';
export const useTerminal=()=>window.fixture.scope;
export const useCajaAbierta=()=>({hayCaja:true,cajaAbierta:{id:'CUT-A'}});
export const useCorteAtrasado=()=>({hayCorteAtrasado:false});
export const usePOSAuth=()=>({posUser:{id:'OWNER',rol:'dueño'}});
export const useConfig=()=>({config:{nombre_negocio:'Confetti · Prueba aislada'}});
export const ensureSession=async()=>{};
export const printDocument=async()=>{};
export const operacionPedido=async()=>{throw Error('Unexpected write');};
export const registrarPagoPedido=async({pedido,monto})=>{window.fixture.payments++;return {montoRegistrado:monto,saldoPendiente:0};};
export const recuperarOperacionPedido=async()=>({montoRegistrado:100,saldoPendiente:0});
const page=(rows,start,n)=>rows.slice(start,start+n);
export const base44={entities:new Proxy({}, {get:(_,name)=>({
 filter:async(q,sort,n=1000,skip=0)=>{
  if(name==='Sucursal')return window.fixture.branches;
  if(name==='CorteCaja')return page(window.fixture.cuts.filter(c=>(!q.sucursal_id||c.sucursal_id===q.sucursal_id)&&(!q.fecha_cierre?.$gte||c.fecha_cierre>=new Date(q.fecha_cierre.$gte).toISOString())&&(!q.fecha_cierre?.$lte||c.fecha_cierre<=new Date(q.fecha_cierre.$lte).toISOString())),skip,Math.min(n,73));
  return [];
 },filterAll:async()=>[],get:async id=>window.fixture.rows.find(r=>r.id===id),
 update:async()=>{throw Error('Unexpected write in read-only fixture');}
})})};
export const supabase={rpc:async(name,p)=>{
 if(window.fixture.fail)return {error:{message:'Fallo de red simulado'}};
 if(name!=='listar_pedidos_pastel_pos')throw Error('Unexpected RPC '+name);
 const scoped=window.fixture.rows.filter(r=>!p.p_sucursal||r.sucursal_id===p.p_sucursal);
 const f=p.p_filtros;
 const rows=scoped.filter(r=>(p.p_vista==='historial'||r.seccion_lista===p.p_vista)&&(!f.busqueda||r.folio.includes(f.busqueda))&&
  (!f.desde||r.fecha_entrega>=f.desde)&&(!f.hasta||r.fecha_entrega<=f.hasta)&&
  (f.hora==='todos'||f.hora==='sin_hora'&&!r.hora_entrega)&&
  (f.estado==='todos'||f.estado===r.estado));
 const start=p.p_cursor?.offset||0, pedidos=page(rows,start,50),hay_mas=start+pedidos.length<rows.length;
 return {data:{pedidos,total:rows.length,hoy:'2026-10-17',hay_mas,siguiente:hay_mas?{offset:start+pedidos.length,id:pedidos.at(-1).id}:null,
 conteos:{actuales:scoped.filter(r=>r.seccion_lista==='actuales').length,anteriores:scoped.filter(r=>r.seccion_lista==='anteriores').length,historial:scoped.length}}};
}};
`;
const entry = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{MemoryRouter}from'react-router-dom';
import Pedidos from './src/pages/PedidosPastel.jsx';import Cortes from './src/components/cortes/CorteHistorialList.jsx';
import Pago from './src/components/pedidos/RegistrarPagoDialog.jsx';import './src/index.css';
const branches=[{id:'A',nombre:'Xochimilco',orden_visual:1},{id:'B',nombre:'Topilejo',orden_visual:2},{id:'C',nombre:'San Gregorio',orden_visual:3}];
window.fixture={payments:0,fail:false,scope:{adminRole:'pastelero',sucursalEfectiva:null},branches,
rows:Array.from({length:64},(_,i)=>({id:'P'+i,folio:'PRUEBA-'+String(i).padStart(3,'0'),sucursal_id:i===63?'B':'A',sucursal_nombre:i===63?'Topilejo':'Xochimilco',tipo_pedido:'pastel_personalizado',cliente_nombre:'Cliente de prueba '+i,cliente_telefono:'5500000000',estado:i<60?'con_anticipo':'pagado',total_final:280,total_abonado:i<60?100:280,saldo_pendiente:i<60?180:0,fecha_entrega:i<60?'2026-10-17':i===60?'2026-10-14':'2026-06-30',hora_entrega:'15:00',kilos:2,seccion_lista:i<60?'actuales':i===60?'anteriores':'historial'})),
cuts:Array.from({length:205},(_,i)=>({id:'C'+i,folio:'CORTE-'+String(i).padStart(3,'0'),sucursal_id:i===204?'B':'A',sucursal_nombre:i===204?'Topilejo':'Xochimilco',estado:'cerrado',tipo_corte:'cierre_diario',created_date:new Date(Date.UTC(2026,9,17)-i*86400000).toISOString(),fecha_cierre:new Date(Date.UTC(2026,9,17)-i*86400000).toISOString(),total_general:280,numero_ventas:1}))};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function App(){const[view,setView]=useState('pedidos');const[scope,setScope]=useState('global');window.fixture.scope=scope==='global'?{adminRole:'pastelero',sucursalEfectiva:null}:{adminRole:null,sucursalEfectiva:{sucursal_id:scope,sucursal_nombre:scope==='A'?'Xochimilco':'Topilejo'}};return <QueryClientProvider client={client}><MemoryRouter><div className="mx-auto max-w-6xl p-3"><nav className="mb-4 flex gap-3 border-b pb-3"><button onClick={()=>setView('pedidos')}>QA pedidos</button><button onClick={()=>setView('cortes')}>QA cortes</button><button onClick={()=>setView('pago')}>QA pago</button><button onClick={()=>setScope('A')}>QA terminal A</button><button onClick={()=>setScope('B')}>QA terminal B</button><button onClick={()=>{window.fixture.fail=true;client.invalidateQueries()}}>QA fallo de red</button></nav>{view==='pedidos'?<Pedidos/>:view==='cortes'?<Cortes limit={100}/>:<Pago pedido={window.fixture.rows[0]} cajaAbierta={{id:'CUT-A'}} posUser={{id:'OWNER'}} sucursalEfectiva={{sucursal_id:'A'}} hayCorteAtrasado={false} open onClose={()=>setView('pedidos')} onPagoRegistrado={()=>{}}/>}</div></MemoryRouter></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);
`;
await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},outfile:out+'/qa.js',bundle:true,minify:true,define:{'process.env.NODE_ENV':'"production"'},format:'iife',platform:'browser',alias:{'@':root+'src'},loader:{'.png':'dataurl'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/CorteViewerDialog$/},()=>({path:'corte-visor',namespace:'fixture-view'}));b.onLoad({filter:/.*/,namespace:'fixture-view'},()=>({contents:'export default function Visor(){return null}',loader:'js'}));b.onResolve({filter:/^@\/(api\/(base44Client|supabaseClient)|lib\/(TerminalContext|useCajaAbierta|useCorteAtrasado|POSAuthContext|ConfigContext|print)|utils\/registrarPagoPedido)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:mock,loader:'js',resolveDir:root}));}}]});
// Tailwind CLI uses the real configuration so tablet/mobile spacing is rendered.
const {execFileSync}=await import('node:child_process');execFileSync(root+'node_modules/.bin/tailwindcss',['-i',root+'src/index.css','-o',out+'/qa.css','--content',root+'src/**/*.{jsx,js}'],{cwd:root,stdio:'ignore'});
fs.writeFileSync(out+'/index.html','<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/qa.css"><div id="root"></div><script src="/qa.js"></script></html>');
http.createServer((req,res)=>{const name=req.url==='/qa.js'?'qa.js':req.url==='/qa.css'?'qa.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(out+'/'+name));}).listen(8765,'0.0.0.0',()=>console.log('QA fixture on port 8765 — synthetic data only'));

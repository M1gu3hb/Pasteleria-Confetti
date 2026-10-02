import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { encolarImpresion } from '../src/native/colaImpresion.js';
import { bytesAvancePapel } from '../src/native/avancePapel.js';
const read=p=>fs.readFileSync(process.env.CONFETTI_VERIFY_ROOT ? process.env.CONFETTI_VERIFY_ROOT+'/'+p : new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/export default /g,'').replace(/export /g,'');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
const events=[];let connectionFailure=false;const gate=defer();
const nc=vm.createContext({console,TextEncoder,Uint8Array,setTimeout,clearTimeout,encolarImpresion,bytesAvancePapel,Capacitor:{isNativePlatform:()=>true},toast:{error:()=>{},warning:()=>{}},getPrinterConfig:()=>({conexion:'tcp',ip:'A',modo:'texto',avanceAntesCorteDots:150}),conectarTCP:async ip=>{events.push('connect:'+ip);if(connectionFailure){connectionFailure=false;throw Error('connection failed');}},conectarUSB:()=>{},desconectar:async()=>events.push('disconnect'),enviarBytes:async b=>events.push('bytes:'+Array.from(b).join(',')),cortar:async()=>events.push('cut'),imprimirImagenRaster:()=>{}});
vm.runInContext(strip(read('src/native/printTicket.js'))+'\nglobalThis.api={conImpresora,imprimirTicketNativo};',nc);
const first=nc.api.conImpresora({conexion:'tcp',ip:'A'},async()=>{events.push('write:A');await gate.promise;});
const second=nc.api.conImpresora({conexion:'tcp',ip:'B'},async()=>events.push('write:B'));
await tick();assert.deepEqual(events,['connect:A','write:A']);gate.resolve();await Promise.all([first,second]);
assert.deepEqual(events,['connect:A','write:A','disconnect','connect:B','write:B','disconnect']);
connectionFailure=true;await assert.rejects(()=>nc.api.conImpresora({conexion:'tcp',ip:'C'},()=>events.push('bad')),/connection failed/);
await nc.api.conImpresora({conexion:'tcp',ip:'D'},()=>events.push('write:D'));assert.deepEqual(events.slice(-5),['connect:C','disconnect','connect:D','write:D','disconnect']);
const ac=new AbortController();ac.abort();await assert.rejects(()=>nc.api.conImpresora({conexion:'tcp',ip:'X'},()=>{},ac.signal),/cancelada/);assert(!events.includes('connect:X'));
const barrier=defer();const blocking=encolarImpresion(()=>barrier.promise);let text='Venta A';const node={get innerText(){return text},cloneNode:()=>({textContent:text})};
const print=nc.api.imprimirTicketNativo({node});text='Venta B';barrier.resolve();await blocking;await print;
const content=events.find(x=>x.startsWith('bytes:27,64'));assert(content.includes(Array.from(new TextEncoder().encode('Venta A')).join(',')));assert(!content.includes(Array.from(new TextEncoder().encode('Venta B')).join(',')));
assert.deepEqual(events.slice(-3),['bytes:27,74,150','cut','disconnect']);
console.log('PASS: real native FIFO lifecycle; connect failure cleanup; queued abort; frozen ticket; advance then cut; next job survives failures');

let details=[{venta_id:'A',subtotal:100}],sale={id:'A',estado:'pagada',subtotal:100,total:100,folio:'V-A'};let fail=false;
const base44={entities:{Venta:{get:async()=>sale},DetalleVenta:{filterAll:async()=>{if(fail)throw Error('offline');return details;}},Mesa:{list:async()=>[]}}};
const tc=vm.createContext({base44});vm.runInContext(strip(read('src/utils/cargarTicketVenta.js'))+'\nglobalThis.load=cargarTicketVenta;',tc);
assert.equal((await tc.load('A')).venta.folio,'V-A');fail=true;await assert.rejects(()=>tc.load('A'),/offline/);fail=false;
for(const bad of [[],[{venta_id:'B',subtotal:100}],[{venta_id:'A',subtotal:90}]]){details=bad;await assert.rejects(()=>tc.load('A'),/productos/i);}
console.log('PASS: actual receipt loader rejects failed, foreign, missing and mismatching detail; valid current snapshot succeeds');

// Minimal hook runner executes the real React component, including effect cleanup.
const hooks=[];let cursor=0,pendingEffects=[];const queries=new Map(),printed=[];const printGate=defer();
const useState=initial=>{const i=cursor++;if(!hooks[i])hooks[i]={v:initial};return [hooks[i].v,v=>{hooks[i].v=typeof v==='function'?v(hooks[i].v):v;}];};
const useRef=initial=>{const i=cursor++;if(!hooks[i])hooks[i]={v:{current:initial}};return hooks[i].v;};
const effect=(fn,deps)=>{const i=cursor++;const old=hooks[i];if(!old||deps.some((d,k)=>d!==old.deps[k])){old?.cleanup?.();hooks[i]={deps};pendingEffects.push(()=>{hooks[i].cleanup=fn();});}};
const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'Fragment'};
const dc=vm.createContext({React,useState,useRef,useLayoutEffect:effect,Dialog:'Dialog',DialogContent:'Content',DialogHeader:'Header',DialogTitle:'Title',Button:'Button',Printer:'Printer',X:'X',Loader2:'Loader',PreCuentaTicket:'Ticket',useConfig:()=>({config:{}}),cargarTicketVenta:id=>{const d=defer();queries.set(id,d);return d.promise;},printDocument:async p=>{printed.push(p);await printGate.promise;},console});
vm.runInContext(ts.transpileModule(strip(read('src/components/tickets/TicketViewerDialog.jsx'))+'\nglobalThis.component=TicketViewerDialog;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,dc);
const render=p=>{cursor=0;const tree=dc.component({...p,onClose:()=>{}});pendingEffects.splice(0).forEach(fn=>fn());return tree;};
const walk=(n,fn)=>{if(!n||typeof n!=='object')return;fn(n);for(const c of n.children||[])Array.isArray(c)?c.forEach(x=>walk(x,fn)):walk(c,fn);};
const button=tree=>{let b;walk(tree,n=>{if(n.type==='Button'&&'aria-busy' in n.props)b=n;});return b;};
let tree=render({venta:{id:'A'},open:true});assert(button(tree).props.disabled);const qa=queries.get('A');
tree=render({venta:{id:'B'},open:true});const qb=queries.get('B');qa.resolve({venta:{id:'A',folio:'V-A'},detalles:[]});await tick();tree=render({venta:{id:'B'},open:true});assert(button(tree).props.disabled);
qb.reject(Error('query failed'));await tick();tree=render({venta:{id:'B'},open:true});assert(button(tree).props.disabled);let alert=false;walk(tree,n=>{if(n.props.role==='alert')alert=true;});assert(alert);
render({venta:{id:'B'},open:false});render({venta:{id:'B'},open:true});queries.get('B').resolve({venta:{id:'B',folio:'CANONICAL'},detalles:[],mesa:null});await tick();tree=render({venta:{id:'B'},open:true});assert.equal(button(tree).props.disabled,false);
const ownNode={own:true};walk(tree,n=>{if(n.props.ref)n.props.ref.current={querySelector:()=>ownNode};});const handler=button(tree).props.onClick;const p1=handler(),p2=handler();await tick();assert.equal(printed.length,1);assert.equal(printed[0].title,'Ticket-CANONICAL');assert.equal(printed[0].node,ownNode);printGate.resolve();await Promise.all([p1,p2]);
console.log('PASS: real ticket dialog blocks errors/stale branch replies, reloads after reopening, serializes double-tap and prints its own canonical DOM');

const ic=vm.createContext({console,ensureSession:async()=>{},supabase:{},JSON,Proxy,Set,Map});vm.runInContext(strip(read('src/api/entitiesAdapter.js'))+'\nglobalThis.entityApi=entities;',ic);
for(const method of ['create','update','delete','bulkCreate'])await assert.rejects(()=>ic.entityApi.Ingrediente[method]({nombre:'fixture'}),/ENTIDAD_NO_DISPONIBLE/);
ic.base44={entities:ic.entityApi};vm.runInContext(strip(read('src/utils/importExecutors.js'))+'\nglobalThis.importApi={ejecutarImportInventario,ejecutarImportProveedores};',ic);
for(const method of ['ejecutarImportInventario','ejecutarImportProveedores']){const report=await ic.importApi[method]([{status:'ok',parsed:{nombre:'Fixture'}}],{});assert.equal(report.creados,0);assert.equal(report.fallidos,1);}
vm.runInContext(strip(read('src/utils/importacionesDisponibles.js'))+'\nglobalThis.allowed=importacionDisponible;',ic);assert.equal(ic.allowed('productos'),true);for(const type of ['gastos','inventario','recetas','proveedores'])assert.equal(ic.allowed(type),false);
let sessionChecks=0,upload;const storageClient={from:()=>({upload:async(path,file,opts)=>{upload={file,opts};return {error:null};},getPublicUrl:()=>({data:{publicUrl:'https://fixture.local/audio'}})})};
const uc=vm.createContext({console,entities:{},supabase:{storage:storageClient},ensureSession:async()=>sessionChecks++});vm.runInContext(strip(read('src/api/base44Client.js'))+'\nglobalThis.core=base44.integrations.Core;',uc);const audio={type:'audio/webm;codecs=opus',name:'fixture.webm'};await uc.core.UploadFile({file:audio,bucket:'notas-voz'});assert.equal(upload.file,audio);assert.equal(upload.opts.contentType,'audio/webm');assert.equal(upload.opts.upsert,false);assert.equal(sessionChecks,1);
console.log('PASS: real unmapped writes throw; import executors report failure instead of fake creations; only product import enabled; audio MIME normalized without modifying bytes or overwriting objects');

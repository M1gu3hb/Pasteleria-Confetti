import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/export default /g,'').replace(/export /g,'');
let pages=[],params=[],session=0;
const ctx=vm.createContext({Intl,Date,BigInt,Set,JSON,Number,Error,ensureSession:async()=>session++,supabase:{rpc:async(name,p)=>{assert(['historial_evidencia_pos','conciliacion_operativa_pos'].includes(name));params.push(p);return pages.shift();}}});
vm.runInContext(strip(read('src/utils/evidenciaFinanciera.js'))+'\nglobalThis.api={cargarHistorialEvidencia,cargarEvidenciaPago,fechaEvidencia,importeEvidencia,cambiosEvidencia};',ctx);
const event=(id,accion='UPDATE')=>({id,accion,registrado_en:'2026-10-02T22:00:00Z',entidad:'ventas',origen:'humano',actor_pos_nombre:'Owner',anterior:{monto:100},posterior:{monto:200}});
const page=(eventos,siguiente=null,hasta='300')=>({data:{eventos,siguiente,hasta},error:null});
pages=[page([event('300'),event('299')],'299'),page([event('298')])];const history=await ctx.api.cargarHistorialEvidencia('pedidos','P');assert.equal(history.length,3);assert.equal(session,1);assert.equal(params[1].p_antes,'299');assert.equal(params[1].p_hasta,'300');
for(const bad of [
 [page([event('300')],'300'),{error:{message:'offline'}}],
 [page([event('300')],'300'),page([event('300')])],
 [page([event('300')],'300'),page([event('298')],null,'999')],
 [page([],'299')],
 [page([event('300')],'299')],
 [page([event('301')])],
 [{data:{eventos:[],hasta:'300'},error:null}]
]){pages=bad;await assert.rejects(()=>ctx.api.cargarHistorialEvidencia('pedidos','P'),/bitácora/);}
for(const v of [null,undefined,'',NaN,'abc'])assert.equal(ctx.api.importeEvidencia(v),'Sin importe registrado');assert.equal(ctx.api.importeEvidencia(0),'$0.00');assert.equal(ctx.api.importeEvidencia(1700),'$1,700.00');assert.match(ctx.api.fechaEvidencia('2026-08-20T17:06:26Z'),/11:06:26.*CDMX/);
console.log('PASS: actual full-history reader follows cursor; fails on offline/repeated/missing/changed snapshot; raw missing amounts do not become zero; explicit CDMX');
const source=strip(read('src/components/common/EvidenciaPagoDialog.jsx'));
const sc=vm.createContext({React,...ctx.api});vm.runInContext(ts.transpileModule(source+'\nglobalThis.receipt=ComprobanteEvidenciaPago;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,sc);
const payment={pedido:'PP-A-0212',pedido_id:'P',venta_id:'V',venta:'CONF-A-V1767',monto:500,metodo:'efectivo',estado_pedido:'con_anticipo',saldo_pedido:280,abonado_pedido:500,tipo_cancelacion:'devolucion',motivo:'<img src=x onerror=bad()>',devuelto_registrado:500,cobrado_en:'2026-08-20T17:06:26Z',cancelado_en:'2026-08-20T17:17:52Z',cancelado_por:'Recorded owner',corte:'CONF-A-C055',corte_estado:'cerrado',sucursal:'A',devoluciones_libro:0,pedidos_relacionados:[]};
pages=[{data:{pagos_con_venta_cancelada:[payment]},error:null},page([event('3')])];const fresh=await ctx.api.cargarEvidenciaPago('P','V');assert.equal(fresh.pago.venta_id,'V');assert.equal(fresh.eventos.length,1);
for(const p of [[],[{...payment,venta_id:'Other'}],[{...payment,saldo_pedido:null}]]){pages=[{data:{pagos_con_venta_cancelada:p},error:null}];await assert.rejects(()=>ctx.api.cargarEvidenciaPago('P','V'),/evidencia|pago/i);}
const html=renderToStaticMarkup(React.createElement(sc.receipt,{pago:payment,eventos:[event('3','OBSERVADO'),event('2')]}));assert(html.includes('CONF-A-C055'));assert(html.includes('$500.00'));assert(html.includes('$280.00'));assert(html.includes('OBSERVADO'));assert(html.includes('fecha no es la del cobro original'));assert(html.includes('&lt;img'));assert(!html.includes('<img src=x'));assert(html.includes('No registra un cobro ni una devolución nueva'));assert(html.includes('no prueban una entrega física'));
console.log('PASS: actual receipt renders persisted payment/refund/cut/ledger, labels baseline honestly, escapes motives and never claims a new physical refund');
// Real dialog, synchronous double tap, query failure and print failure.
const hooks=[];let cursor=0,query={data:{pago:payment,eventos:[event('3')]},error:null,isPending:false,refetch:()=>{}},prints=0,rejectPrint=false;
let release;const gate=new Promise(r=>release=r);
const useRef=v=>{const i=cursor++;if(!hooks[i])hooks[i]={current:v};return hooks[i];};
const useState=v=>{const i=cursor++;if(!hooks[i])hooks[i]={value:v};return [hooks[i].value,n=>hooks[i].value=n];};
const fakeReact={createElement:(type,props,...children)=>({type,props:props||{},children})};
const dc=vm.createContext({React:fakeReact,useRef,useState,useQuery:()=>query,Dialog:'Dialog',DialogContent:'Content',DialogHeader:'Header',DialogTitle:'Title',Button:'Button',...ctx.api,printDocument:async p=>{prints++;assert.equal(p.title,'Evidencia-PP-A-0212-CONF-A-V1767');assert.equal(p.node.own,true);if(rejectPrint)throw Error('printer');await gate;}});
vm.runInContext(ts.transpileModule(source+'\nglobalThis.component=EvidenciaPagoDialog;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,dc);
const render=()=>{cursor=0;return dc.component({pago:payment,onClose:()=>{}});};
const walk=(n,f)=>{if(!n||typeof n!=='object')return;f(n);for(const c of n.children||[])Array.isArray(c)?c.forEach(x=>walk(x,f)):walk(c,f);};
const button=tree=>{let b;walk(tree,n=>{if(n.type==='Button')b=n;});return b;};
query={...query,error:Error('offline')};let tree=render();assert(button(tree).props.disabled);let alert=false;walk(tree,n=>{if(n.props.role==='alert')alert=true;});assert(alert);
query={...query,error:null};tree=render();walk(tree,n=>{if(n.props.ref)n.props.ref.current={querySelector:()=>({own:true})};});const f=button(tree).props.onClick;const one=f(),two=f();await Promise.resolve();assert.equal(prints,1);release();await Promise.all([one,two]);rejectPrint=true;await button(render()).props.onClick();tree=render();let failed=false;walk(tree,n=>{if(n.props.role==='alert'&&JSON.stringify(n.children).includes('imprimir'))failed=true;});assert(failed);
assert(!read('src/components/common/EstadoConciliacion.jsx').includes('requieren comprobante'));
walk(tree,n=>{if(n.props.ref)n.props.ref.current={querySelector:()=>null};});const prior=prints;await button(tree).props.onClick();assert.equal(prints,prior,'Missing own receipt must not print another DOM ticket');
console.log('PASS: actual owner dialog disables partial/error history; prints own DOM once on double tap; print error is visible and retryable; no external receipt prerequisite');
const ec=vm.createContext({Object});vm.runInContext(strip(read('src/utils/errorOperacion.js'))+'\nglobalThis.message=mensajeOperacion;',ec);
const deliveryMessage=ec.message({message:'[pedidos] CONCILIAR_PAGO_CANCELADO: server message'});assert(deliveryMessage.includes('Dashboard'));assert(deliveryMessage.includes('No se registró dinero'));
for(const p of ['src/components/pedidos/PedidoPastelDetalleDialog.jsx','src/components/pedidos/RegistrarPagoDialog.jsx'])assert(read(p).includes('CONCILIAR_PAGO_CANCELADO')&&read(p).includes('mensajeOperacion('));
console.log('PASS: employee delivery error explains the cancellation conflict and owner evidence; no misleading generic success');

import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const trace=[],state={native:true,fail:'',cfg:{modo:'texto',conexion:'usb',usbVendorId:12,usbProductId:34,avanceAntesCorteDots:150}};
globalThis.__barcodePrintQA={trace,state};
globalThis.localStorage={getItem:()=>JSON.stringify(state.cfg)};
globalThis.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,UE5H';this.onload();}};
const nativeMock=`const q=globalThis.__barcodePrintQA;const log=(n,v)=>{q.trace.push([n,v]);if(q.state.fail===n)throw Error('FAIL_'+n);};export const conectarUSB=async p=>log('usb',p);export const conectarTCP=async(...p)=>log('tcp',p);export const imprimirImagenRaster=async p=>log('raster',p);export const enviarBytes=async p=>log('bytes',Array.from(p));export const cortar=async()=>log('cut');export const desconectar=async()=>log('disconnect');`;
const out=await build({stdin:{contents:`export {printBarcodeLabel} from './src/lib/barcodeExport.js';export {imprimirTicketNativo} from './src/native/printTicket.js';export {setPaperWidth} from './src/lib/print.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',alias:{'@':process.cwd()+'/src'},plugins:[{name:'native-boundary-only',setup(b){
 b.onResolve({filter:/^(@capacitor\/core|sonner)$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='sonner'?`export const toast={error:()=>{},warning:()=>{}};`:`export const Capacitor={isNativePlatform:()=>globalThis.__barcodePrintQA.state.native};export const registerPlugin=()=>({});`}));
 b.onLoad({filter:/src\/native\/confettiPrinter\.js$/},()=>({contents:nativeMock}));
 b.onLoad({filter:/src\/lib\/barcodeLabels\.js$/},()=>({contents:`export const barcodeRuns=()=>({width:123});export const createLabelPNG=async(p,width)=>{globalThis.__barcodePrintQA.trace.push(['render',width]);if(globalThis.__barcodePrintQA.state.fail==='render')throw Error('FAIL_render');return new Blob(['PNG'],{type:'image/png'});};`}));
 if(process.argv.includes('--baseline'))b.onLoad({filter:/src\/lib\/barcodeExport\.js$/},()=>({contents:execFileSync('git',['show','5a1545e:src/lib/barcodeExport.js'],{encoding:'utf8'}),resolveDir:process.cwd()+'/src/lib'}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const product={id:'A',codigo_barras:'CF00000001',nombre:'Pastel'};
const receipt={innerText:'Ticket cliente',textContent:'Ticket cliente',cloneNode(){return this;}};
const deadline=p=>Promise.race([p,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('TIMEOUT_COLA')),600);timer.unref?.();})]);
// Keep deadline alive for a deadlocked baseline, then fail exactly on the timeout.
const timer=setTimeout(()=>{},1000);
try {
 api.setPaperWidth(58);
 await deadline(Promise.all([api.printBarcodeLabel(product),api.imprimirTicketNativo({node:receipt})]));
 assert.deepEqual(trace.map(x=>x[0]),['render','usb','raster','bytes','cut','disconnect','usb','bytes','bytes','cut','disconnect']);
 assert.equal(trace[0][1],384);assert.deepEqual(trace[1][1],{vendorId:12,productId:34});assert.deepEqual(trace[3][1],[27,74,150]);
 trace.length=0;state.cfg={...state.cfg,conexion:'tcp',ip:'192.0.2.10',puerto:9101,avanceAntesCorteDots:0};api.setPaperWidth(80);
 await deadline(api.printBarcodeLabel(product));assert.equal(trace[0][1],576);assert.deepEqual(trace.map(x=>x[0]),['render','tcp','raster','cut','disconnect']);assert.deepEqual(trace[1][1],['192.0.2.10',9101]);
 for(const failure of ['raster','bytes','cut']){
  trace.length=0;state.cfg.avanceAntesCorteDots=300;state.fail=failure;
  await assert.rejects(()=>deadline(api.printBarcodeLabel(product)),new RegExp('FAIL_'+failure));
  assert.equal(trace.filter(x=>x[0]==='cut').length,1,'cut attempted even after a write failure');assert.equal(trace.at(-1)[0],'disconnect');
  state.fail='';await deadline(api.imprimirTicketNativo({node:receipt}));assert.equal(trace.at(-1)[0],'disconnect','queue recovered for next receipt');
 }
 for(const failure of ['render','usb','tcp']) {
  trace.length=0;state.cfg.conexion=failure==='usb'?'usb':'tcp';state.fail=failure;
  await assert.rejects(()=>deadline(api.printBarcodeLabel(product)),new RegExp('FAIL_'+failure));
  assert(!trace.some(x=>['raster','cut','bytes'].includes(x[0])),'failed render/connection must not write');
  if(failure!=='render')assert.equal(trace.at(-1)[0],'disconnect');state.fail='';
  await deadline(api.imprimirTicketNativo({node:receipt}));
 }
 console.log('PASS actual shared print queue/lifecycle: barcode then sales receipt, USB selection/TCP, 58/80mm, zero/300-dot feed, guaranteed cut/disconnect and recovery after raster/feed/cut failures.');
}finally{clearTimeout(timer);delete globalThis.__barcodePrintQA;}

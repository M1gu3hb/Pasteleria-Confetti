import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const out=await build({entryPoints:['src/lib/barcodeCore.js'],bundle:true,write:false,format:'esm',plugins:[{name:'old-regression',setup(b){if(process.argv.includes('--baseline'))b.onLoad({filter:/barcodeCore.js$/},()=>({contents:execFileSync('git',['show','5a1545e:src/lib/barcodeCore.js'],{encoding:'utf8'})}));}}]});
const {addBarcodeProduct,createBarcodeReader}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const old={producto_id:'A',nombre:'Pastel',precio_venta:200,cantidad:1};
const updated=addBarcodeProduct([old],{id:'A',nombre:'Pastel',precio_venta:250});assert.equal(updated.length,2,'a new scan must not inherit an old cart price');assert.equal(old.precio_venta,200);assert.equal(updated[1].precio_venta,250);
const reader=createBarcodeReader(()=>{throw Error('must not accept an overlong scan');});for(let i=0;i<10000;i++)reader.feed('A',1000+i);assert(reader.buffer.length<=65,'rejected frames must have bounded memory');reader.feed('Enter',12000);
console.log('PASS reaudited actual core: current scan price preserves prior snapshots, bounded rejected frames.');
const state={data:[],error:null};globalThis.__barcodeRPC=state;
const rpc=await build({stdin:{contents:`export * from './src/lib/barcodes.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',alias:{'@':process.cwd()+'/src'},plugins:[{name:'rpc-boundary',setup(b){if(process.argv.includes('--review2-rpc-baseline'))b.onLoad({filter:/src\/lib\/barcodes.js$/},()=>({contents:execFileSync('git',['show','02c6ba0:src/lib/barcodes.js'],{encoding:'utf8'}),resolveDir:process.cwd()+'/src/lib'}));b.onLoad({filter:/api\/supabaseClient.js$/},()=>({contents:`export const ensureSession=async()=>{};export const supabase={rpc:async()=>globalThis.__barcodeRPC};`}));}}]});
const service=await import('data:text/javascript;base64,'+Buffer.from(rpc.outputFiles[0].text).toString('base64'));
const row={id:'A',nombre:'Pastel',codigo_barras:'0012345',codigo_origen:'asignado',activo:true,visible_en_pos:true,precio_venta:250,sucursal_ids:[]};
state.data=[row];assert.deepEqual(await service.lookupBarcode('0012345','Topilejo'),[row]);
for(const change of [{id:null},{codigo_barras:'another'},{precio_venta:null},{precio_venta:'NaN'},{precio_venta:-1},{precio_venta:''},{precio_venta:'   '},{precio_venta:true},{sucursal_ids:'Topilejo'},{activo:false},{visible_en_pos:false},{sucursal_ids:['other']}]){state.data=[{...row,...change}];await assert.rejects(()=>service.lookupBarcode('0012345','Topilejo'),/producto inválido/);}
state.data=[];assert.deepEqual(await service.lookupBarcode('0012345','Topilejo'),[]);
state.data=[row];assert.equal((await service.assignBarcode('A','0012345')).codigo_barras,'0012345');state.data={...row};assert.equal((await service.assignBarcode('A','0012345')).id,'A');
for(const change of [{codigo_barras:'WRONG'},{codigo_barras:null},{codigo_origen:'wrong'}]){state.data={...row,...change};await assert.rejects(()=>service.assignBarcode('A','0012345'),/verificar el código/);}
console.log('PASS real RPC boundary: singular/one-row assignments, raw null/NaN/negative price, wrong code, foreign branch and hidden/inactive products fail closed.');delete globalThis.__barcodeRPC;

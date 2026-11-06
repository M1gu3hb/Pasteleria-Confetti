// Native reader integration (APK 1.3.0) at the JS boundary: bridge capability detection, single
// processing between native batches and DOM keydown, generations, quarantine, pairing and the
// printer selector. Uses the REAL scannerCapture/barcodeFrame/scannerPairing/printerSelection and a
// fake plugin that follows the Java contract (ScannerCore). --baseline runs it against a447a91.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const baseline=process.argv.includes('--baseline');
const OLD=['src/lib/scannerCapture.js','src/lib/barcodeFrame.js'];
const out=await build({stdin:{contents:`export * from './src/lib/scannerCapture.js';export * from './src/lib/barcodeFrame.js';export * from './src/lib/scannerPairing.js';export * from './src/native/confettiScanner.js';export * from './src/native/printerSelection.js';export * from './src/lib/scannerConfig.js';`,resolveDir:process.cwd()},
 bundle:true,format:'esm',write:false,platform:'neutral',mainFields:['module','main'],logLevel:'silent',
 plugins:[{name:'boundary',setup(b){
  b.onResolve({filter:/confettiScannerPlugin$/},()=>({path:'plugin',namespace:'fake'}));
  b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const ConfettiScanner={};export const isNativeApp=()=>false;',loader:'js'}));
  if(baseline)b.onLoad({filter:/src\/lib\/(scannerCapture|barcodeFrame)\.js$/},a=>{const rel=OLD.find(f=>a.path.endsWith(f));return {contents:execFileSync('git',['show','a447a91:'+rel],{encoding:'utf8'}),loader:'js',resolveDir:process.cwd()+'/src/lib'};});
 }}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const failures=[];
const test=async(name,fn)=>{try{await fn();console.log('PASS',name);}catch(e){failures.push(name);console.error('FAIL',name,e.message);}};
const tick=()=>new Promise(r=>setTimeout(r,0));

// ---- fake plugin following ConfettiScannerPlugin's contract ----
function fakePlugin({unimplemented=false,iniciarFails=null}={}){
 const listeners={lectura:new Set(),estado:new Set()},calls=[];let seq=0;
 const st={protocolo:1,clienteActivo:false,gen:0,vinculando:false,estado:'conectado',capturando:false,vinculo:{descriptor:'d',vendorId:1504,productId:4608,nombre:'Scanner'},dispositivo:{id:7}};
 const snap=()=>JSON.parse(JSON.stringify(st));
 const notImpl=()=>{const e=new Error('"ConfettiScanner" plugin is not implemented on android');e.code='UNIMPLEMENTED';throw e;};
 const p={calls,st,
  addListener:async(ev,fn)=>{calls.push(['addListener',ev]);if(unimplemented)notImpl();listeners[ev].add(fn);return {remove:async()=>{calls.push(['remove',ev]);listeners[ev].delete(fn);}};},
  iniciar:async o=>{calls.push(['iniciar',o]);if(iniciarFails)throw iniciarFails;st.clienteActivo=true;st.gen=o.gen;st.capturando=st.estado==='conectado'&&!!st.vinculo;return snap();},
  invalidar:async o=>{calls.push(['invalidar',o]);st.gen=o.gen;return {gen:o.gen};},
  configurar:async o=>{calls.push(['configurar',o]);return snap();},
  estado:async()=>snap(),
  vincular:async()=>{const e=new Error('No se pudo guardar el vínculo en esta tablet.');e.code='PERSISTENCIA';throw e;},
  emitState(patch){Object.assign(st,patch);for(const fn of listeners.estado)fn(snap());},
  batch({codigo='CF00000001',gen=st.gen,fin='enter',prefix=null,t0=1000,gap=3,keys,origen='vinculado',iguales=1,device={id:7,descriptor:'d',vendorId:1504,productId:4608,nombre:'Scanner'}}={}){
   const teclas=keys||[];if(!keys){let t=t0;if(prefix){teclas.push({k:prefix,t,r:0});t+=gap;}for(const c of codigo){teclas.push({k:c,t,r:0});t+=gap;}if(fin==='enter')teclas.push({k:'Enter',t,r:0});}
   const b={seq:++seq,gen,origen,fin,tFin:(teclas.at(-1)?.t??t0)+400,iguales,dispositivo:device,teclas};for(const fn of listeners.lectura)fn(b);return b;},
 };
 return p;
}
class DOM extends EventTarget{querySelectorAll(){return [];}hidden=false;activeElement=null;}
function setup({plugin=fakePlugin(),config={version:1,enabled:true,profile:'compatible',maxGap:250},isNative=()=>true}={}){
 const doc=new DOM(),win=new EventTarget();win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;let changed;
 const env={doc,win,readSettings:()=>({config}),subscribeSettings:fn=>{changed=fn;return()=>{};},native:h=>m.createNativeScannerBridge?.({plugin,isNative,...h})};
 const c=m.createScannerCapture(env);
 const reads=[],events=[];let opts={enabled:true,active:true,branch:'A',contextKey:'sale',onScan:v=>reads.push(v),onEvent:e=>events.push(e)};
 const reg=c.register(opts,()=>{});
 const key=(k,o={})=>{const e=Object.assign(new Event('keydown',{cancelable:true}),{key:k,repeat:false,ctrlKey:false,altKey:false,metaKey:false,isComposing:false,...o});Object.defineProperty(e,'target',{value:null});doc.dispatchEvent(e);};
 const type=s=>{for(const ch of s)key(ch);};
 return {c,plugin,reads,events,reg,key,type,setOpts:o=>{opts={...opts,...o};reg.update(opts);},setConfig:x=>{config=x;changed();}};
}

await test('browser: never touches the plugin; old APK (UNIMPLEMENTED) degrades without throwing',async()=>{
 const p1=fakePlugin();const s1=setup({plugin:p1,isNative:()=>false});await tick();
 assert.equal(s1.c.native.disponible,false);assert.equal(s1.c.native.motivo,'navegador');assert.equal(p1.calls.length,0);
 const p2=fakePlugin({unimplemented:true});const s2=setup({plugin:p2});await tick();await tick();
 assert.equal(s2.c.native.motivo,'apk_anterior');
 const p3=fakePlugin({iniciarFails:Object.assign(new Error('Method not implemented.'),{code:'UNIMPLEMENTED'})});const s3=setup({plugin:p3});for(let i=0;i<5;i++)await tick();
 assert.equal(s3.c.native.motivo,'apk_anterior');assert(p3.calls.some(c=>c[0]==='remove'),'listeners removed when the APK lacks the plugin');
 // The web path keeps working on old APKs.
 s3.type('CF00000001');s3.key('Enter');assert.deepEqual(s3.reads,['CF00000001']);
 const p4=fakePlugin({iniciarFails:Object.assign(new Error('Versión incompatible'),{code:'PROTOCOLO'})});const s4=setup({plugin:p4});for(let i=0;i<5;i++)await tick();
 assert.equal(s4.c.native.motivo,'protocolo');
});
await test('USB-HID without prefix + Enter; F9 and F7 prefixes; leading zeros; three shots = three scans',async()=>{
 const s=setup();await tick();assert.equal(s.c.native.capturando,true);
 s.plugin.batch({codigo:'0075012345678'});s.plugin.batch({prefix:'F9',codigo:'CF00000001',t0:2000});s.plugin.batch({prefix:'F7',codigo:'CF00000001',t0:3000});
 for(let i=0;i<3;i++)s.plugin.batch({codigo:'CF00000002',t0:4000+i*500});
 assert.deepEqual(s.reads,['0075012345678','CF00000001','CF00000001','CF00000002','CF00000002','CF00000002']);
 assert(s.events.filter(e=>e.type==='complete').every(e=>e.origen==='nativo'&&e.dispositivo?.nombre==='Scanner'));
});
await test('F7 from a human keyboard on the web path is never taken as a prefix',async()=>{
 const s=setup({config:{version:1,enabled:true,profile:'f9',maxGap:250},isNative:()=>false});await tick();
 s.key('F7');s.type('CF00000001');s.key('Enter');assert.deepEqual(s.reads,[]);
 s.key('F9');s.type('CF00000001');s.key('Enter');assert.deepEqual(s.reads,['CF00000001']);
});
await test('one processing per read: web parser passive while native captures; active again when disconnected',async()=>{
 const s=setup();await tick();
 s.type('CF00000009');s.key('Enter');assert.deepEqual(s.reads,[],'DOM keys while capturing are human input, not scans');
 s.plugin.batch({codigo:'CF00000009'});assert.deepEqual(s.reads,['CF00000009']);
 s.plugin.emitState({estado:'desconectado',capturando:false});
 s.type('CF00000008');s.key('Enter');assert.deepEqual(s.reads,['CF00000009','CF00000008'],'existing web path resumes with its own settings');
 s.plugin.emitState({estado:'conectado',capturando:true});
 s.type('CF00000007');s.key('Enter');assert.equal(s.reads.length,2);
});
await test('duplicate Enter, held key and Tab terminator',async()=>{
 const s=setup();await tick();
 s.plugin.batch({codigo:'CF00000001',t0:1000});s.plugin.batch({keys:[{k:'Enter',t:1060,r:0}]});
 const held=[...'CF00000001'].map((k,i)=>({k,t:2000+i*3,r:0}));held.splice(4,0,{k:'0',t:2010,r:1});held.push({k:'Enter',t:2050,r:0});
 s.plugin.batch({keys:held});
 assert.deepEqual(s.reads,['CF00000001','CF00000001']);
 assert(s.events.some(e=>e.type==='duplicate'&&/Terminador doble/.test(e.reason)));
 assert(s.events.some(e=>e.type==='duplicate'&&/sostenida/.test(e.reason)));
 s.plugin.batch({keys:[...'CF1'].map((k,i)=>({k,t:3000+i,r:0})).concat([{k:'Tab',t:3010,r:0}]),fin:'tiempo'});
 assert.equal(s.reads.length,2,'Tab is not a terminator');
});
await test('incomplete read quarantines its tail without blocking checkout; disconnect does not quarantine',async()=>{
 const s=setup();await tick();
 s.plugin.batch({codigo:'CF000',fin:'tiempo',t0:1000});
 assert.equal(s.c.active,false,'a discarding native frame never adds a product, so it must not block checkout');
 s.plugin.batch({codigo:'00001',t0:1500});assert.deepEqual(s.reads,[],'tail of an interrupted read cannot become a code');
 s.plugin.batch({codigo:'CF00000001',t0:2000});assert.deepEqual(s.reads,['CF00000001']);
 s.plugin.batch({codigo:'CF000',fin:'desconexion',t0:3000});
 assert.equal(s.c.active,false);
 s.plugin.batch({codigo:'CF00000002',t0:9000});assert.deepEqual(s.reads,['CF00000001','CF00000002'],'after reconnection the next full read works');
 s.plugin.batch({keys:[...'CF0000000'].map((k,i)=>({k,t:10000+i*3,r:0})).concat([{k:'Backspace',t:10030,r:0},{k:'1',t:10033,r:0},{k:'Enter',t:10036,r:0}])});
 assert.equal(s.reads.length,2,'unexpected keys invalidate the read');
});
await test('owner/branch/user/cut changes advance the generation; stale reads and their tails never reach the new owner',async()=>{
 const s=setup();await tick();
 for(const change of [{branch:'B'},{contextKey:'otro-cajero:caja'},{contextKey:'otro-cajero:otra-caja'}]){
  const before=s.plugin.st.gen;
  s.setOpts(change);await tick();
  assert(s.plugin.st.gen>before,'native receives the new generation');
  s.plugin.batch({codigo:'CF000',fin:'invalidado',gen:before});
  s.plugin.batch({codigo:'00001'});
  s.plugin.batch({codigo:'CF00000001',gen:before});
  assert.deepEqual(s.reads,[],JSON.stringify(change));
 }
 s.plugin.batch({codigo:'CF00000001'});assert.deepEqual(s.reads,['CF00000001']);
});
await test('payment/dialog or disabled owner: read is consumed and ignored',async()=>{
 const s=setup();await tick();
 s.setOpts({enabled:false});await tick();
 s.plugin.batch({codigo:'CF00000001'});assert.deepEqual(s.reads,[]);
 assert(s.events.some(e=>e.type==='invalid'));
 s.setOpts({enabled:true});await tick();
 s.plugin.batch({codigo:'CF00000001'});assert.deepEqual(s.reads,['CF00000001']);
});
await test('settings change reconfigures native timing and invalidates in-flight reads',async()=>{
 const s=setup();await tick();const g=s.plugin.st.gen;
 s.setConfig({version:1,enabled:true,profile:'compatible',maxGap:400});await tick();
 assert(s.plugin.calls.some(c=>c[0]==='configurar'&&c[1].maxGap===400));assert(s.plugin.st.gen>g);
});
await test('pairing: three consecutive identical reads from one device; other devices, failures and ambiguity reset it',async()=>{
 const changes=[];const session=m.createPairingSession({getSettings:()=>({version:1,enabled:true,profile:'f9',maxGap:250}),onChange:x=>changes.push(x)});
 const p=fakePlugin();const kb={id:9,descriptor:'kb',vendorId:1133,productId:49948,nombre:'Keyboard'};
 const send=o=>{const b=p.batch({origen:'vinculacion',...o});session.handle(b);};
 send({codigo:'CFDIAG0001'});send({codigo:'CFDIAG0001',device:kb});
 assert.equal(session.snapshot.streak,1,'a read from another device restarts the count');
 send({codigo:'CFDIAG0001',t0:2000});send({codigo:'CFDIAG0001',fin:'tiempo',t0:3000});
 assert.equal(session.snapshot.streak,0);assert.equal(session.snapshot.readings.at(-1).ok,false);
 for(let i=0;i<2;i++)send({codigo:'CFDIAG0001',t0:4000+i*100});assert.equal(session.snapshot.ready,false);
 send({codigo:'CFDIAG0001',t0:4500});assert.equal(session.snapshot.ready,true);
 assert.equal(session.snapshot.candidate.descriptor,'d');
 const amb=m.createPairingSession({getSettings:()=>({version:1,enabled:true,profile:'f9',maxGap:250})});
 for(let i=0;i<3;i++)amb.handle(p.batch({origen:'vinculacion',codigo:'X1',iguales:2,t0:5000+i*100}));
 assert.equal(amb.snapshot.ready,false);assert.equal(amb.snapshot.problem,'ambiguo');
 const zero=m.createPairingSession({getSettings:()=>({version:1,enabled:true,profile:'f9',maxGap:250})});
 for(let i=0;i<3;i++)zero.handle(p.batch({origen:'vinculacion',codigo:'X1',device:{id:3,descriptor:'z',vendorId:0,productId:0,nombre:'HID'},t0:6000+i*100}));
 assert.equal(zero.snapshot.ready,false);assert.equal(zero.snapshot.problem,'identidad');
 const mixed=m.createPairingSession({getSettings:()=>({version:1,enabled:true,profile:'f9',maxGap:250})});
 ['A1','A1','B2'].forEach((c,i)=>mixed.handle(p.batch({origen:'vinculacion',codigo:c,t0:7000+i*100})));
 assert.equal(mixed.snapshot.streak,1,'three reads must be the same code');
});
await test('pairing batches never reach the sale owner; bind errors keep their code',async()=>{
 const s=setup();await tick();const seen=[];s.c.subscribePairing(b=>seen.push(b));
 s.plugin.batch({origen:'vinculacion',codigo:'CF00000001'});assert.deepEqual(s.reads,[]);assert.equal(seen.length,1);
 await assert.rejects(()=>s.c.nativeBridge.bind({descriptor:'d',vendorId:1,productId:2,nombre:'x'}),e=>e.code==='PERSISTENCIA');
});
await test('printer selector: HID reader never selectable; vendor-class ESC/POS kept; old APK only printer-class',async()=>{
 const nuevo=m.clasificarDispositivosUSB({clasificado:true,dispositivos:[
  {nombre:'Scanner',vendorId:1,productId:2,esImpresora:false,tipo:'lector_teclado',seleccionable:true},
  {nombre:'Propietaria',vendorId:3,productId:4,esImpresora:false,tipo:'propietaria',seleccionable:true},
  {nombre:'Impresora',vendorId:5,productId:6,esImpresora:true,tipo:'impresora',seleccionable:true},null]});
 assert.deepEqual(nuevo.map(d=>[d.nombre,d.seleccionable]),[['Impresora',true],['Propietaria',true],['Scanner',false]],'native flag cannot make a reader selectable');
 const viejo=m.clasificarDispositivosUSB({dispositivos:[{nombre:'Scanner',vendorId:1,productId:2,esImpresora:false},{nombre:'Impresora',vendorId:5,productId:6,esImpresora:true}]});
 assert.deepEqual(viejo.map(d=>[d.nombre,d.tipo,d.seleccionable]),[['Impresora','impresora',true],['Scanner','sin_interfaz',false]]);
 assert.equal(m.eleccionInvalida({usbVendorId:1,usbProductId:2},nuevo)?.nombre,'Scanner');
 assert.equal(m.eleccionInvalida({usbVendorId:5,usbProductId:6},nuevo),null);
 assert.equal(m.eleccionInvalida({usbVendorId:null,usbProductId:null},nuevo),null);
 assert.deepEqual(m.clasificarDispositivosUSB(undefined),[]);
});
console.log(JSON.stringify({tests:12,failures,baseline}));
if(baseline){if(!failures.length){console.error('Baseline unexpectedly passed: the tests do not detect the missing integration.');process.exitCode=1;}}
else if(failures.length)process.exitCode=1;

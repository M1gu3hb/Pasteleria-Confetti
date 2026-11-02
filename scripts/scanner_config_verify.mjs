import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const baseline=process.argv.includes('--baseline');
const out=await build({stdin:{contents:`export * from './src/lib/scannerConfig.js';export * from './src/lib/scannerCapture.js';export * from './src/lib/barcodeFrame.js';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false,plugins:baseline?[{name:'old-frame',setup(b){b.onLoad({filter:/src\/lib\/barcodeFrame.js$/},a=>({contents:execFileSync('git',['show','189b580:src/lib/barcodeFrame.js'],{encoding:'utf8'}),loader:'js',resolveDir:process.cwd()+'/src/lib'}));}}]:[]});
const m=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const failures=[];
const test=(name,fn)=>{try{fn();console.log('PASS',name);}catch(e){failures.push(name);console.error('FAIL',name,e.message);}};
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};globalThis.window=new EventTarget();
test('existing settings preserved, recommended F9 explicit, restart and off state',()=>{
 assert.equal(m.readScannerSettings().config.profile,'compatible');
 const c=m.saveScannerConfig({...m.SCANNER_RECOMMENDED,enabled:false,maxGap:400});
 assert.deepEqual(m.readScannerSettings().config,c);assert.equal(m.readScannerSettings().config.enabled,false);
});
test('invalid raw settings and unavailable storage fail closed without successful save',()=>{
 for(const value of [null,{},[],{...m.SCANNER_RECOMMENDED,enabled:'true'},{...m.SCANNER_RECOMMENDED,maxGap:NaN},{...m.SCANNER_RECOMMENDED,maxGap:49},{...m.SCANNER_RECOMMENDED,maxGap:1001},{...m.SCANNER_RECOMMENDED,profile:'tab'},{...m.SCANNER_RECOMMENDED,maxGap:250.5}])assert.throws(()=>m.validateScannerConfig(value));
 store.set(m.SCANNER_KEY,'broken');assert.equal(m.readScannerSettings().config.enabled,false);assert(m.readScannerSettings().error);
 const prev=localStorage.setItem;localStorage.setItem=()=>{throw Error('denied');};assert.throws(()=>m.saveScannerConfig(m.SCANNER_RECOMMENDED),/No se pudo guardar/);localStorage.setItem=prev;
});
test('S01 repeated prefix never turns a tail into a different product',()=>{
 const scans=[],events=[];let t=1000;
 const frame=m.createBarcodeFrame({getContext:()=>({branch:'A',contextKey:'owner:cut',enabled:true}),isModalOpen:()=>false,onScan:c=>scans.push(c),onDraft:()=>{},onReading:()=>{},onStatus:()=>{},onEvent:e=>events.push(e)});
 const key=(key,repeat=false)=>frame.handle({key,repeat,isTrusted:false,preventDefault(){},stopPropagation(){}},{},t+=5);
 key('F9');for(const c of 'ABC')key(c);key('F9',true);for(const c of '0012345')key(c);key('Enter');
 assert.deepEqual(scans,['ABC0012345']);assert.equal(events.filter(e=>e.type==='duplicate').length,1);
});
test('single DOM listener, ownership/config changes quarantine old tails, duplicate event identity',()=>{
 class DOM extends EventTarget{querySelectorAll(){return [];}hidden=false;}
 const doc=new DOM(),win=new EventTarget();win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;
 let config={...m.SCANNER_RECOMMENDED},changed;
 const c=m.createScannerCapture({doc,win,readSettings:()=>({config}),subscribeSettings:fn=>{changed=fn;return()=>{};}});
 const reads=[],events=[];const opts={enabled:true,active:true,branch:'A',contextKey:'sale',onScan:v=>reads.push(v),onEvent:e=>events.push(e)};
 let reg=c.register(opts,()=>{});
 const event=key=>Object.assign(new Event('keydown',{cancelable:true}),{key,repeat:false,isComposing:false});
 const key=k=>doc.dispatchEvent(event(k));
 key('F9');key('A');reg.remove();reg=c.register({...opts,contextKey:'new-route'},()=>{});for(const k of '0012345')key(k);key('Enter');assert.deepEqual(reads,[]);
 key('F9');for(const k of '0012345')key(k);key('Enter');assert.deepEqual(reads,['0012345']);
 key('F9');key('A');config={...config,maxGap:500};changed();for(const k of '0012345')key(k);key('Enter');assert.equal(reads.length,1);
 key('F9');const e=event('A');doc.dispatchEvent(e);doc.dispatchEvent(e);key('B');key('Enter');assert.equal(reads.at(-1),'AB');assert(events.some(e=>e.type==='duplicate'));
 reg.remove();c.dispose();
});
console.log(JSON.stringify({tests:4,failures}));if(failures.length)process.exitCode=1;

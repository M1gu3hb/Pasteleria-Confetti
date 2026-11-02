// Independent finite model: a full valid frame enters only in its original allowed context.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/lib/barcodeFrame.js'],bundle:true,write:false,format:'esm'});
const {createBarcodeFrame}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
let seed=Number(process.env.SEED)||1701126;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};const alphabet='ABCxyz0123456789._/-';let runs=0;
for(let iteration=0;iteration<2000;iteration++){
 const code='A'+Array.from({length:1+rand(63)},()=>alphabet[rand(alphabet.length)]).join('');
 const prefix=!!rand(2),editing=!!rand(2),enabled=!!rand(2),initialModal=!!rand(2),transition=rand(4);
 let ctx={branch:'A',contextKey:'owner:cut',enabled},modal=initialModal,received=[],reading=false,now=1000;
 const frame=createBarcodeFrame({getContext:()=>ctx,isModalOpen:()=>modal,onScan:c=>received.push(c),onDraft:()=>{},onReading:v=>reading=v,onStatus:()=>{}});
 const key=key=>frame.handle({key,preventDefault(){},stopPropagation(){}},{editing},now+=1+rand(9));if(prefix)key('F9');
 for(let i=0;i<code.length;i++){
  if(i===Math.floor(code.length/2)&&transition){
   if(transition===1)ctx={...ctx,branch:'B'};
   if(transition===2)ctx={...ctx,contextKey:'other:cut'};
   if(transition===3)ctx={...ctx,enabled:!ctx.enabled};frame.invalidate();
  }
  key(code[i]);
 }
 key('Enter');const expected=enabled&&!initialModal&&(prefix||!editing)&&transition===0?[code]:[];
 assert.deepEqual(received,expected,JSON.stringify({iteration,prefix,editing,enabled,initialModal,transition}));assert.equal(reading,false);runs++;
}
console.log('PASS finite model:',runs,'seeded frames across valid alphabets, focus, modal, enable, branch and cashier/cut transitions; no additional finding.');

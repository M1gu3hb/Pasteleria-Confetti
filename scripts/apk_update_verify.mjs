// Aviso "Actualización pendiente" del APK: manifiesto, versión instalada, hosts que Android abre en
// el navegador (réplica de HostMask de Capacitor) y coherencia con capacitor.config.ts / el JSON
// publicado. Usa el módulo REAL src/native/apkUpdate.js con un plugin falso que sigue el contrato
// de ConfettiAppPlugin. --baseline: a447a91 no tiene el módulo (debe fallar).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
const baseline=process.argv.includes('--baseline');
if(baseline&&!fs.existsSync('src/native/apkUpdate.js')){console.log('baseline: sin módulo de actualización');process.exit(1);}
const out=await build({stdin:{contents:`export * from './src/native/apkUpdate.js';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false,logLevel:'silent',
 plugins:[{name:'fake',setup(b){b.onResolve({filter:/confettiAppPlugin$/},()=>({path:'p',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const ConfettiApp={};export const isNativeApp=()=>true;',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const failures=[];
const test=async(n,f)=>{try{await f();console.log('PASS',n);}catch(e){failures.push(n);console.error('FAIL',n,e.message);}};
const SHA='e347e050b2d9050f8fa52414fefc5ed35cfad17d5b0cd3392b41d9ed3ab6c29d';
const base={esquema:1,publicada:true,versionCode:5,versionName:'1.3.0',apk:'https://raw.githubusercontent.com/M1gu3hb/Pasteleria-Confetti/descargas-apk/ConfettiPOS-1.3.0.apk',sha256:SHA,cambios:['Lector de códigos']};

await test('manifiesto publicado y válido; cualquier dato crudo inválido = sin aviso',()=>{
 assert.equal(m.validarManifiesto(base).versionCode,5);
 const malos=[null,undefined,NaN,'',[],{},{...base,publicada:false},{...base,publicada:'true'},{...base,esquema:2},{...base,versionCode:'5'},{...base,versionCode:5.5},{...base,versionCode:0},{...base,versionCode:null},
  {...base,versionName:''},{...base,versionName:null},{...base,apk:'http://x.com/a.apk'},{...base,apk:'javascript:alert(1)'},{...base,apk:null},{...base,sha256:''},{...base,sha256:SHA.slice(1)},{...base,sha256:null},
  {...base,cambios:[]},{...base,cambios:'texto'},{...base,cambios:[null]},{...base,cambios:['']},{...base,pagina:'http://x.com'}];
 for(const v of malos)assert.equal(m.validarManifiesto(v),null,JSON.stringify(v));
});
await test('el JSON del repo es coherente y queda APAGADO hasta subir el APK firmado',()=>{
 const raw=JSON.parse(fs.readFileSync('public/apk/actualizacion.json','utf8'));
 const gradle=fs.readFileSync('android/app/build.gradle','utf8');
 assert.equal(raw.versionCode,Number(gradle.match(/versionCode (\d+)/)[1]),'versionCode del aviso = build.gradle');
 assert.equal(raw.versionName,gradle.match(/versionName "([^"]+)"/)[1]);
 assert.equal(raw.certificadoSha256,'5074a110f20482e83c28d294af78b420415181250a4e8177be3f1096f9ebf610','certificado de la llave de Miguel (APK 1.1.1 publicado)');
 assert(m.abreFueraDeLaApp(raw.apk),'APK 1.1.1 debe poder abrir el enlace en Chrome');
 if(raw.publicada===true){assert(m.validarManifiesto(raw),'publicado pero inválido');console.log('  aviso PUBLICADO para',raw.versionName);}
 else{assert.equal(m.validarManifiesto(raw),null);console.log('  aviso apagado (publicada:false)');}
});
await test('hosts: los de la app se quedan dentro; GitHub raw abre el navegador (HostMask de Capacitor)',()=>{
 const cfg=fs.readFileSync('capacitor.config.ts','utf8');
 const allow=[...cfg.matchAll(/^\s*'([^']+)',?\s*$/gm)].map(x=>x[1]);
 const url=new URL(cfg.match(/url: '([^']+)'/)[1]).hostname;
 assert.deepEqual([...m.HOSTS_DENTRO_DE_LA_APP].sort(),[...new Set([url,...allow])].sort(),'lista igual a capacitor.config.ts');
 for(const u of ['https://confetti-inst-ead772fe6540.vercel.app/ConfettiPOS.apk','https://CONFETTI-INST-EAD772FE6540.VERCEL.APP/a.apk','https://confetti-inst-ead772fe6540.vercel.app./a.apk','https://ivqcxdpqxwjxfohiswqb.supabase.co/storage/v1/object/public/a.apk','https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app/x'])
  assert.equal(m.abreFueraDeLaApp(u),false,u);
 for(const u of ['http://raw.githubusercontent.com/a.apk','javascript:alert(1)','','nada',null,undefined])assert.equal(m.abreFueraDeLaApp(u),false,String(u));
 assert.equal(m.abreFueraDeLaApp('https://raw.githubusercontent.com/M1gu3hb/Pasteleria-Confetti/descargas-apk/ConfettiPOS-1.3.0.apk'),true);
 assert.equal(m.abreFueraDeLaApp('https://a.b.vercel.app/x'),true,'Capacitor exige mismo número de etiquetas para *.vercel.app');
 assert.equal(m.coincideHost('*.vercel.app','x.vercel.app'),true);assert.equal(m.coincideHost('*.vercel.app','vercel.app'),false);
});
await test('versión instalada: APK viejo sin plugin = 1.1.1; 1.3.0 informa; errores u otros datos = sin aviso; navegador = nada',async()=>{
 const notImpl=()=>{const e=new Error('"ConfettiApp" plugin is not implemented on android');e.code='UNIMPLEMENTED';throw e;};
 assert.deepEqual(await m.leerVersionInstalada({plugin:{info:async()=>notImpl()},isNative:()=>true}),{versionCode:3,versionName:'1.1.1 o anterior',actualizadorNativo:false});
 assert.deepEqual(await m.leerVersionInstalada({plugin:{info:async()=>({versionCode:5,versionName:'1.3.0',actualizadorNativo:true})},isNative:()=>true}),{versionCode:5,versionName:'1.3.0',actualizadorNativo:true});
 for(const r of [null,{versionCode:'5'},{versionCode:NaN},{versionCode:0},{}])assert.equal(await m.leerVersionInstalada({plugin:{info:async()=>r},isNative:()=>true}),null,JSON.stringify(r));
 assert.equal(await m.leerVersionInstalada({plugin:{info:async()=>{throw new Error('INFO');}},isNative:()=>true}),null);
 let llamado=false;assert.equal(await m.leerVersionInstalada({plugin:{info:async()=>{llamado=true;}},isNative:()=>false}),null);assert.equal(llamado,false);
});
await test('hay aviso sólo si la publicada es más nueva que la instalada',()=>{
 const man=m.validarManifiesto(base);
 assert.equal(m.hayActualizacion(man,{versionCode:3}),true);
 assert.equal(m.hayActualizacion(man,{versionCode:5}),false);
 assert.equal(m.hayActualizacion(man,{versionCode:6}),false);
 assert.equal(m.hayActualizacion(null,{versionCode:3}),false);
 assert.equal(m.hayActualizacion(man,null),false);
 assert.equal(m.hayActualizacion(man,{versionCode:'3'}),false);
});
await test('lectura del manifiesto: sin caché, HTML de la SPA o error = sin aviso',async()=>{
 let pedido;const ok=await m.leerManifiesto(async(u,o)=>{pedido=[u,o];return {ok:true,json:async()=>base};});
 assert.equal(ok.versionCode,5);assert.match(pedido[0],/^\/apk\/actualizacion\.json\?t=\d+$/);assert.equal(pedido[1].cache,'no-store');
 assert.equal(await m.leerManifiesto(async()=>({ok:true,json:async()=>{throw new SyntaxError('<!doctype html>');}})),null);
 assert.equal(await m.leerManifiesto(async()=>({ok:false})),null);
 assert.equal(await m.leerManifiesto(async()=>null),null);
});
await test('instalación con plugin manda exactamente URL, huella y versión anunciadas',async()=>{
 let args;await m.instalarConPlugin(m.validarManifiesto(base),{descargarEInstalar:async a=>{args=a;}});
 assert.deepEqual(args,{url:base.apk,sha256:SHA,versionCode:5});
});
console.log(JSON.stringify({tests:7,failures}));if(failures.length)process.exitCode=1;

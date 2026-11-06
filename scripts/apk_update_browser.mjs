// Aviso "Actualización pendiente": componente REAL en Chromium, con el plugin ConfettiApp emulado
// (APK 1.1.1 sin plugin / APK 1.3.0 con plugin / navegador) y el manifiesto servido por fetch.
// Emulación de la web; no prueba el instalador de Android ni Chrome del dispositivo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const root=process.cwd();
const require=createRequire(path.join(process.env.CONFETTI_QA_MODULES||root,'package.json'));
const {chromium}=require('playwright');
const fake=`export const isNativeApp=()=>window.appFake.native;
export const ConfettiApp={
 async info(){const f=window.appFake;f.calls.push(['info']);if(f.info==='viejo'){const e=new Error('"ConfettiApp" plugin is not implemented on android');e.code='UNIMPLEMENTED';throw e;}return {versionCode:f.versionCode,versionName:f.versionName,actualizadorNativo:true,paquete:'com.mhastral.confettipos'};},
 async descargarEInstalar(a){const f=window.appFake;f.calls.push(['descargarEInstalar',a]);if(f.instalar==='permiso'){const e=new Error('Android necesita permiso');e.code='PERMISO';throw e;}if(f.instalar==='firma'){const e=new Error('El archivo no está firmado con la llave de Confetti POS. No se instaló.');e.code='FIRMA';throw e;}return {instalador:true};},
 async abrirEnNavegador(a){window.appFake.calls.push(['abrirEnNavegador',a]);return {abierto:true};},
};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Banner from './src/components/common/ActualizacionApkBanner.jsx';
createRoot(document.getElementById('root')).render(<div className="p-4"><Banner/><button>Cobrar $250.00</button></div>);`;
const out=await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'iife',alias:{'@':root+'/src'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',
 plugins:[{name:'fake',setup(b){b.onResolve({filter:/confettiAppPlugin$/},()=>({path:'p',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:fake,loader:'js'}));}}]});
const css=fs.readdirSync(root+'/dist/assets').find(p=>p.endsWith('.css'));
const server=http.createServer((req,res)=>{
 if(req.url==='/app.js'){res.setHeader('content-type','application/javascript');res.end(out.outputFiles[0].contents);}
 else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(fs.readFileSync(root+'/dist/assets/'+css));}
 else {res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');}
});
await new Promise(r=>server.listen(4181,'127.0.0.1',r));
const SHA='e347e050b2d9050f8fa52414fefc5ed35cfad17d5b0cd3392b41d9ed3ab6c29d';
const RAW='https://raw.githubusercontent.com/M1gu3hb/Pasteleria-Confetti/descargas-apk/ConfettiPOS-1.3.0.apk';
const publicado={esquema:1,publicada:true,versionCode:5,versionName:'1.3.0',fecha:'2026-11-06',apk:RAW,pagina:'https://confetti-inst-ead772fe6540.vercel.app/',sha256:SHA,cambios:['Lector de códigos de barras USB.','Las siguientes actualizaciones se instalan desde este aviso.']};
const repo=JSON.parse(fs.readFileSync('public/apk/actualizacion.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
const failures=[];
async function abrir({native=true,info='viejo',versionCode=5,versionName='1.3.0',instalar='ok',manifiesto=publicado,viewport={width:1280,height:900}}={}){
 const context=await browser.newContext({viewport});const p=await context.newPage();p.setDefaultTimeout(8000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(([cfg,man])=>{
  window.appFake={...cfg,calls:[]};window.manifestCalls=0;
  const real=window.fetch.bind(window);
  window.fetch=async(u,o)=>{if(String(u).startsWith('/apk/actualizacion.json')){window.manifestCalls++;
   if(man==='html')return new Response('<!doctype html><html></html>',{status:200,headers:{'content-type':'text/html'}});
   return new Response(JSON.stringify(man),{status:200,headers:{'content-type':'application/json'}});}return real(u,o);};
 },[{native,info,versionCode,versionName,instalar},manifiesto]);
 await p.goto('http://127.0.0.1:4181');await p.waitForTimeout(400);
 return {p,context,errors};
}
const region=p=>p.getByRole('region',{name:'Actualización pendiente'});
const cases={
 async navegador_nunca_muestra_ni_consulta(){const {p,context,errors}=await abrir({native:false});assert.equal(await region(p).count(),0);assert.equal(await p.evaluate(()=>window.manifestCalls),0);assert.deepEqual(errors,[]);await context.close();},
 async manifiesto_del_repo_apagado(){const {p,context}=await abrir({manifiesto:repo});if(repo.publicada!==true)assert.equal(await region(p).count(),0,'sin APK firmado no debe aparecer');await context.close();},
 async html_o_invalido_no_muestra(){for(const man of ['html',{...publicado,sha256:''},{...publicado,publicada:false}]){const {p,context}=await abrir({manifiesto:man});assert.equal(await region(p).count(),0,JSON.stringify(man).slice(0,60));await context.close();}},
 async apk_viejo_ve_aviso_grande_con_enlace_externo(){
  const {p,context,errors}=await abrir();
  const r=region(p);await r.getByRole('heading',{name:/Actualización pendiente/}).waitFor();
  await r.getByText('1.1.1 o anterior').waitFor();
  await r.getByText('Lector de códigos de barras USB.').waitFor();
  await r.getByText(/se abrirá Chrome/).waitFor();
  const a=r.getByRole('link',{name:'Actualizar ahora'});assert.equal(await a.getAttribute('href'),RAW);
  assert.equal(await p.getByRole('dialog').count(),0,'no es un diálogo: no pausa el lector ni bloquea el cobro');
  await p.getByRole('button',{name:'Cobrar $250.00'}).click({trial:true});
  assert.deepEqual(errors,[]);await context.close();
 },
 async apk_al_dia_no_ve_aviso(){const {p,context}=await abrir({info:'nuevo',versionCode:5});assert.equal(await region(p).count(),0);await context.close();},
 async apk_130_actualiza_desde_la_app(){
  const {p,context}=await abrir({info:'nuevo',versionCode:5,manifiesto:{...publicado,versionCode:6,versionName:'1.4.0'}});
  const r=region(p);await r.getByText('Esta terminal tiene la').waitFor();
  await r.getByRole('button',{name:'Actualizar ahora'}).click();
  await r.getByRole('status').filter({hasText:'Se abrió el instalador'}).waitFor();
  const call=await p.evaluate(()=>window.appFake.calls.find(c=>c[0]==='descargarEInstalar')[1]);
  assert.deepEqual(call,{url:RAW,sha256:SHA,versionCode:6});
  await context.close();
 },
 async permiso_y_error_de_firma(){
  let {p,context}=await abrir({info:'nuevo',versionCode:5,instalar:'permiso',manifiesto:{...publicado,versionCode:6}});
  await region(p).getByRole('button',{name:'Actualizar ahora'}).click();
  await region(p).getByRole('status').filter({hasText:'Permitir de esta fuente'}).waitFor();
  assert.equal(await region(p).getByRole('button',{name:'Descargar con el navegador'}).count(),0);
  await context.close();
  ({p,context}=await abrir({info:'nuevo',versionCode:5,instalar:'firma',manifiesto:{...publicado,versionCode:6}}));
  await region(p).getByRole('button',{name:'Actualizar ahora'}).click();
  await region(p).getByRole('status').filter({hasText:'no está firmado con la llave'}).waitFor();
  await region(p).getByRole('button',{name:'Descargar con el navegador'}).click();
  assert.deepEqual(await p.evaluate(()=>window.appFake.calls.find(c=>c[0]==='abrirEnNavegador')[1]),{url:RAW});
  await context.close();
 },
 async mas_tarde_minimiza_y_persiste(){
  const {p,context}=await abrir();
  await region(p).getByRole('button',{name:'Más tarde'}).click();
  await region(p).getByText('Actualización 1.3.0 pendiente').waitFor();
  await p.reload();await p.waitForTimeout(400);
  await region(p).getByText('Actualización 1.3.0 pendiente').waitFor();
  await region(p).getByRole('button',{name:'Ver y actualizar'}).click();
  await region(p).getByRole('heading',{name:/Actualización pendiente/}).waitFor();
  await context.close();
 },
 async telefono_sin_desbordar(){
  const {p,context}=await abrir({viewport:{width:390,height:844}});
  await region(p).getByRole('heading',{name:/Actualización pendiente/}).waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'sin scroll horizontal');
  await context.close();
 },
};
try{
 for(const [n,f] of Object.entries(cases)){try{await f();console.log('PASS apk update browser',n);}catch(e){failures.push(n);console.error('FAIL apk update browser',n,e.message);}}
}finally{await browser.close();server.close();}
console.log(JSON.stringify({failures}));if(failures.length)process.exitCode=1;

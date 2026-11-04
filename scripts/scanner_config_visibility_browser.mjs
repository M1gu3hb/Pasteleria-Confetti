// Real Configuracion, Radix tabs, route guard and scanner; synthetic data and
// placeholders only for unrelated settings sections. No business credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const root=process.cwd();
const require=createRequire(path.join(process.env.CONFETTI_QA_MODULES||root,'package.json'));
const {chromium}=require('playwright');
const mocks={
 base44Client:`export const base44={entities:new Proxy({},{get:()=>({list:async()=>[{id:'qa-config'}],filter:async()=>[],get:async()=>null,update:async()=>{window.fixture.writes++;throw Error('Unexpected write');}})})};`,
 supabaseClient:`export const supabase={rpc:async()=>{window.fixture.writes++;throw Error('Unexpected RPC');}};export const ensureSession=async()=>{};`,
 POSAuthContext:`export const usePOSAuth=()=>({posUser:{id:'qa-owner',rol:window.fixture.role}});`,
 TerminalContext:`export const useTerminal=()=>({adminMode:['dueño','dueno','administrador'].includes(window.fixture.role),adminRole:window.fixture.role==='dueño'?'dueno':window.fixture.role});`,
 ConfigContext:`export const useConfig=()=>({paquete_modo:'esencial',config:{}});`,
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Configuracion from './src/pages/Configuracion.jsx';import AdminRoute from './src/components/common/AdminRoute.jsx';
window.fixture={role:new URL(location.href).searchParams.get('qaRole')||'dueño',writes:0};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[location.pathname+location.search]}><Routes><Route path='/configuracion' element={<AdminRoute soloDueno><Configuracion/></AdminRoute>}/><Route path='/caja' element={<h1>Acceso de caja</h1>}/></Routes></MemoryRouter></QueryClientProvider>);`;
const out=await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'iife',alias:{'@':root+'/src'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundary',setup(b){
 if(process.env.BASELINE)b.onLoad({filter:/src\/pages\/Configuracion.jsx$/},a=>({contents:execFileSync('git',['show','dade1cc:src/pages/Configuracion.jsx'],{encoding:'utf8'}),loader:'jsx',resolveDir:path.dirname(a.path)}));
 b.onResolve({filter:/(base44Client|supabaseClient|POSAuthContext|TerminalContext|ConfigContext)$/},a=>{const n=a.path.split('/').at(-1);return mocks[n]?{path:n,namespace:'fixture'}:null;});
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:root}));
 b.onLoad({filter:/components\/(configuracion\/(ImpresoraTermicaSection|ImpresoraCajonAppSection|PastelesConfigSection|ModoPresentacion|ReiniciarSistemaSection|CategoriasProductoSection|IdentidadNegocio|UsuarioPOSDialog)|datos\/DatosSection).jsx$/},()=>({contents:`import React from 'react';export default function Placeholder(){return <div data-unrelated-settings/>;}`,loader:'jsx'}));
}}]});
const css=fs.readFileSync(root+'/dist/assets/'+fs.readdirSync(root+'/dist/assets').find(f=>f.endsWith('.css')));
const server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','application/javascript');res.end(out.outputFiles[0].contents);}else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root" class="p-4"></div><script src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(4181,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:800,height:1100}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4181/configuracion');const tab=page.getByRole('tab',{name:'Escáner',exact:true});await tab.waitFor();assert(await tab.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
 await tab.click();const section=page.getByRole('region',{name:'Escáner de códigos de barras',exact:true});await section.waitFor();assert.equal(await page.getByRole('button',{name:'Guardar ajustes del escáner'}).count(),1);
 await page.getByRole('tab',{name:'Operación',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Guardar ajustes del escáner'}).count(),0);
 await page.goto('http://127.0.0.1:4181/configuracion?seccion=escaner');await section.waitFor();assert.equal(await tab.getAttribute('aria-selected'),'true');
 await page.getByRole('button',{name:'Probar escáner',exact:true}).click();await page.getByLabel('Zona de prueba',{exact:true}).focus();for(let i=0;i<3;i++){await page.keyboard.press('F9');await page.keyboard.type('CFDIAG0001',{delay:3});await page.keyboard.press('Enter');}
 await page.getByText('Recibidas como tres lecturas separadas',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>fixture.writes),0);
 await page.setViewportSize({width:360,height:800});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'/tmp/confetti-config-escaner-visible.png',fullPage:true});
 for(const role of ['administrador','caja','pastelero']){await page.goto('http://127.0.0.1:4181/configuracion?seccion=escaner&qaRole='+role);await page.getByRole('heading',{name:'Acceso de caja'}).waitFor();assert.equal(await page.getByRole('tab',{name:'Escáner',exact:true}).count(),0);}
 assert.deepEqual(errors,[]);console.log('PASS real settings screen: visible scanner tab, deep link, single mount, three diagnostics, zero writes, mobile layout and unchanged owner-only route.');
}finally{await browser?.close();server.close();}

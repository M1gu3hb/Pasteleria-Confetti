// Prueba opcional de navegador con Playwright/Chromium disponibles en el entorno.
// Datos y contextos aislados; componentes React y CSS del build son los reales.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'confetti-pedidos-browser-'));
const css=fs.readdirSync(path.join(root,'dist/assets')).find(n=>n.endsWith('.css'));
assert(css,'run npm run build first');
const mocks={
  base44Client:`export const base44={entities:{Sucursal:{filter:async()=>window.fixture.branches},PedidoPastel:{filterAll:async criteria=>{window.fixture.queries.push(criteria);if(criteria.sucursal_id==='A')await new Promise(r=>setTimeout(r,150));return window.fixture.orders.map(p=>({...p}));}}}};`,
  TerminalContext:`import React from 'react';export function useTerminal(){const [scope,setScope]=React.useState(window.fixture.scope);React.useEffect(()=>{window.fixture.setScope=setScope;},[]);return scope;}`,
  useCajaAbierta:`export const useCajaAbierta=()=>({hayCaja:false});`,
  ConfigContext:`export const useConfig=()=>({config:{}});`,
  supabaseClient:`export const supabase={};export const ensureSession=async()=>{};`,
  PedidoPastelDetalleDialog:`import React from 'react';export default function Detail({pedido,open}){return open?<div data-testid="detalle" className="border p-3">Detalle {pedido.folio}</div>:null;}`,
};
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import PedidosPastel from './src/pages/PedidosPastel.jsx';
import TicketPastelConfetti from './src/components/pedidos/TicketPastelConfetti.jsx';
import {fechaCDMX,buildWhatsAppLink} from './src/utils/pedidoPastelUtils.js';
const branches=[{id:'A',nombre:'Xochimilco',orden_visual:1},{id:'B',nombre:'Topilejo',orden_visual:2},{id:'C',nombre:'San Gregorio',orden_visual:3}];
const mk=(id,branch,hour,date=fechaCDMX())=>({id,folio:id,cliente_nombre:'Cliente de ejemplo',cliente_telefono:'5500000000',sucursal_id:branch,sucursal_nombre:branches.find(b=>b.id===branch).nombre,fecha_entrega:date,hora_entrega:hour,kilos:9,estado:'confirmado',origen:'pos_interno',tipo_pedido:'pastel_personalizado',incluye_base:true,precio_base:120,subtotal_pastel:1260,total_final:1380,total_abonado:500,saldo_pendiente:880,a_cuenta:100});
window.fixture={branches,scope:{adminRole:'pastelero',sucursalEfectiva:null},queries:[],orders:[mk('A-17','A','17:00'),mk('Z-15','A','15:00'),mk('B-15','B','15:00'),mk('C-10','C','10:00'),mk('C-18','C','18:00'),mk('C-SIN','C',null),mk('C-MANANA','C','15:00',fechaCDMX(1)),{...mk('A-ENTREGADO','A','14:00'),estado:'entregado'},{...mk('A-CATALOGO','A','14:00'),tipo_pedido:'productos_catalogo'}]};
window.fixture.whatsapp=new URL(buildWhatsAppLink(window.fixture.orders[1])).searchParams.get('text');
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><MemoryRouter><main className="p-4 max-w-6xl mx-auto"><PedidosPastel/><div data-testid="ticket" className="mt-5 max-w-sm"><TicketPastelConfetti pedido={window.fixture.orders[1]} config={{}}/></div></main></MemoryRouter></QueryClientProvider>);
`;
const output=await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},bundle:true,format:'iife',write:false,alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-data',setup(b){b.onResolve({filter:/(base44Client|TerminalContext|useCajaAbierta|ConfigContext|supabaseClient|PedidoPastelDetalleDialog)$/},a=>{const name=a.path.split('/').at(-1);return mocks[name]?{path:name,namespace:'fixture'}:null;});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:root}));}}],logLevel:'silent'});
const bundle=output.outputFiles[0].contents;
const server=http.createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);}
  else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,'dist/assets',css)));}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const browser=await chromium.launch({headless:true,executablePath:process.env.CONFETTI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
try{
  const page=await browser.newPage({viewport:{width:1024,height:768},timezoneId:'America/Mexico_City'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+address.port);
  const cards=()=>page.locator('button.skeu-card');
  await cards().first().waitFor();
  assert(!await cards().filter({hasText:'A-ENTREGADO'}).count());
  assert(!await cards().filter({hasText:'A-CATALOGO'}).count());
  const suc=page.getByRole('group',{name:'Sucursales',exact:true});
  await suc.getByRole('button',{name:'Xochimilco',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('button.skeu-card').length===2);
  const order=await cards().allTextContents();assert(order[0].includes('Z-15'));assert(order[1].includes('A-17'));
  assert(await page.evaluate(()=>window.fixture.queries.some(q=>q.sucursal_id==='A')));
  await cards().first().click();assert(await page.getByTestId('detalle').count());
  // Cambiar antes de recibir A, después B: React Query y guardia local siguen B.
  await suc.getByRole('button',{name:'Topilejo',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('button.skeu-card').length===1);
  assert((await cards().innerText()).includes('B-15'));assert(!await page.getByTestId('detalle').count());
  await new Promise(r=>setTimeout(r,200));assert((await cards().innerText()).includes('B-15'));
  await suc.getByRole('button',{name:'San Gregorio',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('button.skeu-card').length===4);
  assert(await page.getByText('Sucursal: San Gregorio',{exact:true}).count());
  assert((await cards().filter({hasText:'C-SIN'}).innerText()).includes('Sin hora'));
  const hours=page.getByRole('group',{name:'Horario',exact:true});
  await hours.getByRole('button',{name:'Desde 18:00',exact:true}).click();
  assert((await cards().innerText()).includes('C-18'));
  await hours.getByRole('button',{name:'Sin hora',exact:true}).click();
  assert((await cards().innerText()).includes('C-SIN'));
  // Buscar restablece horario y fecha sin soltar la sucursal.
  const search=page.getByPlaceholder('Buscar por folio, cliente, teléfono o nota interna...');
  await search.fill('B-15');assert.equal(await cards().count(),0);
  await search.fill('C-10');assert((await cards().innerText()).includes('C-10'));
  assert.equal(await hours.getByRole('button',{name:'Todas las horas',exact:true}).getAttribute('aria-pressed'),'true');
  await search.fill('');
  await page.getByRole('group',{name:'Entrega',exact:true}).getByRole('button',{name:'Hoy',exact:true}).click();
  assert.equal(await cards().count(),3);
  await hours.getByRole('button',{name:'Antes de 12:00',exact:true}).click();assert((await cards().innerText()).includes('C-10'));
  await hours.getByRole('button',{name:'12:00–17:59',exact:true}).click();assert.equal(await cards().count(),0);
  await page.getByRole('group',{name:'Entrega',exact:true}).getByRole('button',{name:'Mañana',exact:true}).click();
  assert((await cards().innerText()).includes('C-MANANA'));
  await hours.getByRole('button',{name:'Todas las horas',exact:true}).click();
  await page.getByRole('group',{name:'Entrega',exact:true}).getByRole('button',{name:'Todas',exact:true}).click();
  for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const geometry=await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('[aria-label="Accesos rápidos a filtros"] [role="group"]')];
      return {overflow:document.documentElement.scrollWidth>innerWidth,rows:rows.map(r=>{const box=r.getBoundingClientRect();const button=r.querySelector('button').getBoundingClientRect();return {x:box.x,width:box.width,height:button.height};})};
    });
    assert.equal(geometry.overflow,false);assert.equal(geometry.rows.length,4);
    assert(geometry.rows.every(r=>r.x===geometry.rows[0].x&&Math.abs(r.width-geometry.rows[0].width)<1&&r.height>=44));
    await page.screenshot({path:path.join(directory,`pedidos-${viewport.width}.png`),fullPage:true});
  }
  // El mismo horario no convierte horas según la zona del dispositivo.
  await page.evaluate(()=>{window.fixture.setScope({adminRole:null,sucursalEfectiva:{sucursal_id:'A',sucursal_nombre:'Xochimilco'}});});
  await page.waitForFunction(()=>document.querySelectorAll('button.skeu-card').length===3);
  const terminal=await cards().allTextContents();assert(terminal.every(t=>/A-17|Z-15|A-ENTREGADO/.test(t)));
  const ticket=await page.getByTestId('ticket').innerText();assert(ticket.includes('Importe de base'));assert(ticket.includes('$120.00'));assert(ticket.includes('FAVOR DE DEVOLVER LA BASE LIMPIA'));
  assert((await page.evaluate(()=>window.fixture.whatsapp)).includes('Al devolver la base limpia, se te devolverán $120.00'));
  assert.deepEqual(errors,[]);
  console.log('PASS navegador: orden, 3 sucursales, detalle/caché, filtros combinados, búsqueda, terminal, ticket y WhatsApp; sin errores de página.');
  console.log('PASS diseño: cuatro filas alineadas; controles 44px; sin desborde a 1024/768/390px. Capturas: '+directory);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

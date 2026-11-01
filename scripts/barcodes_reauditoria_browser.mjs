import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(process.env.CONFETTI_QA_MODULES?path.join(process.env.CONFETTI_QA_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');let args=['--no-sandbox'];try{args=require('@sparticuz/chromium').default.args;}catch{}
const server=spawn(process.execPath,['scripts/barcodes_browser_fixture.mjs'],{stdio:'inherit',env:{...process.env,CONFETTI_QA_REAL_PAYMENT:'1'}});let browser;
try{
 await new Promise(r=>setTimeout(r,1200));browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE||undefined,args,headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(process.env.CONFETTI_QA_BASELINE?1800:15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4179');const a=page.getByRole('region',{name:'Código de barras de Pastel de chocolate'}),b=page.getByRole('region',{name:'Código de barras de Pastel de vainilla'});
 // No input truncation when assigning; no product write on invalid full scan.
 await b.getByRole('button',{name:'Asignar o detectar'}).click();await b.getByRole('textbox',{name:'Código existente'}).fill('A'.repeat(65));await b.getByRole('button',{name:'Guardar código',exact:true}).click();await b.getByRole('alert').filter({hasText:'Código inválido'}).waitFor();assert.equal(await page.evaluate(()=>fixture.products[1].codigo_barras),undefined);
 // Invalid PDF quantity is rejected before assigning any identifier.
 await page.getByRole('button',{name:'PDF de códigos de barras',exact:true}).click();const pdf=page.getByRole('dialog');await pdf.getByRole('checkbox',{name:'Incluir Pastel de vainilla',exact:true}).check();await pdf.getByRole('spinbutton',{name:'Copias de Pastel de vainilla'}).fill('1.5');const n=await page.evaluate(()=>fixture.calls.length);await pdf.getByRole('button',{name:'Generar PDF',exact:true}).click();await pdf.getByRole('alert').filter({hasText:'1 a 100'}).waitFor();assert.equal(await page.evaluate(()=>fixture.calls.length),n);await page.keyboard.press('Escape');
 await a.getByRole('button',{name:'Generar código',exact:true}).click();await a.getByText('CF00000001',{exact:true}).waitFor();
 // Stub only the OS dialog: thermal iframe, DOM, encoder and dispatcher are real.
 await page.evaluate(()=>{
  fixture.printed=[];const append=Node.prototype.appendChild;
  Node.prototype.appendChild=function(node){const value=append.call(this,node);if(node instanceof HTMLIFrameElement)node.contentWindow.print=()=>fixture.printed.push({width:node.style.width,css:node.contentDocument.querySelector('style').textContent,html:node.contentDocument.body.innerHTML});return value;};
 });
 for(const width of [58,80]){
  await page.evaluate(async width=>{fixture.paperWidth(width);await fixture.printLabel(fixture.products[0]);const node=document.createElement('div');node.className='ticket-printable';node.textContent='Venta cliente';await fixture.printReceipt({mode:'thermal',node});},width);
  const pair=await page.evaluate(()=>fixture.printed.slice(-2));assert.equal(pair[0].css,pair[1].css,'receipt and label use same CSS');assert.equal(pair[0].width,width+'mm');assert(pair[0].html.includes('<svg'));assert(pair[0].html.includes('CF00000001'));assert(!pair[0].html.includes('<img'),'barcode must not inherit receipt logo sizing');
 }
 await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByLabel('Lector de códigos de barras').focus();const scan=async()=>{await page.keyboard.type('CF00000001',{delay:3});await page.keyboard.press('Enter');};
 await scan();await scan();await scan();await page.getByRole('status').filter({hasText:'Agregado: Pastel de chocolate'}).waitFor();await page.waitForTimeout(200);const cart=page.locator('.lg\\:flex').filter({has:page.getByRole('button',{name:/Cobrar/})});assert((await cart.innerText()).includes('$750.00'));
 // A duplicated trailing Enter may not open payment; next full scan still works.
 await page.getByRole('button',{name:/Cobrar/}).focus();await scan();await page.keyboard.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);await page.waitForTimeout(180);
 // Prefix reads in search, and consumes a whole frame in payment without editing inputs.
 const search=page.getByPlaceholder('Buscar producto...');await search.fill('vainilla');await page.keyboard.press('F9');await scan();await page.getByRole('status').filter({hasText:'Agregado: Pastel de chocolate'}).waitFor();assert.equal(await search.inputValue(),'vainilla');await search.fill('');
 await page.getByRole('button',{name:/Cobrar/}).click();await page.getByText('Cobrar venta',{exact:true}).waitFor();const money=page.getByPlaceholder('0.00',{exact:true});await money.fill('2000');const before=await page.evaluate(()=>fixture.calls.length);await page.keyboard.press('F9');await scan();assert.equal(await money.inputValue(),'2000','hardware prefix cannot alter real payment input');assert.equal(await page.evaluate(()=>fixture.calls.length),before);await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 // Existing cart snapshot stays 250; a new scan uses the current 300 price.
 await page.evaluate(()=>fixture.products[0].precio_venta=300);await page.getByLabel('Lector de códigos de barras').focus();await scan();await page.waitForTimeout(180);assert((await cart.innerText()).includes('$1,550.00'));
 // Same branch but a different cashier identity invalidates an in-flight scan.
 await page.evaluate(()=>fixture.delay=500);const previous=await cart.innerText();await scan();await page.evaluate(()=>{fixture.userId='new-owner';for(const f of fixture.userSetters)f(fixture.userId);});await page.waitForTimeout(650);assert.equal(await cart.innerText(),previous);
 assert.deepEqual(errors,[]);console.log('PASS reaudited browser: full assignment validation, PDF preflight/no writes, shared receipt/label thermal CSS at 58/80, fast repeats/CRLF, F9 focus/payment isolation, live price snapshots, same-branch identity cancellation.');
}finally{await browser?.close();server.kill();}

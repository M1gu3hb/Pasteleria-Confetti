// Optional real-browser QA. Install Playwright separately; fixtures never reach production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(process.env.CONFETTI_QA_MODULES ? path.join(process.env.CONFETTI_QA_MODULES,'package.json') : import.meta.url);
const {chromium}=require('playwright');
let args=['--no-sandbox','--disable-dev-shm-usage'];
try {args=require('@sparticuz/chromium').default.args;} catch { /* regular Playwright browser */ }

(async()=>{const server=spawn(process.execPath,['scripts/barcodes_browser_fixture.mjs'],{stdio:'inherit'});let browser;
try{
 await new Promise(r=>setTimeout(r,1300));browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE || undefined,args,headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4179');
 const chocolate=page.getByRole('region',{name:'Código de barras de Pastel de chocolate'});
 const vanilla=page.getByRole('region',{name:'Código de barras de Pastel de vainilla'});
 await chocolate.getByRole('button',{name:'Generar código',exact:true}).click();await chocolate.getByText('CF00000001',{exact:true}).waitFor();
 await vanilla.getByRole('button',{name:'Asignar o detectar',exact:true}).click();await vanilla.getByRole('textbox',{name:'Código existente'}).fill('0012345');await vanilla.getByRole('textbox',{name:'Código existente'}).press('Enter');await vanilla.getByText('0012345',{exact:true}).waitFor();
 // Collision rejected visibly; existing identifier retained.
 await vanilla.getByRole('button',{name:'Cambiar código',exact:true}).click();await vanilla.getByRole('textbox',{name:'Código existente'}).fill('CF00000001');await vanilla.getByRole('button',{name:'Guardar código',exact:true}).click();await vanilla.getByText(/etiquetas anteriores dejarán/).waitFor();await vanilla.getByRole('button',{name:'Confirmar cambio e imprimir después'}).click();await vanilla.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>fixture.products[1].codigo_barras),'0012345');
 await chocolate.getByRole('button',{name:'Ver',exact:true}).click();await page.getByRole('dialog').getByText('Código asignado al producto').waitFor();await page.keyboard.press('Escape');
 const [png]=await Promise.all([page.waitForEvent('download'),chocolate.getByRole('button',{name:'Descargar PNG'}).click()]);await png.saveAs('/tmp/confetti-label.png');
 await page.getByRole('button',{name:'PDF de códigos de barras',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Incluir Pastel de chocolate',exact:true}).check();await dialog.getByRole('checkbox',{name:'Incluir Pastel de vainilla',exact:true}).check();await dialog.getByRole('spinbutton',{name:'Copias de Pastel de chocolate'}).fill('13');await dialog.getByRole('button',{name:'Generar PDF',exact:true}).click();await dialog.getByTitle('Vista previa de etiquetas').waitFor();
 const [pdf]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Descargar PDF'}).click()]);await pdf.saveAs('/tmp/confetti-labels.pdf');await page.screenshot({path:'/tmp/confetti-pdf-ui.png'});await page.keyboard.press('Escape');
 // Edit name/price retains web-hidden status and existing barcode; bottom includes PDF.
 await page.getByRole('button',{name:'Editar',exact:true}).first().click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Generar PDF',exact:true}).waitFor();await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>fixture.products[0].visible_en_web),false);assert.equal(await page.evaluate(()=>fixture.products[0].codigo_barras),'CF00000001');
 await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByLabel('Lector de códigos de barras').waitFor();
 const scan=async code=>{await page.keyboard.type(code,{delay:3});await page.keyboard.press('Enter');};
 await page.getByLabel('Lector de códigos de barras').focus();await scan('CF00000001');await scan('CF00000001');await scan('CF00000001');await scan('0012345');await page.getByRole('status').filter({hasText:'Agregado: Pastel de vainilla'}).waitFor();
 const cart=page.locator('.lg\\:flex').filter({has:page.getByRole('button',{name:/Cobrar/})});assert((await cart.innerText()).includes('$970.00'));assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.name==='buscar_producto_codigo_pos').length),4);
 // Scanner Enter on a focused checkout button cannot activate the button.
 await page.getByRole('button',{name:/Cobrar/}).focus();await scan('0012345');await page.waitForTimeout(180);assert.equal(await page.getByText('Cobro de prueba',{exact:true}).count(),0);
 // Search field gets text, never scans. Clear partial state on focus/editing.
 const before=await page.evaluate(()=>fixture.calls.length);await page.getByPlaceholder('Buscar producto...').fill('CF00000001');await page.getByPlaceholder('Buscar producto...').press('Enter');assert.equal(await page.evaluate(()=>fixture.calls.length),before);await page.getByPlaceholder('Buscar producto...').fill('');
 // Unknown / foreign product is visible error, does not add.
 await page.getByLabel('Lector de códigos de barras').focus();await scan('0012345678905');await page.getByRole('status').filter({hasText:'producto no disponible'}).waitFor();
 // Checkout disabled during pending RPC; response exactly once.
 await page.evaluate(()=>fixture.delay=500);await scan('CF00000001');assert(await page.getByRole('button',{name:/Cobrar/}).isDisabled());await page.waitForTimeout(650);assert(!(await page.getByRole('button',{name:/Cobrar/}).isDisabled()));
 await page.getByRole('button',{name:/Cobrar/}).click();await page.getByText('Cobro de prueba',{exact:true}).waitFor();const count=await page.evaluate(()=>fixture.calls.length);await scan('CF00000001');assert.equal(await page.evaluate(()=>fixture.calls.length),count);await page.getByRole('button',{name:'Cerrar cobro'}).click();
 // Stale branch response cannot append to new branch's sale.
 await page.getByLabel('Lector de códigos de barras').focus();const amount=await cart.innerText();await scan('CF00000001');await page.evaluate(()=>fixture.setBranch('Principal'));await page.waitForTimeout(650);assert.equal(await cart.innerText(),amount);
 // 58/80mm output is integer modules, never cropped by image auto-resizing.
 for(const width of [384,576]){const data=await page.evaluate(async width=>{const blob=await fixture.createPNG(fixture.products[0],width);return Array.from(new Uint8Array(await blob.arrayBuffer()));},width);fs.writeFileSync('/tmp/confetti-label-'+width+'.png',Buffer.from(data));}
 await page.setViewportSize({width:800,height:1280});await page.screenshot({path:'/tmp/confetti-pos-tablet.png'});
 await page.getByRole('button',{name:'Catálogo QA',exact:true}).click();await page.setViewportSize({width:360,height:800});await page.waitForTimeout(120);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/confetti-products-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS browser: real catalog/edit, assignment collision, PNG/PDF export, repeated scans, Enter safety, focus/payment protection, pending checkout, stale branch, tablet/mobile layout; no JS errors.');
} finally {await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});

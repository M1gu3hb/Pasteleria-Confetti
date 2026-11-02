// Diagnostic runner accumulates failures: it does not stop at the first finding.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require=createRequire(process.env.CONFETTI_QA_MODULES?path.join(process.env.CONFETTI_QA_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');let args=['--no-sandbox'];try{args=require('@sparticuz/chromium').default.args;}catch{}
const server=spawn(process.execPath,['scripts/barcodes_browser_fixture.mjs'],{stdio:'inherit',env:{...process.env,CONFETTI_QA_REAL_PAYMENT:'1'}});let browser;
const failures=[];
try{
 await new Promise(r=>setTimeout(r,1200));browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE||undefined,args,headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const ventaCalls=()=>page.evaluate(()=>fixture.calls.filter(c=>c.name==='crear_venta_directa_tx'));
 const addA=async()=>{
  await page.evaluate(()=>Object.assign(fixture.products[0],{codigo_barras:'CF00000001',codigo_origen:'generado'}));
  await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByLabel('Lector de códigos de barras').focus();
  await page.keyboard.press('F9');await page.keyboard.type('CF00000001',{delay:3});await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText:'Agregado: Pastel de chocolate'}).waitFor();
 };
 const pay=async()=>{await page.getByRole('button',{name:/^Cobrar /}).click();const d=page.getByRole('dialog');await d.getByPlaceholder('0.00').fill('250');await d.getByRole('button',{name:/Confirmar/}).click();};
 const seedPending=async()=>page.evaluate(()=>localStorage.setItem('confetti:intencion:v1:venta:Topilejo:owner',JSON.stringify({rpc:'crear_venta_directa_tx',clave:'original-key',parametros:{p_sucursal_id:'Topilejo',p_usuario_id:'owner',p_detalle:[{producto_id:'A',producto_nombre:'Compra pendiente',cantidad:1,precio_unitario_snapshot:250,subtotal:250}],p_cabecera:{subtotal:250,total:250},p_metodo_pago:'efectivo',p_monto_efectivo:250,p_monto_tarjeta:0,p_monto_transferencia:0,p_cambio:0,p_corte_caja_id:'fixture-cut'}})));
 const tests={
  async R01(){
   await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByLabel('Lector de códigos de barras').focus();
   await page.evaluate(()=>fixture.products.push({id:'E',nombre:'Código numérico',codigo_barras:'0012345',activo:true,visible_en_pos:true,precio_venta:7,sucursal_ids:[]}));
   await page.keyboard.press('F9');await page.keyboard.type('00 12345',{delay:3});await page.keyboard.press('Enter');await page.waitForTimeout(140);
   assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.name==='buscar_producto_codigo_pos').length),0,'internal space must not alias another barcode');
  },
  async R02(){
   const p=page.getByRole('region',{name:'Código de barras de Pastel de chocolate'});await p.getByRole('button',{name:'Asignar o detectar'}).click();await p.getByRole('textbox',{name:'Código existente'}).fill('DRAFT123');
   await page.evaluate(async()=>{fixture.products[0].nombre='Chocolate renombrado';await fixture.client.invalidateQueries({queryKey:['productos_all']});});
   await page.waitForTimeout(250);const input=page.getByRole('region',{name:'Código de barras de Chocolate renombrado'}).getByRole('textbox',{name:'Código existente'});await input.press('End');await input.press('X');assert.equal(await input.inputValue(),'DRAFT123X','name refresh must preserve assignment draft');
  },
  async R03(){
   const p=page.getByRole('region',{name:'Código de barras de Pastel de chocolate'});await page.evaluate(()=>{fixture.assignmentGate=new Promise(r=>fixture.releaseAssignment=r);});await p.getByRole('button',{name:'Generar código',exact:true}).click();await page.waitForFunction(()=>fixture.products[0].codigo_barras==='CF00000001');
   await page.evaluate(async()=>{fixture.products[0].codigo_barras='EXTERNAL123';fixture.products[0].codigo_origen='asignado';await fixture.client.invalidateQueries({queryKey:['productos_all']});});await p.getByText('EXTERNAL123',{exact:true}).waitFor();
   await page.evaluate(()=>{fixture.releaseAssignment();fixture.assignmentGate=null;});await page.waitForTimeout(150);assert.equal(await p.getByText('EXTERNAL123',{exact:true}).count(),1,'late write response must not overwrite a newer catalog value');
  },
  async R04(){
   const p=page.getByRole('region',{name:'Código de barras de Pastel de chocolate'});await p.getByRole('button',{name:'Generar código',exact:true}).click();await p.getByText('CF00000001',{exact:true}).waitFor();await page.evaluate(()=>fixture.products[0].sucursal_ids=['Topilejo']);
   await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByLabel('Lector de códigos de barras').focus();await page.keyboard.type('CF00000001',{delay:3});await page.keyboard.press('Enter');await page.getByRole('status').filter({hasText:'Agregado: Pastel de chocolate'}).waitFor();
   await page.evaluate(()=>fixture.setBranch('Principal'));await page.waitForTimeout(80);assert(await page.getByRole('button',{name:/Cobrar/}).isDisabled(),'an existing cart must not be charged under another branch');
  },
  async R08(){
   const bytes=await page.evaluate(()=>{const p={...fixture.products[0],nombre:'Pastel Łódź',codigo_barras:'CF00000001'};return Array.from(new Uint8Array(fixture.createPDF([{product:p,copies:1}]).output('arraybuffer')));});
   fs.mkdirSync('/tmp/pdfs',{recursive:true});fs.writeFileSync('/tmp/pdfs/profunda-unicode.pdf',Buffer.from(bytes));
   console.log('VISUAL R08 /tmp/pdfs/profunda-unicode.pdf');
  },
  async R05(){
   await seedPending();await page.getByRole('button',{name:'Ventas QA',exact:true}).click();
   await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();
   await page.getByRole('dialog').getByText(/Compra pendiente/).waitFor();
   const calls=await ventaCalls();assert.equal(calls.length,1);assert.equal(calls[0].p.p_idempotency_key,'original-key');
   assert.equal(calls[0].p.p_detalle[0].producto_nombre,'Compra pendiente');
  },
  async R05_normal(){
   await addA();await pay();await page.getByRole('dialog').getByText(/Pastel de chocolate/).waitFor();assert.equal((await ventaCalls()).length,1);assert.equal(await page.evaluate(()=>localStorage.getItem('confetti:intencion:v1:venta:Topilejo:owner')),null);await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:/^Cobrar /}).count(),0);
  },
  async R05_lost(){
   await addA();await page.evaluate(()=>fixture.saleMode='unknown_after');await pay();
   await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).waitFor();
   assert(await page.getByRole('button',{name:'Limpiar',exact:true}).isDisabled());
   const before=(await ventaCalls())[0];await page.getByLabel('Lector de códigos de barras').focus();await page.keyboard.press('F9');await page.keyboard.type('CF00000001',{delay:3});await page.keyboard.press('Enter');
   assert.equal((await ventaCalls()).length,1);assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.name==='buscar_producto_codigo_pos').length),1);
   await page.evaluate(()=>fixture.saleMode=null);await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();await page.getByRole('dialog').getByText(/Pastel de chocolate/).waitFor();
   const after=(await ventaCalls())[1];assert.deepEqual(after.p,before.p,'recovery must resend the exact original payment/detail/key');assert.equal(await page.evaluate(()=>Object.keys(fixture.sales).length),1);
   await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:/^Cobrar /}).count(),0,'only the frozen original draft is cleared');
  },
  async R05_reload(){
   await addA();await page.evaluate(()=>fixture.saleMode='unknown_after');await pay();await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).waitFor();const before=(await ventaCalls())[0];
   await page.reload();await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();await page.getByRole('dialog').getByText(/Pastel de chocolate/).waitFor();
   assert.deepEqual((await ventaCalls())[0].p,before.p);assert.equal(await page.evaluate(()=>Object.keys(fixture.sales).length),1);await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:/^Cobrar /}).count(),0);
  },
  async R05_before_commit(){
   await addA();await page.evaluate(()=>fixture.saleMode='unknown_before');await pay();await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).waitFor();const before=(await ventaCalls())[0];assert.equal(await page.evaluate(()=>Object.keys(fixture.sales).length),0);
   await page.evaluate(()=>fixture.saleMode=null);await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();await page.getByRole('dialog').getByText(/Pastel de chocolate/).waitFor();assert.deepEqual((await ventaCalls())[1].p,before.p);assert.equal(await page.evaluate(()=>Object.keys(fixture.sales).length),1);
  },
  async R05_closed(){
   await seedPending();await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.evaluate(()=>fixture.setCaja(false));
   await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();await page.getByRole('dialog').getByText(/Compra pendiente/).waitFor();
   await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('heading',{name:'Caja cerrada'}).waitFor();
  },
  async R05_other_draft(){
   await addA();await seedPending();await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'confetti:intencion:v1:venta:Topilejo:owner'})));
   await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();await page.getByRole('dialog').getByText(/Compra pendiente/).waitFor();await page.getByRole('button',{name:'Cerrar',exact:true}).click();
   await page.getByRole('button',{name:/^Cobrar /}).waitFor();assert.equal(await page.getByRole('button',{name:/^Cobrar /}).count(),1,'unrelated draft is not erased by old recovery');
  },
  async R05_definitive(){
   await addA();await page.evaluate(()=>fixture.saleMode='definitive');await pay();await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>localStorage.getItem('confetti:intencion:v1:venta:Topilejo:owner')),null);
   await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert(!(await page.getByRole('button',{name:/^Cobrar /}).isDisabled()));
  },
  async R05_malformed(){
   await seedPending();await page.evaluate(()=>{const k='confetti:intencion:v1:venta:Topilejo:owner';const p=JSON.parse(localStorage.getItem(k));p.parametros.p_sucursal_id='Principal';localStorage.setItem(k,JSON.stringify(p));});
   await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByRole('button',{name:'Recuperar cobro pendiente',exact:true}).click();await page.waitForTimeout(100);assert.equal((await ventaCalls()).length,0);assert(await page.evaluate(()=>!!localStorage.getItem('confetti:intencion:v1:venta:Topilejo:owner')));
  },
  async R04_cashier(){
   await addA();await page.evaluate(()=>fixture.setUser('other'));await page.waitForTimeout(60);assert(await page.getByRole('button',{name:/^Cobrar /}).isDisabled());await page.evaluate(()=>fixture.setUser('owner'));await page.waitForTimeout(60);assert(!(await page.getByRole('button',{name:/^Cobrar /}).isDisabled()));
  },
 };
 for(const [id,test]of Object.entries(tests).filter(([id])=>(!process.env.CASE||process.env.CASE===id)&&(!process.env.CASES||process.env.CASES.split(',').includes(id)))){
  await page.goto('http://127.0.0.1:4179');await page.getByRole('button',{name:'Agregar producto',exact:true}).waitFor();await page.evaluate(()=>{localStorage.clear();fixture.sales={};});
  try{errors.length=0;await test();assert.deepEqual(errors,[],'no uncaught browser errors');console.log('PASS',id);}catch(error){failures.push({id,error:error.message.split('\n')[0]});console.log('FAIL',id,error.message);if(process.env.CONFETTI_QA_DEBUG)console.log(await page.locator('body').innerText(),await ventaCalls());}
 }
 console.log(JSON.stringify({findings:failures}));if(failures.length)process.exitCode=1;
}finally{await browser?.close();server.kill();}

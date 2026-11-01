import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(process.env.CONFETTI_QA_MODULES?path.join(process.env.CONFETTI_QA_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');let args=['--no-sandbox'];try{args=require('@sparticuz/chromium').default.args;}catch{}
const server=spawn(process.execPath,['scripts/barcodes_browser_fixture.mjs'],{stdio:'inherit',env:{...process.env,CONFETTI_QA_REAL_PAYMENT:'1'}});let browser;
try{
 await new Promise(r=>setTimeout(r,1200));browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE||undefined,args,headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const wanted=process.env.CASE;const cases=['partial_checkout','partial_branch','pdf_snapshot','assignment_prefix'];
 for(const name of cases.filter(c=>!wanted||c===wanted)){
  await page.goto('http://127.0.0.1:4179');
  const panel=page.getByRole('region',{name:'Código de barras de Pastel de chocolate'});
  if(name==='assignment_prefix'){
   const b=page.getByRole('region',{name:'Código de barras de Pastel de vainilla'});await b.getByRole('button',{name:'Asignar o detectar'}).click();const input=b.getByRole('textbox',{name:'Código existente'});await input.fill('OLD');await input.press('F9');await page.keyboard.type('0012345',{delay:3});await page.keyboard.press('Enter');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>fixture.products[1].codigo_barras),'0012345','scanner must replace stale assignment input, never concatenate codes');
  }else{
   await panel.getByRole('button',{name:'Generar código',exact:true}).click();await panel.getByText('CF00000001',{exact:true}).waitFor();
   if(name==='pdf_snapshot'){
    await page.getByRole('button',{name:'PDF de códigos de barras',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Incluir Pastel de chocolate',exact:true}).check();await dialog.getByRole('button',{name:'Generar PDF',exact:true}).click();await dialog.getByTitle('Vista previa de etiquetas').waitFor();await page.evaluate(()=>fixture.products[0].codigo_barras='NEW123');let downloads=0;page.on('download',()=>downloads++);await dialog.getByRole('button',{name:'Descargar PDF'}).click();await page.waitForTimeout(250);assert.equal(downloads,0,'PDF must revalidate printed codes before export');await dialog.getByRole('alert').filter({hasText:'catálogo cambió'}).waitFor();
   }else{
    await page.getByRole('button',{name:'Ventas QA',exact:true}).click();await page.getByLabel('Lector de códigos de barras').focus();
    if(name==='partial_checkout'){
     await page.keyboard.type('CF00000001',{delay:3});await page.keyboard.press('Enter');await page.getByRole('status').filter({hasText:'Agregado: Pastel de chocolate'}).waitFor();await page.keyboard.press('F9');await page.keyboard.type('CF00',{delay:3});assert(await page.getByRole('button',{name:/Cobrar/}).isDisabled(),'checkout must wait for the frame, not just the RPC');await page.keyboard.type('000001',{delay:3});await page.keyboard.press('Enter');await page.waitForTimeout(150);assert(!(await page.getByRole('button',{name:/Cobrar/}).isDisabled()));
    }else{
     await page.evaluate(()=>fixture.products.push({id:'D',nombre:'Sufijo ajeno',precio_venta:1,activo:true,visible_en_pos:true,sucursal_ids:['Principal'],codigo_barras:'000001'}));const before=await page.evaluate(()=>fixture.calls.filter(c=>c.name==='buscar_producto_codigo_pos').length);await page.keyboard.press('F9');await page.keyboard.type('CF00',{delay:3});await page.evaluate(()=>fixture.setBranch('Principal'));await page.waitForTimeout(60);await page.keyboard.type('000001',{delay:3});await page.keyboard.press('Enter');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.name==='buscar_producto_codigo_pos').length),before,'a frame begun in another branch must not become a valid suffix lookup');
    }
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS second audit:',name);
 }
}finally{await browser?.close();server.kill();}

// Real React screens (POS, payment, Configuración → Escáner, printer selector) with the APK 1.3.0
// native reader EMULATED in the page (barcodes_browser_fixture + CONFETTI_QA_NATIVE_SCANNER).
// The emulation sends the same batches the Java plugin sends; it does not prove Android hardware.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(process.env.CONFETTI_QA_MODULES?path.join(process.env.CONFETTI_QA_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
// CONFETTI_QA_NATIVE_BASELINE=1 runs the same cases against a447a91 (before this integration): they must fail.
const server=spawn(process.execPath,['scripts/barcodes_browser_fixture.mjs'],{stdio:'inherit',env:{...process.env,CONFETTI_QA_REAL_PAYMENT:'1',CONFETTI_QA_NATIVE_SCANNER:'1'}});
let browser;const failures=[];
try {
 for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:4179')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CONFETTI_QA_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
 const lookups=p=>p.evaluate(()=>fixture.calls.filter(c=>c.name==='buscar_producto_codigo_pos').map(c=>c.p.p_codigo));
 const sales=p=>p.evaluate(()=>fixture.calls.filter(c=>c.name==='crear_venta_directa_tx').length);
 const withCode=(p,id='A',code='CF00000001')=>p.evaluate(([id,code])=>Object.assign(fixture.products.find(x=>x.id===id),{codigo_barras:code,codigo_origen:'asignado'}),[id,code]);
 const bound=async p=>{await p.evaluate(()=>nativeScanner.bound());};
 const sale=async p=>{await p.getByRole('button',{name:'Ventas QA',exact:true}).click();await p.getByLabel('Lector de códigos de barras').waitFor();};
 const batch=(p,o={})=>p.evaluate(o=>nativeScanner.batch(o),o);
 const settle=p=>p.waitForTimeout(250);
 const cobrar=p=>p.getByRole('button',{name:/^Cobrar /}).first();
 const cases={
  async hid_enter_three_shots(p){
   await withCode(p);await bound(p);await sale(p);
   await p.getByText('Lector vinculado conectado.',{exact:true}).waitFor();
   for(let i=0;i<3;i++){await batch(p,{codigo:'CF00000001'});await settle(p);}
   assert.deepEqual(await lookups(p),['CF00000001','CF00000001','CF00000001']);
   await p.waitForFunction(()=>/\$750\.00/.test(document.body.innerText));
  },
  async prefixes_f9_f7_and_leading_zeros(p){
   await withCode(p,'A','0012345');await bound(p);await sale(p);
   await batch(p,{prefix:'F9',codigo:'0012345'});await settle(p);
   await batch(p,{prefix:'F7',codigo:'0012345'});await settle(p);
   assert.deepEqual(await lookups(p),['0012345','0012345']);
   await p.waitForFunction(()=>/\$500\.00/.test(document.body.innerText));
  },
  async web_keys_ignored_while_native_captures(p){
   await withCode(p);await bound(p);await sale(p);
   const search=p.getByPlaceholder('Buscar producto...');await search.click();
   // A human keyboard (or anything not bound) types normally; the web parser stays passive.
   await p.keyboard.press('F9');await p.keyboard.type('CF00000001',{delay:3});await p.keyboard.press('Enter');await settle(p);
   assert.equal((await lookups(p)).length,0,'web keydown must not be parsed while the native reader is bound and connected');
   assert.equal(await search.inputValue(),'CF00000001','human typing must reach the focused field');
   await search.fill('');
   // The native read is processed once, and never written into the focused search box.
   await search.click();await batch(p,{codigo:'CF00000001'});await settle(p);
   assert.deepEqual(await lookups(p),['CF00000001']);
   assert.equal(await search.inputValue(),'');
  },
  async payment_open_no_contamination(p){
   await withCode(p);await bound(p);await sale(p);
   await batch(p,{codigo:'CF00000001'});await p.waitForFunction(()=>/\$250\.00/.test(document.body.innerText));
   await cobrar(p).click();
   const money=p.getByPlaceholder('0.00',{exact:true});await money.fill('300');await money.focus();
   await batch(p,{codigo:'CF00000001'});await settle(p);
   assert.equal(await money.inputValue(),'300','scan cannot write into the amount');
   assert.deepEqual(await lookups(p),['CF00000001'],'scan with payment open must not look up or add');
   assert.equal(await sales(p),0,'scan Enter cannot confirm the payment');
  },
  async duplicate_enter_held_key_incomplete(p){
   await withCode(p);await bound(p);await sale(p);
   const t=await p.evaluate(()=>performance.now());
   await batch(p,{codigo:'CF00000001',t0:t});
   await batch(p,{keys:[{k:'Enter',t:t+40,r:0}]});// CR+LF style double terminator
   // Held key: Android repeats the DOWN with repeatCount>0; the repeat is ignored, not appended.
   const held=[...'CF00000001'].map((k,i)=>({k,t:t+400+i*3,r:0}));held.splice(3,0,{k:'0',t:t+408,r:1});held.push({k:'Enter',t:t+440,r:0});
   await batch(p,{keys:held});
   await batch(p,{codigo:'CF000',fin:'tiempo'});// trigger released mid-read: no Enter
   await batch(p,{codigo:'00001'});// its tail can never become a code
   await settle(p);
   const codes=await lookups(p);
   assert.equal(codes[0],'CF00000001');
   assert(!codes.includes('00001'),'tail after an incomplete read must be quarantined');
   assert.deepEqual(codes,['CF00000001','CF00000001'],'double Enter ignored and held-key repeat not appended: '+JSON.stringify(codes));
   await batch(p,{codigo:'CF00000001'});await settle(p);
   assert.equal((await lookups(p)).length,3,'a complete read after the quarantine works');
  },
  async disconnect_and_reconnect(p){
   await withCode(p);await bound(p);await sale(p);
   await batch(p,{codigo:'CF000',fin:'desconexion'});
   await p.evaluate(()=>nativeScanner.setConnected([]));
   await p.getByText('Lector vinculado desconectado: revise el cable USB.',{exact:true}).waitFor();
   assert.equal(await cobrar(p).count(),0);
   await p.evaluate(()=>nativeScanner.setConnected([{...nativeScanner.dev,id:31}]));// Android assigns another deviceId
   await p.getByText('Lector vinculado conectado.',{exact:true}).waitFor();
   await batch(p,{codigo:'CF00000001',device:{...await p.evaluate(()=>nativeScanner.dev),id:31}});await settle(p);
   assert.deepEqual(await lookups(p),['CF00000001'],'no quarantine after a disconnect; reconnection resumes capture');
  },
  async stale_after_branch_user_cut_change(p){
   await withCode(p);await bound(p);await sale(p);
   for(const change of ['branch','user','caja']){
    const before=await p.evaluate(()=>nativeScanner.state.gen);
    await p.evaluate(c=>{if(c==='branch')fixture.setBranch(fixture.branch==='Topilejo'?'Centro':'Topilejo');if(c==='user')fixture.setUser(fixture.userId+'x');if(c==='caja')fixture.setCaja(false);},change);
    if(change==='caja'){await settle(p);await p.evaluate(()=>fixture.setCaja(true));}
    await settle(p);
    const after=await p.evaluate(()=>nativeScanner.state.gen);
    assert(after>before,`${change}: native generation must advance`);
    // Order the Java plugin produces: the read in progress is flushed with its ORIGINAL gen,
    // and its remaining keys form a new group with the new gen.
    await batch(p,{codigo:'CF000',fin:'invalidado',gen:before});
    await batch(p,{codigo:'00001'});// tail of the interrupted read
    // A read that completed before the plugin learned the new gen.
    await batch(p,{codigo:'CF00000001',gen:before});
    await settle(p);
    assert.equal((await lookups(p)).length,0,`${change}: stale or tail read cannot add products`);
   }
   await batch(p,{codigo:'CF00000001'});await settle(p);
   assert.deepEqual(await lookups(p),['CF00000001']);
  },
  async unknown_inactive_other_branch(p){
   await withCode(p);await bound(p);await sale(p);
   await p.evaluate(()=>{fixture.products.push({id:'D',nombre:'Inactivo',precio_venta:10,activo:false,visible_en_pos:true,sucursal_ids:[],codigo_barras:'INACT01'});});
   for(const code of ['NOEXISTE1','INACT01','0012345678905'])await batch(p,{codigo:code}),await settle(p);
   assert.deepEqual(await lookups(p),['NOEXISTE1','INACT01','0012345678905']);
   await p.getByRole('status').filter({hasText:'producto no disponible en esta sucursal'}).first().waitFor();
   assert.equal(await cobrar(p).count(),0,'nothing added for unknown, inactive or other-branch codes');
  },
  async slow_and_failed_lookup(p){
   await withCode(p);await bound(p);await sale(p);
   await p.evaluate(()=>{fixture.delay=600;});
   await batch(p,{codigo:'CF00000001'});
   await p.getByRole('status').filter({hasText:'Agregando 1 lectura'}).waitFor();
   await p.waitForFunction(()=>/\$250\.00/.test(document.body.innerText));
   await p.evaluate(()=>{fixture.delay=20;fixture.fail=true;});
   await batch(p,{codigo:'CF00000001'});await settle(p);
   await p.getByRole('status').filter({hasText:'Red de prueba no disponible'}).first().waitFor();
   assert(await p.evaluate(()=>/\$250\.00/.test(document.body.innerText)),'failed lookup must not change the order');
  },
  async ambiguous_pauses_capture(p){
   await withCode(p);await bound(p);await sale(p);
   await p.evaluate(()=>nativeScanner.setConnected([nativeScanner.dev,{...nativeScanner.dev,id:40,descriptor:'otro'}]));
   await p.getByText(/dos dispositivos idénticos/).waitFor();
   const st=await p.evaluate(()=>nativeScanner.state.capturando);assert.equal(st,false);
  },
  async pairing_flow_success(p){
   await p.getByRole('button',{name:'Escáner QA',exact:true}).click();
   const region=p.getByRole('region',{name:'Lector USB de esta terminal'});
   await region.getByText('Ningún lector vinculado todavía.').waitFor();
   await region.getByRole('button',{name:'Vincular lector',exact:true}).click();
   const pairing=p.getByRole('region',{name:'Vinculación del lector'});await pairing.waitFor();
   // A keyboard read first: different device, must not count towards the reader.
   await batch(p,{codigo:'CF1',device:{id:9,descriptor:'kb',vendorId:1133,productId:49948,nombre:'Logitech USB Keyboard'}});
   await batch(p,{codigo:'CFDIAG0001'});await batch(p,{codigo:'CFDIAG0001',fin:'tiempo'});
   await pairing.getByText('Lectura no válida').first().waitFor();
   assert.equal(await p.evaluate(()=>nativeScanner.calls.filter(c=>c[0]==='vincular').length),0,'never bind before three consecutive good reads');
   for(let i=0;i<3;i++)await batch(p,{codigo:'CFDIAG0001'});
   await p.getByRole('status').filter({hasText:'Lector vinculado y guardado en esta terminal'}).waitFor();
   const call=await p.evaluate(()=>nativeScanner.calls.find(c=>c[0]==='vincular')[1]);
   assert.deepEqual(call,{descriptor:'desc-lector',vendorId:1504,productId:4608,nombre:'Symbol Bar Code Scanner'});
   await region.getByText(/Lector conectado: Symbol Bar Code Scanner/).waitFor();
   assert.equal(await p.evaluate(()=>fixture.calls.length),0,'pairing never touches catalog or sales');
  },
  async pairing_persistence_failure_and_ambiguity(p){
   await p.evaluate(()=>{nativeScanner.persistFails=true;});
   await p.getByRole('button',{name:'Escáner QA',exact:true}).click();
   const region=p.getByRole('region',{name:'Lector USB de esta terminal'});
   await region.getByRole('button',{name:'Vincular lector',exact:true}).click();
   for(let i=0;i<3;i++)await batch(p,{codigo:'CFDIAG0001'});
   await region.getByRole('alert').filter({hasText:'No se pudo guardar el vínculo'}).waitFor();
   assert.equal(await region.getByText(/Lector vinculado y guardado/).count(),0,'no success without persistence');
   await region.getByRole('button',{name:'Vincular lector',exact:true}).click();
   for(let i=0;i<3;i++)await batch(p,{codigo:'CFDIAG0001',iguales:2});
   await region.getByRole('alert').filter({hasText:'otro dispositivo idéntico'}).waitFor();
   await p.waitForTimeout(200);
   assert.equal(await p.evaluate(()=>nativeScanner.calls.filter(c=>c[0]==='vincular').length),1,'ambiguous identity is never offered for binding');
   await region.getByRole('button',{name:'Cancelar vinculación'}).click();
   assert(await p.evaluate(()=>nativeScanner.calls.some(c=>c[0]==='cancelarVinculacion')));
  },
  async pairing_cancelled_when_leaving_screen(p){
   await p.getByRole('button',{name:'Escáner QA',exact:true}).click();
   await p.getByRole('button',{name:'Vincular lector',exact:true}).click();
   await p.getByRole('region',{name:'Vinculación del lector'}).waitFor();
   await p.getByRole('button',{name:'Ventas QA',exact:true}).click();
   await p.waitForFunction(()=>nativeScanner.calls.some(c=>c[0]==='cancelarVinculacion'));
  },
  async native_diagnostic_and_lookup_is_read_only(p){
   await bound(p);await p.getByRole('button',{name:'Escáner QA',exact:true}).click();
   await p.getByRole('button',{name:'Probar escáner',exact:true}).click();
   for(let i=0;i<3;i++)await batch(p,{codigo:'CFDIAG0001'});
   const test=p.getByRole('region',{name:'Prueba guiada del escáner'});
   await test.getByText('Recibidas como tres lecturas separadas',{exact:true}).waitFor();
   assert.equal(await test.getByText('Recibida del lector vinculado: Symbol Bar Code Scanner.').count(),3);
   await test.getByText(/Tres lecturas recibidas del lector vinculado/).waitFor();
   assert.equal(await p.evaluate(()=>fixture.calls.length),0,'diagnostic is service-free until the person asks for a lookup');
  },
  async printer_selector_blocks_hid(p){
   await p.evaluate(()=>{window.nativePrinterList={clasificado:true,dispositivos:[
    {nombre:'Symbol Bar Code Scanner',vendorId:1504,productId:4608,deviceName:'/dev/bus/usb/001/004',esImpresora:false,tipo:'lector_teclado',seleccionable:false,clases:[3]},
    {nombre:'POS-80 Printer',vendorId:1046,productId:20497,deviceName:'/dev/bus/usb/001/003',esImpresora:true,tipo:'impresora',seleccionable:true,clases:[7]},
    {nombre:'Thermal 0xFF',vendorId:1155,productId:22304,deviceName:'/dev/bus/usb/001/005',esImpresora:false,tipo:'propietaria',seleccionable:true,clases:[255]}]};
    localStorage.setItem('confetti_printer_cfg',JSON.stringify({usbVendorId:1504,usbProductId:4608,usbNombre:'Symbol Bar Code Scanner'}));});
   await p.getByRole('button',{name:'Impresora QA',exact:true}).click();
   await p.getByRole('button',{name:'Detectar impresoras USB'}).click();
   const scanner=p.getByRole('button',{name:/^Symbol Bar Code Scanner — Lector o teclado/});
   await scanner.waitFor();assert.equal(await scanner.isDisabled(),true,'a HID reader cannot be chosen as printer');
   await p.getByRole('alert').filter({hasText:'no es una impresora'}).waitFor();
   const own=p.getByRole('button',{name:/^Thermal 0xFF — Impresora \(interfaz del fabricante\)/});assert.equal(await own.isDisabled(),false,'vendor-class ESC/POS stays selectable');
   await p.getByRole('button',{name:/^POS-80 Printer — Impresora$/}).click();
   const cfg=await p.evaluate(()=>JSON.parse(localStorage.getItem('confetti_printer_cfg')));
   assert.equal(cfg.usbVendorId,1046);assert.equal(cfg.usbProductId,20497);
   // APK < 1.3.0 (no classification): only printer-class interfaces can work with its DantSu path.
   await p.evaluate(()=>{window.nativePrinterList={dispositivos:[{nombre:'Symbol Bar Code Scanner',vendorId:1504,productId:4608,deviceName:'a',esImpresora:false},{nombre:'POS-80 Printer',vendorId:1046,productId:20497,deviceName:'b',esImpresora:true}]};});
   await p.getByRole('button',{name:'Detectar impresoras USB'}).click();
   await p.getByRole('button',{name:/^Symbol Bar Code Scanner — Sin interfaz de impresora/}).waitFor();
   assert.equal(await p.getByRole('button',{name:/^Symbol Bar Code Scanner — Sin interfaz/}).isDisabled(),true);
  },
 };
 for(const [name,fn] of Object.entries(cases)){
  if(process.env.CASES&&!process.env.CASES.split(',').includes(name))continue;
  const context=await browser.newContext({viewport:{width:1280,height:900}});const p=await context.newPage();p.setDefaultTimeout(process.env.CONFETTI_QA_NATIVE_BASELINE?3000:12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{await p.goto('http://127.0.0.1:4179');await p.waitForFunction(baseline=>window.nativeScanner&&(baseline||nativeScanner.calls.some(c=>c[0]==='iniciar')),!!process.env.CONFETTI_QA_NATIVE_BASELINE);await fn(p);assert.deepEqual(errors,[]);console.log('PASS native scanner browser',name);}
  catch(e){failures.push({name,message:e.message});console.error('FAIL native scanner browser',name,e.message);console.error((await p.locator('body').innerText()).slice(-3000));}
  finally{await context.close();}
 }
}finally{if(browser)await browser.close();server.kill();}
console.log(JSON.stringify({failures}));if(failures.length)process.exitCode=1;

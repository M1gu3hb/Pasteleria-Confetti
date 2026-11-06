import React, { useEffect, useRef, useState } from 'react';
import { useScannerSettings } from '@/components/barcodes/useScannerSettings';
import { useBarcodeCapture } from '@/components/barcodes/useBarcodeCapture';
import { useNativeScanner } from '@/components/barcodes/useNativeScanner';
import { saveScannerConfig, SCANNER_RECOMMENDED } from '@/lib/scannerConfig';
import { createPairingSession, PAIRING_READS, sameDevice } from '@/lib/scannerPairing';
import { inspectBarcode, barcodeCoverage } from '@/lib/barcodes';
import BarcodeImage from '@/components/barcodes/BarcodeImage';
import { printBarcodeLabel } from '@/lib/barcodeExport';

const DIAGNOSTIC={nombre:'PRUEBA DE ESCÁNER · NO ES UN PRODUCTO',codigo_barras:'CFDIAG0001'};
const btn='min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50';
const nombreDe=d=>d?.nombre||(d?`USB ${Number(d.vendorId).toString(16).padStart(4,'0')}:${Number(d.productId).toString(16).padStart(4,'0')}`:'dispositivo');

/** Device state shown ONLY from system evidence (Android InputManager), never from received keys. */
function EstadoLector({nativo}) {
  if(!nativo?.disponible)return null;
  const v=nativo.vinculo;
  if(nativo.vinculando)return <p className="text-sm"><strong>Vinculación en curso.</strong> Mientras dura, el lector no agrega productos a la venta.</p>;
  if(nativo.estado==='conectado')return <p className="text-sm text-emerald-700 dark:text-emerald-300"><strong>✓ Lector conectado: {nombreDe(nativo.dispositivo||v)}.</strong> {nativo.capturando?'Sus lecturas van directo a la venta y no escriben en los campos.':'Preparando la captura…'}</p>;
  if(nativo.estado==='desconectado')return <p className="text-sm text-amber-700 dark:text-amber-300"><strong>El lector vinculado ({nombreDe(v)}) no está conectado.</strong> Android no lo detecta: revise el cable USB y el puerto.</p>;
  if(nativo.estado==='ambiguo')return <p role="alert" className="text-sm text-destructive"><strong>Hay {nativo.iguales} dispositivos idénticos a su lector conectados.</strong> No se puede saber cuál es el lector, así que no se usa ninguno. Desconecte el que no sea el lector.</p>;
  return <p className="text-sm">Ningún lector vinculado todavía.</p>;
}

/** Explicit pairing: three identical reads of a printed code from one device, then persist natively. */
function VinculacionLector({nativo,bridge,subscribePairing,settings}) {
  const [pairing,setPairing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
  const session=useRef(null),wasPairing=useRef(false),binding=useRef(false);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>subscribePairing(batch=>{session.current?.handle(batch);}),[subscribePairing]);
  // Leaving the screen must never leave the terminal in pairing mode (it captures every external keyboard).
  useEffect(()=>()=>{if(session.current){session.current=null;bridge?.cancelPairing().catch(()=>{});}},[bridge]);
  useEffect(()=>{
    if(nativo.vinculando){wasPairing.current=true;return;}
    if(wasPairing.current&&session.current&&!binding.current){session.current=null;setPairing(null);setError('Terminó el tiempo para vincular. Vuelva a intentarlo.');}
    wasPairing.current=false;
  },[nativo.vinculando]);
  const start=async()=>{
    setError('');setDone('');
    session.current=createPairingSession({getSettings:()=>settingsRef.current,onChange:setPairing});
    setPairing(session.current.snapshot);
    try{await bridge.startPairing(180);}catch(e){session.current=null;setPairing(null);setError(e.message);}
  };
  const cancel=async()=>{session.current=null;setPairing(null);try{await bridge.cancelPairing();}catch{/* expira solo */}};
  const bind=async device=>{
    binding.current=true;setBusy(true);setError('');
    try{
      const s=await bridge.bind(device);
      const v=s?.vinculo;
      // Success only after the native side persisted it and reports THIS device connected.
      const ok=v&&v.vendorId===device.vendorId&&v.productId===device.productId&&v.nombre===device.nombre&&s.estado==='conectado';
      if(!ok)throw new Error('No se pudo confirmar el vínculo guardado. Repita la vinculación.');
      setDone(`Lector vinculado y guardado en esta terminal: ${nombreDe(v)}. Ya puede escanear en Nueva venta.`);
    }catch(e){setError(e.message||'No se pudo vincular el lector.');}
    finally{session.current=null;setPairing(null);binding.current=false;setBusy(false);}
  };
  useEffect(()=>{if(pairing?.ready&&!busy&&!binding.current)bind(pairing.candidate);},[pairing?.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const unbind=async()=>{
    if(!window.confirm('¿Desvincular el lector de esta terminal? Volverá a comportarse como un teclado hasta vincularlo de nuevo.'))return;
    setBusy(true);setError('');setDone('');
    try{const s=await bridge.unbind();if(s?.vinculo)throw new Error('No se pudo borrar el vínculo.');setDone('Lector desvinculado de esta terminal.');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const last=pairing?.readings?.at(-1);
  return <div className="space-y-3">
    <ol className="list-decimal pl-5 text-sm space-y-1">
      <li>Conecte el lector a un puerto USB de la terminal.</li>
      <li>Toque <strong>{nativo.vinculo?'Volver a vincular':'Vincular lector'}</strong> y escanee <strong>tres veces el mismo código impreso</strong> (la etiqueta de prueba de abajo o el código de cualquier empaque). Un lector láser no lee códigos en la pantalla.</li>
      <li>Toque <strong>Probar escáner</strong> y escanee un producto para ver si está registrado.</li>
    </ol>
    {!pairing&&<div className="flex flex-wrap gap-2">
      <button type="button" className={btn} disabled={busy||!settings.enabled} onClick={start}>{nativo.vinculo?'Volver a vincular':'Vincular lector'}</button>
      {nativo.vinculo&&<button type="button" className={btn} disabled={busy} onClick={unbind}>Desvincular lector</button>}
    </div>}
    {!settings.enabled&&<p className="text-sm">El lector está desactivado en este dispositivo (Ajustes avanzados).</p>}
    {pairing&&<div role="region" aria-label="Vinculación del lector" className="border rounded-lg p-3 space-y-2">
      <p className="text-sm"><strong>Escanee el mismo código impreso tres veces.</strong> Suelte el gatillo entre lecturas. No hace falta tocar ningún campo.</p>
      <p role="status" className="text-sm">Lecturas correctas seguidas: <strong>{Math.min(pairing.streak,PAIRING_READS)} de {PAIRING_READS}</strong>{busy?' · Guardando…':''}</p>
      {last?.device&&<p className="text-sm">Dispositivo que envió la última lectura: <strong>{nombreDe(last.device)}</strong></p>}
      {pairing.problem==='ambiguo'&&<p role="alert" className="text-sm text-destructive">Hay otro dispositivo idéntico conectado. Desconéctelo y vuelva a escanear: así no se vincula el equivocado.</p>}
      {pairing.problem==='identidad'&&<p role="alert" className="text-sm text-destructive">Este dispositivo no informa una identidad USB suficiente; no se puede vincular. Use el modo teclado (Ajustes avanzados).</p>}
      <ol aria-label="Lecturas de vinculación" className="space-y-1 max-h-48 overflow-y-auto">{[...(pairing.readings||[])].reverse().map(r=><li key={r.n} className="border rounded p-2 text-xs break-all">
        <strong>{r.ok?'Lectura correcta':'Lectura no válida'}</strong> · <code>{r.code||'(sin caracteres)'}</code> · {nombreDe(r.device)}
        {!r.ok&&r.reason&&<p>{r.reason}</p>}
        {r.ok&&pairing.candidate&&!sameDevice(r.device,pairing.candidate)&&<p>Otro dispositivo.</p>}
      </li>)}</ol>
      <button type="button" className={btn} disabled={busy} onClick={cancel}>Cancelar vinculación</button>
    </div>}
    {done&&<p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{done}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

/** Catalog readiness: missing codes are a catalog task, not a reader failure. Read-only. */
function CodigosCatalogo() {
  const [cobertura,setCobertura]=useState(null),[fallo,setFallo]=useState('');
  useEffect(()=>{let vivo=true;barcodeCoverage().then(c=>{if(vivo)setCobertura(c);}).catch(()=>{if(vivo)setFallo('No se pudo consultar el catálogo en este momento.');});return()=>{vivo=false;};},[]);
  return <div className="text-sm rounded border p-3 space-y-2" aria-label="Códigos en el catálogo" role="region">
    <p><strong>Códigos en el catálogo</strong></p>
    {cobertura&&<p>{cobertura.sinCodigo===0?`Los ${cobertura.activos} productos activos tienen código.`:`De ${cobertura.activos} productos activos, ${cobertura.sinCodigo} todavía no tienen código. El lector sólo encuentra productos con código registrado; esto no es una falla del lector.`}</p>}
    {fallo&&<p>{fallo}</p>}
    <ul className="list-disc pl-5 space-y-1">
      <li><strong>Productos con código en su empaque</strong> (refrescos, velas, etc.): Productos → abra el producto → Código de barras → <strong>Asignar o detectar</strong> y escanee el empaque.</li>
      <li><strong>Productos propios</strong> (pasteles, gelatinas): Productos → Código de barras → <strong>Generar código</strong> → <strong>Imprimir</strong>, y pegue la etiqueta en el producto o en una hoja junto a la caja. Para varios a la vez: <strong>Generar PDF</strong>.</li>
    </ul>
  </div>;
}

function ResultadoProducto({code}) {
  const [res,setRes]=useState(null),[busy,setBusy]=useState(false);
  const consultar=async()=>{setBusy(true);try{setRes(await inspectBarcode(code));}catch(e){setRes({estado:'error',mensaje:e.message});}finally{setBusy(false);}};
  if(!res)return <button type="button" className="underline text-xs min-h-8" disabled={busy} onClick={consultar}>{busy?'Consultando…':'Buscar producto (sólo consulta)'}</button>;
  const p=res.producto;
  const texto={
    ok:`Producto encontrado: ${p?.nombre}. En Nueva venta se agregaría una pieza.`,
    no_registrado:'Este código no está registrado en el catálogo. El lector funciona; falta asignarlo al producto en Productos.',
    inactivo:`El código pertenece a «${p?.nombre}», que está inactivo.`,
    oculto:`«${p?.nombre}» no está visible en el punto de venta.`,
    ambiguo:'Más de un producto tiene este código. Administración debe revisarlo.',
    invalido:'Código con caracteres no válidos para el catálogo.',
    error:res.mensaje||'No se pudo consultar el catálogo.',
  }[res.estado];
  return <p className="text-xs"><strong>Producto:</strong> {texto}</p>;
}

/** Local settings: deliberately no database writes, products or payment services. */
export default function EscanerCodigosSection() {
  const settings=useScannerSettings();
  const {state:nativo,bridge,subscribePairing}=useNativeScanner();
  const [form,setForm]=useState(settings.config),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [testing,setTesting]=useState(false),[events,setEvents]=useState([]),[stage,setStage]=useState('Esperando una lectura.'),[physical,setPhysical]=useState(false),[printing,setPrinting]=useState(false),[help,setHelp]=useState(false);
  const testInput=useRef(null);
  const configKey=JSON.stringify(settings.config);
  useEffect(()=>{setForm(settings.config);setTesting(false);setEvents([]);setPhysical(false);setStage('Esperando una lectura.');},[configKey]);
  const dirty=JSON.stringify(form)!==configKey;
  const nativoDisponible=nativo?.disponible===true;
  const capture=useBarcodeCapture({active:testing,enabled:testing,branch:null,contextKey:'scanner-diagnostic',inputRef:testInput,
    onScan:()=>{}, // No product lookup or write: even the test code is never assigned.
    onEvent:event=>{
      if(event.type==='start'){setStage('Leyendo…');setPhysical(false);}
      if(['complete','invalid','cancelled','duplicate'].includes(event.type))setEvents(previous=>[...previous.slice(-29),{...event,n:Date.now()+Math.random()}]);
      if(event.type==='complete')setStage('Lectura de prueba correcta.');
      if(['invalid','interrupted','cancelled'].includes(event.type)){setStage(event.reason||'Configuración incompleta o lectura interrumpida.');setPhysical(false);}
    },
  });
  const complete=events.filter(e=>e.type==='complete');
  const lastThree=complete.slice(-3);
  const repeated=lastThree.length===3&&lastThree.every(e=>e.code===lastThree[0].code);
  const nativeRepeated=repeated&&lastThree.every(e=>e.origen==='nativo');
  const save=()=>{
    setError('');setMessage('');
    try {saveScannerConfig(form);setMessage('Guardado sólo en este dispositivo. Los demás dispositivos no cambian.');}
    catch(e){setError(e.message);}
  };
  const start=()=>{capture.invalidate();setEvents([]);setPhysical(false);setStage('Esperando una lectura.');setTesting(true);};
  const print=async()=>{if(printing)return;setPrinting(true);setError('');try{await printBarcodeLabel(DIAGNOSTIC);}catch(e){setError(e.message||'No se pudo imprimir la etiqueta de prueba.');}finally{setPrinting(false);}};
  const ajustes=<>
    {settings.existing&&!nativoDisponible&&<p className="text-sm">Se conserva el modo existente. Para proteger los campos de pago, configura tu lector con F9 + Enter y selecciona la configuración recomendada.</p>}
    {nativoDisponible&&<p className="text-sm">Con el lector vinculado no hace falta programar F9: la terminal reconoce el lector. Estos ajustes sólo aplican a lectores sin vincular (modo teclado) y al tiempo entre teclas.</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>Activar lector en este dispositivo</label>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm">Perfil de lectura<select aria-label="Perfil de lectura" value={form.profile} onChange={e=>setForm({...form,profile:e.target.value})} className="skeu-input block w-full p-2 mt-1"><option value="f9">Recomendado: F9 + Enter</option><option value="compatible">Compatible con el lector existente (sin prefijo)</option></select></label>
      <label className="text-sm">Tiempo máximo entre teclas (ms)<input type="number" min="50" max="1000" step="1" value={form.maxGap} onChange={e=>setForm({...form,maxGap:Number(e.target.value)})} className="skeu-input block w-full p-2 mt-1"/><span className="text-xs text-muted-foreground">Recomendado: 250 ms. Una pausa mayor invalida la lectura completa.</span></label>
    </div>
    <p className="text-sm">Modo teclado — prefijo: <strong>{form.profile==='f9'?'F9 obligatorio':'F9 admitido; también entrada sin prefijo'}</strong>. Terminador: <strong>Enter</strong>. No se admiten Tab ni otros terminadores. El POS no reprograma el lector.{nativoDisponible?' Lector vinculado: prefijo opcional (F9 o F7) y Enter al final.':''}</p>
    {form.profile==='compatible'&&!nativoDisponible&&<p className="text-sm text-amber-700 dark:text-amber-300">Sin F9, el lector es indistinguible de un teclado y puede escribir en búsquedas o importes. Usa F9 para protegerlos; no se elimina una segunda lectura completa sólo por repetir el código.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btn} onClick={save}>Guardar ajustes del escáner</button>
      <button type="button" className={btn} onClick={()=>{capture.invalidate();setForm({...SCANNER_RECOMMENDED});setMessage('Configuración recomendada preparada: configura también F9 y Enter en el lector, y guarda.');}}>Restaurar configuración recomendada</button>
    </div>
    {dirty&&<p className="text-sm">Hay ajustes sin guardar. Guarda para probar con esos valores.</p>}
  </>;
  return <section aria-label="Escáner de códigos de barras" className="skeu-card mt-4 p-4 space-y-4">
    <div><h2 className="text-base font-semibold">Escáner de códigos de barras</h2><p className="text-sm text-muted-foreground">Ajustes de esta tablet o navegador. No cambian otras cajas ni sucursales.</p></div>
    {settings.error&&<p role="alert" className="text-sm text-destructive">{settings.error}</p>}
    <div role="region" aria-label="Lector USB de esta terminal" className="text-sm rounded border p-3 space-y-2">
      <p><strong>Lector USB de esta terminal</strong></p>
      {nativoDisponible?<>
        <EstadoLector nativo={nativo}/>
        <VinculacionLector nativo={nativo} bridge={bridge} subscribePairing={subscribePairing} settings={settings.config}/>
      </>:<>
        <p><strong>Detección física no disponible en este entorno.</strong></p>
        <p>{nativo?.motivo==='apk_anterior'?'La app instalada en esta terminal es anterior a la versión 1.3.0: recibe las teclas del lector como si fuera un teclado, sin identificarlo ni detectar su desconexión. Para vincular el lector hay que instalar Confetti POS 1.3.0 (conserva datos y sesión).'
          :nativo?.motivo==='navegador'?'El navegador puede recibir teclas sin revelar qué dispositivo las envía. WebUSB o WebHID no garantizan acceso a un lector en modo teclado. La vinculación del lector está en la app Confetti POS 1.3.0 de la terminal.'
          :nativo?.motivo==='protocolo'||nativo?.motivo==='error'?`El lector nativo no respondió${nativo?.detalle?` (${nativo.detalle})`:''}. Se usa el modo teclado.`
          :'Comprobando si esta app puede identificar el lector…'}</p>
        <p>Una lectura anterior no prueba que siga conectado. El POS no solicita permisos USB/Bluetooth ni toma el control de la impresora.</p>
      </>}
    </div>
    {nativoDisponible?<details className="space-y-3 rounded border p-3"><summary className="font-semibold cursor-pointer min-h-11 py-2 text-sm">Ajustes avanzados (lectores sin vincular)</summary><div className="space-y-3 pt-2">{ajustes}</div></details>:ajustes}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btn} disabled={dirty||!settings.config.enabled||!!settings.error} onClick={start}>Probar escáner</button>
      <button type="button" onClick={()=>setHelp(true)} className="min-h-11 px-3 py-2 underline text-sm">Cómo configurarlo</button>
    </div>
    {message&&<p role="status" className="text-sm">{message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {testing&&<div role="region" className="border rounded-lg p-3 space-y-3" aria-label="Prueba guiada del escáner">
      <h3 className="font-semibold">Prueba sin ventas ni cambios en productos</h3>
      <p className="text-sm">Escanea esta etiqueta impresa o una existente. Después escanea el mismo código tres veces, soltando el disparador entre lecturas. Cada lectura completa debe aparecer una vez. Un lector láser necesita el código impreso: no lee la pantalla.</p>
      <BarcodeImage code={DIAGNOSTIC.codigo_barras} name={DIAGNOSTIC.nombre}/>
      <button type="button" className={btn} disabled={printing} onClick={print}>{printing?'Preparando impresión…':'Imprimir etiqueta de prueba'}</button>
      <p className="text-xs text-muted-foreground">Etiqueta sólo para diagnóstico: no crea productos ni ventas. Usa la misma impresora configurada para tickets y etiquetas.</p>
      <label className="block text-sm">Zona de prueba<input aria-label="Zona de prueba" ref={testInput} readOnly inputMode="none" value={capture.draft} placeholder={nativo?.capturando?'Escanea con el lector vinculado (no hace falta tocar aquí)':'Toca aquí y escanea con tu lector'} className="skeu-input block w-full p-2 mt-1"/></label>
      <p role="status" className="text-sm">{stage} {capture.reading?'Lectura en curso; Esc cancela.':''}</p>
      <p className="text-sm">Lecturas completas recibidas: <strong>{complete.length}</strong>. Tres lecturas iguales: <strong>{repeated?'Recibidas como tres lecturas separadas':'Pendiente'}</strong>.</p>
      <p className="text-xs text-muted-foreground">Máximo 30 eventos visibles. Una tecla sostenida o un Enter doble se señala y se ignora. Dos tramas completas idénticas pueden ser dos disparos: sólo la persona puede comprobar si el lector duplicó un disparo.</p>
      <ol className="space-y-2 max-h-64 overflow-y-auto" aria-label="Resultados de lecturas">{events.map(e=><li key={e.n} className="border rounded p-2 text-xs break-all space-y-1">
        <strong>{e.type==='complete'?'Lectura completa':e.type==='duplicate'?'Evento repetido ignorado':'Lectura no válida'}</strong>
        <p>Código: <code>{e.code||'(sin caracteres)'}</code> · Longitud: {e.length} · Prefijo: {e.prefixed?'Sí':'No'} · Enter final: {e.terminated?'Sí':'No'} · Mayor intervalo: {Math.round(e.maxGap||0)} ms</p>
        {e.reason&&<p>{e.reason}</p>}
        <p>{e.origen==='nativo'?`Recibida del lector vinculado: ${nombreDe(e.dispositivo)}.`:e.trusted?'Entrada de teclado; el dispositivo de origen no es identificable.':'Evento de software o repetición de control; no acredita una prueba física.'}</p>
        {e.type==='complete'&&<ResultadoProducto code={e.code}/>}
      </li>)}</ol>
      {repeated&&!nativeRepeated&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={physical} onChange={e=>setPhysical(e.target.checked)}/>Confirmo que hice estos tres disparos con el lector físico de esta tablet.</label>}
      {physical&&repeated&&!nativeRepeated&&<p className="text-sm">Prueba física declarada por la persona. No es una detección automática ni certifica reconexión o impresión.</p>}
      {nativeRepeated&&<p className="text-sm">Tres lecturas recibidas del lector vinculado, identificado por Android. No certifica la impresión ni los códigos del catálogo.</p>}
      <div className="flex gap-2"><button type="button" className={btn} onClick={start}>Reiniciar prueba</button><button type="button" className={btn} onClick={()=>{capture.invalidate();setTesting(false);}}>Terminar prueba</button></div>
    </div>}
    <CodigosCatalogo/>
    <details id="scanner-help" open={help} onToggle={e=>setHelp(e.currentTarget.open)} className="space-y-2 text-sm">
      <summary className="font-semibold cursor-pointer min-h-11 py-2">Cómo configurarlo</summary>
      {nativoDisponible&&<ol className="list-decimal pl-5 space-y-1">
        <li>Conecte el lector USB a la terminal. Debe estar en modo teclado (HID), que es el de fábrica en Steren COM-595 y Zebra DS2208, y enviar Enter al final (también de fábrica).</li>
        <li>Toque Vincular lector y escanee tres veces el mismo código impreso. La terminal guarda qué dispositivo es el lector.</li>
        <li>Desde entonces sus lecturas sólo agregan productos en Nueva venta; no escriben en búsquedas ni importes y no confirman pagos.</li>
        <li>Si lo desconecta, el aviso aparece aquí. Al reconectarlo vuelve a funcionar solo. Si cambia de lector, vincúlelo de nuevo.</li>
        <li>Si no lee: revise cable, que el lector emita su pitido y que envíe Enter. Si cambia letras o símbolos: el idioma del teclado físico en Android debe coincidir con el del lector.</li>
      </ol>}
      {!nativoDisponible&&<ol className="list-decimal pl-5 space-y-1">
        <li>Conecta el lector USB o su receptor. Si usas adaptador OTG, revisa alimentación y conexión. Para Bluetooth, enlázalo desde Android.</li>
        <li>En el manual del lector, selecciona modo teclado HID compatible con tu tablet y el idioma de su teclado.</li>
        <li>Configura en el lector el prefijo F9, el terminador Enter y una trama por disparo. Puede requerir escanear páginas del manual; los códigos de programación dependen de la marca y modelo.</li>
        <li>Selecciona la configuración recomendada del POS, guarda y abre Probar escáner. Revisa el código completo y las tres lecturas repetidas.</li>
        <li>Termina la prueba y comienza a vender. Cada lectura completa agrega una pieza; el cobro conserva su confirmación habitual.</li>
        <li>Si no lee: revisa alimentación, modo teclado, F9 y Enter. Si cambia letras: revisa idioma. Si se interrumpe: revisa tiempos y repite desde F9. Si duplica piezas: revisa una sola trama por disparo y el sufijo del manual; no reduzcas piezas automáticamente por código repetido.</li>
      </ol>}
      <p>El POS guarda activación, perfil y tiempos; el modo físico del lector se programa en el propio lector. Lectores serie (COM), propietarios o que requieren controlador no están soportados. Esta sección no promete compatibilidad universal.</p>
    </details>
  </section>;
}

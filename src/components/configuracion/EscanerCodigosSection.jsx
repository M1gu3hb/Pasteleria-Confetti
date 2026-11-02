import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useScannerSettings } from '@/components/barcodes/useScannerSettings';
import { useBarcodeCapture } from '@/components/barcodes/useBarcodeCapture';
import { saveScannerConfig, SCANNER_RECOMMENDED } from '@/lib/scannerConfig';
import BarcodeImage from '@/components/barcodes/BarcodeImage';
import { printBarcodeLabel } from '@/lib/barcodeExport';

const DIAGNOSTIC={nombre:'PRUEBA DE ESCÁNER · NO ES UN PRODUCTO',codigo_barras:'CFDIAG0001'};
/** Local settings: deliberately no database, products or payment services. */
export default function EscanerCodigosSection() {
  const settings=useScannerSettings();
  const [form,setForm]=useState(settings.config),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [testing,setTesting]=useState(false),[events,setEvents]=useState([]),[stage,setStage]=useState('Esperando una lectura.'),[physical,setPhysical]=useState(false),[printing,setPrinting]=useState(false),[help,setHelp]=useState(false);
  const testInput=useRef(null);
  const configKey=JSON.stringify(settings.config);
  useEffect(()=>{setForm(settings.config);setTesting(false);setEvents([]);setPhysical(false);setStage('Esperando una lectura.');},[configKey]);
  const dirty=JSON.stringify(form)!==configKey;
  const capture=useBarcodeCapture({active:testing,enabled:testing,branch:null,contextKey:'scanner-diagnostic',inputRef:testInput,
    onScan:()=>{}, // No product lookup or write: even the test code is never assigned.
    onEvent:event=>{
      if(event.type==='start'){setStage('Leyendo…');setPhysical(false);}
      if(['complete','invalid','cancelled','duplicate'].includes(event.type))setEvents(previous=>[...previous.slice(-29),event]);
      if(event.type==='complete')setStage('Lectura de prueba correcta.');
      if(['invalid','interrupted','cancelled'].includes(event.type)){setStage(event.reason||'Configuración incompleta o lectura interrumpida.');setPhysical(false);}
    },
  });
  const complete=events.filter(e=>e.type==='complete');
  const lastThree=complete.slice(-3);
  const repeated=lastThree.length===3&&lastThree.every(e=>e.code===lastThree[0].code);
  const save=()=>{
    setError('');setMessage('');
    try {saveScannerConfig(form);setMessage('Guardado sólo en este dispositivo. Los demás dispositivos no cambian.');}
    catch(e){setError(e.message);}
  };
  const start=()=>{capture.invalidate();setEvents([]);setPhysical(false);setStage('Esperando una lectura.');setTesting(true);};
  const print=async()=>{if(printing)return;setPrinting(true);setError('');try{await printBarcodeLabel(DIAGNOSTIC);}catch(e){setError(e.message||'No se pudo imprimir la etiqueta de prueba.');}finally{setPrinting(false);}};
  return <section aria-label="Escáner de códigos de barras" className="skeu-card mt-4 p-4 space-y-4">
    <div><h2 className="text-base font-semibold">Escáner de códigos de barras</h2><p className="text-sm text-muted-foreground">Ajustes de esta tablet o navegador. No cambian otras cajas ni sucursales.</p></div>
    {settings.error&&<p role="alert" className="text-sm text-destructive">{settings.error}</p>}
    {settings.existing&&<p className="text-sm">Se conserva el modo existente. Para proteger los campos de pago, configura tu lector con F9 + Enter y selecciona la configuración recomendada.</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>Activar lector en este dispositivo</label>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm">Perfil de lectura<select aria-label="Perfil de lectura" value={form.profile} onChange={e=>setForm({...form,profile:e.target.value})} className="skeu-input block w-full p-2 mt-1"><option value="f9">Recomendado: F9 + Enter</option><option value="compatible">Compatible con el lector existente (sin prefijo)</option></select></label>
      <label className="text-sm">Tiempo máximo entre teclas (ms)<input type="number" min="50" max="1000" step="1" value={form.maxGap} onChange={e=>setForm({...form,maxGap:Number(e.target.value)})} className="skeu-input block w-full p-2 mt-1"/><span className="text-xs text-muted-foreground">Recomendado: 250 ms. Una pausa mayor invalida la lectura completa.</span></label>
    </div>
    <p className="text-sm">Prefijo: <strong>{form.profile==='f9'?'F9 obligatorio':'F9 admitido; también entrada sin prefijo'}</strong>. Terminador: <strong>Enter</strong>. No se admiten Tab ni otros terminadores. El POS no reprograma el lector.</p>
    {form.profile==='compatible'&&<p className="text-sm text-amber-700 dark:text-amber-300">Sin F9, el lector es indistinguible de un teclado y puede escribir en búsquedas o importes. Usa F9 para protegerlos; no se elimina una segunda lectura completa sólo por repetir el código.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={save}>Guardar ajustes del escáner</button>
      <button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={()=>{capture.invalidate();setForm({...SCANNER_RECOMMENDED});setMessage('Configuración recomendada preparada: configura también F9 y Enter en el lector, y guarda.');}}>Restaurar configuración recomendada</button>
      <button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={dirty||!settings.config.enabled||!!settings.error} onClick={start}>Probar escáner</button>
      <button type="button" onClick={()=>setHelp(true)} className="min-h-11 px-3 py-2 underline text-sm">Cómo configurarlo</button>
    </div>
    {dirty&&<p className="text-sm">Hay ajustes sin guardar. Guarda para probar con esos valores.</p>}
    {message&&<p role="status" className="text-sm">{message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="text-sm rounded border p-3 space-y-1">
      <p><strong>Detección física no disponible en este entorno.</strong></p>
      <p>{Capacitor.isNativePlatform()?'El APK actual recibe las teclas; no incluye un puente que identifique el lector ni observe su desconexión.':'El navegador puede recibir teclas sin revelar qué dispositivo las envía. WebUSB o WebHID no garantizan acceso a un lector en modo teclado.'}</p>
      <p>Una lectura anterior no prueba que siga conectado. El POS no solicita permisos USB/Bluetooth ni toma el control de la impresora.</p>
    </div>
    {testing&&<div role="region" className="border rounded-lg p-3 space-y-3" aria-label="Prueba guiada del escáner">
      <h3 className="font-semibold">Prueba sin ventas ni cambios en productos</h3>
      <p className="text-sm">Escanea esta etiqueta o una existente. Después escanea el mismo código tres veces, soltando el disparador entre lecturas. Cada lectura completa debe aparecer una vez.</p>
      <BarcodeImage code={DIAGNOSTIC.codigo_barras} name={DIAGNOSTIC.nombre}/>
      <button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" disabled={printing} onClick={print}>{printing?'Preparando impresión…':'Imprimir etiqueta de prueba'}</button>
      <p className="text-xs text-muted-foreground">Etiqueta sólo para diagnóstico: no crea productos ni ventas. Usa la misma impresora configurada para tickets y etiquetas.</p>
      <label className="block text-sm">Zona de prueba<input aria-label="Zona de prueba" ref={testInput} readOnly inputMode="none" value={capture.draft} placeholder="Toca aquí y escanea con tu lector" className="skeu-input block w-full p-2 mt-1"/></label>
      <p role="status" className="text-sm">{stage} {capture.reading?'Lectura en curso; Esc cancela.':''}</p>
      <p className="text-sm">Lecturas completas recibidas: <strong>{complete.length}</strong>. Tres lecturas iguales: <strong>{repeated?'Recibidas como tres lecturas separadas':'Pendiente'}</strong>.</p>
      <p className="text-xs text-muted-foreground">Máximo 30 eventos visibles. Una tecla sostenida o un Enter doble se señala y se ignora. Dos tramas completas idénticas pueden ser dos disparos: sólo la persona puede comprobar si el lector duplicó un disparo.</p>
      <ol className="space-y-2 max-h-64 overflow-y-auto" aria-label="Resultados de lecturas">{events.map((e,i)=><li key={i} className="border rounded p-2 text-xs break-all">
        <strong>{e.type==='complete'?'Lectura completa':e.type==='duplicate'?'Evento repetido ignorado':'Lectura no válida'}</strong>
        <p>Código: <code>{e.code||'(sin caracteres)'}</code> · Longitud: {e.length} · Prefijo F9: {e.prefixed?'Sí':'No'} · Enter final: {e.terminated?'Sí':'No'} · Mayor intervalo: {Math.round(e.maxGap||0)} ms</p>
        {e.reason&&<p>{e.reason}</p>}<p>{e.trusted?'Entrada de teclado; el dispositivo de origen no es identificable.':'Evento de software o repetición de control; no acredita una prueba física.'}</p>
      </li>)}</ol>
      {repeated&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={physical} onChange={e=>setPhysical(e.target.checked)}/>Confirmo que hice estos tres disparos con el lector físico de esta tablet.</label>}
      {physical&&repeated&&<p className="text-sm">Prueba física declarada por la persona. No es una detección automática ni certifica reconexión o impresión.</p>}
      <div className="flex gap-2"><button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={start}>Reiniciar prueba</button><button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={()=>{capture.invalidate();setTesting(false);}}>Terminar prueba</button></div>
    </div>}
    <details id="scanner-help" open={help} onToggle={e=>setHelp(e.currentTarget.open)} className="space-y-2 text-sm">
      <summary className="font-semibold cursor-pointer min-h-11 py-2">Cómo configurarlo</summary>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Conecta el lector USB o su receptor. Si usas adaptador OTG, revisa alimentación y conexión. Para Bluetooth, enlázalo desde Android.</li>
        <li>En el manual del lector, selecciona modo teclado HID compatible con tu tablet y el idioma de su teclado.</li>
        <li>Configura en el lector el prefijo F9, el terminador Enter y una trama por disparo. Puede requerir escanear páginas del manual; los códigos de programación dependen de la marca y modelo.</li>
        <li>Selecciona la configuración recomendada del POS, guarda y abre Probar escáner. Revisa el código completo y las tres lecturas repetidas.</li>
        <li>Termina la prueba y comienza a vender. Cada lectura completa agrega una pieza; el cobro conserva su confirmación habitual.</li>
        <li>Si no lee: revisa alimentación, modo teclado, F9 y Enter. Si cambia letras: revisa idioma. Si se interrumpe: revisa tiempos y repite desde F9. Si duplica piezas: revisa una sola trama por disparo y el sufijo del manual; no reduzcas piezas automáticamente por código repetido.</li>
      </ol>
      <p>El POS guarda activación, perfil y tiempos; el prefijo, terminador y modo físico se programan en el lector. Lectores serie, propietarios o que requieren controlador necesitan integración específica. Esta sección no promete compatibilidad universal.</p>
    </details>
  </section>;
}

import { createBarcodeReader } from './barcodeCore';

/** One parser for sale, assignment and diagnostics; quarantine survives ownership changes.
 * @param {any} options
 */
export function createBarcodeFrame({getContext,isModalOpen,onScan,onDraft,onReading,onStatus,
  getSettings=()=>({enabled:true,profile:'compatible',maxGap:250}),onEvent=()=>{}}) {
  let origin=null,active=false,prefixed=false,discarding=false,lastTerminator=null;
  let raw='',lastKeyAt=null,largestGap=0,reason='',trusted=true;
  const contextMatches=(a,b)=>a && a.branch===b.branch && a.contextKey===b.contextKey && a.enabled===b.enabled;
  const emit=(type,extra={})=>onEvent({type,code:raw,length:raw.length,prefixed,terminated:false,maxGap:largestGap,reason,trusted,...extra});
  const reader=createBarcodeReader(code=>{
    const ctx=getContext();
    if(!discarding && origin?.allowed && contextMatches(origin,ctx) && ctx.enabled && !isModalOpen()) onScan(code,ctx.branch);
    else if(origin?.allowed)onStatus('Lectura interrumpida. Vuelve a escanear el código completo.');
  },{maxGap:()=>getSettings().maxGap});
  const pausedInput=createBarcodeReader(()=>{},{maxGap:()=>getSettings().maxGap});
  const paint=()=>{onDraft(reader.buffer);onReading(active);};
  const reset=()=>{reader.reset();pausedInput.reset();origin=null;active=false;prefixed=false;discarding=false;raw='';lastKeyAt=null;largestGap=0;reason='';trusted=true;paint();};
  const invalidate=(why='Cambió el contexto durante la lectura.')=>{
    if(active){reader.discard();origin=null;discarding=true;reason=why;onStatus('Lectura interrumpida. Escanea de nuevo con F9 o pulsa Esc.');emit('interrupted');paint();}
    else reset();
  };
  const start=(withPrefix,now)=>{
    reset();const ctx=getContext();origin={...ctx,allowed:ctx.enabled&&!isModalOpen()};
    active=true;prefixed=withPrefix;lastKeyAt=withPrefix?now:null;
    if(origin.allowed)onStatus('Leyendo código… Pulsa Esc si necesitas cancelar.');
    emit('start');paint();
  };
  const consume=event=>{event.preventDefault();event.stopPropagation();};
  return {
    get active(){return active;},
    invalidate,
    reset,
    expire(now=globalThis.performance.now()) {
      if(active&&!discarding&&lastKeyAt!==null&&(now<lastKeyAt||now-lastKeyAt>getSettings().maxGap))invalidate('Se interrumpió el ritmo de lectura. Revisa el tiempo y escanea de nuevo.');
    },
    handle(event,{editing=false,dedicated=false}={},now=globalThis.performance.now()) {
      const key=event.key;
      if(key==='F9'){
        consume(event);
        if(event.repeat){emit('duplicate',{reason:'F9 sostenido ignorado.'});return;}
        if(active)emit('interrupted',{reason:'Una nueva F9 reemplazó la lectura anterior.'});
        start(true,now);trusted=event.isTrusted===true;return;
      }
      if(key==='Escape'){if(active){consume(event);emit('cancelled',{reason:'Lectura cancelada con Esc.'});}reset();return;}
      if(key==='Tab'){if(active&&prefixed){consume(event);invalidate('Terminador inesperado: configura Enter en el lector.');}else reset();return;}
      if(event.ctrlKey||event.altKey||event.metaKey||event.isComposing){if(active){if(prefixed)consume(event);invalidate('Atajo o composición inesperados en la lectura.');}return;}
      if(active&&prefixed&&key.length!==1&&key!=='Enter'&&key!=='Shift'){consume(event);invalidate('Tecla inesperada. Configura el lector como teclado.');return;}
      if(event.repeat&&active&&(key.length===1||key==='Enter')){consume(event);emit('duplicate',{reason:'Tecla sostenida ignorada.'});return;}
      if(key==='Enter'&&event.repeat&&lastTerminator!==null){consume(event);return;}
      if(key==='Enter'&&!active&&lastTerminator!==null&&now>=lastTerminator&&now-lastTerminator<250){consume(event);emit('duplicate',{reason:'Terminador doble ignorado.'});return;}
      const ctx=getContext(),settings=getSettings(),paused=!ctx.enabled||isModalOpen();
      if(!active){
        if(!settings.enabled)return;
        if(editing&&!dedicated){
          if(paused){const before=pausedInput.buffer;pausedInput.feed(key,now,event.repeat);if(key==='Enter'&&before){consume(event);lastTerminator=now;}}
          else pausedInput.reset();
          return;
        }
        if(key.length!==1||event.repeat)return;
        if(settings.profile==='f9'){
          // In the dedicated read-only target we can diagnose a missing prefix;
          // ordinary human typing elsewhere must remain untouched.
          if(!dedicated)return;
          start(false,now);invalidate('Falta el prefijo F9. Configúralo en el lector y repite.');
        }else start(false,now);
      }
      if(paused&&origin?.allowed)invalidate();
      if(key.length===1||key==='Enter')consume(event);
      if(key.length===1||key==='Enter'){
        if(lastKeyAt!==null){largestGap=Math.max(largestGap,now-lastKeyAt);if(!discarding&&(now<lastKeyAt||now-lastKeyAt>settings.maxGap))invalidate('Se interrumpió el ritmo de lectura.');}
        lastKeyAt=now;trusted=trusted&&event.isTrusted===true;
      }
      if(key.length===1&&raw.length<65)raw+=key;
      if(key.length===1&&!/^[A-Za-z0-9._/-]$/.test(key))invalidate('Caracteres inesperados: revisa el idioma del teclado y el modo del lector.');
      if(paused&&!prefixed&&!origin?.allowed)onStatus('Lector en pausa');
      const before=reader.buffer;
      const result=reader.feed(key,now,event.repeat);paint();
      if(key==='Enter'&&!event.repeat){
        const valid=!!result&&!discarding&&origin?.allowed&&contextMatches(origin,ctx)&&!paused;
        emit(valid?'complete':'invalid',{terminated:true,reason:reason||(!valid?'Lectura incompleta o lector en pausa.':'')});
        const incomplete=(!!before||prefixed)&&!result&&!discarding;
        lastTerminator=now;reset();
        if(incomplete&&!paused)onStatus('Lectura incompleta. Vuelve a escanear el código completo.');
      }
    },
  };
}

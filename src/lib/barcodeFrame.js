import { createBarcodeReader } from './barcodeCore';

/** Keep a frame's origin across focus, modal and branch transitions. */
export function createBarcodeFrame({getContext,isModalOpen,onScan,onDraft,onReading,onStatus}) {
  let origin=null,active=false,prefixed=false,discarding=false,lastTerminator=null;
  const contextMatches=(a,b)=>a && a.branch===b.branch && a.contextKey===b.contextKey && a.enabled===b.enabled;
  const reader=createBarcodeReader(code=>{
    const ctx=getContext();
    if(!discarding && origin?.allowed && contextMatches(origin,ctx) && ctx.enabled && !isModalOpen()) onScan(code,ctx.branch);
    else if(origin?.allowed) onStatus('Lectura interrumpida. Vuelve a escanear el código completo.');
  });
  const pausedInput=createBarcodeReader(()=>{});
  const paint=()=>{onDraft(reader.buffer);onReading(active);};
  const reset=()=>{reader.reset();pausedInput.reset();origin=null;active=false;prefixed=false;discarding=false;paint();};
  const start=withPrefix=>{
    reader.reset();pausedInput.reset();const ctx=getContext();origin={...ctx,allowed:ctx.enabled&&!isModalOpen()};
    active=true;prefixed=withPrefix;discarding=false;
    if(origin.allowed)onStatus('Leyendo código… Pulsa Esc si necesitas cancelar.');
    paint();
  };
  const consume=event=>{event.preventDefault();event.stopPropagation();};
  return {
    get active(){return active;},
    invalidate(){
      if(active){reader.discard();origin=null;discarding=true;onStatus('Lectura interrumpida. Escanea de nuevo con F9 o pulsa Esc.');paint();}
      else reset();
    },
    reset,
    handle(event,{editing=false,dedicated=false}={},now=globalThis.performance.now()) {
      const key=event.key;
      if(key==='F9'){consume(event);start(true);return;}
      if(key==='Escape'){reset();return;}
      if(key==='Tab'){if(active&&prefixed){consume(event);this.invalidate();}else reset();return;}
      if(event.ctrlKey||event.altKey||event.metaKey||event.isComposing){if(active){if(prefixed)consume(event);this.invalidate();}return;}
      if(active&&prefixed&&key.length!==1&&key!=='Enter'&&key!=='Shift'){consume(event);this.invalidate();return;}
      if(key==='Enter'&&event.repeat&&lastTerminator!==null){consume(event);return;}
      if(key==='Enter'&&!active&&lastTerminator!==null&&now>=lastTerminator&&now-lastTerminator<250){consume(event);return;}
      const ctx=getContext(),paused=!ctx.enabled||isModalOpen();
      if(!active){
        if(editing&&!dedicated){
          // Preserve Enter protection for legacy unprefixed readers in forms;
          // only a configured F9 prefix can also prevent their typed digits.
          if(paused){const before=pausedInput.buffer;pausedInput.feed(key,now,event.repeat);if(key==='Enter'&&before){consume(event);lastTerminator=now;}}
          else pausedInput.reset();
          return;
        }
        if(key.length!==1||event.repeat)return;
        start(false);
      }
      // An already known frame is consumed even if focus moves to a payment
      // field. A context change quarantines its tail until Enter/Escape/F9.
      {
        if(paused&&origin?.allowed)this.invalidate();
        if(key.length===1||key==='Enter')consume(event);
        if(paused&&!prefixed&&!origin?.allowed)onStatus('Lector en pausa');
        const before=reader.buffer;
        const result=reader.feed(key,now,event.repeat);paint();
        if(key==='Enter'&&!event.repeat){
          const incomplete=(!!before||prefixed)&&!result&&!discarding;
          lastTerminator=now;reset();
          if(incomplete&&!paused)onStatus('Lectura incompleta. Vuelve a escanear el código completo.');
        }
      }
    },
  };
}

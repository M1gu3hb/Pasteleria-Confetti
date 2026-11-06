import { createBarcodeFrame } from './barcodeFrame';
import { readScannerSettings, subscribeScannerConfig } from './scannerConfig';
import { createNativeScannerBridge } from '../native/confettiScanner';

const STALE='Cambió la pantalla, la sesión o la caja durante la lectura. Vuelve a escanear.';
const NATIVE_END={
  pausa:'La aplicación se pausó durante la lectura. Vuelve a escanear.',
  limite:'Lectura demasiado larga sin Enter. Revisa el terminador del lector.',
  invalidado:STALE,
  vinculacion:'Lectura interrumpida por la vinculación del lector.',
};
/** Native key → the KeyboardEvent shape barcodeFrame reads (it never reached the DOM). */
const keyEvent=k=>({key:k.k,repeat:(Number(k.r)||0)>0,ctrlKey:!!k.ctrl,altKey:!!k.alt,metaKey:!!k.meta,isComposing:false,isTrusted:true,preventDefault(){},stopPropagation(){}});

/** Single keyboard owner per document; never replace the parser on navigation.
 * Two sources feed the SAME parser rules and the same owner/context checks:
 *  - web: document keydown (browser, or APK without a bound reader);
 *  - native: ConfettiScanner batches from the bound USB-HID reader (APK 1.3.0+). While the native
 *    bridge reports capturando=true the web parser is passive, so a read is never processed twice
 *    and human/touch keyboards keep their normal behaviour.
 * @param {any} env injectable DOM boundary for meaningful lifecycle tests
 */
export function createScannerCapture(env) {
  const {doc,win,readSettings,subscribeSettings}=env;
  let settings=readSettings().config,owner=null,signature='',serial=0,timer=null;
  let gen=0,lastSeq=0,batchDevice=null,webReading=false,nativeState={disponible:false,motivo:'sin_puente'};
  const clients=new Map(),seen=new WeakSet(),nativeListeners=new Set(),pairingListeners=new Set();
  const options=()=>owner?.options||{};
  const context=()=>({branch:options().branch??null,contextKey:`${owner?.id||''}:${options().contextKey||''}`,enabled:!!owner&&options().enabled!==false&&settings.enabled});
  const state={draft:'',reading:false,status:'Esperando una lectura.',nativo:nativeState};
  const nativeCapturing=()=>nativeState.disponible===true&&nativeState.capturando===true;
  let nativeFrame;
  const notify=()=>{
    state.reading=webReading||(!!nativeFrame&&nativeFrame.active&&!nativeFrame.discarding);
    state.nativo=nativeState;
    for(const client of clients.values())client.onState({...state});
  };
  const modalOpen=()=>{
    const dialogs=Array.from(doc.querySelectorAll('[role="dialog"][data-state="open"]'));
    if(!dialogs.length)return false;
    const input=options().inputRef?.current;
    return !(options().allowModal&&input&&dialogs.at(-1).contains(input));
  };
  const frameSettings=()=>({...settings,enabled:settings.enabled&&!!owner});
  const frame=createBarcodeFrame({getContext:context,isModalOpen:modalOpen,getSettings:frameSettings,
    onScan:(code,branch)=>options().onScan?.(code,branch),
    onDraft:v=>{state.draft=v;},onReading:v=>{webReading=v;},
    onStatus:v=>{state.status=v;},onEvent:e=>options().onEvent?.(e),
  });
  nativeFrame=createBarcodeFrame({getContext:context,isModalOpen:modalOpen,getSettings:frameSettings,
    onScan:(code,branch)=>options().onScan?.(code,branch),
    onDraft:()=>{},onReading:()=>{},
    onStatus:v=>{state.status=v;},onEvent:e=>options().onEvent?.({...e,origen:'nativo',dispositivo:batchDevice}),
  });
  const handleBatch=batch=>{
    if(!batch||typeof batch!=='object')return;
    const seq=Number(batch.seq);
    if(Number.isFinite(seq)){if(seq<=lastSeq)return;lastSeq=seq;}
    if(batch.origen==='vinculacion'){for(const fn of pairingListeners)fn(batch);return;}
    if(batch.origen!=='vinculado')return;
    batchDevice=batch.dispositivo&&typeof batch.dispositivo==='object'?batch.dispositivo:null;
    const keys=Array.isArray(batch.teclas)?batch.teclas.filter(k=>k&&typeof k.k==='string'&&Number.isFinite(Number(k.t))):[];
    if(batch.gen!==gen){
      // Started before the JS context changed: never let it, or its tail, reach the new owner.
      if(batch.fin==='enter'||keys.some(k=>k.k==='Enter')){nativeFrame.reset();state.status=STALE;options().onEvent?.({type:'interrupted',reason:STALE,code:'',length:0,origen:'nativo',dispositivo:batchDevice});}
      else nativeFrame.quarantine(STALE);
      notify();return;
    }
    for(const k of keys)nativeFrame.handle(keyEvent(k),{native:true},Number(k.t));
    if(batch.fin==='tiempo'){
      nativeFrame.expire(Number(batch.tFin));
      if(nativeFrame.active&&!nativeFrame.discarding)nativeFrame.invalidate('Se interrumpió el ritmo de lectura. Revisa el tiempo y escanea de nuevo.');
    }else if(batch.fin==='desconexion'){
      // The device is gone: no tail can follow from it, so do not quarantine the next read.
      if(nativeFrame.active)nativeFrame.invalidate('El lector se desconectó durante la lectura.');
      nativeFrame.reset();
    }else if(batch.fin!=='enter'&&nativeFrame.active){
      nativeFrame.invalidate(NATIVE_END[batch.fin]||STALE);
    }
    notify();
  };
  const bridge=env.native?.({
    onBatch:handleBatch,
    onState:next=>{
      const was=nativeCapturing();
      nativeState=next&&typeof next==='object'?next:{disponible:false,motivo:'error'};
      // Switching source: neither parser may keep a partial frame from the other mode.
      if(was!==nativeCapturing()){frame.reset();nativeFrame.reset();}
      notify();
      for(const fn of nativeListeners)fn(nativeState);
    },
  });
  const advance=()=>{gen++;bridge?.invalidate(gen);};
  const sync=()=>{
    const available=[...clients.values()].filter(c=>c.options.active!==false);
    // Several product cards may have assignment open. The focused input owns
    // the scanner; mount order must never assign a code to another product.
    const focused=available.find(c=>c.options.inputRef?.current&&c.options.inputRef.current===doc.activeElement);
    const next=focused||(available.includes(owner)?owner:null)||available.at(-1)||null;
    const opts=next?.options||{};
    const sig=JSON.stringify([next?.id,opts.branch,opts.contextKey,opts.enabled,settings]);
    if(sig!==signature){
      owner=next;signature=sig;advance();
      frame.invalidate('Cambió la pantalla, sesión o configuración.');nativeFrame.invalidate('Cambió la pantalla, sesión o configuración.');
      state.status=frame.active||nativeFrame.active?state.status:settings.enabled?'Esperando una lectura.':'Lector desactivado en este dispositivo.';
      for(const c of clients.values())c.options.onInvalidate?.();notify();
    }
  };
  const handle=event=>{
    // The bound reader is consumed natively; anything still arriving here is a human or touch
    // keyboard (or an unbound device) and must behave normally.
    if(nativeCapturing())return;
    if(seen.has(event)){options().onEvent?.({type:'duplicate',reason:'El mismo evento se recibió dos veces.',code:'',length:0});return;}
    seen.add(event);
    const target=event.target;
    const editing=!!target&&(target.isContentEditable||!!target.closest?.('input,textarea,select,[role="textbox"]'));
    frame.handle(event,{editing,dedicated:options().captureUnprefixed!==false&&target===options().inputRef?.current});notify();
    if(timer!==null)win.clearTimeout(timer);
    if(frame.active)timer=win.setTimeout(()=>{frame.expire();notify();},settings.maxGap+5);
  };
  const blur=()=>{frame.invalidate('La aplicación perdió el foco.');nativeFrame.invalidate('La aplicación perdió el foco.');advance();notify();};
  const focus=()=>{sync();if(frame.active){frame.invalidate('Cambió el campo durante la lectura.');notify();}};
  const visibility=()=>{if(doc.hidden)blur();};
  const unsubscribe=subscribeSettings(()=>{settings=readSettings().config;bridge?.configure(settings.maxGap);sync();});
  doc.addEventListener('keydown',handle,true);doc.addEventListener('focusin',focus,true);
  win.addEventListener('blur',blur);doc.addEventListener('visibilitychange',visibility);
  // Catch a dialog opened AND closed between scanner keys, not only its final state.
  const observer=env.observe?.(()=>{if(frame.active){frame.invalidate('Se abrió o cerró un diálogo durante la lectura.');notify();}});
  bridge?.start(gen,settings.maxGap);
  return {
    register(initial,onState){
      const id=++serial,client={id,options:initial,onState};clients.set(id,client);sync();onState({...state});
      return {update(next){client.options=next;sync();},remove(){clients.delete(id);sync();}};
    },
    invalidate(){frame.invalidate();nativeFrame.invalidate();notify();},
    get active(){return frame.active||(nativeFrame.active&&!nativeFrame.discarding);},
    /** Native reader state/actions (APK 1.3.0+). In the browser or older APKs: {disponible:false}. */
    get native(){return nativeState;},
    get nativeBridge(){return bridge||null;},
    subscribeNative(fn){nativeListeners.add(fn);fn(nativeState);return()=>{nativeListeners.delete(fn);};},
    subscribePairing(fn){pairingListeners.add(fn);return()=>{pairingListeners.delete(fn);};},
    // Used only when disposing a test DOM or application runtime, not a route.
    dispose(){unsubscribe();observer?.disconnect();bridge?.dispose?.();if(timer!==null)win.clearTimeout(timer);doc.removeEventListener('keydown',handle,true);doc.removeEventListener('focusin',focus,true);win.removeEventListener('blur',blur);doc.removeEventListener('visibilitychange',visibility);},
  };
}
let singleton;
export function getScannerCapture() {
  if(!singleton)singleton=createScannerCapture({doc:document,win:window,readSettings:readScannerSettings,subscribeSettings:subscribeScannerConfig,
    native:handlers=>createNativeScannerBridge(handlers),
    observe:callback=>{
      let previous=Array.from(document.querySelectorAll('[role="dialog"][data-state="open"]'));
      const observer=new MutationObserver(()=>{
        const current=Array.from(document.querySelectorAll('[role="dialog"][data-state="open"]'));
        // Compare actual node identities, including same-count replacements.
        if(current.length!==previous.length||current.some((node,i)=>node!==previous[i])){previous=current;callback();}
      });
      observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-state','role']});
      return observer;
    },
  });
  return singleton;
}

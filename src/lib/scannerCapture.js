import { createBarcodeFrame } from './barcodeFrame';
import { readScannerSettings, subscribeScannerConfig } from './scannerConfig';

/** Single keyboard owner per document; never replace the parser on navigation.
 * @param {any} env injectable DOM boundary for meaningful lifecycle tests
 */
export function createScannerCapture(env) {
  const {doc,win,readSettings,subscribeSettings}=env;
  let settings=readSettings().config,owner=null,signature='',serial=0,timer=null;
  const clients=new Map(),seen=new WeakSet();
  const options=()=>owner?.options||{};
  const context=()=>({branch:options().branch??null,contextKey:`${owner?.id||''}:${options().contextKey||''}`,enabled:!!owner&&options().enabled!==false&&settings.enabled});
  const state={draft:'',reading:false,status:'Esperando una lectura.'};
  const notify=()=>{for(const client of clients.values())client.onState({...state});};
  const modalOpen=()=>{
    const dialogs=Array.from(doc.querySelectorAll('[role="dialog"][data-state="open"]'));
    if(!dialogs.length)return false;
    const input=options().inputRef?.current;
    return !(options().allowModal&&input&&dialogs.at(-1).contains(input));
  };
  const frame=createBarcodeFrame({getContext:context,isModalOpen:modalOpen,getSettings:()=>({...settings,enabled:settings.enabled&&!!owner}),
    onScan:(code,branch)=>options().onScan?.(code,branch),
    onDraft:v=>{state.draft=v;},onReading:v=>{state.reading=v;},
    onStatus:v=>{state.status=v;},onEvent:e=>options().onEvent?.(e),
  });
  const sync=()=>{
    const available=[...clients.values()].filter(c=>c.options.active!==false);
    const next=available.at(-1)||null;
    const opts=next?.options||{};
    const sig=JSON.stringify([next?.id,opts.branch,opts.contextKey,opts.enabled,settings]);
    if(sig!==signature){owner=next;signature=sig;frame.invalidate('Cambió la pantalla, sesión o configuración.');state.status=frame.active?state.status:settings.enabled?'Esperando una lectura.':'Lector desactivado en este dispositivo.';for(const c of clients.values())c.options.onInvalidate?.();notify();}
  };
  const handle=event=>{
    if(seen.has(event)){options().onEvent?.({type:'duplicate',reason:'El mismo evento se recibió dos veces.',code:'',length:0});return;}
    seen.add(event);
    const target=event.target;
    const editing=!!target&&(target.isContentEditable||!!target.closest?.('input,textarea,select,[role="textbox"]'));
    frame.handle(event,{editing,dedicated:options().captureUnprefixed!==false&&target===options().inputRef?.current});notify();
    if(timer!==null)win.clearTimeout(timer);
    if(frame.active)timer=win.setTimeout(()=>{frame.expire();notify();},settings.maxGap+5);
  };
  const blur=()=>{frame.invalidate('La aplicación perdió el foco.');notify();};
  const focus=()=>{if(frame.active){frame.invalidate('Cambió el campo durante la lectura.');notify();}};
  const visibility=()=>{if(doc.hidden)blur();};
  const unsubscribe=subscribeSettings(()=>{settings=readSettings().config;sync();});
  doc.addEventListener('keydown',handle,true);doc.addEventListener('focusin',focus,true);
  win.addEventListener('blur',blur);doc.addEventListener('visibilitychange',visibility);
  // Catch a dialog opened AND closed between scanner keys, not only its final state.
  const observer=env.observe?.(()=>{if(frame.active){frame.invalidate('Se abrió o cerró un diálogo durante la lectura.');notify();}});
  return {
    register(initial,onState){
      const id=++serial,client={id,options:initial,onState};clients.set(id,client);sync();onState({...state});
      return {update(next){client.options=next;sync();},remove(){clients.delete(id);sync();}};
    },
    invalidate(){frame.invalidate();notify();},
    get active(){return frame.active;},
    // Used only when disposing a test DOM or application runtime, not a route.
    dispose(){unsubscribe();observer?.disconnect();if(timer!==null)win.clearTimeout(timer);doc.removeEventListener('keydown',handle,true);doc.removeEventListener('focusin',focus,true);win.removeEventListener('blur',blur);doc.removeEventListener('visibilitychange',visibility);},
  };
}
let singleton;
export function getScannerCapture() {
  if(!singleton)singleton=createScannerCapture({doc:document,win:window,readSettings:readScannerSettings,subscribeSettings:subscribeScannerConfig,
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

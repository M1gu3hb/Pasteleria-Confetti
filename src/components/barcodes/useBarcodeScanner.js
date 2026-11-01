import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createScanQueue } from '@/lib/barcodeCore';
import { createBarcodeFrame } from '@/lib/barcodeFrame';
import { toast } from 'sonner';
import { lookupBarcode } from '@/lib/barcodes';

/** @param {{branch:string|null, enabled:boolean, contextKey?:string, onProduct:(product:any)=>void}} options */
export function useBarcodeScanner({ branch, enabled, onProduct, contextKey = '' }) {
  const [pending,setPending]=useState(0),[reading,setReading]=useState(false),[draft,setDraft]=useState(''),[status,setStatus]=useState('Listo para escanear');
  const latest=useRef({branch,enabled,onProduct,contextKey});latest.current={branch,enabled,onProduct,contextKey};
  const inputRef=useRef(null),frameRef=useRef(null),queueRef=useRef(null);
  const modalOpen=()=>!!document.querySelector('[role="dialog"][data-state="open"]');
  if(!queueRef.current)queueRef.current=createScanQueue({
    lookup:async(code,scope)=>{
      const previous=latest.current.contextKey;
      const rows=await lookupBarcode(code,scope);
      return previous===latest.current.contextKey?rows:[];
    },
    onProduct:(product,fromBranch)=>{
      if(!latest.current.enabled||latest.current.branch!==fromBranch||modalOpen())throw new Error('La lectura se interrumpió al cambiar de pantalla. Vuelve a escanear.');
      latest.current.onProduct(product);setStatus(`Agregado: ${product.nombre}`);
    },
    onError:error=>{const message=error?.message||'No se pudo leer el producto. Reintenta.';setStatus(message);toast.error(message);},
    onPending:setPending,
  });
  useLayoutEffect(()=>{
    queueRef.current.clear();frameRef.current?.invalidate();
    if(!frameRef.current?.active)setStatus(enabled?'Listo para escanear':'Lector en pausa');
  },[branch,enabled,contextKey]);
  useEffect(()=>{
    const frame=createBarcodeFrame({getContext:()=>latest.current,isModalOpen:modalOpen,onScan:(code,scope)=>queueRef.current.enqueue(code,scope),onDraft:setDraft,onReading:setReading,onStatus:setStatus});
    frameRef.current=frame;
    const onKey=event=>{
      const target=event.target;
      const editing=target instanceof HTMLElement&&(target.isContentEditable||!!target.closest('input,textarea,select,[role="textbox"]'));
      frame.handle(event,{editing,dedicated:target===inputRef.current});
    };
    const onBlur=()=>frame.invalidate();
    document.addEventListener('keydown',onKey,true);window.addEventListener('blur',onBlur);
    return()=>{document.removeEventListener('keydown',onKey,true);window.removeEventListener('blur',onBlur);frameRef.current=null;queueRef.current.clear();};
  },[]);
  return {pending,reading,busy:pending>0||reading,draft,status,inputRef,
    clear:()=>{queueRef.current.clear();frameRef.current?.invalidate();},
    canCheckout:()=>queueRef.current.pending===0&&!frameRef.current?.active};
}

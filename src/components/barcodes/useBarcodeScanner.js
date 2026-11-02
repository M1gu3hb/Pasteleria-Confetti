import { useLayoutEffect, useRef, useState } from 'react';
import { createScanQueue } from '@/lib/barcodeCore';
import { useBarcodeCapture } from './useBarcodeCapture';
import { toast } from 'sonner';
import { lookupBarcode } from '@/lib/barcodes';

/** @param {{branch:string|null, enabled:boolean, contextKey?:string, onProduct:(product:any)=>void}} options */
export function useBarcodeScanner({ branch, enabled, onProduct, contextKey = '' }) {
  const [pending,setPending]=useState(0),[result,setResult]=useState('');
  const latest=useRef({branch,enabled,onProduct,contextKey});latest.current={branch,enabled,onProduct,contextKey};
  const inputRef=useRef(null),queueRef=useRef(null);
  const modalOpen=()=>!!document.querySelector('[role="dialog"][data-state="open"]');
  if(!queueRef.current)queueRef.current=createScanQueue({
    lookup:async(code,scope)=>{
      const previous=latest.current.contextKey;
      const rows=await lookupBarcode(code,scope);
      return previous===latest.current.contextKey?rows:[];
    },
    onProduct:(product,fromBranch)=>{
      if(!latest.current.enabled||latest.current.branch!==fromBranch||modalOpen())throw new Error('La lectura se interrumpió al cambiar de pantalla. Vuelve a escanear.');
      latest.current.onProduct(product);setResult(`Agregado: ${product.nombre}`);
    },
    onError:error=>{const message=error?.message||'No se pudo leer el producto. Reintenta.';setResult(message);toast.error(message);},
    onPending:setPending,
  });
  const capture=useBarcodeCapture({branch,enabled,contextKey,inputRef,
    onScan:(code,scope)=>queueRef.current.enqueue(code,scope),
    onEvent:event=>{if(event.type==='start')setResult('');},
    onInvalidate:()=>{queueRef.current.clear();setResult('');},
  });
  useLayoutEffect(()=>()=>queueRef.current.clear(),[]);
  return {pending,reading:capture.reading,busy:pending>0||capture.reading,draft:capture.draft,status:result||capture.status,inputRef,
    clear:()=>{queueRef.current.clear();capture.invalidate();},
    canCheckout:()=>queueRef.current.pending===0&&!capture.isReading()};
}

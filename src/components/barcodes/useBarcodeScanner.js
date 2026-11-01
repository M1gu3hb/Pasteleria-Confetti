import { useEffect, useRef, useState } from 'react';
import { createBarcodeReader, createScanQueue } from '@/lib/barcodeCore';
import { toast } from 'sonner';
import { lookupBarcode } from '@/lib/barcodes';

/** @param {{branch:string|null, enabled:boolean, contextKey?:string, onProduct:(product:any)=>void}} options */
export function useBarcodeScanner({ branch, enabled, onProduct, contextKey = '' }) {
  const [pending,setPending] = useState(0), [draft,setDraft] = useState(''), [status,setStatus] = useState('Listo para escanear');
  const latest = useRef({ branch, enabled, onProduct, contextKey });
  latest.current = { branch, enabled, onProduct, contextKey };
  const inputRef = useRef(null);
  const readerRef = useRef(null);
  const queueRef = useRef(null);
  if (!queueRef.current) queueRef.current = createScanQueue({
    lookup: async (code,scope) => {
      const previous=latest.current.contextKey;
      const rows=await lookupBarcode(code,scope);
      return previous===latest.current.contextKey ? rows : [];
    },
    onProduct: (product,fromBranch) => { if (!latest.current.enabled || latest.current.branch !== fromBranch) return;latest.current.onProduct(product);setStatus(`Agregado: ${product.nombre}`); },
    onError: error => { const message=error?.message || 'No se pudo leer el producto. Reintenta.';setStatus(message);toast.error(message); },
    onPending: setPending,
  });
  useEffect(() => {
    const queue = queueRef.current;
    queue.clear();setDraft('');setStatus(enabled ? 'Listo para escanear' : 'Lector en pausa');
    const reader = createBarcodeReader(code => {
      const ctx = latest.current;
      if (ctx.enabled && ctx.branch && !document.querySelector('[role="dialog"][data-state="open"]')) queue.enqueue(code,ctx.branch);
    });
    readerRef.current=reader;
    let prefixed=false, lastTerminator=0;
    const reset = () => { if(reader.buffer) reader.discard();else reader.reset();prefixed=false;setDraft(''); };
    const onKey = event => {
      const target = event.target;
      const dedicated = target === inputRef.current;
      const editing = target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input,textarea,select,[role="textbox"]'));
      const modal = !!document.querySelector('[role="dialog"][data-state="open"]');
      const now=Date.now();
      // Optional F9 prefix identifies the hardware unambiguously, even when
      // a price/payment field has focus. No guessed rollback of money inputs.
      if(event.key==='F9') {event.preventDefault();event.stopPropagation();reader.reset();prefixed=true;return;}
      if(prefixed) {
        event.preventDefault();event.stopPropagation();
        reader.feed(event.key,now,event.repeat);setDraft(reader.buffer);
        if(event.key==='Enter'||event.key==='Escape') {prefixed=false;lastTerminator=now;}
        return;
      }
      if(event.key==='Enter'&&!reader.buffer&&now-lastTerminator<250) {event.preventDefault();event.stopPropagation();return;}
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) { reset();return; }
      // A paused reader must also consume its trailing Enter: otherwise the
      // browser can activate the focused payment button even without a lookup.
      if (!latest.current.enabled || modal) {
        if (event.key === 'Enter' && reader.buffer) {event.preventDefault();event.stopPropagation();}
        else if (!editing && event.key.length === 1) {event.preventDefault();event.stopPropagation();}
        reader.feed(event.key,now,event.repeat);if(event.key==='Enter')lastTerminator=now;setDraft('');return;
      }
      if (editing && !dedicated) { reset();return; }
      if (event.key.length === 1 || event.key === 'Enter' && reader.buffer) {
        event.preventDefault();event.stopPropagation();
      }
      const before = reader.buffer;
      const result = reader.feed(event.key,now,event.repeat);
      setDraft(reader.buffer);
      if(event.key==='Enter'&&before)lastTerminator=now;
      if (event.key === 'Enter' && before && !result) setStatus('Lectura incompleta. Vuelve a escanear el código completo.');
    };
    document.addEventListener('keydown',onKey,true);
    window.addEventListener('blur',reset);
    return () => { document.removeEventListener('keydown',onKey,true);window.removeEventListener('blur',reset);queue.clear(); };
  }, [branch,enabled,contextKey]);
  return { pending,draft,status,inputRef, clear: () => {queueRef.current.clear();if(readerRef.current?.buffer)readerRef.current.discard();else readerRef.current?.reset();setDraft('');}, canCheckout: () => queueRef.current.pending === 0 };
}

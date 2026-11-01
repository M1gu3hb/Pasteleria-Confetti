import { Capacitor } from '@capacitor/core';
import BarcodeImage from './BarcodeImage';
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createLabelsPDF, validateLabelQuantities } from '@/lib/barcodeLabels';
import { exportBarcodeFile } from '@/lib/barcodeExport';
import { base44 } from '@/api/base44Client';
import { assignBarcode } from '@/lib/barcodes';
import { useQueryClient } from '@tanstack/react-query';

/** @param {{open:boolean,onClose:()=>void,products:any[],initialId?:string,scopeKey?:string}} props */
export default function BarcodePDFDialog({open,onClose,products,initialId='',scopeKey=''}) {
  const [copies,setCopies] = useState({}), [busy,setBusy] = useState(false), [error,setError] = useState(''), [preview,setPreview] = useState(''), [included,setIncluded] = useState([]);
  const epoch=useRef(0),running=useRef(false);
  const queryClient = useQueryClient();
  useEffect(()=>()=>{epoch.current++;running.current=false;},[]);
  useEffect(()=>{epoch.current++;running.current=false;setBusy(false);setCopies(initialId ? {[initialId]:1} : {});setError('');setPreview('');setIncluded([]);},[open,initialId,scopeKey]);
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  const selected = products.filter(p=>Object.prototype.hasOwnProperty.call(copies,p.id));
  const generate = async () => {
    if(running.current)return;running.current=true;
    const operation=++epoch.current;setBusy(true);setError('');setPreview('');
    try {
      validateLabelQuantities(selected.map(p=>({copies:copies[p.id]})));
      const entries = [];
      for (const p of selected) {
        if(operation!==epoch.current)return;
        const product = await assignBarcode(p.id,'',true);
        if(operation!==epoch.current)return;
        entries.push({product,copies:Number(copies[p.id])});
      }
      await queryClient.invalidateQueries({queryKey:['productos_all']});
      const blob = createLabelsPDF(entries).output('blob');
      if(operation!==epoch.current)return;
      setIncluded(entries);setPreview(URL.createObjectURL(blob));
    } catch(e) {if(operation===epoch.current)setError(e.message || 'No se pudo generar el PDF.');}
    finally {if(operation===epoch.current){running.current=false;setBusy(false);}}
  };
  const download = async () => {
    if(running.current)return;running.current=true;
    const operation=++epoch.current;setBusy(true);setError('');
    try {
      for(const {product} of included){
        const current=await base44.entities.ProductoTerminado.get(product.id);
        if(operation!==epoch.current)return;
        if(!current||current.id!==product.id||current.codigo_barras!==product.codigo_barras||current.nombre!==product.nombre){
          setPreview('');throw new Error('El catálogo cambió. Vuelve a generar el PDF antes de descargarlo.');
        }
      }
      const blob=await(await fetch(preview)).blob();if(operation!==epoch.current)return;await exportBarcodeFile(blob,'Etiquetas-Confetti.pdf');
    }
    catch(e) {if(operation===epoch.current)setError(e.message || 'No se pudo guardar el PDF.');}
    finally {if(operation===epoch.current){running.current=false;setBusy(false);}}
  };
  return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}>
    <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>PDF de códigos de barras</DialogTitle><DialogDescription>Selecciona productos y copias. Los que aún no tengan código recibirán uno al generar. Imprime en carta a tamaño real (100 %).</DialogDescription></DialogHeader>
      <div className="max-h-60 overflow-y-auto space-y-2">
        {products.map(p=><div key={p.id} className="flex gap-3 items-center">
          <input type="checkbox" aria-label={`Incluir ${p.nombre}`} checked={Object.prototype.hasOwnProperty.call(copies,p.id)} disabled={busy} onChange={e=>{setCopies(prev=>{const next={...prev};if(e.target.checked)next[p.id]=1;else delete next[p.id];return next;});setPreview('');}} />
          <span className="flex-1 text-sm">{p.nombre}<span className="block text-xs text-muted-foreground">{p.codigo_barras || 'Se generará un código'}</span></span>
          {Object.prototype.hasOwnProperty.call(copies,p.id)&&<input type="number" min="1" max="100" aria-label={`Copias de ${p.nombre}`} className="skeu-input w-20 p-2" value={copies[p.id]} disabled={busy} onChange={e=>{setCopies(prev=>({...prev,[p.id]:e.target.value}));setPreview('');}} />}
        </div>)}
      </div>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 flex-wrap"><Button disabled={busy||!selected.length} onClick={generate}>{busy?'Preparando…':'Generar PDF'}</Button>{preview&&<Button variant="outline" disabled={busy} onClick={download}>Descargar PDF</Button>}</div>
      {preview&&<><p className="text-xs text-muted-foreground">Vista previa del mismo archivo que se descarga. En tablet también puedes descargarlo y abrirlo con tu visor PDF.</p>{Capacitor.isNativePlatform() ? <div className="max-h-80 overflow-y-auto grid grid-cols-2 gap-2 bg-white p-2 rounded">{included.map(({product,copies:count})=><div key={product.id} className="border p-1"><BarcodeImage code={product.codigo_barras} name={product.nombre}/><p className="text-xs text-black text-center">{count} etiqueta(s)</p></div>)}</div> : <iframe title="Vista previa de etiquetas" src={preview} className="w-full h-80 bg-white border rounded" />}</>}
    </DialogContent>
  </Dialog>;
}

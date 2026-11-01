import { Capacitor } from '@capacitor/core';
import BarcodeImage from './BarcodeImage';
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createLabelsPDF } from '@/lib/barcodeLabels';
import { exportBarcodeFile } from '@/lib/barcodeExport';
import { assignBarcode } from '@/lib/barcodes';
import { useQueryClient } from '@tanstack/react-query';

/** @param {{open:boolean,onClose:()=>void,products:any[],initialId?:string}} props */
export default function BarcodePDFDialog({open,onClose,products,initialId=''}) {
  const [copies,setCopies] = useState({}), [busy,setBusy] = useState(false), [error,setError] = useState(''), [preview,setPreview] = useState(''), [included,setIncluded] = useState([]);
  const queryClient = useQueryClient();
  useEffect(()=>{ if(open) {setCopies(initialId ? {[initialId]:1} : {});setError('');setPreview('');} },[open,initialId]);
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  const selected = products.filter(p=>Number(copies[p.id])>0);
  const generate = async () => {
    setBusy(true);setError('');
    try {
      const entries = [];
      for (const p of selected) {
        const product = await assignBarcode(p.id,'',true);
        entries.push({product,copies:Number(copies[p.id])});
      }
      await queryClient.invalidateQueries({queryKey:['productos_all']});
      const blob = createLabelsPDF(entries).output('blob');
      setIncluded(entries);setPreview(URL.createObjectURL(blob));
    } catch(e) {setError(e.message || 'No se pudo generar el PDF.');}
    finally {setBusy(false);}
  };
  const download = async () => {
    setBusy(true);setError('');
    try {const blob=await (await fetch(preview)).blob();await exportBarcodeFile(blob,'Etiquetas-Confetti.pdf');}
    catch(e) {setError(e.message || 'No se pudo guardar el PDF.');}
    finally {setBusy(false);}
  };
  return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}>
    <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>PDF de códigos de barras</DialogTitle><DialogDescription>Selecciona productos y copias. Los que aún no tengan código recibirán uno al generar. Imprime en carta a tamaño real (100 %).</DialogDescription></DialogHeader>
      <div className="max-h-60 overflow-y-auto space-y-2">
        {products.map(p=><div key={p.id} className="flex gap-3 items-center">
          <input type="checkbox" aria-label={`Incluir ${p.nombre}`} checked={!!copies[p.id]} disabled={busy} onChange={e=>{setCopies(prev=>({...prev,[p.id]:e.target.checked?1:0}));setPreview('');}} />
          <span className="flex-1 text-sm">{p.nombre}<span className="block text-xs text-muted-foreground">{p.codigo_barras || 'Se generará un código'}</span></span>
          {!!copies[p.id]&&<input type="number" min="1" max="100" aria-label={`Copias de ${p.nombre}`} className="skeu-input w-20 p-2" value={copies[p.id]} disabled={busy} onChange={e=>{setCopies(prev=>({...prev,[p.id]:e.target.value}));setPreview('');}} />}
        </div>)}
      </div>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 flex-wrap"><Button disabled={busy||!selected.length} onClick={generate}>{busy?'Preparando…':'Generar PDF'}</Button>{preview&&<Button variant="outline" disabled={busy} onClick={download}>Descargar PDF</Button>}</div>
      {preview&&<><p className="text-xs text-muted-foreground">Vista previa del mismo archivo que se descarga. En tablet también puedes descargarlo y abrirlo con tu visor PDF.</p>{Capacitor.isNativePlatform() ? <div className="max-h-80 overflow-y-auto grid grid-cols-2 gap-2 bg-white p-2 rounded">{included.map(({product,copies:count})=><div key={product.id} className="border p-1"><BarcodeImage code={product.codigo_barras} name={product.nombre}/><p className="text-xs text-black text-center">{count} etiqueta(s)</p></div>)}</div> : <iframe title="Vista previa de etiquetas" src={preview} className="w-full h-80 bg-white border rounded" />}</>}
    </DialogContent>
  </Dialog>;
}

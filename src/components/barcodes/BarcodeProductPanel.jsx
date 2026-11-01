import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import BarcodeImage from './BarcodeImage';
import { base44 } from '@/api/base44Client';
import { assignBarcode } from '@/lib/barcodes';
import { createLabelPNG } from '@/lib/barcodeLabels';
import { exportBarcodeFile, printBarcodeLabel } from '@/lib/barcodeExport';

/** @param {{product?:any,onPDF?:(id:string)=>void}} props */
export default function BarcodeProductPanel({product,onPDF}) {
  const [saved,setSaved] = useState(product), [code,setCode] = useState(''), [assigning,setAssigning] = useState(false), [confirming,setConfirming] = useState(false), [large,setLarge] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const queryClient = useQueryClient();
  useEffect(()=>{setSaved(product);setCode('');setError('');setAssigning(false);setConfirming(false);},[product?.id,product?.codigo_barras]);
  const run = async action => {setBusy(true);setError('');try {await action();}catch(e){setError(e.message || 'No se pudo completar.');}finally{setBusy(false);}};
  const save = generate => run(async()=>{
    const updated=await assignBarcode(product.id,code,generate);
    setSaved(updated);setAssigning(false);setConfirming(false);setCode('');
    await Promise.all([queryClient.invalidateQueries({queryKey:['productos_all']}),queryClient.invalidateQueries({queryKey:['productos_pos']})]);
  });
  const exportCurrent = async action => {
    const updated=await base44.entities.ProductoTerminado.get(product.id);
    if (!updated?.codigo_barras || updated.id!==product.id) throw new Error('El producto ya no tiene código disponible. Actualiza el catálogo antes de imprimir.');
    setSaved(updated);
    if(updated.codigo_barras!==saved.codigo_barras) throw new Error('El código cambió desde otro dispositivo. Ya se actualizó la vista; revisa la etiqueta antes de imprimir o descargar.');
    await action(updated);
  };
  if(!product?.id) return <p className="border-t pt-3 text-xs text-muted-foreground">Guarda el producto para generar o asignar su código de barras.</p>;
  return <section className="border-t pt-3 space-y-2" onClick={e=>e.stopPropagation()} aria-label={`Código de barras de ${product.nombre}`}>
    <p className="text-xs font-semibold">Código de barras</p>
    {saved?.codigo_barras&&<BarcodeImage code={saved.codigo_barras} name={saved.nombre} />}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-1.5">
      {!saved?.codigo_barras&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>save(true)}>Generar código</Button>}
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setAssigning(!assigning)}>{saved?.codigo_barras?'Cambiar código':'Asignar o detectar'}</Button>
      {saved?.codigo_barras&&<>
        <Button type="button" size="sm" variant="outline" onClick={()=>setLarge(true)}>Ver</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>run(()=>exportCurrent(async current=>exportBarcodeFile(await createLabelPNG(current),`Codigo-${current.codigo_barras}.png`)))}>Descargar PNG</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>run(()=>exportCurrent(current=>printBarcodeLabel(current)))}>Imprimir</Button>
      </>}
      {onPDF&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>onPDF(product.id)}>Generar PDF</Button>}
    </div>
    {assigning&&<div className="space-y-2">
      <label className="text-xs block">Escanea o escribe el código existente<input autoFocus value={code} maxLength={64} disabled={busy} aria-label="Código existente" className="skeu-input w-full p-2 mt-1" onChange={e=>{setCode(e.target.value);setConfirming(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(code.trim()) saved?.codigo_barras?setConfirming(true):save(false);}}} /></label>
      {confirming&&<p className="text-xs text-amber-700">Al cambiarlo, las etiquetas anteriores dejarán de servir. Tendrás que imprimir las nuevas.</p>}
      <Button type="button" size="sm" disabled={busy||!code.trim()} onClick={()=>saved?.codigo_barras&&!confirming?setConfirming(true):save(false)}>{confirming?'Confirmar cambio e imprimir después':'Guardar código'}</Button>
    </div>}
    <Dialog open={large} onOpenChange={setLarge}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{saved?.nombre}</DialogTitle><DialogDescription>Código asignado al producto</DialogDescription></DialogHeader>{saved?.codigo_barras&&<BarcodeImage code={saved.codigo_barras} name={saved.nombre} />}</DialogContent></Dialog>
  </section>;
}

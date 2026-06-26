import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import QRCanvas, { getQRDataURL } from './QRCanvas';
import { buildPortalQRUrl } from '@/utils/qrUtils';

/**
 * Modal que muestra el QR de una mesa con acciones: copiar / descargar / imprimir / abrir.
 */
export default function QRMesaDialog({ mesa, open, onClose, config }) {
  const url = mesa ? buildPortalQRUrl(mesa) : '';
  const [downloading, setDownloading] = useState(false);

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const descargar = async () => {
    if (!url) return;
    setDownloading(true);
    try {
      const dataUrl = await getQRDataURL(url, { size: 800 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `QR-Mesa-${mesa?.numero || ''}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('QR descargado');
    } catch (err) {
      console.error('[QRMesaDialog] descargar:', err);
      toast.error('No se pudo descargar');
    } finally {
      setDownloading(false);
    }
  };

  const imprimir = async () => {
    if (!url) return;
    try {
      const dataUrl = await getQRDataURL(url, { size: 800 });
      const w = window.open('', '_blank', 'width=480,height=640');
      if (!w) { toast.error('Tu navegador bloqueó la impresión'); return; }
      const nombreNegocio = config?.nombre_negocio || '';
      w.document.write(`
        <html>
          <head>
            <title>QR Mesa ${mesa?.numero || ''}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 24px; }
              h1 { margin: 0 0 4px 0; font-size: 22px; }
              h2 { margin: 0 0 16px 0; font-size: 18px; color: #555; }
              img { max-width: 320px; width: 100%; }
              p { font-size: 11px; color: #777; margin-top: 12px; word-break: break-all; }
            </style>
          </head>
          <body>
            <h1>${nombreNegocio}</h1>
            <h2>Mesa ${mesa?.numero || ''}${mesa?.nombre ? ' — ' + mesa.nombre : ''}</h2>
            <img src="${dataUrl}" alt="QR Mesa ${mesa?.numero || ''}" />
            <p>Escanea para ver el menú</p>
            <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
          </body>
        </html>
      `);
      w.document.close();
    } catch (err) {
      console.error('[QRMesaDialog] imprimir:', err);
      toast.error('No se pudo imprimir');
    }
  };

  const abrir = () => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose && onClose(); }}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading">QR Mesa {mesa?.numero}{mesa?.nombre ? ` · ${mesa.nombre}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="bg-white border-2 border-slate-200 rounded-xl p-3 shadow-sm">
            <QRCanvas value={url} size={220} />
          </div>
          <p className="text-xs text-muted-foreground break-all text-center max-w-full px-2">{url}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copiar} className="gap-2">
            <Copy className="w-4 h-4" /> Copiar
          </Button>
          <Button variant="outline" onClick={abrir} className="gap-2">
            <ExternalLink className="w-4 h-4" /> Abrir
          </Button>
          <Button variant="outline" onClick={descargar} disabled={downloading} className="gap-2">
            <Download className="w-4 h-4" /> {downloading ? 'Descargando...' : 'Descargar'}
          </Button>
          <Button variant="outline" onClick={imprimir} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useConfig } from '@/lib/ConfigContext';
import { printDocument } from '@/lib/print';
import PreCuentaTicket from './PreCuentaTicket';

/**
 * Dialog que muestra el ticket real de una venta y permite reimprimirlo.
 * Usado desde "Ver ticket" en Ventas y Registros.
 */
export default function TicketViewerDialog({ venta, open, onClose }) {
  const { config } = useConfig();
  const [detalles, setDetalles] = useState([]);
  const [mesa, setMesa] = useState(null);
  const [loading, setLoading] = useState(false);
  // FASE 2: feedback de impresión (spinner + botón deshabilitado mientras imprime).
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    if (!open || !venta?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const dets = await base44.entities.DetalleVenta.filter({ venta_id: venta.id }).catch(() => []);
      let m = null;
      if (venta.mesa_id) {
        m = await base44.entities.Mesa.list().then(list => list.find(x => x.id === venta.mesa_id)).catch(() => null);
      }
      if (!cancelled) {
        setDetalles(dets);
        setMesa(m);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, venta]);

  const handlePrint = async () => {
    if (imprimiendo) return; // evita doble impresión por doble clic
    setImprimiendo(true);
    try {
      // FASE 2: `await` cubre todo el tiempo real de impresión (el helper devuelve
      // la promesa nativa). Si falla, el helper ya avisó con un toast.
      await printDocument({ mode: 'thermal', title: `Ticket-${venta?.folio || ''}` });
    } catch (err) {
      console.error('[TicketViewer] imprimir:', err);
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="no-print px-5 pt-4 pb-3 border-b sticky top-0 bg-white z-10 flex-row items-center justify-between">
          <DialogTitle className="font-heading">Ticket · {venta?.folio}</DialogTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={imprimiendo}
              aria-busy={imprimiendo}
              className="transition-transform active:scale-95"
            >
              {imprimiendo
                ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Imprimiendo…</>)
                : (<><Printer className="w-4 h-4 mr-1" /> Imprimir</>)}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="p-4 bg-gray-100 flex justify-center">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8">Cargando ticket...</p>
          ) : (
            <PreCuentaTicket
              venta={venta}
              detalles={detalles}
              mesa={mesa}
              config={config}
              esFinal={venta?.estado === 'pagada'}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
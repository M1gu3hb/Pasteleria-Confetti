import React, { useLayoutEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Loader2 } from 'lucide-react';
import { cargarTicketVenta } from '@/utils/cargarTicketVenta';
import { useConfig } from '@/lib/ConfigContext';
import { printDocument } from '@/lib/print';
import PreCuentaTicket from './PreCuentaTicket';

/**
 * Dialog que muestra el ticket real de una venta y permite reimprimirlo.
 * Usado desde "Ver ticket" en Ventas y Registros.
 */
export default function TicketViewerDialog({ venta, open, onClose }) {
  const { config } = useConfig();
  const [ticket, setTicket] = useState(/** @type {Awaited<ReturnType<typeof cargarTicketVenta>> | null} */ (null));
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const imprimiendoRef = useRef(false);
  const ticketNodeRef = useRef(null);
  const idActivoRef = useRef(venta?.id);
  idActivoRef.current = open ? venta?.id : null;
  const listo = open && ticket?.venta.id === venta?.id && !error;
  // FASE 2: feedback de impresión (spinner + botón deshabilitado mientras imprime).
  const [imprimiendo, setImprimiendo] = useState(false);

  useLayoutEffect(() => {
    if (!open || !venta?.id) { setTicket(null); setError(null); return; }
    let cancelled = false;
    setTicket(null);
    setError(null);
    (async () => {
      try {
        const resultado = await cargarTicketVenta(venta.id);
        if (!cancelled) setTicket(resultado);
      } catch (e) { if (!cancelled) setError(e?.message || 'No se pudo consultar el ticket.'); }
    })();
    return () => { cancelled = true; };
  }, [open, venta?.id, intento]);

  const handlePrint = async () => {
    if (imprimiendoRef.current || !listo || idActivoRef.current !== ticket?.venta.id) return;
    imprimiendoRef.current = true;
    setImprimiendo(true);
    try {
      // FASE 2: `await` cubre todo el tiempo real de impresión (el helper devuelve
      // la promesa nativa). Si falla, el helper ya avisó con un toast.
      const node = ticketNodeRef.current?.querySelector('[data-thermal-ticket]') ||
        ticketNodeRef.current?.querySelector('.ticket-printable');
      if (!node) throw new Error('El ticket todavía no está listo para imprimir.');
      await printDocument({ mode: 'thermal', title: `Ticket-${ticket.venta.folio || ''}`, node });
    } catch (err) {
      console.error('[TicketViewer] imprimir:', err);
    } finally {
      setImprimiendo(false);
      imprimiendoRef.current = false;
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
              disabled={imprimiendo || !listo}
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
        <div ref={ticketNodeRef} className="p-4 bg-gray-100 flex justify-center">
          {error ? (
            <div role="alert" className="text-sm py-6 space-y-3">
              <p>{error}</p>
              <Button variant="outline" onClick={() => setIntento(x => x + 1)}>Reintentar consulta</Button>
            </div>
          ) : !listo ? (
            <p className="text-sm text-muted-foreground py-8">Cargando ticket...</p>
          ) : (
            <PreCuentaTicket
              venta={ticket.venta}
              detalles={ticket.detalles}
              mesa={ticket.mesa}
              config={config}
              esFinal={ticket.venta.estado === 'pagada'}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

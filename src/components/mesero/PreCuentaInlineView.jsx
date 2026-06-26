import React from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';

/**
 * Vista de pre-cuenta como overlay INLINE — sin Radix Dialog/Portal.
 *
 * Se renderiza dentro del árbol normal de React (no en portal). Esto evita
 * conflictos de removeChild entre portales que se montan/desmontan a la vez.
 */
export default function PreCuentaInlineView({ open, data, config, onClose, onPrint }) {
  if (!open || !data) return null;
  const venta = data.venta || null;
  const detalles = Array.isArray(data.detalles) ? data.detalles : [];
  const mesa = data.mesa || null;
  const codigo = data.codigo || venta?.codigo_caja || '';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55">
      <div
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <h2 className="font-heading font-bold text-base">Pre-cuenta lista</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-muted/30 p-3 flex-1 overflow-y-auto">
          {venta ? (
            <PreCuentaTicket
              venta={venta}
              detalles={detalles}
              mesa={mesa}
              config={config}
              codigo={codigo}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Sin datos de pre-cuenta.</p>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={onPrint}>
            <Printer className="w-4 h-4 mr-1" />Imprimir
          </Button>
        </div>
      </div>
    </div>
  );
}
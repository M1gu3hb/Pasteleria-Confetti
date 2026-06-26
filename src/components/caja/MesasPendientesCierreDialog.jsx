import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, UtensilsCrossed } from 'lucide-react';
import { MESA_STATUS_CONFIG } from '@/lib/constants';

/**
 * 6A — Dialog que bloquea el cierre diario cuando hay mesas pendientes.
 *
 * Solo es informativo: lista las mesas que no están en "libre" y le pide al
 * cajero que las cierre/libere/cobre antes de intentar de nuevo.
 *
 * No hace escrituras. No toca lógica de cobro.
 */
export default function MesasPendientesCierreDialog({ open, onClose, mesas = [] }) {
  const arr = Array.isArray(mesas) ? mesas : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            No puedes cerrar caja
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-3 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold">Hay mesas pendientes.</p>
            <p className="text-xs mt-0.5">
              Cierra, cobra o libera estas mesas antes de hacer el corte.
            </p>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {arr.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin mesas pendientes.
              </p>
            ) : (
              arr.map((m) => {
                const cfg = MESA_STATUS_CONFIG[m?.estado] || MESA_STATUS_CONFIG.libre;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border bg-card"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-heading font-black text-xs"
                      style={{
                        background: cfg.fill,
                        color: cfg.text,
                        border: `1.5px solid ${cfg.stroke}`,
                      }}
                    >
                      {m?.numero ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        Mesa {m?.numero ?? '—'}
                        {m?.nombre ? ` · ${m.nombre}` : ''}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Estado: {cfg.label}
                        {m?.venta_activa_id ? ' · Con venta activa' : ''}
                      </p>
                    </div>
                    <UtensilsCrossed className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
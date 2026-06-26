import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, RotateCcw, Ban } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { toast } from 'sonner';

/**
 * CancelarVentaDialog — Prompt 5a
 *
 * Cancela o devuelve (reembolsa) una venta desde la sección Ventas.
 * Ambos modos REVIERTEN la venta (estado='cancelada' → deja de contar como
 * ingreso en dashboard/Registros y en el corte, porque esas vistas filtran por
 * estado 'pagada'/!='cancelada').
 *
 * Diferencia:
 *  - 'cancelacion': error humano, NO hubo devolución de dinero.
 *  - 'devolucion':  se reembolsó dinero al cliente → guarda monto_devuelto=total.
 *
 * NO borra la venta (se conserva con su motivo y tipo). NO toca cortes ya
 * cerrados, ni totales de ventas normales.
 *
 * Props:
 *  - open, onClose
 *  - venta: la venta a cancelar/devolver
 *  - modo: 'cancelacion' | 'devolucion'
 *  - posUser: usuario POS actual (para sello cancelado_por)
 *  - onDone(): callback tras cancelar (refrescar listas)
 */
export default function CancelarVentaDialog({ open, onClose, venta, modo = 'cancelacion', posUser, onDone }) {
  const queryClient = useQueryClient();
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esDevolucion = modo === 'devolucion';
  const total = Number(venta?.total) || 0;

  useEffect(() => {
    if (open) { setNota(''); setGuardando(false); }
  }, [open]);

  const confirmar = async () => {
    if (!venta?.id) { onClose?.(); return; }
    const motivo = (nota || '').trim();
    if (!motivo) { toast.error('Escribe el motivo (obligatorio).'); return; }
    if (guardando) return;
    setGuardando(true);
    try {
      const payload = {
        estado: 'cancelada',
        tipo_cancelacion: esDevolucion ? 'devolucion' : 'cancelacion',
        motivo_cancelacion: motivo,
        monto_devuelto: esDevolucion ? total : 0,
        fecha_cancelacion: new Date().toISOString(),
        cancelado_por_id: posUser?.id || '',
        cancelado_por_nombre: posUser?.nombre || '',
      };
      await base44.entities.Venta.update(venta.id, payload);
      // Refrescar todas las vistas que reflejan ingresos del día/periodo.
      ['ventas_all', 'ventas_pagadas_caja', 'ventas_hoy', 'registros_ventas',
       'resumen_periodo_ventas', 'dashboard_data', 'cortes_caja_estado',
      ].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(esDevolucion ? 'Venta devuelta (reembolso registrado).' : 'Venta cancelada.');
      onDone?.();
      onClose?.();
    } catch (e) {
      console.error('[CancelarVentaDialog]', e);
      toast.error('No se pudo procesar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !guardando) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {esDevolucion ? (
              <><RotateCcw className="w-5 h-5 text-destructive" /> Devolver venta (reembolso)</>
            ) : (
              <><Ban className="w-5 h-5 text-amber-600" /> Cancelar venta</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Folio</span>
              <span className="font-mono font-bold">{venta?.folio || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total de la venta</span>
              <span className="font-bold">{formatCurrency(total)}</span>
            </div>
          </div>

          {esDevolucion ? (
            <div className="rounded-xl border-2 border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Monto a devolver: <strong>{formatCurrency(total)}</strong>.
                  Esta acción revertirá la venta y registrará el reembolso.
                  El total se restará del dashboard.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
              <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Esta acción cancelará la venta. El total se restará del dashboard.</p>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Motivo (obligatorio)</Label>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={esDevolucion ? 'Motivo de la devolución…' : 'Motivo de la cancelación…'}
              rows={3}
              className="mt-1"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cerrar
          </Button>
          <Button
            variant={esDevolucion ? 'destructive' : 'default'}
            onClick={confirmar}
            disabled={guardando || !nota.trim()}
            className={esDevolucion ? '' : 'bg-amber-600 hover:bg-amber-700 text-white'}
          >
            {guardando ? 'Procesando…' : (esDevolucion ? 'Confirmar devolución' : 'Confirmar cancelación')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
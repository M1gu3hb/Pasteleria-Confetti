import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

/**
 * Diálogo de reparación para mesas huérfanas:
 * mesas con estado distinto de "libre" pero sin venta_activa_id.
 *
 * Pide confirmación explícita antes de liberar la mesa. NO borra ventas reales,
 * solo limpia el estado de la mesa.
 */
export default function MesaHuerfanaDialog({ mesa, open, onCancel, onConfirm, loading }) {
  const numero = mesa?.numero ?? '—';
  const estado = mesa?.estado || '—';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel?.(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Mesa {numero} sin venta activa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Esta mesa no tiene venta activa. ¿Quieres liberarla?
          </p>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
            <p><span className="font-semibold">Estado actual:</span> {estado}</p>
            <p>Al liberar, la mesa volverá a <span className="font-semibold">libre</span>.</p>
            <p className="opacity-80">No se borran ventas reales del historial.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Liberando…' : 'Liberar mesa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
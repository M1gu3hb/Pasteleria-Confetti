import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle } from 'lucide-react';
import { eliminarProductoConCascada } from '@/utils/posApiClient';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Diálogo de confirmación para BORRADO REAL (hard delete) de un producto.
 * Borra en cascada: primero la copia del sitio web, luego el producto del POS.
 * Si la web falla, NO borra del POS y avisa (evita huérfanos en el sitio).
 *
 * Props:
 *  - open, onClose
 *  - producto: el ProductoTerminado a borrar (necesita id y nombre)
 *  - onDeleted: callback tras borrado exitoso (refrescar lista)
 */
export default function EliminarProductoDialog({ open, onClose, producto, onDeleted }) {
  const [borrando, setBorrando] = useState(false);

  const handleEliminar = async () => {
    if (!producto?.id) return;
    setBorrando(true);
    try {
      const res = await eliminarProductoConCascada(
        producto,
        base44.entities.ProductoTerminado
      );
      if (res.ok) {
        toast.success(`"${producto.nombre}" se eliminó de todos lados.`);
        onDeleted?.();
        onClose?.();
      } else {
        toast.error(res.error || 'No se pudo eliminar. Reintenta.');
      }
    } catch (e) {
      console.error('[EliminarProductoDialog]', e);
      toast.error('Ocurrió un error al eliminar. Reintenta.');
    } finally {
      setBorrando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Eliminar producto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            ¿Seguro que quieres eliminar{' '}
            <span className="font-semibold text-foreground">"{producto?.nombre}"</span>?
          </p>
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-destructive space-y-1.5">
            <p className="font-medium">Esta acción es permanente:</p>
            <ul className="list-disc list-inside space-y-0.5 text-[13px]">
              <li>Se elimina del POS y del punto de venta.</li>
              <li>Se quita también del sitio web público.</li>
              <li>No se puede deshacer.</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Las ventas y pedidos anteriores que lo incluían no se ven afectados:
            conservan el nombre y precio históricos.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={borrando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleEliminar}
            disabled={borrando}
            className="gap-2"
          >
            {borrando ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Sí, eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
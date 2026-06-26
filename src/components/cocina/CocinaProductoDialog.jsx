import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChefHat, FileText } from 'lucide-react';

/**
 * Ficha del producto para Cocina — SIN costos, márgenes, gramajes.
 * Muestra: nombre, descripción, ingredientes (solo nombres) y notas/exclusiones del pedido.
 */
export default function CocinaProductoDialog({ open, onClose, item }) {
  // item: { producto_id, producto_nombre, cantidad, notas }
  const productoId = item?.producto_id;

  const { data: producto } = useQuery({
    queryKey: ['cocina_producto_ficha', productoId],
    queryFn: () => base44.entities.ProductoTerminado.get(productoId),
    enabled: !!productoId && open,
  });

  const { data: recetas = [] } = useQuery({
    queryKey: ['cocina_producto_recetas', productoId],
    queryFn: () => base44.entities.RecetaEscandallo.filter({ producto_id: productoId }),
    initialData: [],
    enabled: !!productoId && open,
  });

  const ingredientes = (Array.isArray(recetas) ? recetas : [])
    .filter(r => r?.activo !== false)
    .map(r => r?.ingrediente_nombre)
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose && onClose(); }}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-600" />
            {item?.producto_nombre || producto?.nombre || 'Producto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {(item?.cantidad || 0) > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-bold text-amber-800">Cantidad solicitada: {item.cantidad}</p>
            </div>
          )}

          {producto?.descripcion && (
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Descripción</p>
              <p className="text-sm text-slate-700">{producto.descripcion}</p>
            </div>
          )}

          {ingredientes.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Ingredientes</p>
              <div className="flex flex-wrap gap-1.5">
                {ingredientes.map((nombre, i) => (
                  <span key={`${nombre}-${i}`} className="px-2 py-1 rounded-full text-xs bg-slate-100 border text-slate-700">
                    {nombre}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sin ingredientes registrados.</p>
          )}

          {item?.notas && (
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3">
              <p className="text-[10px] uppercase font-bold text-orange-700 mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Indicaciones del pedido
              </p>
              <p className="text-sm font-medium text-orange-900">{item.notas}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
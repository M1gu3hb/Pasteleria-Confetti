import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ListChecks } from 'lucide-react';
import ModificadoresEditor, { sanitizeModificadores, validateModificadores } from './ModificadoresEditor';

/**
 * Diálogo para editar las "Opciones de preparación / Modificadores"
 * de un producto. Lo abrimos desde la card de Productos y desde el
 * dialog de Receta.
 *
 * NO toca: costo, receta, ingredientes, precio, inventario.
 * SOLO actualiza el campo `modificadores` del ProductoTerminado.
 */
export default function ModificadoresDialog({ open, onClose, producto = null }) {
  const queryClient = useQueryClient();
  const [grupos, setGrupos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setGrupos(Array.isArray(producto?.modificadores) ? producto.modificadores : []);
    }
  }, [open, producto]);

  const handleGuardar = async () => {
    if (!producto?.id) {
      toast.error('Producto inválido');
      return;
    }
    // FIX 6B-AUDIT-1: Validar ANTES de guardar.
    // Si el usuario escribió un grupo con nombre pero está incompleto
    // (sin opciones, obligatorio sin opciones activas, o con duplicados),
    // bloqueamos con mensaje claro y NO eliminamos silenciosamente.
    const validation = validateModificadores(grupos);
    if (!validation.ok) {
      // Mostrar solo el primer error para no abrumar; el resto se ve al
      // intentar guardar de nuevo después de corregir.
      const primero = validation.errors[0];
      const extra = validation.errors.length > 1 ? ` (+${validation.errors.length - 1} más)` : '';
      toast.error(primero + extra);
      return;
    }
    setGuardando(true);
    try {
      const limpio = sanitizeModificadores(grupos);
      await base44.entities.ProductoTerminado.update(producto.id, {
        modificadores: limpio,
      });
      queryClient.invalidateQueries({ queryKey: ['productos_all'] });
      queryClient.invalidateQueries({ queryKey: ['productos_pos'] });
      toast.success(limpio.length > 0
        ? `Guardado · ${limpio.length} grupo(s) de opciones`
        : 'Opciones eliminadas');
      onClose && onClose();
    } catch (err) {
      console.error('[ModificadoresDialog] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !guardando) onClose && onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            Opciones de preparación
          </DialogTitle>
          {producto?.nombre && (
            <p className="text-xs text-muted-foreground mt-1">{producto.nombre}</p>
          )}
        </DialogHeader>

        <div className="py-2">
          <ModificadoresEditor
            value={grupos}
            onChange={setGrupos}
            disabled={guardando}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar opciones'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
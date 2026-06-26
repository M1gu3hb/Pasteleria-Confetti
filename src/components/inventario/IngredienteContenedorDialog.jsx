// =====================================================
// components/inventario/IngredienteContenedorDialog.jsx
// =====================================================
// LEGADO: este diálogo ya no se abre desde la fila de Inventario.
// La configuración de contenedor se movió a:
//   - "Ajustar stock" (ingrediente existente)
//   - "Registrar inventario existente" (ingrediente nuevo)
//
// Se mantiene este componente intacto para no romper si algún otro lugar
// lo invoca, pero ya usa la sección compartida `IngredienteContenedorSection`
// para no duplicar lógica.
//
// REGLA DE ESTABILIDAD: NO toca stock, costo ni movimientos.
// =====================================================
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Beaker, Save } from 'lucide-react';
import { toast } from 'sonner';
import IngredienteContenedorSection, {
  hidratarValorContenedor,
  construirPayloadContenedor,
} from './IngredienteContenedorSection';

export default function IngredienteContenedorDialog({ open, onClose, ingrediente }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(hidratarValorContenedor(ingrediente));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && ingrediente) {
      setValue(hidratarValorContenedor(ingrediente));
    }
  }, [open, ingrediente]);

  const close = () => {
    if (saving) return;
    onClose?.();
  };

  const handleGuardar = async () => {
    if (!ingrediente?.id) {
      toast.error('Ingrediente inválido.');
      return;
    }
    const { ok, error, payload } = construirPayloadContenedor(value);
    if (!ok) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Ingrediente.update(ingrediente.id, payload);
      ['ingredientes_all', 'ingredientes_dashboard', 'inventario', 'ingredientes_activos_tipoventa']
        .forEach(k => { try { queryClient.invalidateQueries({ queryKey: [k] }); } catch {} });
      toast.success(
        value.esContenedor
          ? `"${ingrediente.nombre}" marcado como contenedor.`
          : `"${ingrediente.nombre}" volvió a ser ingrediente normal.`
      );
      onClose?.();
    } catch (err) {
      console.error('[IngredienteContenedorDialog] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!ingrediente) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Beaker className="w-5 h-5 text-primary" />
            Configurar como contenedor
          </DialogTitle>
          <DialogDescription className="text-xs">
            {ingrediente.nombre}
          </DialogDescription>
        </DialogHeader>

        <IngredienteContenedorSection
          value={value}
          onChange={setValue}
          unidadBase={ingrediente.unidad_base}
          stockActual={ingrediente.stock_actual}
          disabled={saving}
          compact
        />

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
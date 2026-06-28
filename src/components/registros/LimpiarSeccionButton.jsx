import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useQueryClient } from '@tanstack/react-query';

const LABELS = {
  cortes: 'cortes',
  ventas: 'ventas',
  compras: 'compras',
  gastos: 'gastos',
  movimientos: 'movimientos de inventario',
};

const NOTAS = {
  cortes: 'Eliminará todos los cortes de caja históricos.',
  ventas: 'Eliminará ventas, sus detalles, descuentos de inventario y pedidos de cocina relacionados.',
  compras: 'Eliminará compras y sus detalles. Los stocks NO se revierten automáticamente.',
  gastos: 'Eliminará gastos operativos.',
  movimientos: 'Eliminará el historial de movimientos. Los stocks actuales NO se modifican.',
};

/**
 * Botón rojo solo para admin. Pide confirmación con texto "ELIMINAR".
 */
export default function LimpiarSeccionButton({ seccion, onCleared }) {
  const { posUser } = usePOSAuth();
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [open, setOpen] = useState(false);

  if (posUser?.rol !== 'administrador') return null;

  // FASE 5 (F6) — botón muerto NEUTRALIZADO: la limpieza de historial por sección
  // (función de Base44) no está migrada. Avisa que está desactivada en vez de fallar.
  const handle = async () => {
    toast.info('Función desactivada por el momento.');
    setConfirmText('');
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" className="gap-1">
          <Trash2 className="w-3.5 h-3.5" /> Limpiar {LABELS[seccion]}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            ¿Limpiar historial de {LABELS[seccion]}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{NOTAS[seccion]}</span>
            <span className="block font-medium text-destructive">
              Esta acción NO afecta datos maestros (productos, recetas, ingredientes, configuración).
            </span>
            <span className="block">
              Para confirmar escribe <strong>ELIMINAR</strong>:
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="ELIMINAR"
          className="font-mono"
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handle(); }}
            className="bg-destructive hover:bg-destructive/90"
            disabled={working}
          >
            {working ? 'Eliminando...' : 'Eliminar historial'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
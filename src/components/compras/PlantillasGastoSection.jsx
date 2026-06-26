import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Repeat, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/financialUtils';
import { usePOSAuth } from '@/lib/POSAuthContext';
import PlantillaGastoDialog from '@/components/compras/PlantillaGastoDialog';

const PERIODICIDAD_LABEL = {
  mensual: 'Mensual',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  anual: 'Anual',
  unico: 'Único',
};

/**
 * Sección "Gastos recurrentes / plantillas" dentro de pages/Compras.
 *
 * - Lista plantillas activas (PlantillaGasto.filter({activa:true})).
 * - Permite crear, editar, desactivar (soft-delete).
 * - Permite "Registrar pago de este periodo" → crea un GastoOperativo
 *   con la información de la plantilla.
 * - ANTI-DUPLICADO: antes de crear el gasto, busca GastoOperativo del mismo
 *   mes (YYYY-MM) con misma categoría y descripción. Si encuentra → muestra
 *   confirmación. Si el admin confirma, registra igual (caso "pagué dos veces").
 *
 * No toca: cálculos financieros, MovimientoInventario, recetas, ventas.
 * El gasto generado es un GastoOperativo normal — los reportes lo ven como
 * gasto operativo, NO como compra de inventario.
 */
export default function PlantillasGastoSection() {
  const queryClient = useQueryClient();
  const { posUser } = usePOSAuth();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmDup, setConfirmDup] = useState(null); // { plantilla, existente }
  const [registrando, setRegistrando] = useState(false);

  const { data: plantillas = [] } = useQuery({
    queryKey: ['plantillas_gasto'],
    queryFn: () => base44.entities.PlantillaGasto.filter({ activa: true }),
    initialData: [],
  });

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setEditing(p); setShowForm(true); };

  const desactivar = async () => {
    if (!confirmDel?.id) return;
    try {
      await base44.entities.PlantillaGasto.update(confirmDel.id, { activa: false });
      toast.success(`Plantilla "${confirmDel.nombre}" eliminada`);
      queryClient.invalidateQueries({ queryKey: ['plantillas_gasto'] });
      setConfirmDel(null);
    } catch (e) {
      toast.error('Error: ' + (e?.message || ''));
    }
  };

  // Genera el GastoOperativo desde una plantilla, con guardia anti-duplicado.
  const registrarPago = async (plantilla, forzar = false) => {
    setRegistrando(true);
    try {
      const hoy = new Date();
      const fechaIso = hoy.toISOString().slice(0, 10);
      const mesActual = fechaIso.slice(0, 7); // YYYY-MM

      // Solo verificamos duplicado para periódicos (no para "único").
      if (!forzar && plantilla.periodicidad && plantilla.periodicidad !== 'unico') {
        let existente = null;
        try {
          const gastosMes = await base44.entities.GastoOperativo.filter({
            categoria: plantilla.categoria || 'servicios',
            descripcion: plantilla.nombre,
          });
          existente = (Array.isArray(gastosMes) ? gastosMes : [])
            .find(g => (g.fecha || '').slice(0, 7) === mesActual);
        } catch (e) {
          console.warn('[PlantillasGastoSection] no se pudo verificar duplicado:', e);
        }
        if (existente) {
          setConfirmDup({ plantilla, existente });
          setRegistrando(false);
          return;
        }
      }

      await base44.entities.GastoOperativo.create({
        fecha: fechaIso,
        categoria: plantilla.categoria || 'servicios',
        descripcion: plantilla.nombre,
        monto: Number(plantilla.monto_sugerido) || 0,
        metodo_pago: plantilla.metodo_pago || 'efectivo',
        usuario_id: posUser?.id,
        usuario_nombre: posUser?.nombre,
        notas: `[Desde plantilla: ${plantilla.nombre}] ${plantilla.notas || ''}`.trim(),
      });

      // Actualizar metadatos de uso
      try {
        await base44.entities.PlantillaGasto.update(plantilla.id, {
          ultima_fecha_uso: new Date().toISOString(),
          veces_usada: (Number(plantilla.veces_usada) || 0) + 1,
        });
      } catch {}

      toast.success(`Gasto "${plantilla.nombre}" registrado por ${formatCurrency(plantilla.monto_sugerido)}`);
      queryClient.invalidateQueries({ queryKey: ['gastos_hoy'] });
      queryClient.invalidateQueries({ queryKey: ['plantillas_gasto'] });
      queryClient.invalidateQueries({ queryKey: ['registros_gastos'] });
      setConfirmDup(null);
    } catch (e) {
      toast.error('No se pudo registrar el pago: ' + (e?.message || ''));
    }
    setRegistrando(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-bold text-lg flex items-center gap-2">
          <Repeat className="w-5 h-5" /> Gastos recurrentes
        </h3>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nueva plantilla
        </Button>
      </div>

      {plantillas.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Aún no hay plantillas de gasto. Crea una para registrar pagos fijos rápido (renta, luz, internet…).
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plantillas.map(p => (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nombre}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {p.categoria || 'otro'} · {PERIODICIDAD_LABEL[p.periodicidad] || 'Mensual'}
                    {p.dia_pago_sugerido ? ` · día ${p.dia_pago_sugerido}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDel(p)}
                    title="Eliminar plantilla"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="font-heading font-black text-lg">
                  {formatCurrency(p.monto_sugerido)}
                </span>
                <Button size="sm" onClick={() => registrarPago(p)} disabled={registrando}>
                  <Calendar className="w-3.5 h-3.5 mr-1" /> Registrar pago
                </Button>
              </div>

              {p.ultima_fecha_uso && (
                <p className="text-[10px] text-muted-foreground">
                  Última vez: {new Date(p.ultima_fecha_uso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}usada {p.veces_usada || 0} {(p.veces_usada || 0) === 1 ? 'vez' : 'veces'}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <PlantillaGastoDialog
        open={showForm}
        plantilla={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
      />

      {/* Confirmación eliminar */}
      <AlertDialog open={!!confirmDel} onOpenChange={(v) => { if (!v) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              ¿Eliminar plantilla?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{confirmDel?.nombre}"</strong> dejará de aparecer aquí.
              Los gastos ya registrados desde esta plantilla NO se borran.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={desactivar}>Sí, eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación anti-duplicado */}
      <AlertDialog open={!!confirmDup} onOpenChange={(v) => { if (!v) setConfirmDup(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Ya hay un gasto este mes
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe un gasto de <strong>"{confirmDup?.plantilla?.nombre}"</strong> registrado
              el {confirmDup?.existente?.fecha || ''} por{' '}
              <strong>{formatCurrency(confirmDup?.existente?.monto)}</strong>.
              <br /><br />
              ¿Quieres registrar otro pago igual? Esto creará un segundo gasto del mes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDup && registrarPago(confirmDup.plantilla, true)}
              disabled={registrando}
            >
              Sí, registrar de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
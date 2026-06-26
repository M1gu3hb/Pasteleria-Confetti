import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useTerminal } from '@/lib/TerminalContext';

const CATEGORIAS = [
  { value: 'servicios', label: 'Servicios (luz, agua, gas, internet)' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'reparacion', label: 'Reparación / mantenimiento' },
  { value: 'pago_extraordinario', label: 'Pago extraordinario' },
  { value: 'marketing', label: 'Marketing / publicidad' },
  { value: 'otro', label: 'Otro' },
];

export default function RegistrarGastoDialog({ open, onClose }) {
  const { posUser } = usePOSAuth();
  // FASE 2C — estampa la sucursal activa en el gasto para segmentar por caja.
  const { sucursalEfectiva } = useTerminal();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  function empty() {
    return {
      categoria: 'servicios',
      descripcion: '',
      monto: '',
      fecha: new Date().toISOString().slice(0, 10),
      metodo_pago: 'efectivo',
      recurrente: false,
      notas: '',
    };
  }

  const close = () => { setForm(empty()); onClose(); };

  const handleSave = async () => {
    const monto = parseFloat(form.monto);
    if (!form.descripcion.trim() || !monto || monto <= 0) {
      toast.error('Completa descripción y monto');
      return;
    }
    setSaving(true);
    try {
      const notas = form.recurrente
        ? `[RECURRENTE/FIJO MENSUAL] ${form.notas || ''}`.trim()
        : form.notas;

      await base44.entities.GastoOperativo.create({
        fecha: form.fecha,
        categoria: form.categoria,
        descripcion: form.descripcion.trim(),
        monto,
        metodo_pago: form.metodo_pago,
        sucursal_id: sucursalEfectiva?.sucursal_id || null,
        sucursal_nombre: sucursalEfectiva?.sucursal_nombre || '',
        usuario_id: posUser?.id,
        usuario_nombre: posUser?.nombre,
        notas,
      });

      ['gastos_hoy', 'registros_gastos'].forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      toast.success('Gasto registrado');
      close();
    } catch (e) {
      toast.error('Error: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Registrar gasto operativo</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo de gasto</Label>
            <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Descripción</Label>
            <Input value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: Recibo CFE de mayo" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Monto</Label>
              <Input type="number" value={form.monto}
                onChange={e => setForm({ ...form, monto: e.target.value })}
                placeholder="$0.00" />
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.fecha}
                onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Método de pago</Label>
            <Select value={form.metodo_pago} onValueChange={v => setForm({ ...form, metodo_pago: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/40 cursor-pointer">
            <input type="checkbox" checked={form.recurrente}
              onChange={e => setForm({ ...form, recurrente: e.target.checked })}
              className="mt-1" />
            <div>
              <p className="text-sm font-medium">Gasto fijo / recurrente mensual</p>
              <p className="text-[11px] text-muted-foreground">Marcará este gasto como mensual fijo en los registros.</p>
            </div>
          </label>

          <div>
            <Label className="text-xs">Notas</Label>
            <Input value={form.notas}
              onChange={e => setForm({ ...form, notas: e.target.value })}
              placeholder="Opcional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar gasto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Users, AlertTriangle, PartyPopper } from 'lucide-react';

/**
 * 6A — Diálogo unificado para abrir una mesa desde Mesero.
 *
 * Captura:
 *  - personas (requerido)
 *  - cliente_nombre (opcional)
 *  - notas_alergias (opcional, información de seguridad operativa)
 *  - celebracion_especial + tipo_celebracion (opcional)
 *
 * El padre maneja `open`, recibe los datos en `onConfirm(form)` y muestra
 * el toast/redirección. Si se cancela, el padre cierra el dialog.
 */
export default function AbrirMesaDialog({ open, onOpenChange, mesa, onConfirm, loading = false }) {
  const [form, setForm] = useState({
    personas: 2,
    cliente_nombre: '',
    notas: '',
    notas_alergias: '',
    celebracion_especial: false,
    tipo_celebracion: '',
  });

  // Reset cuando se abre/cambia mesa.
  useEffect(() => {
    if (open) {
      setForm({
        personas: 2,
        cliente_nombre: '',
        notas: '',
        notas_alergias: '',
        celebracion_especial: false,
        tipo_celebracion: '',
      });
    }
  }, [open, mesa?.id]);

  const handleConfirm = () => {
    if (loading) return;
    onConfirm?.(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Abrir mesa {mesa?.numero}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Personas */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Users className="w-3 h-3" />Número de personas *
            </Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={form.personas}
              onChange={(e) => setForm({ ...form, personas: e.target.value })}
              className="text-2xl h-14 text-center font-bold mt-1"
            />
          </div>

          {/* Nombre del cliente */}
          <div>
            <Label className="text-xs">
              Nombre del cliente <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              value={form.cliente_nombre}
              onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
              placeholder="Nombre del cliente o reservación"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Ej. "Familia López". No se guarda en la base de clientes.
            </p>
          </div>

          {/* Alergias */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Alergias o indicaciones críticas <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              value={form.notas_alergias}
              onChange={(e) => setForm({ ...form, notas_alergias: e.target.value })}
              placeholder="Ej. alérgico a maíz, sin nuez, intolerante a lactosa"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Información de seguridad para cocina. NO se imprime en el ticket del cliente.
            </p>
          </div>

          {/* Celebración */}
          <div className="rounded-xl border p-3 bg-muted/30 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <PartyPopper className="w-4 h-4 text-pink-500" />
                  Cumpleaños o celebración especial
                </Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Marca la mesa para que el equipo lo sepa.
                </p>
              </div>
              <Switch
                checked={form.celebracion_especial === true}
                onCheckedChange={(v) =>
                  setForm({
                    ...form,
                    celebracion_especial: v,
                    tipo_celebracion: v ? form.tipo_celebracion : '',
                  })
                }
              />
            </div>
            {form.celebracion_especial && (
              <div>
                <Label className="text-xs">Tipo de celebración (opcional)</Label>
                <Input
                  value={form.tipo_celebracion}
                  onChange={(e) => setForm({ ...form, tipo_celebracion: e.target.value })}
                  placeholder="Ej. Cumpleaños, aniversario, graduación"
                />
              </div>
            )}
          </div>

          {/* Notas generales */}
          <div>
            <Label className="text-xs">
              Notas generales <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Indicaciones generales para el servicio"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)' }}
          >
            {loading ? 'Abriendo…' : 'Abrir mesa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
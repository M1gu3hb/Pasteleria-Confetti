import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Gift } from 'lucide-react';

// Función 1D — Configuración de los extras del formulario de pastel.
// Lee/escribe el campo extras_pastel (JSON string) de ConfiguracionNegocio.
// Cada extra: { id, nombre, precio, activo }. Precio 0 = "A consultar".
export default function ExtrasPastelSection({ cfg }) {
  const queryClient = useQueryClient();
  const [extrasEdit, setExtrasEdit] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!cfg?.id) return;
    if (cfg.extras_pastel) {
      try {
        const arr = JSON.parse(cfg.extras_pastel);
        setExtrasEdit(Array.isArray(arr) ? arr : []);
      } catch {
        setExtrasEdit([]);
      }
    } else {
      setExtrasEdit([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.id, cfg?.updated_date]);

  const actualizarExtra = (id, campo, valor) => {
    setExtrasEdit(prev => prev.map(e => (e.id === id ? { ...e, [campo]: valor } : e)));
  };

  const guardarExtras = async () => {
    if (!cfg?.id) { toast.error('Espera a que cargue la configuración'); return; }
    setGuardando(true);
    try {
      const extrasJSON = JSON.stringify(extrasEdit);
      await base44.entities.ConfiguracionNegocio.update(cfg.id, {
        extras_pastel: extrasJSON,
      });
      await queryClient.refetchQueries({ queryKey: ['config'] });
      toast.success('Extras guardados');
    } catch (err) {
      console.error('[ExtrasPastelSection] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Gift className="w-4 h-4 text-primary" />
          Extras del formulario de pastel
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configura los extras que aparecen al crear un pedido de pastel.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {extrasEdit.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay extras configurados.</p>
        )}
        {extrasEdit.map(extra => (
          <div key={extra.id} className="skeu-card rounded-xl p-3 flex items-center gap-3">
            <Switch
              checked={extra.activo === true}
              onCheckedChange={v => actualizarExtra(extra.id, 'activo', v)}
            />
            <Input
              value={extra.nombre ?? ''}
              onChange={e => actualizarExtra(extra.id, 'nombre', e.target.value)}
              className="skeu-input flex-1 h-9 text-sm"
              placeholder="Nombre del extra"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                min="0"
                value={extra.precio ?? 0}
                onChange={e => actualizarExtra(extra.id, 'precio', parseFloat(e.target.value) || 0)}
                className="skeu-input w-24 h-9 text-sm"
                placeholder="0"
              />
            </div>
          </div>
        ))}
        <Button onClick={guardarExtras} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar extras'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Precio 0 = "A consultar" en el formulario. Desactivar oculta el extra del formulario.
        </p>
      </CardContent>
    </Card>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InputDinero from '@/components/ui/InputDinero';
import { toast } from 'sonner';
import { Ruler, Plus, Trash2 } from 'lucide-react';
import { parseBaseRangos } from '@/utils/baseRangos';

// CAMBIOS_V2 Fase 02 — Configuración del "Importe de base" por rangos de kilos.
// Lee/escribe configuracion_negocio.base_rangos (JSON string de
// [{ min_kg, max_kg, precio }]). El importe se aplica AUTOMÁTICO y obligatorio
// en el POS y en la web según los kilos del pastel.
export default function BaseRangosSection({ cfg }) {
  const queryClient = useQueryClient();
  const [rangos, setRangos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!cfg?.id) return;
    setRangos(parseBaseRangos(cfg.base_rangos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.id, cfg?.updated_date]);

  const actualizar = (idx, campo, valor) => {
    setRangos(prev => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  };

  const agregar = () => {
    setRangos(prev => [...prev, { min_kg: '', max_kg: '', precio: '' }]);
  };

  const eliminar = (idx) => {
    setRangos(prev => prev.filter((_, i) => i !== idx));
  };

  const guardar = async () => {
    if (!cfg?.id) { toast.error('Espera a que cargue la configuración'); return; }
    setGuardando(true);
    try {
      // Normaliza: números válidos, descarta rangos vacíos/invalidos, ordena por min.
      const limpios = rangos
        .map(r => ({
          min_kg: Number(r.min_kg) || 0,
          max_kg: Number(r.max_kg) || 0,
          precio: Number(r.precio) || 0,
        }))
        .filter(r => r.max_kg >= r.min_kg && (r.min_kg > 0 || r.max_kg > 0))
        .sort((a, b) => a.min_kg - b.min_kg);
      await base44.entities.ConfiguracionNegocio.update(cfg.id, {
        base_rangos: JSON.stringify(limpios),
      });
      await queryClient.refetchQueries({ queryKey: ['config'] });
      toast.success('Rangos de base guardados');
    } catch (err) {
      console.error('[BaseRangosSection] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Ruler className="w-4 h-4 text-primary" />
          Importe de base por kilos
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cargo obligatorio que se suma automáticamente según los kilos del pastel.
          Se sincroniza con la página web.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rangos.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay rangos configurados (el importe de base saldrá como "a confirmar").</p>
        )}
        {rangos.map((r, idx) => (
          <div key={idx} className="skeu-card rounded-xl p-3 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <InputDinero
                min="0" value={r.min_kg}
                onChange={v => actualizar(idx, 'min_kg', v)}
                className="skeu-input w-16 h-9 text-sm" placeholder="4"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <InputDinero
                min="0" value={r.max_kg}
                onChange={v => actualizar(idx, 'max_kg', v)}
                className="skeu-input w-16 h-9 text-sm" placeholder="5"
              />
              <span className="text-xs text-muted-foreground">kg</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">→ $</span>
              <InputDinero
                min="0" value={r.precio}
                onChange={v => actualizar(idx, 'precio', v)}
                className="skeu-input w-24 h-9 text-sm" placeholder="80"
                title="Importe de base para este rango"
              />
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive ml-auto"
              onClick={() => eliminar(idx)}
              title="Eliminar rango"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" onClick={agregar}>
            <Plus className="w-4 h-4 mr-1" />Agregar rango
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar rangos'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ej.: 4 a 5 kg → $80, 6 a 8 kg → $100, 9 a 15 kg → $120. Si los kilos superan el último
          rango se usa el último; si no hay rangos, el importe queda "a confirmar".
        </p>
      </CardContent>
    </Card>
  );
}

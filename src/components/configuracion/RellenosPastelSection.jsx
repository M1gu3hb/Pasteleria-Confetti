import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { sincronizarRellenosAWeb } from '@/utils/posApiClient';

// Configuración de los rellenos del formulario de pastel.
// Lee/escribe el campo rellenos_pastel (JSON string) de ConfiguracionNegocio.
// Cada relleno: { id, nombre, precio_kilo, activo }.
// precio_kilo 0 = usa el precio por kilo global; > 0 = sobreescribe.
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `relleno-${Date.now().toString().slice(-5)}`;
}

export default function RellenosPastelSection({ cfg }) {
  const queryClient = useQueryClient();
  const [rellenosEdit, setRellenosEdit] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!cfg?.id) return;
    if (cfg.rellenos_pastel) {
      try {
        const arr = JSON.parse(cfg.rellenos_pastel);
        setRellenosEdit(Array.isArray(arr) ? arr : []);
      } catch {
        setRellenosEdit([]);
      }
    } else {
      setRellenosEdit([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.id, cfg?.updated_date]);

  const actualizar = (id, campo, valor) => {
    setRellenosEdit(prev => prev.map(r => (r.id === id ? { ...r, [campo]: valor } : r)));
  };

  const agregar = () => {
    setRellenosEdit(prev => [
      ...prev,
      { id: `relleno-${Date.now().toString().slice(-6)}`, nombre: '', precio_kilo: 0, activo: true },
    ]);
  };

  const eliminar = (id) => {
    setRellenosEdit(prev => prev.filter(r => r.id !== id));
  };

  const guardar = async () => {
    if (!cfg?.id) { toast.error('Espera a que cargue la configuración'); return; }
    setGuardando(true);
    try {
      // Normalizar: asegurar id (slug del nombre si falta) y números válidos.
      const limpios = rellenosEdit.map(r => ({
        id: r.id || slugify(r.nombre),
        nombre: String(r.nombre || '').trim(),
        precio_kilo: Number(r.precio_kilo) || 0,
        activo: r.activo === true,
      })).filter(r => r.nombre);
      const rellenosJSON = JSON.stringify(limpios);
      await base44.entities.ConfiguracionNegocio.update(cfg.id, {
        rellenos_pastel: rellenosJSON,
      });
      await queryClient.refetchQueries({ queryKey: ['config'] });
      // Sincronizar rellenos a la web (fire and forget)
      sincronizarRellenosAWeb(rellenosJSON).catch(() => {});
      toast.success('Rellenos guardados');
    } catch (err) {
      console.error('[RellenosPastelSection] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Rellenos del pastel
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configura los rellenos que aparecen al crear un pedido de pastel. Se sincronizan también con la página web.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rellenosEdit.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay rellenos configurados.</p>
        )}
        {rellenosEdit.map(rel => (
          <div key={rel.id} className="skeu-card rounded-xl p-3 flex items-center gap-3">
            <Switch
              checked={rel.activo === true}
              onCheckedChange={v => actualizar(rel.id, 'activo', v)}
            />
            <Input
              value={rel.nombre ?? ''}
              onChange={e => actualizar(rel.id, 'nombre', e.target.value)}
              className="skeu-input flex-1 h-9 text-sm"
              placeholder="Nombre del relleno"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">$/kg</span>
              <Input
                type="number"
                min="0"
                value={rel.precio_kilo ?? 0}
                onChange={e => actualizar(rel.id, 'precio_kilo', parseFloat(e.target.value) || 0)}
                className="skeu-input w-24 h-9 text-sm"
                placeholder="0"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => eliminar(rel.id)}
              title="Eliminar relleno"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" onClick={agregar}>
            <Plus className="w-4 h-4 mr-1" />Agregar relleno
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar rellenos'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Precio por kilo 0 = usa el precio por kilo global. Si pones un precio, ese relleno sobreescribe el precio por kilo en el cálculo del pastel.
        </p>
      </CardContent>
    </Card>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InputDinero from '@/components/ui/InputDinero';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { normalizarRelleno, serializarRelleno } from '@/utils/rellenoPastel';

// Configuración de los rellenos del formulario de pastel.
// Lee/escribe el campo rellenos_pastel (JSON string) de ConfiguracionNegocio.
// CAMBIOS_V2 Fase 03 — cada relleno tiene un TIPO de cobro:
//   - 'plano'       → se SUMA un monto fijo al total (como base/oblea/etc.).
//   - 'precio_kilo' → CAMBIA el precio por kilo del pastel (monto = precio/kilo).
// Se guarda el espejo `precio_kilo` (= monto si plano, 0 si especial) para que el
// front EN VIVO siga funcionando hasta el deploy.
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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
        setRellenosEdit(Array.isArray(arr) ? arr.map(normalizarRelleno) : []);
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
      { id: `relleno-${Date.now().toString().slice(-6)}`, nombre: '', tipo: 'plano', monto: 0, activo: true },
    ]);
  };

  const eliminar = (id) => {
    setRellenosEdit(prev => prev.filter(r => r.id !== id));
  };

  const guardar = async () => {
    if (!cfg?.id) { toast.error('Espera a que cargue la configuración'); return; }
    setGuardando(true);
    try {
      // Normalizar + serializar (incluye el espejo legacy precio_kilo).
      const limpios = rellenosEdit
        .map(r => serializarRelleno({ ...r, id: r.id || slugify(r.nombre), nombre: String(r.nombre || '').trim() }))
        .filter(r => r.nombre);
      const rellenosJSON = JSON.stringify(limpios);
      await base44.entities.ConfiguracionNegocio.update(cfg.id, {
        rellenos_pastel: rellenosJSON,
      });
      await queryClient.refetchQueries({ queryKey: ['config'] });
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
          Configura los rellenos y cómo se cobran. Se sincronizan también con la página web.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rellenosEdit.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay rellenos configurados.</p>
        )}
        {rellenosEdit.map(rel => {
          const esPrecioKilo = rel.tipo === 'precio_kilo';
          return (
            <div key={rel.id} className="skeu-card rounded-xl p-3 space-y-2.5">
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-2 flex-wrap pl-[52px]">
                {/* Selector de tipo de cobro */}
                <div className="inline-flex rounded-lg border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => actualizar(rel.id, 'tipo', 'plano')}
                    className={`px-2.5 py-1.5 transition-colors ${!esPrecioKilo ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
                  >
                    Plano +$
                  </button>
                  <button
                    type="button"
                    onClick={() => actualizar(rel.id, 'tipo', 'precio_kilo')}
                    className={`px-2.5 py-1.5 border-l transition-colors ${esPrecioKilo ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
                  >
                    Precio/kg
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {esPrecioKilo ? '$ por kilo' : '+$ extra'}
                  </span>
                  <InputDinero
                    min="0"
                    value={rel.monto}
                    onChange={v => actualizar(rel.id, 'monto', v)}
                    className="skeu-input w-24 h-9 text-sm"
                    placeholder="0"
                    title={esPrecioKilo ? 'Precio por kilo final con este relleno' : 'Monto extra que se suma al total'}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button variant="outline" onClick={agregar}>
            <Plus className="w-4 h-4 mr-1" />Agregar relleno
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar rellenos'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>Plano +$:</strong> el monto se SUMA al total (en 0 no cobra).
          <strong> Precio/kg:</strong> el relleno fija el precio por kilo del pastel
          (ej. $150/kg). En el POS el precio por kilo sigue siendo editable. Aplica igual en el POS y la web.
        </p>
      </CardContent>
    </Card>
  );
}

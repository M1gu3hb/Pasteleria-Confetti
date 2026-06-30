import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Cake } from 'lucide-react';
import ExtrasPastelSection from '@/components/configuracion/ExtrasPastelSection';
import RellenosPastelSection from '@/components/configuracion/RellenosPastelSection';
import BaseRangosSection from '@/components/configuracion/BaseRangosSection';

// Configuración de Pasteles Personalizados (Fase 3).
// Dos bloques independientes: ratio personas/kilo y precio por kilo,
// cada uno con modo global o por sucursal. Solo dueño (la página ya
// está protegida con AdminRoute soloDueno).
function parseMapa(str) {
  try {
    const o = JSON.parse(str || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function BloqueConfig({ titulo, descripcion, unidad, esGlobal, setEsGlobal, valorGlobal, setValorGlobal, mapa, setMapa, sucursales, onGuardar, guardando }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">{descripcion}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Precio global (mismo valor para todas las sucursales)</Label>
          <Switch checked={esGlobal} onCheckedChange={setEsGlobal} />
        </div>
        {esGlobal ? (
          <div className="max-w-xs">
            <Label className="text-xs">{unidad}</Label>
            <Input
              type="number" min="0" step="0.01"
              value={valorGlobal}
              onChange={e => setValorGlobal(e.target.value)}
              className="mt-1 h-11 text-lg font-bold"
            />
          </div>
        ) : (
          <div className="space-y-2">
            {(Array.isArray(sucursales) ? sucursales : []).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/40 border">
                <p className="text-sm font-medium truncate">{s.nombre}</p>
                <Input
                  type="number" min="0" step="0.01"
                  value={mapa[s.id] ?? ''}
                  placeholder={String(valorGlobal || '')}
                  onChange={e => setMapa({ ...mapa, [s.id]: e.target.value })}
                  className="w-32 h-10 text-right font-bold"
                />
              </div>
            ))}
            {(!sucursales || sucursales.length === 0) && (
              <p className="text-xs text-muted-foreground">No hay sucursales activas.</p>
            )}
          </div>
        )}
        <Button onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PastelesConfigSection({ cfg }) {
  const queryClient = useQueryClient();
  const [guardando, setGuardando] = useState(null); // 'ratio' | 'precio' | null

  // Bloque A — ratio
  const [ratioGlobalOn, setRatioGlobalOn] = useState(true);
  const [ratioGlobal, setRatioGlobal] = useState('10');
  const [ratioMapa, setRatioMapa] = useState({});
  // Bloque B — precio
  const [precioGlobalOn, setPrecioGlobalOn] = useState(true);
  const [precioGlobal, setPrecioGlobal] = useState('350');
  const [precioMapa, setPrecioMapa] = useState({});

  const { data: sucursalesRaw } = useQuery({
    queryKey: ['sucursales_activas'],
    queryFn: () => base44.entities.Sucursal.filter({ activa: true }),
    staleTime: 30000,
  });
  const sucursales = Array.isArray(sucursalesRaw) ? sucursalesRaw : [];

  useEffect(() => {
    if (!cfg?.id) return;
    setRatioGlobalOn(cfg.ratio_personas_es_global !== false);
    setRatioGlobal(String(cfg.ratio_personas_por_kilo ?? 10));
    setRatioMapa(parseMapa(cfg.ratio_personas_por_sucursal));
    setPrecioGlobalOn(cfg.precio_kilo_es_global !== false);
    setPrecioGlobal(String(cfg.precio_kilo_global ?? 350));
    setPrecioMapa(parseMapa(cfg.precio_kilo_por_sucursal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.id, cfg?.updated_date]);

  const guardar = async (bloque) => {
    if (!cfg?.id) { toast.error('Espera a que cargue la configuración'); return; }
    setGuardando(bloque);
    try {
      const payload = bloque === 'ratio'
        ? {
            ratio_personas_es_global: ratioGlobalOn,
            ratio_personas_por_kilo: parseFloat(ratioGlobal) || 10,
            ratio_personas_por_sucursal: JSON.stringify(
              Object.fromEntries(Object.entries(ratioMapa).map(([k, v]) => [k, parseFloat(v) || 0]).filter(([, v]) => v > 0))
            ),
          }
        : {
            precio_kilo_es_global: precioGlobalOn,
            precio_kilo_global: parseFloat(precioGlobal) || 350,
            precio_kilo_por_sucursal: JSON.stringify(
              Object.fromEntries(Object.entries(precioMapa).map(([k, v]) => [k, parseFloat(v) || 0]).filter(([, v]) => v > 0))
            ),
          };
      await base44.entities.ConfiguracionNegocio.update(cfg.id, payload);
      await queryClient.refetchQueries({ queryKey: ['config'] });
      toast.success('Configuración de pasteles guardada');
    } catch (err) {
      console.error('[PastelesConfig] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Cake className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-bold text-lg">Pasteles Personalizados</h3>
      </div>
      <BloqueConfig
        titulo="Ratio personas por kilo"
        descripcion="Cuántas personas rinde 1 kilo de pastel. Se usa para sugerir kilos en el formulario."
        unidad="Personas por kilo"
        esGlobal={ratioGlobalOn}
        setEsGlobal={setRatioGlobalOn}
        valorGlobal={ratioGlobal}
        setValorGlobal={setRatioGlobal}
        mapa={ratioMapa}
        setMapa={setRatioMapa}
        sucursales={sucursales}
        onGuardar={() => guardar('ratio')}
        guardando={guardando === 'ratio'}
      />
      <BloqueConfig
        titulo="Precio por kilo"
        descripcion="Precio base por kilo de pastel. El empleado puede ajustarlo en cada pedido."
        unidad="Precio por kilo ($)"
        esGlobal={precioGlobalOn}
        setEsGlobal={setPrecioGlobalOn}
        valorGlobal={precioGlobal}
        setValorGlobal={setPrecioGlobal}
        mapa={precioMapa}
        setMapa={setPrecioMapa}
        sucursales={sucursales}
        onGuardar={() => guardar('precio')}
        guardando={guardando === 'precio'}
      />
      <BaseRangosSection cfg={cfg} />
      <ExtrasPastelSection cfg={cfg} />
      <RellenosPastelSection cfg={cfg} />
    </div>
  );
}
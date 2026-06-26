import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Ruler, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { parseUnidadesList, DEFAULT_UNIDADES_COMPRA } from '@/utils/unidadesMedida';

/**
 * Configuración → Operación → "Unidades de medida".
 *
 * Permite al admin editar la lista de unidades de medida disponibles en:
 *   - Registrar compra
 *   - Registrar inventario existente
 * Se guarda como `ConfiguracionNegocio.unidades_medida_lista` (texto separado por coma).
 * Las unidades default (kg, g, litro, ml, pieza, caja, paquete, bolsa, unidad) SIEMPRE
 * están disponibles aunque el admin las borre — la conversión de unidades depende de ellas.
 */
export default function UnidadesMedidaSection() {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: configs = [] } = useQuery({
    queryKey: ['config'],
    queryFn: () => base44.entities.ConfiguracionNegocio.list(),
    initialData: [],
  });
  const cfg = configs?.[0] || null;

  useEffect(() => {
    if (cfg) {
      setTexto(cfg.unidades_medida_lista || DEFAULT_UNIDADES_COMPRA.join(', '));
    }
  }, [cfg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    const parsed = parseUnidadesList(texto);
    if (parsed.length === 0) {
      toast.error('Necesitas al menos una unidad de medida.');
      return;
    }
    setSaving(true);
    try {
      const limpio = parsed.join(', ');
      if (cfg?.id) {
        await base44.entities.ConfiguracionNegocio.update(cfg.id, { unidades_medida_lista: limpio });
      } else {
        await base44.entities.ConfiguracionNegocio.create({
          nombre_negocio: 'Mi negocio',
          unidades_medida_lista: limpio,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success(`Unidades guardadas (${parsed.length})`);
    } catch (e) {
      toast.error('Error al guardar: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Ruler className="w-4 h-4 text-primary" />
          Unidades de medida
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Estas unidades aparecen en <strong>Registrar compra</strong> y
          <strong> Registrar inventario existente</strong>. Las unidades base
          (g, ml, pieza) son fijas y se usan para conversiones automáticas.
        </p>

        <div>
          <Label className="text-xs font-semibold">Unidades separadas por coma</Label>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={DEFAULT_UNIDADES_COMPRA.join(', ')}
            rows={2}
            className="mt-1 text-sm font-mono"
            disabled={saving}
          />
        </div>

        <div className="rounded-lg p-3 bg-muted/40 border text-xs flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="space-y-1">
            <p>
              <strong>Sugerencias:</strong> kg, g, litro, ml, pieza, caja, paquete, bolsa, unidad.
            </p>
            <p>
              No se repiten por mayúsculas o espacios. Las unidades default siempre
              están disponibles aunque las borres de la lista.
            </p>
          </div>
        </div>

        <Button onClick={guardar} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar unidades'}
        </Button>
      </CardContent>
    </Card>
  );
}
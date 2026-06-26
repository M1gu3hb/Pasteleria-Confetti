// =====================================================
// components/inventario/IngredienteContenedorSection.jsx
// =====================================================
// Sección reutilizable para configurar un ingrediente como "contenedor"
// (botella/cilindro vendido por porciones: shots, copas, vasos).
//
// USO:
//   <IngredienteContenedorSection
//     value={{ esContenedor, capacidadMl, porciones, mlPorPorcion, nombrePorcion }}
//     onChange={(next) => setValue(next)}
//     unidadBase={ing.unidad_base}        // opcional, solo para texto contextual
//     stockActual={ing.stock_actual}      // opcional, solo para texto contextual
//     disabled={saving}
//     hideInfoBox={false}                 // ocultar el aviso azul si el padre ya da contexto
//   />
//
// Esta sección NO guarda nada por su cuenta. El padre toma `value` y lo
// persiste como parte de su propio update/create.
//
// Campos del payload sugerido (cuando esContenedor === true):
//   tipo_ingrediente: 'contenedor'
//   capacidad_contenedor_ml
//   porciones_por_contenedor_default
//   ml_por_porcion_default
//   nombre_porcion_default
//
// Cuando esContenedor === false → tipo_ingrediente: 'normal' (campos en undefined).
//
// REGLA DE ESTABILIDAD: NUNCA toca stock_actual ni costo. Solo metadatos.
// =====================================================
import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Beaker, Info } from 'lucide-react';
import { mlPorPorcionEfectivo } from '@/utils/tipoVentaUtils';

/**
 * Hidrata el estado inicial a partir del ingrediente que viene de BD.
 * Devuelve un objeto plano con los 5 campos que usa la sección.
 * Defensivo contra null/undefined.
 */
export function hidratarValorContenedor(ing) {
  if (!ing) {
    return {
      esContenedor: false,
      capacidadMl: '',
      porciones: '',
      mlPorPorcion: '',
      nombrePorcion: '',
    };
  }
  return {
    esContenedor: ing?.tipo_ingrediente === 'contenedor',
    capacidadMl: ing?.capacidad_contenedor_ml != null ? String(ing.capacidad_contenedor_ml) : '',
    porciones: ing?.porciones_por_contenedor_default != null ? String(ing.porciones_por_contenedor_default) : '',
    mlPorPorcion: ing?.ml_por_porcion_default != null ? String(ing.ml_por_porcion_default) : '',
    nombrePorcion: ing?.nombre_porcion_default || '',
  };
}

/**
 * Construye el payload a persistir en el Ingrediente a partir del estado
 * de la sección. Centraliza la validación mínima.
 *
 * @returns { ok: boolean, error?: string, payload?: object }
 */
export function construirPayloadContenedor(value) {
  const v = value || {};
  if (!v.esContenedor) {
    return {
      ok: true,
      payload: {
        tipo_ingrediente: 'normal',
        capacidad_contenedor_ml: undefined,
        porciones_por_contenedor_default: undefined,
        ml_por_porcion_default: undefined,
        nombre_porcion_default: '',
      },
    };
  }
  const capNum = Number(v.capacidadMl);
  const porNum = Number(v.porciones);
  if (!Number.isFinite(capNum) || capNum <= 0) {
    return { ok: false, error: 'Capacidad del contenedor debe ser mayor a 0.' };
  }
  if (!Number.isFinite(porNum) || porNum <= 0) {
    return { ok: false, error: 'Porciones por contenedor debe ser mayor a 0.' };
  }
  const mlExp = v.mlPorPorcion === '' ? undefined : Number(v.mlPorPorcion);
  if (mlExp !== undefined && (!Number.isFinite(mlExp) || mlExp <= 0)) {
    return { ok: false, error: 'ml por porción inválido.' };
  }
  const mlDerivado = mlPorPorcionEfectivo({
    ml_por_porcion: mlExp,
    capacidad_contenedor_ml: capNum,
    porciones_por_contenedor: porNum,
  });
  return {
    ok: true,
    payload: {
      tipo_ingrediente: 'contenedor',
      capacidad_contenedor_ml: capNum,
      porciones_por_contenedor_default: porNum,
      ml_por_porcion_default: mlExp !== undefined ? mlExp : (mlDerivado || undefined),
      nombre_porcion_default: (v.nombrePorcion || '').trim() || 'shot',
    },
  };
}

export default function IngredienteContenedorSection({
  value,
  onChange,
  unidadBase,
  stockActual,
  disabled = false,
  hideInfoBox = false,
  title = 'Configurar como contenedor',
  compact = false,
}) {
  const v = value || {};
  const set = (patch) => onChange?.({ ...v, ...patch });

  const mlPorPorcionDerivado = useMemo(() => {
    return mlPorPorcionEfectivo({
      ml_por_porcion: v.mlPorPorcion === '' || v.mlPorPorcion == null ? undefined : Number(v.mlPorPorcion),
      capacidad_contenedor_ml: v.capacidadMl === '' || v.capacidadMl == null ? undefined : Number(v.capacidadMl),
      porciones_por_contenedor: v.porciones === '' || v.porciones == null ? undefined : Number(v.porciones),
    });
  }, [v.mlPorPorcion, v.capacidadMl, v.porciones]);

  return (
    <div className={`space-y-3 ${compact ? '' : 'rounded-xl border bg-card p-3'}`}>
      {!compact && (
        <div className="flex items-center gap-2">
          <Beaker className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">{title}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Marca este ingrediente como <strong>contenedor</strong> si quieres venderlo por
        porciones (shots, copas, vasos) en productos por porción/contenedor.
      </p>

      {(unidadBase || stockActual != null) && (
        <div className="rounded-lg p-2.5 bg-muted/40 border text-xs">
          {unidadBase && <>Unidad base: <strong>{unidadBase}</strong></>}
          {unidadBase && stockActual != null && <> · </>}
          {stockActual != null && (
            <>Stock actual: <strong>{Number(stockActual || 0).toLocaleString()} {unidadBase || ''}</strong></>
          )}
        </div>
      )}

      {!hideInfoBox && (
        <div className="rounded-lg p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <p className="text-blue-900 dark:text-blue-100">
            Esto solo cambia metadatos. <strong>No modifica stock, costo ni movimientos</strong>.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between p-3 rounded-lg border">
        <div className="min-w-0">
          <Label className="text-sm font-semibold">Es contenedor</Label>
          <p className="text-[11px] text-muted-foreground">
            {v.esContenedor
              ? 'Activado — puede usarse como ingrediente base para productos por porción.'
              : 'Desactivado — sigue siendo ingrediente normal.'}
          </p>
        </div>
        <Switch
          checked={!!v.esContenedor}
          onCheckedChange={(checked) => set({ esContenedor: !!checked })}
          disabled={disabled}
        />
      </div>

      {v.esContenedor && (
        <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Capacidad por contenedor (ml) *</Label>
              <Input
                type="number" step="1" min="0"
                value={v.capacidadMl}
                onChange={(e) => set({ capacidadMl: e.target.value })}
                placeholder="ej. 750"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Porciones por contenedor *</Label>
              <Input
                type="number" step="1" min="0"
                value={v.porciones}
                onChange={(e) => set({ porciones: e.target.value })}
                placeholder="ej. 25"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">ml por porción (opcional)</Label>
              <Input
                type="number" step="0.1" min="0"
                value={v.mlPorPorcion}
                onChange={(e) => set({ mlPorPorcion: e.target.value })}
                placeholder={mlPorPorcionDerivado > 0 ? `auto: ${mlPorPorcionDerivado}` : 'ej. 30'}
                disabled={disabled}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Si lo dejas vacío, se calcula: capacidad ÷ porciones.
              </p>
            </div>
            <div>
              <Label className="text-xs">Nombre de la porción *</Label>
              <Input
                value={v.nombrePorcion}
                onChange={(e) => set({ nombrePorcion: e.target.value })}
                placeholder="ej. shot, copa, vaso"
                disabled={disabled}
              />
            </div>
          </div>

          {mlPorPorcionDerivado > 0 && (
            <div className="text-[11px] text-muted-foreground p-2 rounded-md bg-card border">
              <strong>Resumen:</strong> {v.capacidadMl || 0} ml por contenedor ÷ {v.porciones || 0} {v.nombrePorcion || 'porciones'}
              {' '}= <strong>{mlPorPorcionDerivado} ml por {v.nombrePorcion || 'porción'}</strong>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
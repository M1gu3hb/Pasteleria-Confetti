// =====================================================
// components/productos/TipoVentaSection.jsx
// =====================================================
// 6B / Bloque 1.B — Sección reutilizable para configurar el "tipo_venta"
// de un producto: precio_fijo | variable_medida | porcion_contenedor.
//
// REGLAS CRÍTICAS:
// - Default visual y de datos: 'precio_fijo'. Si el usuario no toca nada,
//   el producto se sigue comportando 100% igual que antes (flujo clásico).
// - No toca costo/utilidad/margen del producto. Solo persiste los campos
//   nuevos del schema. El cálculo financiero de variables vivirá en
//   sub-bloques 1.G/1.H (Caja + inventario), sin tocar los flujos actuales.
// - Defensivo: nunca devuelve NaN, valida con Number.isFinite y arrays con
//   Array.isArray. Acepta `value` parcial/null y siempre rinde.
//
// PROPS:
//   value:    { tipo_venta, ingrediente_base_id, ingrediente_base_nombre,
//               unidad_variable, precio_por_unidad_variable,
//               cantidad_minima_variable, cantidad_maxima_variable, incremento_variable,
//               presets_variable_qr,
//               capacidad_contenedor_ml, porciones_por_contenedor,
//               ml_por_porcion, nombre_porcion, precio_por_porcion,
//               presets_porcion_qr }
//   onChange: (patch) => void  (recibe SOLO los campos que cambiaron)
//   ingredientes: array (opcional) — para el selector de ingrediente base.
// =====================================================
import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info } from 'lucide-react';
import {
  TIPO_VENTA,
  UNIDADES_VARIABLE,
  mlPorPorcionEfectivo,
} from '@/utils/tipoVentaUtils';

const TIPO_VENTA_OPCIONES = [
  { value: TIPO_VENTA.PRECIO_FIJO,        label: 'Precio fijo',        hint: 'Producto clásico con un precio único.' },
  { value: TIPO_VENTA.VARIABLE_MEDIDA,    label: 'Variable por medida', hint: 'Se vende por peso o volumen (g/kg/ml/l). Ej: barbacoa por gramo.' },
  { value: TIPO_VENTA.PORCION_CONTENEDOR, label: 'Por porción de contenedor', hint: 'Se sirven porciones desde un contenedor en ml. Ej: shots de una botella.' },
];

// Parser/encoder de presets — el schema los guarda como array de números.
// En la UI los mostramos como texto separado por comas para simplicidad.
function presetsToText(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.filter(n => Number.isFinite(Number(n)) && Number(n) > 0).join(', ');
}
function textToPresets(txt) {
  if (!txt || typeof txt !== 'string') return [];
  return txt
    .split(/[,\s]+/)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n) && n > 0);
}

export default function TipoVentaSection({ value = {}, onChange, ingredientes = [] }) {
  const v = value || {};
  const tipo = v.tipo_venta || TIPO_VENTA.PRECIO_FIJO;
  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];

  const handle = (patch) => {
    if (typeof onChange === 'function') onChange(patch);
  };

  // Cuando el usuario cambia el tipo, limpiamos campos que ya no aplican
  // para no dejar basura en BD. Esto NO borra ingrediente_base si vuelve
  // a variable luego — solo se limpia al volver a 'precio_fijo'.
  const onTipoChange = (nuevoTipo) => {
    if (nuevoTipo === TIPO_VENTA.PRECIO_FIJO) {
      handle({
        tipo_venta: TIPO_VENTA.PRECIO_FIJO,
        ingrediente_base_id: '',
        ingrediente_base_nombre: '',
        unidad_variable: '',
        precio_por_unidad_variable: undefined,
        cantidad_minima_variable: undefined,
        cantidad_maxima_variable: undefined,
        incremento_variable: undefined,
        presets_variable_qr: [],
        capacidad_contenedor_ml: undefined,
        porciones_por_contenedor: undefined,
        ml_por_porcion: undefined,
        nombre_porcion: '',
        precio_por_porcion: undefined,
        presets_porcion_qr: [],
      });
      return;
    }
    if (nuevoTipo === TIPO_VENTA.VARIABLE_MEDIDA) {
      handle({
        tipo_venta: TIPO_VENTA.VARIABLE_MEDIDA,
        // Limpiamos los de porción (mutuamente excluyentes en uso)
        capacidad_contenedor_ml: undefined,
        porciones_por_contenedor: undefined,
        ml_por_porcion: undefined,
        nombre_porcion: '',
        precio_por_porcion: undefined,
        presets_porcion_qr: [],
        // Defaults razonables
        unidad_variable: v.unidad_variable || 'g',
      });
      return;
    }
    if (nuevoTipo === TIPO_VENTA.PORCION_CONTENEDOR) {
      handle({
        tipo_venta: TIPO_VENTA.PORCION_CONTENEDOR,
        // Limpiamos los de medida
        unidad_variable: '',
        precio_por_unidad_variable: undefined,
        cantidad_minima_variable: undefined,
        cantidad_maxima_variable: undefined,
        incremento_variable: undefined,
        presets_variable_qr: [],
        // Defaults razonables
        unidad_contenedor_base: 'ml',
        nombre_porcion: v.nombre_porcion || 'shot',
      });
      return;
    }
  };

  // Filtrar ingredientes candidatos según el tipo:
  // - variable_medida: cualquier ingrediente activo (g/ml/pieza), aunque g/ml son los típicos.
  // - porcion_contenedor: idealmente tipo 'contenedor' o unidad_base 'ml'. Mostramos primero los que mejor encajen.
  const ingredientesCandidatos = useMemo(() => {
    const base = safeIngredientes.filter(i => i?.activo !== false);
    if (tipo === TIPO_VENTA.PORCION_CONTENEDOR) {
      // Priorizar contenedores; luego ingredientes en ml.
      return [...base].sort((a, b) => {
        const aPref = (a?.tipo_ingrediente === 'contenedor' ? 0 : (a?.unidad_base === 'ml' ? 1 : 2));
        const bPref = (b?.tipo_ingrediente === 'contenedor' ? 0 : (b?.unidad_base === 'ml' ? 1 : 2));
        return aPref - bPref;
      });
    }
    return base;
  }, [safeIngredientes, tipo]);

  const onIngredienteChange = (id) => {
    const ing = safeIngredientes.find(i => i?.id === id);
    handle({
      ingrediente_base_id: id || '',
      ingrediente_base_nombre: ing?.nombre || '',
      // Si elige un contenedor y tipo es porción, sugerimos sus defaults
      // (solo si los campos están vacíos — no pisamos lo que ya escribió).
      ...(tipo === TIPO_VENTA.PORCION_CONTENEDOR && ing?.tipo_ingrediente === 'contenedor' ? {
        capacidad_contenedor_ml: v.capacidad_contenedor_ml ?? ing?.capacidad_contenedor_ml,
        porciones_por_contenedor: v.porciones_por_contenedor ?? ing?.porciones_por_contenedor_default,
        ml_por_porcion: v.ml_por_porcion ?? ing?.ml_por_porcion_default,
        nombre_porcion: v.nombre_porcion || ing?.nombre_porcion_default || 'shot',
      } : {}),
    });
  };

  // ml por porción derivado (solo informativo)
  const mlPorPorcionShow = useMemo(() => {
    if (tipo !== TIPO_VENTA.PORCION_CONTENEDOR) return 0;
    return mlPorPorcionEfectivo({
      ml_por_porcion: v.ml_por_porcion,
      capacidad_contenedor_ml: v.capacidad_contenedor_ml,
      porciones_por_contenedor: v.porciones_por_contenedor,
    });
  }, [tipo, v.ml_por_porcion, v.capacidad_contenedor_ml, v.porciones_por_contenedor]);

  // ---- Render ----
  return (
    <section className="space-y-3 p-3 rounded-xl border bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tipo de venta
        </Label>
      </div>

      <Select value={tipo} onValueChange={onTipoChange}>
        <SelectTrigger>
          <SelectValue placeholder="Precio fijo" />
        </SelectTrigger>
        <SelectContent>
          {TIPO_VENTA_OPCIONES.map(op => (
            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>{TIPO_VENTA_OPCIONES.find(o => o.value === tipo)?.hint || ''}</span>
      </p>

      {/* === VARIABLE POR MEDIDA === */}
      {tipo === TIPO_VENTA.VARIABLE_MEDIDA && (
        <div className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Ingrediente base *</Label>
              <Select value={v.ingrediente_base_id || ''} onValueChange={onIngredienteChange}>
                <SelectTrigger>
                  <SelectValue placeholder={safeIngredientes.length === 0 ? 'Sin ingredientes en inventario' : 'Selecciona…'} />
                </SelectTrigger>
                <SelectContent>
                  {ingredientesCandidatos.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nombre} <span className="text-muted-foreground">({i.unidad_base})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {safeIngredientes.length === 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                  Necesitas registrar al menos un ingrediente en Inventario para usar este tipo de venta.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Unidad mostrada al cliente *</Label>
              <Select value={v.unidad_variable || 'g'} onValueChange={(u) => handle({ unidad_variable: u })}>
                <SelectTrigger>
                  <SelectValue placeholder="g" />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADES_VARIABLE.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Precio por {v.unidad_variable || 'g'} *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={v.precio_por_unidad_variable ?? ''}
                onChange={(e) => handle({ precio_por_unidad_variable: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Cantidad mínima ({v.unidad_variable || 'g'})</Label>
              <Input
                type="number" step="0.01" min="0"
                value={v.cantidad_minima_variable ?? ''}
                onChange={(e) => handle({ cantidad_minima_variable: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="ej. 100"
              />
            </div>
            <div>
              <Label className="text-xs">Cantidad máxima ({v.unidad_variable || 'g'})</Label>
              <Input
                type="number" step="0.01" min="0"
                value={v.cantidad_maxima_variable ?? ''}
                onChange={(e) => handle({ cantidad_maxima_variable: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="ej. 2000"
              />
            </div>
            <div>
              <Label className="text-xs">Incremento permitido ({v.unidad_variable || 'g'})</Label>
              <Input
                type="number" step="0.01" min="0"
                value={v.incremento_variable ?? ''}
                onChange={(e) => handle({ incremento_variable: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="ej. 50"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Presets en QR ({v.unidad_variable || 'g'}) — separa con comas</Label>
              <Input
                value={presetsToText(v.presets_variable_qr)}
                onChange={(e) => handle({ presets_variable_qr: textToPresets(e.target.value) })}
                placeholder="ej. 250, 500, 1000"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Botones rápidos visibles al comensal en el Portal QR.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* === POR PORCIÓN DE CONTENEDOR === */}
      {tipo === TIPO_VENTA.PORCION_CONTENEDOR && (
        <div className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Ingrediente base (contenedor) *</Label>
              <Select value={v.ingrediente_base_id || ''} onValueChange={onIngredienteChange}>
                <SelectTrigger>
                  <SelectValue placeholder={safeIngredientes.length === 0 ? 'Sin ingredientes en inventario' : 'Selecciona…'} />
                </SelectTrigger>
                <SelectContent>
                  {ingredientesCandidatos.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nombre}
                      {i.tipo_ingrediente === 'contenedor'
                        ? <span className="text-emerald-600"> · contenedor</span>
                        : <span className="text-muted-foreground"> ({i.unidad_base})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {safeIngredientes.length === 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                  Necesitas registrar al menos un ingrediente en Inventario para usar este tipo de venta.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Capacidad del contenedor (ml) *</Label>
              <Input
                type="number" step="1" min="0"
                value={v.capacidad_contenedor_ml ?? ''}
                onChange={(e) => handle({ capacidad_contenedor_ml: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="ej. 750"
              />
            </div>
            <div>
              <Label className="text-xs">Porciones por contenedor *</Label>
              <Input
                type="number" step="1" min="0"
                value={v.porciones_por_contenedor ?? ''}
                onChange={(e) => handle({ porciones_por_contenedor: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="ej. 25"
              />
            </div>
            <div>
              <Label className="text-xs">ml por porción (opcional)</Label>
              <Input
                type="number" step="0.1" min="0"
                value={v.ml_por_porcion ?? ''}
                onChange={(e) => handle({ ml_por_porcion: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder={mlPorPorcionShow > 0 ? `auto: ${mlPorPorcionShow}` : 'ej. 30'}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Si lo dejas vacío, se calcula: capacidad ÷ porciones.
              </p>
            </div>
            <div>
              <Label className="text-xs">Nombre de la porción *</Label>
              <Input
                value={v.nombre_porcion || ''}
                onChange={(e) => handle({ nombre_porcion: e.target.value })}
                placeholder="ej. shot, copa, vaso"
              />
            </div>
            <div>
              <Label className="text-xs">Precio por porción *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={v.precio_por_porcion ?? ''}
                onChange={(e) => handle({ precio_por_porcion: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Presets en QR (n.º de porciones)</Label>
              <Input
                value={presetsToText(v.presets_porcion_qr)}
                onChange={(e) => handle({ presets_porcion_qr: textToPresets(e.target.value) })}
                placeholder="ej. 1, 2, 4"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
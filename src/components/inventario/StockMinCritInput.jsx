import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * StockMinCritInput
 * -----------------
 * Captura de stock mínimo y stock crítico con UNIDAD CLARA.
 *
 * Problema que resuelve:
 *   Antes el usuario escribía "4" pensando en kg y el sistema lo guardaba como
 *   4 gramos. Esto resultaba en alertas inservibles.
 *
 * Esta UI:
 *   - Pide cantidad + unidad de captura (kg/g, l/ml, pza).
 *   - Convierte internamente a la unidad base del ingrediente al guardar.
 *   - Muestra equivalencia inmediata abajo del campo.
 *
 * NO toca lógica financiera, NO toca cálculo de costos, NO crea entidades.
 * Es solo un componente de captura.
 *
 * Props:
 *   - unidadBase: 'g' | 'ml' | 'pieza'  (del ingrediente)
 *   - valoresEnBase: { stock_minimo, stock_critico } en unidad base actual
 *   - onChange: ({ stock_minimo, stock_critico }) => void  (siempre en unidad base)
 *   - compact (boolean opcional): true = sin descripciones, formato más estrecho
 *
 * Internamente mantenemos lo que el usuario escribió + la unidad elegida, y
 * exportamos hacia afuera el número ya convertido a base, para que el caller
 * lo persista sin tener que pensar en conversiones.
 */

// Pares válidos por unidad base. NUNCA mezclamos masa con volumen con piezas.
const UNIDADES_DISPONIBLES = {
  g:     [{ value: 'g',  label: 'g',  factor: 1    },
          { value: 'kg', label: 'kg', factor: 1000 }],
  ml:    [{ value: 'ml', label: 'ml',    factor: 1    },
          { value: 'l',  label: 'litros', factor: 1000 }],
  pieza: [{ value: 'pieza', label: 'piezas', factor: 1 }],
};

const unidadDefault = (unidadBase) => {
  if (unidadBase === 'g') return 'kg';     // los humanos piensan en kg, no g
  if (unidadBase === 'ml') return 'l';     // los humanos piensan en l, no ml
  return 'pieza';
};

const getFactor = (unidadBase, unidadCaptura) => {
  const list = UNIDADES_DISPONIBLES[unidadBase] || UNIDADES_DISPONIBLES.pieza;
  return (list.find(u => u.value === unidadCaptura)?.factor) || 1;
};

/**
 * Convierte un valor en unidad base de regreso al display en unidad de captura.
 * Solo informativo para inicializar inputs cuando se edita un ingrediente.
 */
function baseADisplay(valorBase, unidadBase, unidadCaptura) {
  const v = Number(valorBase) || 0;
  if (v <= 0) return '';
  const factor = getFactor(unidadBase, unidadCaptura);
  if (factor === 1) return String(v);
  const conv = v / factor;
  // Si es un múltiplo exacto (4000 → 4), mostramos entero. Si no, 3 decimales.
  return Number.isInteger(conv) ? String(conv) : String(parseFloat(conv.toFixed(3)));
}

export default function StockMinCritInput({
  unidadBase = 'g',
  valoresEnBase = {},
  onChange,
  compact = false,
}) {
  // Unidades disponibles para esta unidad base
  const opciones = UNIDADES_DISPONIBLES[unidadBase] || UNIDADES_DISPONIBLES.pieza;

  // Unidad seleccionada por el usuario (default: la más humana — kg/l/pieza).
  // Se mantiene en estado local de this dialog usando React.useState para que
  // el componente sea autocontenido y no obligue al caller a manejarla.
  const [unidad, setUnidad] = React.useState(() => unidadDefault(unidadBase));

  // Si el unidadBase cambia (caso edge: usuario cambia unidad base mientras edita),
  // ajustamos la unidad de captura a su default.
  React.useEffect(() => {
    setUnidad(unidadDefault(unidadBase));
  }, [unidadBase]);

  // Valores actuales en display (convertidos desde base).
  const minDisplay = useMemo(
    () => baseADisplay(valoresEnBase?.stock_minimo, unidadBase, unidad),
    [valoresEnBase?.stock_minimo, unidadBase, unidad]
  );
  const critDisplay = useMemo(
    () => baseADisplay(valoresEnBase?.stock_critico, unidadBase, unidad),
    [valoresEnBase?.stock_critico, unidadBase, unidad]
  );

  // Manejadores: cada cambio re-convierte a unidad base y avisa al caller.
  const factor = getFactor(unidadBase, unidad);

  const handleMin = (e) => {
    const raw = e.target.value;
    const num = parseFloat(raw);
    const enBase = Number.isFinite(num) && num >= 0 ? num * factor : 0;
    onChange?.({
      stock_minimo: enBase,
      stock_critico: Number(valoresEnBase?.stock_critico) || 0,
    });
  };

  const handleCrit = (e) => {
    const raw = e.target.value;
    const num = parseFloat(raw);
    const enBase = Number.isFinite(num) && num >= 0 ? num * factor : 0;
    onChange?.({
      stock_minimo: Number(valoresEnBase?.stock_minimo) || 0,
      stock_critico: enBase,
    });
  };

  const handleUnidad = (v) => {
    // Cambia solo la unidad de visualización. Los valores en base no cambian.
    setUnidad(v);
  };

  const showEquiv = unidadBase !== 'pieza' && factor !== 1;

  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-xs font-medium text-muted-foreground">
          Alertas de inventario
        </p>
      )}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div>
          <Label className="text-xs">Stock mínimo</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={minDisplay}
            onChange={handleMin}
            placeholder="0"
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Stock crítico</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={critDisplay}
            onChange={handleCrit}
            placeholder="0"
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Unidad</Label>
          <Select value={unidad} onValueChange={handleUnidad}>
            <SelectTrigger className="h-9 w-[88px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {opciones.map(u => (
                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Equivalencia visible (4 kg = 4000 g) — evita el bug del usuario que
          piensa que escribió kg pero el sistema interpretó g. */}
      {showEquiv && (Number(valoresEnBase?.stock_minimo) > 0 || Number(valoresEnBase?.stock_critico) > 0) && (
        <p className="text-[11px] text-muted-foreground">
          {Number(valoresEnBase?.stock_minimo) > 0 && (
            <>Mín: <strong>{Number(valoresEnBase.stock_minimo).toLocaleString()} {unidadBase}</strong></>
          )}
          {Number(valoresEnBase?.stock_minimo) > 0 && Number(valoresEnBase?.stock_critico) > 0 && ' · '}
          {Number(valoresEnBase?.stock_critico) > 0 && (
            <>Crít: <strong>{Number(valoresEnBase.stock_critico).toLocaleString()} {unidadBase}</strong></>
          )}
        </p>
      )}

      {!compact && (
        <p className="text-[11px] text-muted-foreground">
          Captura en {unidad}. El sistema guarda internamente en {unidadBase}.
        </p>
      )}
    </div>
  );
}
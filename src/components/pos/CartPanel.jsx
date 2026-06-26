import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/utils/financialUtils';
import { Plus, Minus, Trash2, ShoppingCart, Scale, Beaker } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';

export default function CartPanel({ items, onUpdateQty, onRemove, total, onCheckout, onClear }) {
  const { config } = useConfig();
  const totalClass = config?.colorear_importes_monetarios !== false ? 'text-primary' : 'text-foreground';
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Agrega productos</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-heading font-semibold text-sm">Orden</h3>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive">
          Limpiar
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {items.map((item, idx) => {
            // 6B / 1.K — Línea variable: muestra "500 g" / "4 shots" y bloquea +/-.
            const tipo = item?.tipo_venta;
            const esMedida = tipo === 'variable_medida';
            const esPorcion = tipo === 'porcion_contenedor';
            const esVariable = esMedida || esPorcion;
            const etiquetaVar = esMedida
              ? `${Number(item?.cantidad_variable) || 0} ${item?.unidad_variable || ''}`
              : esPorcion
                ? `${Number(item?.cantidad_porciones) || 0} ${item?.nombre_porcion || 'porción'}`
                : '';
            // Subtotal de línea: para variables usamos subtotal_linea fijo;
            // para precio_fijo, precio × cantidad.
            const subtotalLinea = esVariable
              ? (Number(item?.subtotal_linea) || 0)
              : (Number(item?.precio_venta) || 0) * (Number(item?.cantidad) || 0);
            return (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1">
                    {esVariable && (
                      esMedida
                        ? <Scale className="w-3 h-3 text-primary shrink-0" />
                        : <Beaker className="w-3 h-3 text-primary shrink-0" />
                    )}
                    <span className="truncate">{item.nombre}</span>
                  </p>
                  {esVariable ? (
                    <p className="text-xs text-primary font-bold">{etiquetaVar}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.precio_venta)} c/u</p>
                  )}
                  {item.notas && <p className="text-[10px] text-primary/70 truncate">📝 {item.notas}</p>}
                </div>
                {/* Variables: sin +/- (cada línea es independiente). Solo trash. */}
                {!esVariable && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => onUpdateQty(idx, item.cantidad - 1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold">{item.cantidad}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => onUpdateQty(idx, item.cantidad + 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <p className="text-sm font-bold w-16 text-right">{formatCurrency(subtotalLinea)}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border space-y-3">
        <div className="flex justify-between items-baseline font-heading font-bold">
          <span className="text-lg">Total</span>
          <span className={`font-display text-3xl ${totalClass}`}>{formatCurrency(total)}</span>
        </div>
        <Button onClick={onCheckout} className="btn-cobrar w-full rounded-2xl text-lg font-semibold min-h-[56px]" size="lg">
          Cobrar {formatCurrency(total)}
        </Button>
      </div>
    </div>
  );
}
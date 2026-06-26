import React from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/financialUtils';
import { Coffee, Scale, Beaker } from 'lucide-react';

export default function ProductCard({ product, onAdd, showCost = false }) {
  // 6B / 1.K — Identificar productos variables para badge y precio "desde".
  const tipo = product?.tipo_venta;
  const esMedida = tipo === 'variable_medida';
  const esPorcion = tipo === 'porcion_contenedor';
  const esVariable = esMedida || esPorcion;

  // Precio mostrado: para variables, "desde X" (precio por unidad/porción).
  const precioBase = esMedida
    ? Number(product?.precio_por_unidad_variable) || 0
    : esPorcion
      ? Number(product?.precio_por_porcion) || 0
      : Number(product?.precio_venta) || 0;
  const unidadBase = esMedida
    ? (product?.unidad_variable || '')
    : esPorcion
      ? (product?.nombre_porcion || 'porción')
      : '';

  return (
    <Card
      onClick={() => onAdd(product)}
      className="skeu-product cursor-pointer min-h-[80px] rounded-2xl active:scale-95 transition-all duration-200 overflow-hidden group border-0"
    >
      <div className="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden"
        style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.4) inset' }}>
        {product.imagen_url ? (
          <img src={product.imagen_url} alt={product.nombre} className="w-full h-full object-cover" />
        ) : (
          <Coffee className="w-8 h-8 text-muted-foreground/40" />
        )}
        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
        {/* Badge variable */}
        {esVariable && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary text-primary-foreground shadow flex items-center gap-1">
            {esMedida ? <Scale className="w-2.5 h-2.5" /> : <Beaker className="w-2.5 h-2.5" />}
            {esMedida ? 'Por medida' : 'Por porción'}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-medium text-sm truncate">{product.nombre}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="font-heading font-bold text-primary">
            {esVariable ? (
              <>
                <span className="text-[10px] text-muted-foreground font-normal">desde </span>
                {formatCurrency(precioBase)}
                {unidadBase ? <span className="text-[10px] text-muted-foreground font-normal"> /{unidadBase}</span> : null}
              </>
            ) : (
              formatCurrency(product.precio_venta)
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
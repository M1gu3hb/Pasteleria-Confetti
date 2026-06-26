import React from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { TIPO_VENTA } from '@/utils/tipoVentaUtils';

/**
 * Precio visible en cards del Mesero/POS para distinguir
 * productos variables (g, kg, ml, l, shot, copa...) de precio fijo.
 *
 * Reglas:
 *  - precio_fijo: $X.XX
 *  - variable_medida: $X.XX / unidad_variable (g, kg, ml, l)
 *  - porcion_contenedor: $X.XX / nombre_porcion (shot, copa, vaso)
 *
 * Solo afecta presentación visual. No cambia precio_venta ni la lógica
 * de agregar al carrito.
 */
export default function PrecioProductoMesero({ producto, colorize = true }) {
  const cls = colorize ? 'text-primary' : 'text-foreground';
  const tipo = producto?.tipo_venta;
  if (tipo === TIPO_VENTA.VARIABLE_MEDIDA) {
    const precio = Number(producto?.precio_por_unidad_variable) || 0;
    const u = producto?.unidad_variable || 'g';
    return (
      <p className={`font-bold text-sm mt-1 ${cls}`}>
        {formatCurrency(precio)} <span className="text-[10px] font-medium opacity-70">/ {u}</span>
      </p>
    );
  }
  if (tipo === TIPO_VENTA.PORCION_CONTENEDOR) {
    const precio = Number(producto?.precio_por_porcion) || 0;
    const np = producto?.nombre_porcion || 'porción';
    return (
      <p className={`font-bold text-sm mt-1 ${cls}`}>
        {formatCurrency(precio)} <span className="text-[10px] font-medium opacity-70">/ {np}</span>
      </p>
    );
  }
  return <p className={`font-bold text-sm mt-1 ${cls}`}>{formatCurrency(producto?.precio_venta)}</p>;
}

/**
 * Mini-badge para identificar producto variable. Discreto.
 */
export function VariableBadge({ producto }) {
  const tipo = producto?.tipo_venta;
  if (tipo !== TIPO_VENTA.VARIABLE_MEDIDA && tipo !== TIPO_VENTA.PORCION_CONTENEDOR) return null;
  const label = tipo === TIPO_VENTA.VARIABLE_MEDIDA ? 'Variable' : 'Por porción';
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
      {label}
    </span>
  );
}
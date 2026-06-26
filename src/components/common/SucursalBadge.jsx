import React from 'react';
import { Store } from 'lucide-react';
import { etiquetaSucursal } from '@/lib/sucursalQuery';

/**
 * FASE 2C-VISTAS — Indicador ligero de la sucursal que se está viendo.
 * - Con sucursal activa: "Sucursal: <nombre>".
 * - Dueño en global (sin sucursal): "Todas las sucursales".
 *
 * Componente puramente visual, sin lógica de negocio.
 */
export default function SucursalBadge({ sucursalEfectiva }) {
  const label = etiquetaSucursal(sucursalEfectiva);
  const esGlobal = !sucursalEfectiva?.sucursal_id;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
        esGlobal
          ? 'bg-muted/60 text-muted-foreground border-border'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200'
      }`}
      title={esGlobal ? 'Viendo datos de todas las sucursales' : `Sucursal: ${label}`}
    >
      <Store className="w-3 h-3 shrink-0" />
      {esGlobal ? 'Todas las sucursales' : `Sucursal: ${label}`}
    </span>
  );
}
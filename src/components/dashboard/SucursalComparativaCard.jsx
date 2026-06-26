import React from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { useConfig } from '@/lib/ConfigContext';

/**
 * Mini-card comparativa por sucursal (solo vista general del dueño).
 * Muestra nombre, monto vendido hoy y número de tickets, con un acento de
 * color distintivo por sucursal (borde izquierdo + punto de color).
 *
 * Estética Confetti: Playfair en el número, Plus Jakarta en labels.
 * Puramente visual — sin lógica de negocio.
 */
export default function SucursalComparativaCard({ nombre, total, tickets, color }) {
  const { config } = useConfig();
  const colorize = config?.colorear_importes_monetarios !== false;
  const safeTotal = Number(total) || 0;
  const safeTickets = Number(tickets) || 0;
  const acento = color || '#E8579A';

  return (
    <div
      className="skeu-card rounded-2xl p-4 border border-l-4"
      style={{ borderLeftColor: acento }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: acento }} />
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">
          {nombre || 'Sucursal'}
        </p>
      </div>
      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
        <span
          className="text-2xl font-heading font-black truncate"
          style={{ color: colorize ? acento : undefined }}
        >
          {formatCurrency(safeTotal)}
        </span>
        <span className="text-xs text-muted-foreground">
          · {safeTickets} {safeTickets === 1 ? 'ticket' : 'tickets'}
        </span>
      </div>
    </div>
  );
}
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { STOCK_STATUS_CONFIG, MESA_STATUS_CONFIG, PREP_STATUS_CONFIG } from '@/lib/constants';
import {
  STOCK_BADGE_DARK_CLASSES,
  MESA_BADGE_DARK_CLASSES,
  PREP_BADGE_DARK_CLASSES,
} from '@/lib/darkPalettes';

/**
 * Badges de estado con soporte dark-mode.
 * Los strings `dark:bg-emerald-900/...` están definidos como literales en
 * darkPalettes.js para que Tailwind JIT los detecte en build.
 */
export function StockStatusBadge({ status }) {
  const cfg = STOCK_STATUS_CONFIG[status] || STOCK_STATUS_CONFIG.suficiente;
  const darkCls = STOCK_BADGE_DARK_CLASSES[status] || '';
  return (
    <Badge variant="outline" className={`${cfg.color} ${darkCls} text-[11px] font-medium border`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${cfg.dot}`} />
      {cfg.label}
    </Badge>
  );
}

export function MesaStatusBadge({ status }) {
  const cfg = MESA_STATUS_CONFIG[status] || MESA_STATUS_CONFIG.libre;
  const darkCls = MESA_BADGE_DARK_CLASSES[status] || '';
  return (
    <Badge variant="outline" className={`${cfg.color || ''} ${darkCls} text-[11px] font-medium border`}>
      {cfg.label}
    </Badge>
  );
}

export function PrepStatusBadge({ status }) {
  const cfg = PREP_STATUS_CONFIG[status] || PREP_STATUS_CONFIG.nuevo;
  const darkCls = PREP_BADGE_DARK_CLASSES[status] || '';
  return (
    <Badge variant="outline" className={`${cfg.color} ${darkCls} text-[11px] font-medium border`}>
      {cfg.label}
    </Badge>
  );
}
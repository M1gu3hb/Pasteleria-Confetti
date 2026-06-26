import React from 'react';
import { useConfig } from '@/lib/ConfigContext';
import { useIsDark } from '@/lib/ThemeContext';
import { STATCARD_PALETTES } from '@/lib/darkPalettes';

/**
 * Skeuomorphic stat card with its own color theme.
 * Use for Dashboard cards where each metric should have a distinct identity.
 *
 * Dark-mode aware: usa paletas STATCARD_PALETTES (light/dark) sin tocar lógica.
 */
export default function ColoredStatCard({ title, value, subtitle, icon: Icon, color = 'slate', accent }) {
  const { config } = useConfig();
  const isDark = useIsDark();
  const palette = (isDark ? STATCARD_PALETTES.dark : STATCARD_PALETTES.light)[color] || STATCARD_PALETTES.light.slate;
  const colorize = config?.colorear_importes_monetarios !== false;
  // En dark, ignoramos la override a `#0f172a` (negro) cuando colorize=false, porque
  // sería ilegible. Usamos el value de la paleta dark (siempre claro).
  const valueColor = colorize ? palette.value : (isDark ? palette.value : '#0f172a');
  const innerShadow = isDark
    ? `0 1px 0 rgba(255,255,255,0.06) inset, 0 -2px 6px rgba(0,0,0,0.4) inset, 0 8px 18px ${palette.shadow}`
    : `0 1px 0 rgba(255,255,255,0.6) inset, 0 -2px 6px rgba(0,0,0,0.06) inset, 0 8px 18px ${palette.shadow}`;
  return (
    <div className="premium-sheen relative rounded-2xl p-4 overflow-hidden border"
      style={{
        background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
        borderColor: palette.border,
        boxShadow: innerShadow,
      }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: palette.label }}>
            {title}
          </p>
          <p className="text-xl font-heading font-black mt-1 truncate" style={{ color: valueColor }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] mt-0.5" style={{ color: palette.label }}>{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: palette.iconBg,
              boxShadow: isDark
                ? `0 2px 4px ${palette.shadow}, 0 1px 0 rgba(255,255,255,0.06) inset`
                : `0 2px 4px ${palette.shadow}, 0 1px 0 rgba(255,255,255,0.5) inset`,
            }}>
            <Icon className="w-4 h-4" style={{ color: palette.iconColor }} />
          </div>
        )}
      </div>
      {accent && (
        <div className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full opacity-20"
          style={{ background: palette.iconColor }} />
      )}
    </div>
  );
}

export const PAYMENT_COLORS = {
  efectivo: '#16a34a',
  tarjeta: '#2563eb',
  transferencia: '#7c3aed',
};
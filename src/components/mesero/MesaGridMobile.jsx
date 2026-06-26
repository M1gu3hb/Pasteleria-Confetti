import React from 'react';
import { MESA_STATUS_CONFIG } from '@/lib/constants';
import { Users, UtensilsCrossed, Loader2 } from 'lucide-react';
import { useIsDark } from '@/lib/ThemeContext';
import { MESA_STATUS_DARK } from '@/lib/darkPalettes';

/**
 * Grid de mesas para móvil. Reemplaza el canvas posicional.
 *
 * Props:
 *  - mesas: array de mesas
 *  - onMesaClick(mesa)
 *  - getResponsable(mesa) → { color, nombre } | null
 *  - loading: si true muestra placeholder en lugar de "no hay mesas".
 *
 * Dark mode: usa MESA_STATUS_DARK con fill/stroke profundos + glow
 * para que cada estado sea distinguible y "Libre" sea legible sin zoom.
 */
export default function MesaGridMobile({ mesas, onMesaClick, getResponsable, loading = false }) {
  const isDark = useIsDark();
  const safeMesas = Array.isArray(mesas) ? mesas : [];

  if (loading && safeMesas.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin opacity-70" />
        <p className="text-sm">Cargando mapa de mesas…</p>
      </div>
    );
  }

  if (safeMesas.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay mesas en esta zona</p>
      </div>
    );
  }

  const sorted = [...safeMesas].sort((a, b) =>
    ((a?.orden || 0) - (b?.orden || 0)) || ((a?.numero || 0) - (b?.numero || 0))
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {sorted.map(mesa => {
        const lightCfg = MESA_STATUS_CONFIG[mesa.estado] || MESA_STATUS_CONFIG.libre;
        const darkCfg = MESA_STATUS_DARK[mesa.estado] || MESA_STATUS_DARK.libre;
        const cfg = isDark
          ? { ...lightCfg, fill: darkCfg.fill, stroke: darkCfg.stroke, text: darkCfg.text, glow: darkCfg.glow }
          : { ...lightCfg, glow: null };

        const resp = typeof getResponsable === 'function' ? getResponsable(mesa) : null;
        const respColor = resp?.color || null;
        const respNombre = resp?.nombre || '';

        // Sombra y glow por estado en dark; skeuomorphism clásico en light.
        const baseShadow = isDark
          ? '0 1px 0 rgba(255,255,255,0.05) inset, 0 -2px 4px rgba(0,0,0,0.4) inset, 0 6px 14px rgba(0,0,0,0.45)'
          : '0 1px 0 rgba(255,255,255,0.6) inset, 0 -2px 4px rgba(0,0,0,0.08) inset, 0 4px 10px rgba(0,0,0,0.12)';
        const glowShadow = cfg.glow ? `, 0 0 18px ${cfg.glow}` : '';
        const respGlow = respColor ? `, 0 0 0 1.5px ${respColor}33, 0 0 12px ${respColor}44` : '';
        const finalShadow = `${baseShadow}${glowShadow}${respGlow}`;

        // Chip de estado: en dark un fondo más sólido y borde del color, no white/40.
        const chipBg = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
        const chipBorder = isDark ? cfg.stroke : 'transparent';
        const chipText = isDark ? cfg.text : cfg.text;

        return (
          <button key={mesa.id}
            onClick={() => onMesaClick(mesa)}
            className="rounded-2xl p-3 border-2 active:scale-95 transition-all flex flex-col items-center justify-center min-h-[110px] relative overflow-hidden"
            style={{
              background: isDark
                ? `linear-gradient(135deg, ${cfg.fill} 0%, ${shade(cfg.fill, -8)} 100%)`
                : `linear-gradient(135deg, ${cfg.fill} 0%, ${shade(cfg.fill, -10)} 100%)`,
              borderColor: cfg.stroke,
              color: cfg.text,
              boxShadow: finalShadow,
            }}>
            {/* Punto del color del mesero */}
            {respColor && (
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full"
                style={{
                  background: respColor,
                  boxShadow: `0 0 0 2px ${isDark ? '#0f172a' : '#ffffff'}, 0 0 6px ${respColor}aa`,
                }}
              />
            )}
            {/* 6A: emojis discretos para celebración y alergia */}
            {mesa?.celebracion_especial === true && (
              <span
                aria-hidden
                className="absolute top-1.5 left-1.5 text-base leading-none select-none"
                title={mesa?.tipo_celebracion || 'Celebración'}
              >
                🎉
              </span>
            )}
            {mesa?.notas_alergias && (
              <span
                aria-hidden
                className="absolute bottom-1.5 left-1.5 text-sm leading-none select-none"
                title={`Alergia: ${mesa.notas_alergias}`}
              >
                ⚠️
              </span>
            )}
            <span className="font-heading font-black text-2xl leading-none" style={{ color: cfg.text }}>
              {mesa.numero}
            </span>
            {mesa.nombre && (
              <span className="text-[10px] mt-0.5 opacity-80" style={{ color: cfg.text }}>
                {mesa.nombre}
              </span>
            )}
            <span
              className="text-[10px] font-bold mt-1.5 px-2 py-0.5 rounded-full border"
              style={{
                background: chipBg,
                borderColor: chipBorder,
                color: chipText,
                textShadow: isDark ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
              }}
            >
              {lightCfg.label}
            </span>
            {/* Comensales activos cuando la mesa está ocupada. Si no hay activos,
                muestra la capacidad de la mesa como referencia. */}
            {(() => {
              const personas = Number(mesa?.personas_actuales) || 0;
              const cap = Number(mesa?.capacidad) || 0;
              const valor = personas > 0 ? personas : cap;
              if (valor <= 0) return null;
              return (
                <span
                  className="text-[10px] font-semibold flex items-center gap-1 mt-1 opacity-90"
                  style={{ color: cfg.text }}
                >
                  <Users className="w-3 h-3" />
                  {personas > 0 ? `${personas} ${personas === 1 ? 'persona' : 'personas'}` : `${cap}`}
                </span>
              );
            })()}
            {respNombre && (
              // Badge del mesero — premium con highlight superior + textshadow
              // para que se lea claro sobre cualquier color.
              <span
                className="text-[10px] font-bold mt-1 px-2.5 py-0.5 rounded-full truncate max-w-[95%]"
                style={{
                  background: respColor || (isDark ? '#475569' : '#64748b'),
                  color: '#fff',
                  boxShadow: respColor
                    ? `0 1px 4px ${respColor}66, inset 0 1px 0 rgba(255,255,255,0.25)`
                    : 'inset 0 1px 0 rgba(255,255,255,0.25)',
                  textShadow: '0 1px 1px rgba(0,0,0,0.25)',
                }}
                title={respNombre}
              >
                {respNombre.replace(/^(Mesero:|Atiende:)\s*/i, '')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function shade(hex, percent) {
  if (!hex || !hex.startsWith('#')) return hex;
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0xff) + Math.round(255 * (percent / 100));
  let b = (num & 0xff) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
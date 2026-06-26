import React from 'react';
import { MESA_STATUS_CONFIG, TAMANOS_MESA } from '@/lib/constants';
import { MESA_STATUS_DARK } from '@/lib/darkPalettes';
import { useIsDark } from '@/lib/ThemeContext';
import { Users } from 'lucide-react';

export default function MesaShape({ mesa, onClick, draggable = false, onDragStart, selected = false, inline = false, responsableColor = null, responsableNombre = '' }) {
  const isDark = useIsDark();
  const lightCfg = MESA_STATUS_CONFIG[mesa.estado] || MESA_STATUS_CONFIG.libre;
  const darkOverride = isDark ? (MESA_STATUS_DARK[mesa.estado] || MESA_STATUS_DARK.libre) : null;
  // En dark usamos paleta oscura propia (fondo más profundo, texto claro);
  // en light dejamos exactamente como estaba.
  const cfg = isDark ? { ...lightCfg, ...darkOverride } : lightCfg;
  const forma = mesa.forma || 'redonda';
  const tamano = mesa.tamano || 'mediana';
  const dim = TAMANOS_MESA[tamano]?.[forma] || { w: 80, h: 80 };

  const isRound = forma === 'redonda';
  const borderRadius = isRound ? '50%' : forma === 'cuadrada' ? '12px' : '14px';
  const borderColor = cfg.stroke;
  const borderWidth = '2.5px';

  // Sombra skeuomorphism. En dark, el highlight superior es más sutil y la
  // sombra inferior más marcada para que la mesa "flote" sobre el fondo oscuro.
  // Glow del estado: halo de color que asegura que el estado se distinga en dark.
  const stateGlow = isDark && cfg.glow ? `, 0 0 18px ${cfg.glow}` : '';
  const skeuoShadow = isDark
    ? `0 1px 0 rgba(255,255,255,0.12) inset, 0 -2px 4px rgba(0,0,0,0.4) inset, 0 6px 16px rgba(0,0,0,0.55)${stateGlow}`
    : '0 1px 0 rgba(255,255,255,0.7) inset, 0 -2px 4px rgba(0,0,0,0.08) inset, 0 6px 14px rgba(0,0,0,0.18)';
  const aura = responsableColor
    ? `0 0 0 1.5px ${responsableColor}33, 0 0 14px ${responsableColor}${isDark ? '88' : '55'}, ${skeuoShadow}`
    : skeuoShadow;
  const finalShadow = selected
    ? `0 0 0 3px ${(responsableColor || borderColor)}66, 0 8px 20px rgba(0,0,0,${isDark ? '0.6' : '0.25'})${stateGlow}`
    : aura;

  // shade() en dark debe oscurecer LIGERAMENTE menos para no perder fondo.
  const bgGradient = isDark
    ? `linear-gradient(135deg, ${shade(cfg.fill, 6)} 0%, ${cfg.fill} 100%)`
    : `linear-gradient(135deg, ${cfg.fill} 0%, ${shade(cfg.fill, -8)} 100%)`;

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`${inline ? 'relative' : 'absolute'} cursor-pointer transition-transform hover:scale-105 active:scale-95 select-none`}
      style={{
        ...(inline ? {} : { left: mesa.posicion_x ?? 100, top: mesa.posicion_y ?? 100 }),
        width: dim.w,
        height: dim.h,
        background: bgGradient,
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius,
        boxShadow: finalShadow,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        color: cfg.text,
        // Reflejo premium sutil arriba (más visible en light, sutil en dark)
        backgroundImage: bgGradient + (isDark
          ? ', linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 30%)'
          : ', linear-gradient(to bottom, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 30%)'),
      }}
    >
      {responsableColor && (
        // Punto del color del mesero — más grande y notorio que antes
        // para que la asignación se vea de un vistazo incluso de lejos.
        <span
          aria-hidden
          className="absolute top-1 right-1 w-3 h-3 rounded-full"
          style={{
            background: responsableColor,
            boxShadow: `0 0 0 2px ${isDark ? '#0f172a' : '#ffffff'}, 0 0 8px ${responsableColor}cc`,
          }}
        />
      )}
      {/* 6A: emoji de celebración — destacado en esquina superior izquierda. */}
      {mesa?.celebracion_especial === true && (
        <span
          aria-hidden
          className="absolute leading-none select-none"
          title={mesa?.tipo_celebracion || 'Celebración'}
          style={{
            top: 2,
            left: 2,
            fontSize: dim.w < 75 ? 12 : 14,
            zIndex: 2,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
        >
          🎉
        </span>
      )}
      {/* 6A: indicador de alergia — abajo izquierda, visible. */}
      {mesa?.notas_alergias && (
        <span
          aria-hidden
          className="absolute leading-none select-none"
          title={`Alergia: ${mesa.notas_alergias}`}
          style={{
            bottom: 2,
            left: 2,
            fontSize: dim.w < 75 ? 11 : 13,
            zIndex: 2,
            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
          }}
        >
          ⚠️
        </span>
      )}
      <span className="font-heading font-bold text-base leading-none">
        {mesa.numero}
      </span>
      <span
        className="font-semibold leading-tight text-center px-1 mt-1"
        style={{ fontSize: dim.w < 75 ? 8 : 9, maxWidth: dim.w - 8 }}
      >
        {cfg.label}
      </span>
      {/* Mesero + Personas actuales — visibles juntos cuando aplican.
          Si hay mesero, se fusionan en un solo badge ("Carlos · 4 pers.") para
          no saturar; mesas chicas usan formato corto ("Carlos · 4").
          Si NO hay mesero pero sí hay personas/capacidad, se muestra el
          contador suelto. Sin mesero y sin personas → nada. */}
      {(() => {
        const personas = Number(mesa?.personas_actuales) || 0;
        const cap = Number(mesa?.capacidad) || 0;
        const personasValor = personas > 0 ? personas : 0;
        const small = dim.w < 80;
        const mostrarCapSuelta = cap > 0 && dim.w >= 75;

        // CASO 1 — Hay mesero asignado → badge fusionado
        if (responsableNombre) {
          const nombreCorto = small
            ? (responsableNombre.replace(/^(Mesero:|Atiende:)\s*/i, '').split(' ')[0] || responsableNombre)
            : responsableNombre.replace(/^(Mesero:|Atiende:)\s*/i, '');
          // Sufijo de personas: en mesas chicas solo el número, en grandes "4 pers."
          const sufijo = personasValor > 0
            ? (small ? ` · ${personasValor}` : ` · ${personasValor} pers.`)
            : '';
          return (
            <span
              className="font-bold mt-1 px-2 py-0.5 rounded-full truncate"
              style={{
                fontSize: small ? 8 : 9,
                background: responsableColor || (isDark ? '#475569' : '#64748b'),
                color: '#fff',
                maxWidth: dim.w - 8,
                boxShadow: responsableColor
                  ? `0 1px 4px ${responsableColor}66, inset 0 1px 0 rgba(255,255,255,0.2)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.2)',
                textShadow: '0 1px 1px rgba(0,0,0,0.25)',
              }}
              title={`${responsableNombre}${personasValor > 0 ? ` — ${personasValor} personas` : ''}`}
            >
              {nombreCorto}{sufijo}
            </span>
          );
        }

        // CASO 2 — Sin mesero, mostrar personas/capacidad sueltas si aplica
        const valor = personasValor > 0 ? personasValor : (mostrarCapSuelta ? cap : 0);
        if (valor <= 0 || dim.w < 75) return null;
        return (
          <span className="text-[8px] flex items-center gap-0.5 mt-0.5 opacity-70">
            <Users className="w-2 h-2" />{valor}{personasValor > 0 ? ' pers.' : ''}
          </span>
        );
      })()}
    </div>
  );
}

// Shade a hex color by percent (negative = darker)
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
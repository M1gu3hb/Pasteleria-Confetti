import React from 'react';
import { useConfig } from '@/lib/ConfigContext';

/**
 * Fondo visual del sistema.
 *
 * Reglas:
 * - Si existe `background_image_url`: se aplica como fondo REAL (fixed, cover/contain).
 * - Si NO existe pero existe `background_logo_url` distinto del logo del negocio:
 *   se aplica también como fondo (compatibilidad con datos previos).
 * - Si solo hay logo de negocio: NO se muestra como fondo (evita el bug del
 *   "rectángulo en medio" que era en realidad el logo del negocio).
 *
 * Usa SIEMPRE background-image sobre un div fijo a pantalla completa.
 * Nunca un <img> centrado (causa visual de "logo flotando").
 */
export default function BrandedBackground() {
  const { config } = useConfig();
  const fondo = config?.background_image_url || config?.background_logo_url || '';
  const opacity = clampOpacity(config?.background_opacity);
  const fitMode = config?.background_fit === 'contain' ? 'contain' : 'cover';

  // Si no hay fondo configurado, solo dejamos el degradado base (sin logo flotante).
  return (
    <div aria-hidden="true" className="no-print fixed inset-0 pointer-events-none overflow-hidden -z-0">
      {/* Base sutil — usa tokens para que el degradado funcione en claro y oscuro */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-accent/30 dark:to-accent/10" />

      {fondo && (
        <div
          className="absolute inset-0 brand-watermark"
          style={{
            backgroundImage: `url("${fondo}")`,
            backgroundSize: fitMode,
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
            opacity,
            // Evita que el navegador intente hacer scroll del fondo en móviles
            backgroundAttachment: 'scroll',
          }}
        />
      )}
    </div>
  );
}

function clampOpacity(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return 0.12;
  return Math.max(0, Math.min(1, n));
}

/** Glass panel reutilizable. */
export function GlassPanel({ className = '', children, ...rest }) {
  return (
    <div
      {...rest}
      className={`bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}
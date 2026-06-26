/**
 * brandColors.js
 * ---------------
 * Utilidades para personalización de marca por restaurante.
 *
 * Toma color_primario y color_acento (hex) de la configuración y deriva
 * tonos light/dark/glow para que el sistema pueda pintar degradados y
 * efectos premium sin quedar plano.
 *
 * NO toca colores semánticos (rojo=error, verde=éxito, ámbar=warn). Esos
 * siguen viviendo en CSS vars de tema (--destructive, --success, etc.).
 *
 * Defaults (paleta MH azul premium):
 *   primario:  #1e40af
 *   acento:    #38bdf8
 */

export const BRAND_DEFAULTS = {
  color_primario: '#1e40af',
  color_acento: '#38bdf8',
  color_secundario: '#0f172a', // legacy, no se expone en UI
};

/** Hex `#rrggbb` (o `#rgb`) → `{r,g,b}`. Tolera basura → null. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** `{r,g,b}` → `#rrggbb`. */
export function rgbToHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** `rgba(r,g,b,a)` con clamp. */
export function rgba({ r, g, b }, a = 1) {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${r|0}, ${g|0}, ${b|0}, ${aa})`;
}

/**
 * Mezcla un color con negro (factor 0..1 = qué tanto oscurecer).
 *   shade(color, 0)   = color
 *   shade(color, 0.5) = mitad más oscuro
 *   shade(color, 1)   = negro
 */
export function darken(rgb, factor) {
  if (!rgb) return rgb;
  const f = Math.max(0, Math.min(1, factor));
  return {
    r: rgb.r * (1 - f),
    g: rgb.g * (1 - f),
    b: rgb.b * (1 - f),
  };
}

/** Mezcla con blanco para aclarar. */
export function lighten(rgb, factor) {
  if (!rgb) return rgb;
  const f = Math.max(0, Math.min(1, factor));
  return {
    r: rgb.r + (255 - rgb.r) * f,
    g: rgb.g + (255 - rgb.g) * f,
    b: rgb.b + (255 - rgb.b) * f,
  };
}

/**
 * Genera la paleta completa derivada de los dos colores configurables.
 * Devuelve un objeto con CSS vars listas para inyectar.
 *
 *   --brand-primary           : color primario base (hex)
 *   --brand-primary-rgb       : "r, g, b"  (para usar con / alpha en Tailwind)
 *   --brand-primary-dark      : versión 25% más oscura
 *   --brand-primary-light     : versión 30% más clara
 *   --brand-primary-glow      : rgba para halos / blurs
 *   --brand-primary-soft      : rgba ~15% para fondos suaves
 *   --brand-accent            : color acento base
 *   --brand-accent-rgb        : "r, g, b"
 *   --brand-accent-dark
 *   --brand-accent-light
 *   --brand-accent-glow
 *   --brand-accent-soft
 *
 * Si los hex son inválidos, cae a defaults. Nunca regresa null.
 */
export function buildBrandPalette(colorPrimario, colorAcento) {
  const pHex = (typeof colorPrimario === 'string' && colorPrimario.trim()) || BRAND_DEFAULTS.color_primario;
  const aHex = (typeof colorAcento === 'string' && colorAcento.trim()) || BRAND_DEFAULTS.color_acento;

  const pRgb = hexToRgb(pHex) || hexToRgb(BRAND_DEFAULTS.color_primario);
  const aRgb = hexToRgb(aHex) || hexToRgb(BRAND_DEFAULTS.color_acento);

  const pDark = darken(pRgb, 0.25);
  const pLight = lighten(pRgb, 0.30);
  const aDark = darken(aRgb, 0.25);
  const aLight = lighten(aRgb, 0.30);

  return {
    '--brand-primary': rgbToHex(pRgb),
    '--brand-primary-rgb': `${pRgb.r}, ${pRgb.g}, ${pRgb.b}`,
    '--brand-primary-dark': rgbToHex(pDark),
    '--brand-primary-light': rgbToHex(pLight),
    '--brand-primary-glow': rgba(pRgb, 0.45),
    '--brand-primary-soft': rgba(pRgb, 0.15),
    '--brand-primary-bg':   rgba(pRgb, 0.08),

    '--brand-accent': rgbToHex(aRgb),
    '--brand-accent-rgb': `${aRgb.r}, ${aRgb.g}, ${aRgb.b}`,
    '--brand-accent-dark': rgbToHex(aDark),
    '--brand-accent-light': rgbToHex(aLight),
    '--brand-accent-glow': rgba(aRgb, 0.45),
    '--brand-accent-soft': rgba(aRgb, 0.18),
    '--brand-accent-bg':   rgba(aRgb, 0.10),
  };
}

/**
 * Aplica una paleta como CSS vars al elemento (default: <html>).
 * Idempotente: re-llamarla sobrescribe los valores anteriores.
 */
export function applyBrandPalette(palette, el) {
  try {
    const target = el || document.documentElement;
    if (!target || !palette) return;
    Object.entries(palette).forEach(([k, v]) => {
      target.style.setProperty(k, v);
    });
  } catch {
    /* no-op */
  }
}
/**
 * Helper centralizado para colores de importes monetarios.
 * Si config.colorear_importes_monetarios === false, devolvemos clase neutra (negro/blanco).
 * No afecta colores de estados funcionales (libre/ocupado/pendiente, etc).
 */
const NEUTRAL_CLASS = 'text-foreground';

/**
 * @param {object} config - configuración del negocio
 * @param {string} colorClass - clase Tailwind original (ej. "text-emerald-600")
 * @returns clase Tailwind apropiada
 */
export function getMoneyTextClass(config, colorClass) {
  if (config?.colorear_importes_monetarios === false) {
    return NEUTRAL_CLASS;
  }
  return colorClass || NEUTRAL_CLASS;
}

/** Helper para fondos coloreados de importes (cards de dinero) */
export function getMoneyBgClass(config, bgClass, neutralBg = 'bg-muted/40 border-border') {
  if (config?.colorear_importes_monetarios === false) {
    return neutralBg;
  }
  return bgClass || neutralBg;
}
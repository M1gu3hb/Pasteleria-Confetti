/**
 * darkPalettes.js — Paletas dark-mode para componentes skeuomorphic.
 *
 * IMPORTANTE: Esto SOLO devuelve estilos. NO altera ningún flujo,
 * estado, ni lógica de negocio.
 *
 * Se usa en componentes que pintan con estilos inline (colores hex
 * hardcoded) — Tailwind no puede adaptarlos automáticamente al
 * dark mode. Cada paleta tiene su versión light y dark para que
 * el componente elija con `useIsDark()`.
 */

// ============================================================
// Cards de KPI (ColoredStatCard)
// ============================================================
export const STATCARD_PALETTES = {
  light: {
    primary: { from: '#fff5f3', to: '#ffe5e0', border: '#fecaca', label: '#7f1d1d', value: '#991b1b', iconBg: '#fee2e2', iconColor: '#b91c1c', shadow: 'rgba(185,28,28,0.10)' },
    green:   { from: '#f0fdf4', to: '#dcfce7', border: '#bbf7d0', label: '#166534', value: '#15803d', iconBg: '#dcfce7', iconColor: '#16a34a', shadow: 'rgba(22,163,74,0.10)' },
    blue:    { from: '#eff6ff', to: '#dbeafe', border: '#bfdbfe', label: '#1e40af', value: '#1d4ed8', iconBg: '#dbeafe', iconColor: '#2563eb', shadow: 'rgba(37,99,235,0.10)' },
    amber:   { from: '#fffbeb', to: '#fef3c7', border: '#fde68a', label: '#92400e', value: '#b45309', iconBg: '#fef3c7', iconColor: '#d97706', shadow: 'rgba(217,119,6,0.10)' },
    purple:  { from: '#faf5ff', to: '#ede9fe', border: '#ddd6fe', label: '#5b21b6', value: '#6d28d9', iconBg: '#ede9fe', iconColor: '#7c3aed', shadow: 'rgba(124,58,237,0.10)' },
    rose:    { from: '#fff1f2', to: '#ffe4e6', border: '#fecdd3', label: '#9f1239', value: '#be123c', iconBg: '#ffe4e6', iconColor: '#e11d48', shadow: 'rgba(225,29,72,0.10)' },
    cyan:    { from: '#ecfeff', to: '#cffafe', border: '#a5f3fc', label: '#155e75', value: '#0e7490', iconBg: '#cffafe', iconColor: '#0891b2', shadow: 'rgba(8,145,178,0.10)' },
    slate:   { from: '#f8fafc', to: '#f1f5f9', border: '#e2e8f0', label: '#475569', value: '#0f172a', iconBg: '#e2e8f0', iconColor: '#475569', shadow: 'rgba(15,23,42,0.06)' },
  },
  // Dark: fondo realmente oscuro con un tinte del color de identidad,
  // bordes visibles, labels y values brillantes y legibles.
  dark: {
    primary: { from: '#1f0f10', to: '#2a1316', border: '#7f1d1d', label: '#fca5a5', value: '#fecaca', iconBg: '#3a1a1d', iconColor: '#fca5a5', shadow: 'rgba(185,28,28,0.35)' },
    green:   { from: '#0a1a12', to: '#0f2a1b', border: '#166534', label: '#86efac', value: '#bbf7d0', iconBg: '#14361f', iconColor: '#86efac', shadow: 'rgba(22,163,74,0.35)' },
    blue:    { from: '#0b1424', to: '#0f1e35', border: '#1e3a8a', label: '#93c5fd', value: '#dbeafe', iconBg: '#162648', iconColor: '#93c5fd', shadow: 'rgba(37,99,235,0.35)' },
    amber:   { from: '#1c1308', to: '#2b1d0a', border: '#92400e', label: '#fcd34d', value: '#fde68a', iconBg: '#3a2710', iconColor: '#fbbf24', shadow: 'rgba(217,119,6,0.35)' },
    purple:  { from: '#170f24', to: '#221537', border: '#6d28d9', label: '#c4b5fd', value: '#ddd6fe', iconBg: '#2d1d4a', iconColor: '#c4b5fd', shadow: 'rgba(124,58,237,0.35)' },
    rose:    { from: '#1f0d12', to: '#2c1019', border: '#9f1239', label: '#fda4af', value: '#fecdd3', iconBg: '#3b1422', iconColor: '#fda4af', shadow: 'rgba(225,29,72,0.35)' },
    cyan:    { from: '#082026', to: '#0c2e36', border: '#155e75', label: '#67e8f9', value: '#a5f3fc', iconBg: '#0f3f4a', iconColor: '#67e8f9', shadow: 'rgba(8,145,178,0.35)' },
    slate:   { from: '#0f172a', to: '#1e293b', border: '#334155', label: '#cbd5e1', value: '#f1f5f9', iconBg: '#1e293b', iconColor: '#cbd5e1', shadow: 'rgba(15,23,42,0.40)' },
  },
};

// ============================================================
// Métodos de pago (PaymentCard del Dashboard)
// ============================================================
export const PAYMENT_PALETTES = {
  light: {
    // El componente actual usa `color` (hex) + degradado a blanco.
    // En light no cambia nada — esta paleta es solo para dark.
  },
  dark: {
    // tinte=color, base=fondo card oscuro
    base: '#0f172a',
    surface: '#1a2333',
  },
};

// ============================================================
// MesaShape — estados de mesa
// (constants.MESA_STATUS_CONFIG no toca; aquí mapeamos overrides para dark)
// Más contraste/glow por estado, sin volverse infantil.
// `glow` opcional: rgba para halo del estado.
// ============================================================
export const MESA_STATUS_DARK = {
  libre:              { fill: '#4a4225', stroke: '#d4a936', text: '#fde68a', glow: 'rgba(212,169,54,0.35)' },
  esperando_orden:    { fill: '#1f4a30', stroke: '#22c55e', text: '#bbf7d0', glow: 'rgba(34,197,94,0.40)' },
  pedido_enviado:     { fill: '#1a3470', stroke: '#60a5fa', text: '#ffffff', glow: 'rgba(96,165,250,0.45)' },
  en_preparacion:     { fill: '#4d2a12', stroke: '#fb923c', text: '#ffffff', glow: 'rgba(251,146,60,0.50)' },
  en_espera_entrega:  { fill: '#0f4a2c', stroke: '#22c55e', text: '#ffffff', glow: 'rgba(34,197,94,0.45)' },
  ocupada:            { fill: '#4a1922', stroke: '#f43f5e', text: '#ffffff', glow: 'rgba(244,63,94,0.50)' },
  cuenta_solicitada:  { fill: '#3a235a', stroke: '#c084fc', text: '#ffffff', glow: 'rgba(192,132,252,0.50)' },
  limpieza:           { fill: '#3a2917', stroke: '#c9844c', text: '#ffffff', glow: 'rgba(201,132,76,0.40)' },
  pagada:             { fill: '#2e2e2e', stroke: '#9ca3af', text: '#e5e5e5', glow: 'rgba(156,163,175,0.25)' },
  cancelada:          { fill: '#3a1218', stroke: '#9b2c36', text: '#ffffff', glow: 'rgba(155,44,54,0.35)' },
};

// ============================================================
// Cocina — columnas Nuevos / En preparación / Listos
// ============================================================
export const COCINA_COLS = {
  light: {
    nuevo:          { bg: '#D6E4F5', border: '#3B82C7', text: '#1E4A82' },
    en_preparacion: { bg: '#FFE4CC', border: '#E68A33', text: '#8C4A14' },
    listo:          { bg: '#D6F5DC', border: '#16A34A', text: '#166534' },
  },
  dark: {
    nuevo:          { bg: '#0c1a2e', border: '#3B82F6', text: '#bfdbfe' },
    en_preparacion: { bg: '#2a1607', border: '#E68A33', text: '#fed7aa' },
    listo:          { bg: '#0a2316', border: '#16A34A', text: '#bbf7d0' },
  },
};

// ============================================================
// Floor (mapa de mesas) — fondo "madera"
// ============================================================
export const FLOOR_BG = {
  light: {
    bg: 'linear-gradient(135deg, #F4EAD5 0%, #E8DCC0 100%)',
    border: '#C9B68A',
    dotPattern: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)',
  },
  dark: {
    bg: 'linear-gradient(135deg, #1a1408 0%, #0e0a04 100%)',
    border: '#3a2e16',
    dotPattern: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
  },
};

// ============================================================
// Productos — placeholder cuando no hay imagen
// ============================================================
export const PRODUCT_PLACEHOLDER_BG = {
  light: 'linear-gradient(135deg, #F4EAD5 0%, #E8DCC0 100%)',
  dark:  'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
};

// ============================================================
// Estados de stock (StockStatusBadge) — clases tailwind
// ============================================================
export const STOCK_BADGE_DARK_CLASSES = {
  suficiente: 'dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  medio:      'dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-800',
  bajo:       'dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  critico:    'dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  agotado:    'dark:bg-red-900/70 dark:text-red-200 dark:border-red-700',
};

export const PREP_BADGE_DARK_CLASSES = {
  nuevo:          'dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  en_preparacion: 'dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  listo:          'dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  entregado:      'dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  cancelado:      'dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
};

export const MESA_BADGE_DARK_CLASSES = {
  libre:              'dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  esperando_orden:    'dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
  pedido_enviado:     'dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900',
  en_preparacion:     'dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900',
  en_espera_entrega:  'dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900',
  ocupada:            'dark:bg-red-950/60 dark:text-red-300 dark:border-red-900',
  cuenta_solicitada:  'dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900',
  limpieza:           'dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900',
  pagada:             'dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  cancelada:          'dark:bg-red-900/70 dark:text-red-200 dark:border-red-800',
};

// ============================================================
// Margen (MARGIN_CONFIG) — bg cards en Productos
// ============================================================
export const MARGIN_DARK_BG = {
  high:   'dark:bg-emerald-950/40',
  medium: 'dark:bg-yellow-950/40',
  low:    'dark:bg-red-950/40',
};
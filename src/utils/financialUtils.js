import { MARGIN_THRESHOLDS } from '@/lib/constants';

/**
 * Calculate gross profit
 */
export function calculateGrossProfit(revenue, cost) {
  return (revenue || 0) - (cost || 0);
}

/**
 * Calculate gross margin percentage
 */
export function calculateMargin(revenue, cost) {
  if (!revenue || revenue === 0) return 0;
  return ((revenue - cost) / revenue) * 100;
}

/**
 * Get margin level (high, medium, low)
 */
export function getMarginLevel(margin) {
  if (margin >= MARGIN_THRESHOLDS.high) return 'high';
  if (margin >= MARGIN_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Format currency
 */
export function formatCurrency(amount, symbol = '$') {
  if (amount === null || amount === undefined) return `${symbol}0.00`;
  return `${symbol}${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format percentage
 */
export function formatPercent(value) {
  if (value === null || value === undefined) return '0.0%';
  return `${Number(value).toFixed(1)}%`;
}

/**
 * Calculate recipe cost from lines
 */
export function calculateRecipeCost(recipeLines) {
  if (!recipeLines || recipeLines.length === 0) return 0;
  return recipeLines.reduce((sum, line) => {
    if (!line.activo && line.activo !== undefined) return sum;
    const mermaFactor = 1 + ((line.merma_porcentaje || 0) / 100);
    const effectiveQty = (line.cantidad_convertida_unidad_base || 0) * mermaFactor;
    return sum + (effectiveQty * (line.costo_unitario_base_snapshot || 0));
  }, 0);
}

/**
 * Generate folio
 */
export function generateFolio(prefix = 'V') {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}
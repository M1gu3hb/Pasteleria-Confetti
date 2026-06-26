import { UNIT_CONVERSIONS } from '@/lib/constants';

/**
 * Convert purchase units to base units
 * @param {number} qty - Quantity in purchase units
 * @param {string} purchaseUnit - Purchase unit (kg, litro, caja, etc.)
 * @param {number} piecesPerPackage - For caja/paquete/bolsa, how many base pieces
 * @returns {number} Quantity in base units
 */
export function convertToBaseUnits(qty, purchaseUnit, piecesPerPackage = 1) {
  const conv = UNIT_CONVERSIONS[purchaseUnit];
  if (!conv) return qty;
  
  if (['caja', 'paquete', 'bolsa'].includes(purchaseUnit)) {
    return qty * (piecesPerPackage || 1);
  }
  
  return qty * conv.factor;
}

/**
 * Calculate cost per base unit
 */
export function calculateCostPerBaseUnit(totalCost, qtyInBaseUnits) {
  if (!qtyInBaseUnits || qtyInBaseUnits === 0) return 0;
  return totalCost / qtyInBaseUnits;
}

/**
 * Weighted average cost calculation
 */
export function calculateWeightedAvgCost(currentStock, currentCost, newQty, newCost) {
  if (currentStock + newQty === 0) return newCost;
  if (currentStock <= 0) return calculateCostPerBaseUnit(newCost * newQty, newQty) || 0;
  
  const totalValue = (currentStock * currentCost) + (newQty * (newCost / newQty * newQty));
  // Corrected: use the cost per unit for the new batch
  const newCostPerUnit = newCost / newQty;
  const weightedAvg = ((currentStock * currentCost) + (newQty * newCostPerUnit)) / (currentStock + newQty);
  return weightedAvg;
}

/**
 * Format unit label
 */
export function formatUnit(unit, qty = 1) {
  const labels = { g: 'g', ml: 'ml', pieza: qty === 1 ? 'pza' : 'pzas', kg: 'kg', litro: qty === 1 ? 'lt' : 'lts' };
  return labels[unit] || unit;
}
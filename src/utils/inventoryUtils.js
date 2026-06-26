import { STOCK_STATUS } from '@/lib/constants';

/**
 * Get stock status for an ingredient
 */
export function getStockStatus(ingredient) {
  const { stock_actual = 0, stock_minimo = 0, stock_critico = 0 } = ingredient;
  
  if (stock_actual <= 0) return STOCK_STATUS.OUT;
  if (stock_critico > 0 && stock_actual <= stock_critico) return STOCK_STATUS.CRITICAL;
  if (stock_minimo > 0 && stock_actual <= stock_minimo) return STOCK_STATUS.LOW;
  if (stock_minimo > 0 && stock_actual <= stock_minimo * 1.5) return STOCK_STATUS.MEDIUM;
  return STOCK_STATUS.SUFFICIENT;
}

/**
 * Calculate inventory value for an ingredient
 */
export function calculateInventoryValue(ingredient) {
  return (ingredient.stock_actual || 0) * (ingredient.costo_por_unidad_base || 0);
}

/**
 * Check if there's enough stock for a recipe
 */
export function checkStockForProduct(recipeLines, ingredients, quantity = 1) {
  const issues = [];
  
  for (const line of recipeLines) {
    if (!line.activo && line.activo !== undefined) continue;
    const ingredient = ingredients.find(i => i.id === line.ingrediente_id);
    if (!ingredient) {
      issues.push({ ingrediente_nombre: line.ingrediente_nombre, faltante: line.cantidad_convertida_unidad_base * quantity, disponible: 0 });
      continue;
    }
    
    const mermaFactor = 1 + ((line.merma_porcentaje || 0) / 100);
    const needed = (line.cantidad_convertida_unidad_base || 0) * mermaFactor * quantity;
    
    if (ingredient.stock_actual < needed) {
      issues.push({
        ingrediente_nombre: ingredient.nombre,
        unidad_base: ingredient.unidad_base,
        faltante: needed - ingredient.stock_actual,
        disponible: ingredient.stock_actual,
        necesario: needed,
      });
    }
  }
  
  return { sufficient: issues.length === 0, issues };
}

/**
 * Estimate how many products can be made with current stock
 */
export function estimateProductCapacity(recipeLines, ingredients) {
  if (!recipeLines || recipeLines.length === 0) return Infinity;
  
  let minCapacity = Infinity;
  
  for (const line of recipeLines) {
    if (!line.activo && line.activo !== undefined) continue;
    const ingredient = ingredients.find(i => i.id === line.ingrediente_id);
    if (!ingredient) return 0;
    
    const mermaFactor = 1 + ((line.merma_porcentaje || 0) / 100);
    const perUnit = (line.cantidad_convertida_unidad_base || 0) * mermaFactor;
    
    if (perUnit > 0) {
      const capacity = Math.floor(ingredient.stock_actual / perUnit);
      minCapacity = Math.min(minCapacity, capacity);
    }
  }
  
  return minCapacity === Infinity ? 0 : minCapacity;
}
// Historical expense imports cannot bypass a cut or rewrite a closed cut.
// Inventory/recipes/providers have no backing tables in Confetti's package.
export const importacionDisponible = tipo => tipo === 'productos';

export function exigirImportacionDisponible(tipo) {
  if (!importacionDisponible(tipo)) {
    throw new Error('Esta importación no está disponible. Los gastos se registran desde la caja de la sucursal.');
  }
}

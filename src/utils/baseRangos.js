// Importe de base por rangos de kilos (CAMBIOS_V2 · Fase 02).
// La "base" deja de ser un extra opcional: es un cargo OBLIGATORIO cuyo precio
// depende del rango de kilos del pastel. Abel configura los rangos en
// Configuración → Pasteles (campo `base_rangos`, JSON string de
// [{ min_kg, max_kg, precio }]). POS y web comparten esta misma lógica.

// Normaliza `base_rangos` (string JSON o array) a array de rangos válidos.
export function parseBaseRangos(value) {
  let arr = value;
  if (typeof value === 'string') {
    try { arr = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => ({
      min_kg: Number(r?.min_kg) || 0,
      max_kg: Number(r?.max_kg) || 0,
      precio: Number(r?.precio) || 0,
    }))
    .filter((r) => r.max_kg >= r.min_kg);
}

// Devuelve el importe de base para unos kilos dados.
// Reglas (documentadas): se toma el rango cuyo [min,max] contiene los kilos.
// Si los kilos exceden el último rango → se usa el último. Si son menores que
// el primero → se usa el primero (el más cercano). Sin rangos o kilos<=0 → 0
// (degradación segura: "a confirmar").
export function calcularImporteBase(kilos, base_rangos) {
  const k = Number(kilos) || 0;
  const rangos = parseBaseRangos(base_rangos);
  if (k <= 0 || rangos.length === 0) return 0;
  const ord = [...rangos].sort((a, b) => a.min_kg - b.min_kg);
  for (const r of ord) {
    if (k >= r.min_kg && k <= r.max_kg) return r.precio;
  }
  const primero = ord[0];
  const ultimo = ord[ord.length - 1];
  if (k < primero.min_kg) return primero.precio;
  if (k > ultimo.max_kg) return ultimo.precio;
  return 0;
}

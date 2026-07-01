// Importe de base por rangos de kilos (CAMBIOS_V2 · Fase 02 + FIX 2).
// La "base" es un cargo cuyo precio depende del rango de kilos. Abel configura
// los rangos en Configuración → Pasteles (campo `base_rangos`, JSON string de
// [{ min_kg, max_kg, precio }]; el precio puede ser 0). POS y web comparten esta
// lógica.

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

// Kilo máximo configurado (tope del rango más alto). 0 si no hay rangos.
// Se usa para la leyenda "los pasteles de más de N kg se cotizan aparte".
export function rangoMaximoKg(base_rangos) {
  return parseBaseRangos(base_rangos).reduce((m, r) => Math.max(m, r.max_kg), 0);
}

// Devuelve { importe, cotizaAparte } para unos kilos dados (FIX 2):
//  - kilos DENTRO de un rango  → { importe: precioDelRango, cotizaAparte:false }
//    (el precio puede ser 0 → no se cobra base, sin línea).
//  - kilos ARRIBA del max más alto → { importe:0, cotizaAparte:true }
//    ("se cotiza aparte": NO se cobra base automática; el total queda a consultar).
//  - kilos bajo el min más chico o en un HUECO entre rangos → { importe:0, cotizaAparte:false }
//    (sin base).
//  - sin rangos o kilos<=0 → { importe:0, cotizaAparte:false }.
export function calcularImporteBase(kilos, base_rangos) {
  const k = Number(kilos) || 0;
  const rangos = parseBaseRangos(base_rangos);
  if (k <= 0 || rangos.length === 0) return { importe: 0, cotizaAparte: false };
  const ord = [...rangos].sort((a, b) => a.min_kg - b.min_kg);
  for (const r of ord) {
    if (k >= r.min_kg && k <= r.max_kg) return { importe: r.precio, cotizaAparte: false };
  }
  const ultimo = ord[ord.length - 1];
  if (k > ultimo.max_kg) return { importe: 0, cotizaAparte: true };
  // Bajo el primer rango o en un hueco entre rangos: sin base automática.
  return { importe: 0, cotizaAparte: false };
}

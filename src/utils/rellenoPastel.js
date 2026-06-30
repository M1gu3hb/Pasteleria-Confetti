// Rellenos con tipo (CAMBIOS_V2 · Fase 03).
// Dos tipos de relleno:
//   - 'plano'       → suma un extra fijo (monto) al total (como hoy).
//   - 'precio_kilo' → cambia el precio POR KILO del pastel (monto = precio/kilo final).
//
// RETRO-COMPAT: los rellenos viejos solo traían `precio_kilo` (mal nombrado: era
// un monto plano). Se normalizan a { tipo:'plano', monto: precio_kilo }.
//
// Para no romper el front EN VIVO (que lee `precio_kilo` como monto plano), al
// GUARDAR la config se conserva el espejo `precio_kilo` = (plano? monto : 0).

export function normalizarRelleno(r) {
  if (!r) return null;
  const tipo = r.tipo === 'precio_kilo' ? 'precio_kilo' : 'plano';
  const monto = (r.monto != null && r.monto !== '')
    ? Number(r.monto) || 0
    : Number(r.precio_kilo) || 0; // legacy: precio_kilo era el monto plano
  return { id: r.id, nombre: r.nombre, activo: r.activo === true, tipo, monto };
}

// Forma de guardado: incluye el espejo legacy `precio_kilo` para el front en vivo.
export function serializarRelleno(r) {
  const n = normalizarRelleno(r);
  return {
    id: n.id,
    nombre: n.nombre,
    activo: n.activo,
    tipo: n.tipo,
    monto: n.monto,
    precio_kilo: n.tipo === 'plano' ? n.monto : 0,
  };
}

// 6A — Helper para bloquear cierre/corte de caja si quedan mesas pendientes.
//
// Regla: NO se puede cerrar caja (cierre_diario) si alguna mesa tiene estado
// distinto a "libre" o tiene venta_activa_id. Tampoco se permite si la mesa
// está en "limpieza" (debe quedar libre antes del cierre).
//
// Devuelve un array de mesas pendientes (Activo:true), ordenado por número.
// No hace ninguna escritura. Solo lectura.

import { base44 } from '@/api/base44Client';

const ESTADOS_NO_BLOQ = new Set(['libre']);

export async function obtenerMesasPendientesCierre() {
  let mesas = [];
  try {
    mesas = await base44.entities.Mesa.filter({ activo: true });
  } catch (e) {
    console.warn('[obtenerMesasPendientesCierre] error leyendo mesas:', e);
    return [];
  }
  const arr = Array.isArray(mesas) ? mesas : [];
  const pendientes = arr.filter((m) => {
    if (!m) return false;
    const estado = m.estado || 'libre';
    const tieneVenta = !!m.venta_activa_id;
    // Bloquea si NO es "libre" o si tiene venta activa.
    return !ESTADOS_NO_BLOQ.has(estado) || tieneVenta;
  });
  // Orden por número ascendente para mostrar bonito en UI.
  return pendientes.sort((a, b) => (Number(a?.numero) || 0) - (Number(b?.numero) || 0));
}
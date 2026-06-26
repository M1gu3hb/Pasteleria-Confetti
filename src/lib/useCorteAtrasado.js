import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTerminal } from '@/lib/TerminalContext';

/**
 * PARTE F — Detección de corte ATRASADO por sucursal.
 *
 * Regla de negocio: si la sucursal activa tiene un CorteCaja en estado
 * 'abierto' cuya fecha_apertura es de un DÍA CALENDARIO ANTERIOR a HOY
 * (en zona horaria de México), NO se puede operar (vender / abrir caja)
 * hasta cerrar ese corte.
 *
 * - Es POR SUCURSAL: solo mira cortes de la sucursal efectiva.
 * - "Hoy" = día calendario en America/Mexico_City (UTC-6, sin DST desde 2023).
 * - Si el corte abierto es de HOY mismo → NO bloquea.
 * - NO cierra nada automáticamente: solo detecta y devuelve el corte.
 */

// Inicio del día (00:00) de México para una fecha dada, devuelto como
// timestamp UTC comparable. México = UTC-6 fijo (sin horario de verano).
export function obtenerInicioDiaMexico(date = new Date()) {
  const MX_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC-6
  // Desplazamos a "hora México", tomamos su fecha YYYY-MM-DD y la
  // reconvertimos al instante UTC que corresponde a las 00:00 México.
  const enMx = new Date(date.getTime() - MX_OFFSET_MS);
  const y = enMx.getUTCFullYear();
  const m = enMx.getUTCMonth();
  const d = enMx.getUTCDate();
  // 00:00 México = 06:00 UTC de ese mismo día calendario.
  return new Date(Date.UTC(y, m, d, 0, 0, 0)).getTime() + MX_OFFSET_MS;
}

export function useCorteAtrasado() {
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalEfectiva?.sucursal_id || null;

  // Reusa exactamente la queryKey de useCajaAbierta → mismo caché, sin fetch extra.
  const { data: cortes } = useQuery({
    queryKey: ['cortes_caja_estado', sucId],
    queryFn: () => base44.entities.CorteCaja.list('-created_date', 50),
    refetchInterval: 8000,
    staleTime: 4000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    enabled: !!sucId,
  });

  const safeCortes = Array.isArray(cortes) ? cortes : [];
  const inicioHoyMX = obtenerInicioDiaMexico(new Date());

  const corteAtrasado = sucId
    ? (safeCortes.find(c => {
        if (!c || c.sucursal_id !== sucId) return false;
        if (c.estado !== 'abierto') return false;
        if (c.tipo_corte && c.tipo_corte !== 'cierre_diario') return false;
        const aperturaIso = c.fecha_apertura || c.fecha_inicio || c.created_date;
        if (!aperturaIso) return false;
        const t = new Date(aperturaIso).getTime();
        return Number.isFinite(t) && t < inicioHoyMX;
      }) || null)
    : null;

  return { corteAtrasado, hayCorteAtrasado: !!corteAtrasado };
}
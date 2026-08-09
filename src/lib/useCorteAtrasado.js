import { useCajaAbierta } from '@/lib/useCajaAbierta';
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
 *
 * CAMBIO DE RENDIMIENTO (2026-08-01):
 *  Antes este hook lanzaba su PROPIO useQuery con refetchInterval:8000 sobre
 *  la misma queryKey que useCajaAbierta. React Query crea un temporizador por
 *  OBSERVADOR, así que eran dos timers por pantalla (y ~6 puntos de montaje
 *  entre ambos hooks) → intervalo efectivo ~2 s sobre cortes_caja.
 *
 *  Ahora DERIVA de useCajaAbierta y no ejecuta ninguna consulta propia.
 *  Es correcto porque sólo puede existir UN corte abierto por sucursal
 *  (regla de negocio del propio POS, verificada en producción: 1 corte
 *  abierto en cada una de las 3 sucursales). El corte atrasado, si existe,
 *  ES esa misma caja abierta cuando su apertura es anterior a hoy.
 *
 *  La lógica de fecha (CANDADO 2: medianoche America/Mexico_City) y el orden
 *  de campos `fecha_apertura || fecha_inicio || created_date` se conservan
 *  idénticos.
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
  // Misma fuente de verdad que la caja: sin consulta ni temporizador propios.
  const { cajaAbierta } = useCajaAbierta();
  // El filtro original comparaba `c.sucursal_id !== sucId` en el cliente. Al
  // derivar de useCajaAbierta esa comprobación se perdió: si por cualquier vía
  // llegara un corte de OTRA sucursal, se bloquearía la apertura de caja de
  // ésta por el corte atrasado de aquélla. Se restituye explícitamente.
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalEfectiva?.sucursal_id || null;

  const inicioHoyMX = obtenerInicioDiaMexico(new Date());

  const corteAtrasado = (() => {
    const c = cajaAbierta;
    if (!c) return null;
    if (sucId && c.sucursal_id && c.sucursal_id !== sucId) return null;
    // Guardas conservadas del filtro original (defensivas: la consulta ya
    // acota estado y tipo_corte en PostgreSQL).
    if (c.estado && c.estado !== 'abierto') return null;
    if (c.tipo_corte && c.tipo_corte !== 'cierre_diario') return null;
    const aperturaIso = c.fecha_apertura || c.fecha_inicio || c.created_date;
    if (!aperturaIso) return null;
    const t = new Date(aperturaIso).getTime();
    return Number.isFinite(t) && t < inicioHoyMX ? c : null;
  })();

  return { corteAtrasado, hayCorteAtrasado: !!corteAtrasado };
}

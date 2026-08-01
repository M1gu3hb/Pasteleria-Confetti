import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
import { useTerminal } from '@/lib/TerminalContext';
import { fetchCajaAbierta, fetchUltimoCierre } from '@/lib/cajaEstado';
import { registrarRefrescoCaja, KEY_CAJA_ABIERTA, KEY_ULTIMO_CIERRE } from '@/lib/cajaRefresco';

/**
 * Hook compartido — fuente ÚNICA de verdad para "¿hay caja abierta?".
 *
 * Una caja abierta = CorteCaja con tipo_corte='cierre_diario' y estado='abierto'.
 * Solo puede existir UNA a la vez por sucursal (regla de negocio global,
 * verificada en producción: 1 corte abierto en cada una de las 3 sucursales).
 *
 * Compatibilidad: registros viejos sin tipo_corte se tratan como cierre_diario.
 *
 * Devuelve:
 *  - cajaAbierta: el registro o null
 *  - hayCaja: boolean conveniente para guards
 *  - isLoading: boolean (verdadero SOLO durante el primer fetch jamás hecho)
 *  - status: 'unknown' | 'open' | 'closed' | 'error'
 *  - fondoEsperado: número que debería estar en caja al abrir hoy
 *
 * HOTFIX P0 (Dashboard/Caja "cerrada" falsa) — SE CONSERVA IGUAL:
 *  - `placeholderData: previousData` mantiene el resultado anterior durante
 *    el refetch (gracias al gcTime de 30 min del QueryClient).
 *  - `lastKnownOpenRef` recuerda la última caja abierta vista en ESTA sesión.
 *  - `status='unknown'` solo se devuelve cuando NO sabemos nada. Los
 *    consumidores deben mostrar "Verificando…" en lugar de "Cerrada".
 *
 * CAMBIO DE RENDIMIENTO (2026-08-01):
 *  Antes: CorteCaja.list('-created_date', 50) con select('*'), filtrado en
 *  cliente y refetchInterval:8000 POR OBSERVADOR (6 puntos de montaje →
 *  intervalo efectivo ~2 s → 584,029 consultas y 4,137 s de CPU de base).
 *  Ahora: filtro por sucursal+estado en PostgreSQL, columnas mínimas, limit 1,
 *  y UN SOLO temporizador de respaldo por sucursal (ver `cajaEstado.js`).
 *  El queryKey se conserva (`cortes_caja_estado`) para que los
 *  invalidateQueries existentes de Caja.jsx sigan surtiendo efecto inmediato.
 */
export function useCajaAbierta() {
  const lastKnownOpenRef = useRef(null);   // último corte abierto visto
  const lastKnownClosedRef = useRef(null); // último cierre cerrado visto

  // FASE 2C — Caja por sucursal. La caja abierta es la de la sucursal activa.
  // Si no hay sucursal efectiva (p. ej. dueño en modo global sin elegir), NO
  // hay una caja concreta que operar → devolvemos null (cerrada).
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalEfectiva?.sucursal_id || null;
  const queryClient = useQueryClient();

  // UN solo temporizador + listeners de foco/red por sucursal, con refcount,
  // aunque este hook se monte en varias pantallas a la vez.
  useEffect(() => {
    if (!sucId) return undefined;
    return registrarRefrescoCaja(sucId, queryClient);
  }, [sucId, queryClient]);

  const { data: caja, isPending, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: KEY_CAJA_ABIERTA(sucId),
    queryFn: () => fetchCajaAbierta(sucId),
    enabled: !!sucId,
    // Sin refetchInterval por observador: el refresco lo centraliza
    // registrarRefrescoCaja() para que no se multipliquen los temporizadores.
    refetchInterval: false,
    staleTime: 4000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Consulta separada y pequeña, sólo para fondoEsperado. Cambia rara vez (al
  // cerrar caja), y ese momento ya invalida por prefijo.
  const { data: ultimoCierreData } = useQuery({
    queryKey: KEY_ULTIMO_CIERRE(sucId),
    queryFn: () => fetchUltimoCierre(sucId),
    enabled: !!sucId,
    refetchInterval: false,
    staleTime: 60_000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // `undefined` = todavía no resolvió. `null` = resolvió y NO hay caja abierta.
  const haRecibidoDatos = sucId ? caja !== undefined : true;
  const cajaAbiertaFromData = sucId ? (caja || null) : null;
  const ultimoCierreFromData = ultimoCierreData || null;

  // Memoria de la sesión. Solo actualizamos cuando tenemos data confirmada
  // (no durante isPending o errores).
  if (haRecibidoDatos) {
    lastKnownOpenRef.current = cajaAbiertaFromData;
    if (ultimoCierreFromData) lastKnownClosedRef.current = ultimoCierreFromData;
  }

  // Estado tri-state explícito:
  // - 'unknown': primer fetch en curso Y sin último valor conocido.
  // - 'open':    confirmamos caja abierta.
  // - 'closed':  confirmamos NO hay caja abierta.
  // - 'error':   fetch falló y no tenemos último valor conocido.
  let status;
  let cajaAbierta;
  if (haRecibidoDatos) {
    cajaAbierta = cajaAbiertaFromData;
    status = cajaAbierta ? 'open' : 'closed';
  } else if (lastKnownOpenRef.current) {
    // Sin datos frescos pero conocemos un valor abierto previo → no flashear cerrada
    cajaAbierta = lastKnownOpenRef.current;
    status = 'open';
  } else if (isError) {
    cajaAbierta = null;
    status = 'error';
  } else {
    cajaAbierta = null;
    status = 'unknown';
  }

  // isLoading = true SOLO si todavía no tenemos forma de saber el estado.
  const cargandoSinValorPrevio = (isPending || isLoading) && status === 'unknown';

  const ultimoCierre = ultimoCierreFromData || lastKnownClosedRef.current;
  const fondoEsperado = Number(ultimoCierre?.dinero_dejado_en_caja);
  const fondoEsperadoSeguro = Number.isFinite(fondoEsperado) ? fondoEsperado : 0;

  return {
    cajaAbierta,
    hayCaja: status === 'open',
    status,
    isLoading: cargandoSinValorPrevio,
    isFetching,
    fondoEsperado: fondoEsperadoSeguro,
    ultimoCierre,
    refetch,
  };
}

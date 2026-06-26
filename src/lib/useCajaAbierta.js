import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useTerminal } from '@/lib/TerminalContext';

/**
 * Hook compartido — fuente ÚNICA de verdad para "¿hay caja abierta?".
 *
 * Una caja abierta = CorteCaja con tipo_corte='cierre_diario' y estado='abierto'.
 * Solo puede existir UNA a la vez (regla de negocio global).
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
 * HOTFIX P0 (Dashboard/Caja "cerrada" falsa):
 *  Antes el hook devolvía hayCaja=false en cuanto isPending se hacía false,
 *  aunque el último valor conocido fuera "abierta". Esto causaba el flash
 *  "abierta → cerrada → abierta" al cambiar de pantalla.
 *
 *  Ahora:
 *  - `placeholderData: previousData` mantiene el resultado anterior durante
 *    el refetch (gracias al gcTime de 30 min del QueryClient).
 *  - `lastKnownOpenRef` recuerda la última caja abierta vista en ESTA sesión.
 *    Mientras `isPending` está activo y el caché está vacío, devolvemos el
 *    último estado conocido para no flashear "cerrada".
 *  - `status='unknown'` solo se devuelve cuando NO sabemos nada (primer fetch
 *    sin caché ni último valor). Los consumidores deben mostrar "Verificando…"
 *    en lugar de "Cerrada" cuando status === 'unknown'.
 */
export function useCajaAbierta() {
  const lastKnownOpenRef = useRef(null);  // último corte abierto visto
  const lastKnownClosedRef = useRef(null); // último cierre cerrado visto

  // FASE 2C — Caja por sucursal. La caja abierta es la de la sucursal activa.
  // Si no hay sucursal efectiva (p. ej. dueño en modo global sin elegir), NO
  // hay una caja concreta que operar → devolvemos null (cerrada).
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalEfectiva?.sucursal_id || null;

  const { data: cortes, isPending, isLoading, isFetching, isError, refetch } = useQuery({
    // queryKey incluye la sucursal para que cada sucursal tenga su propio caché.
    queryKey: ['cortes_caja_estado', sucId],
    queryFn: () => base44.entities.CorteCaja.list('-created_date', 50),
    refetchInterval: 8000,
    staleTime: 4000,
    // 30 min en caché tras desmontar — evita falsos "primer fetch" al navegar.
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const safeCortes = Array.isArray(cortes) ? cortes : [];

  // Filtro por sucursal: solo cortes de la sucursal activa. Cortes viejos sin
  // sucursal_id se ignoran cuando hay sucursal activa (no son de esta sucursal).
  // Si sucId es null, no hay sucursal → no se opera ninguna caja.
  const cortesSucursal = sucId
    ? safeCortes.filter(c => c?.sucursal_id === sucId)
    : [];

  // Calcular desde el dato actual (si lo hay)
  const cajaAbiertaFromData = cortesSucursal.find(c =>
    c?.estado === 'abierto' &&
    (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte)
  ) || null;

  const ultimoCierreFromData = cortesSucursal.find(c =>
    c?.estado === 'cerrado' &&
    (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte)
  ) || null;

  // Memoria de la sesión. Solo actualizamos cuando tenemos data confirmada
  // (no durante isPending o errores). Esto NO crea bugs: si la caja se cerró
  // en este dispositivo, el siguiente refetch traerá `cortes` con `estado:'cerrado'`
  // y cajaAbiertaFromData será null → devolvemos closed correctamente.
  const haRecibidoDatos = Array.isArray(cortes); // distinguir [] real de undefined
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
  // Si ya conocemos un valor previo, NO estamos "loading" para el consumidor:
  // mostramos el último válido y refetcheamos en background.
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
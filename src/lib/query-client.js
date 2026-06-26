import { QueryClient } from '@tanstack/react-query';

/**
 * HOTFIX P0 — Carga robusta global + cache real entre navegaciones.
 *
 * Antes:
 *  - retry: 1 → cualquier query que fallara en su primer fetch (latencia móvil,
 *    hidratación, red intermitente) se rendía instantáneamente y la UI mostraba
 *    "sin datos" / error inmediato.
 *  - Sin gcTime configurado → React Query liberaba el caché ~5min después de
 *    desmontar la query. En la práctica, cambiar Dashboard→Caja→Mesero→Dashboard
 *    NO liberaba caché, PERO cualquier hook que naciera con `isPending=true`
 *    (sin previousData) volvía a mostrar "loading" como si fuera primera vez.
 *
 * Ahora:
 *  - 3 reintentos con backoff exponencial (≈ 600ms, 1.2s, 2.4s, máx 5s).
 *  - gcTime: 30 min — el caché vive entre navegaciones rápidas sin volver a
 *    montar como primera vez. Esto resuelve "cada vez que cambio de sección
 *    parece reiniciar todo".
 *  - staleTime: 0 por defecto a nivel global (cada query define el suyo) para
 *    que las invalidaciones explícitas (cobro, abrir caja, etc.) sigan
 *    funcionando inmediato y no quede caché "fresco" mentiroso.
 *  - placeholderData: previousData NO se setea aquí (debe ser por query, porque
 *    React Query requiere que sea callable opcionalmente).
 *  - refetchOnWindowFocus en false para no aumentar consumo.
 *  - refetchOnReconnect en true para que al recuperar red móvil refresque.
 */
export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 3,
      retryDelay: (attemptIndex) =>
        Math.min(600 * 2 ** attemptIndex, 5000),
      // 30 min: tiempo que React Query mantiene el caché tras desmontar.
      // No es polling — solo "memoria" entre navegaciones para evitar
      // que cambiar de pantalla se vea como primera carga.
      gcTime: 30 * 60 * 1000,
    },
  },
});
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook defensivo que limpia overlays/portales al cambiar de ruta.
 * Evita que diálogos/menús queden flotando bloqueando la UI cuando
 * el usuario navega rápido por el sidebar.
 *
 * No es destructivo: solo libera pointer-events del body si quedó bloqueado
 * por algún portal de Radix que no se cerró bien.
 */
export function useRouteCleanup() {
  const location = useLocation();

  useEffect(() => {
    // Si algún portal dejó el body con pointer-events: none o overflow: hidden,
    // los liberamos al cambiar de ruta.
    try {
      if (typeof document === 'undefined') return;
      const body = document.body;
      if (!body) return;
      // Limpiar locks de scroll que algunos portales aplican
      if (body.style.pointerEvents === 'none') body.style.pointerEvents = '';
      if (body.style.overflow === 'hidden') {
        // Solo si no hay un dialog abierto en este momento
        const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
        if (openDialogs.length === 0) body.style.overflow = '';
      }
    } catch {
      // Silencioso — nunca romper navegación
    }
  }, [location.pathname]);
}
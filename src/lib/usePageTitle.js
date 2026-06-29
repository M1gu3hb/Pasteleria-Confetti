import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BRAND = 'Pastelería Confetti';

const ROUTE_TITLES = {
  '/': `Dashboard | ${BRAND}`,
  '/pos': `Caja POS | ${BRAND}`,
  '/mesero': `Mesero | ${BRAND}`,
  '/mesas': `Mesas | ${BRAND}`,
  '/cocina': `Cocina | ${BRAND}`,
  '/inventario': `Inventario | ${BRAND}`,
  '/compras': `Compras | ${BRAND}`,
  '/recetas': `Recetas | ${BRAND}`,
  '/productos': `Productos | ${BRAND}`,
  '/ventas': `Ventas | ${BRAND}`,
  '/caja': `Caja | ${BRAND}`,
  '/registros': `Registros | ${BRAND}`,
  '/configuracion': `Configuración | ${BRAND}`,
};

/**
 * Hook que actualiza el <title> de la pestaña según la ruta actual.
 * Defensivo: nunca lanza errores aunque pathname venga raro.
 */
export default function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    try {
      const path = location?.pathname || '/';
      const title = ROUTE_TITLES[path] || BRAND;
      if (typeof document !== 'undefined') {
        document.title = title;
      }
    } catch (e) {
      // No romper la app por un problema de título
      console.warn('[usePageTitle] no se pudo actualizar título:', e);
    }
  }, [location?.pathname]);
}
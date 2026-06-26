// =====================================================
// STUB DE COMPATIBILIDAD — NO USAR EN CÓDIGO NUEVO
// =====================================================
// F3.2 eliminó la lógica multi-sucursal. Este archivo existe únicamente
// porque Tailwind/Vite mantiene en su caché de escaneo la ruta antigua y
// lanza ENOENT cuando intenta leerla durante el build de PostCSS.
//
// No exporta lógica real. Si algún componente lo importa por error, recibe
// valores no-op seguros (sin romper render). Cualquier desarrollador que vea
// este archivo debe BORRAR el import del componente que lo trae.
// =====================================================

import React, { createContext, useContext } from 'react';

const NoopContext = createContext({
  sucursalActiva: null,
  sucursales: [],
  isLoading: false,
});

export function SucursalProvider({ children }) {
  return (
    <NoopContext.Provider value={{ sucursalActiva: null, sucursales: [], isLoading: false }}>
      {children}
    </NoopContext.Provider>
  );
}

export function useSucursal() {
  return useContext(NoopContext);
}

export default NoopContext;
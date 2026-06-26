import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTerminal } from '@/lib/TerminalContext';

/**
 * AdminRoute — Fase 2A.fix
 * Protege rutas administrativas según el modo y rol activo:
 *
 *  - Si NO hay sesión admin (modo empleado) → redirige a /caja.
 *  - Si la ruta es solo para dueño (soloDueno) y el rol es
 *    "administrador" → redirige a /caja (Configuración).
 *
 * El modo admin se activa solo tras validar PIN (ModalPinAdmin) y NO es
 * persistente.
 */
export default function AdminRoute({ children, soloDueno = false }) {
  const { adminMode, adminRole } = useTerminal();

  if (!adminMode) {
    return <Navigate to="/caja" replace />;
  }

  // Configuración solo para dueño. Administrador no entra.
  if (soloDueno && adminRole !== 'dueno') {
    return <Navigate to="/caja" replace />;
  }

  return children;
}
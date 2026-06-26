import React from 'react';
import { Navigate } from 'react-router-dom';

// Vista antigua de Mesas — ya no se usa.
// La gestión operativa de mesas vive en /mesero.
// El mapa configurable vive en Configuración → Mesas.
// Este componente solo redirige para que cualquier enlace viejo
// no muestre la UI antigua.
export default function Mesas() {
  return <Navigate to="/mesero" replace />;
}
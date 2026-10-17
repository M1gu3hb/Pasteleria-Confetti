import React from 'react';
import CorteHistorialList from '@/components/cortes/CorteHistorialList';

// Comparte paginación, errores y aislamiento con Caja. Seis al inicio, sin tope histórico.
export default function CortesRecientesDashboard({ sucId = null, mostrarSucursal = false }) {
  return <CorteHistorialList sucId={sucId} limit={6} showFilter={false} compact />;
}

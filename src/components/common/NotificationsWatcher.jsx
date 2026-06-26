import React from 'react';

/**
 * NotificationsWatcher (placeholder).
 *
 * Antes este watcher reproducía sonido global de "nuevo pedido" para cocina/admin
 * desde cualquier pantalla. Ahora:
 *
 * - Los pedidos NUEVOS en cocina los maneja CocinaNuevoPedidoWatcher (montado
 *   solo en /cocina) con su propio control "Voz: ON/OFF".
 * - Los pedidos LISTOS los maneja PedidoListoWatcher (global, ruteo por mesero).
 * - Las solicitudes QR las maneja SolicitudesQRWatcher (global, ruteo por mesero).
 *
 * Se deja este componente vacío para no romper imports existentes en AppLayout.
 */
export default function NotificationsWatcher() {
  return null;
}
// Helpers del Portal QR — token estable por mesa y URLs públicas.
// No usa servicios externos: el QR se genera con `qrcode` (local).

/**
 * Genera un token corto y estable a partir del id de la mesa.
 * El token es público (va en la URL del QR) y NO expone datos sensibles.
 */
export function generarTokenMesa(mesaId) {
  if (!mesaId) return '';
  // Hash simple no criptográfico (suficiente para QR público).
  let h = 0;
  for (let i = 0; i < mesaId.length; i++) {
    h = (h * 31 + mesaId.charCodeAt(i)) >>> 0;
  }
  return 'm' + h.toString(36) + mesaId.slice(-4);
}

/**
 * URL pública de la mesa para escanear con QR.
 * Usa el origin actual + ruta /qr/:token
 */
export function buildPortalQRUrl(mesa) {
  if (typeof window === 'undefined' || !mesa?.qr_token) return '';
  return `${window.location.origin}/qr/${mesa.qr_token}`;
}

/**
 * Devuelve los tipos de solicitud habilitados según la config.
 */
export function getTiposSolicitudHabilitados(config) {
  const tipos = [];
  if (config?.portal_qr_permitir_ordenar !== false) tipos.push('ordenar');
  if (config?.portal_qr_permitir_cuenta !== false) tipos.push('cuenta');
  if (config?.portal_qr_permitir_ayuda !== false) tipos.push('ayuda');
  return tipos;
}

export const TIPO_SOLICITUD_LABEL = {
  ordenar: 'Quiero ordenar',
  cuenta: 'Pedir cuenta',
  ayuda: 'Necesito ayuda',
};

export const TIPO_SOLICITUD_VERBO = {
  ordenar: 'quiere ordenar',
  cuenta: 'solicita cuenta',
  ayuda: 'requiere ayuda',
};
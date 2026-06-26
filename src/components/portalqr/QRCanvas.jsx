import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * Renderiza un QR localmente en <canvas>. Sin servicios externos.
 * Props: value (string), size (px), bg, fg.
 */
export default function QRCanvas({ value, size = 200, bg = '#ffffff', fg = '#000000', className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: { dark: fg, light: bg },
      errorCorrectionLevel: 'M',
    }).catch((err) => console.warn('[QRCanvas]', err));
  }, [value, size, bg, fg]);

  if (!value) {
    return (
      <div className={`flex items-center justify-center bg-muted text-xs text-muted-foreground rounded ${className}`}
        style={{ width: size, height: size }}>
        Sin QR
      </div>
    );
  }
  return <canvas ref={canvasRef} className={className} aria-label="QR" />;
}

/**
 * Helper: genera el dataURL del QR (para descarga PNG).
 */
export async function getQRDataURL(value, opts = {}) {
  if (!value) return '';
  return QRCode.toDataURL(value, {
    width: opts.size || 512,
    margin: 2,
    color: { dark: opts.fg || '#000000', light: opts.bg || '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}
import { useEffect } from 'react';
import { useConfig } from '@/lib/ConfigContext';
import { buildBrandPalette, applyBrandPalette, BRAND_DEFAULTS } from '@/lib/brandColors';

/**
 * Variante del BrandColorsApplier dedicada al login.
 *
 * El login se renderiza FUERA de AppLayout (no tiene Sidebar ni
 * BrandColorsApplier global) y sí necesita las vars de marca para
 * mostrar el degradado y el glow personalizados.
 *
 * Esto solo aplica vars a <html>. No revierte al desmontar (las vars
 * sobreviven y AppLayout las pisa al entrar; comportamiento idéntico
 * pero sin parpadeo).
 */
export default function LoginBrandColors() {
  const { config } = useConfig() || {};
  const primario = config?.color_primario || BRAND_DEFAULTS.color_primario;
  const acento   = config?.color_acento   || BRAND_DEFAULTS.color_acento;

  useEffect(() => {
    applyBrandPalette(buildBrandPalette(primario, acento));
  }, [primario, acento]);

  return null;
}
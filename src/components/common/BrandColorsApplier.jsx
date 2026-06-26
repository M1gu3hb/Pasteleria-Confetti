import { useEffect } from 'react';
import { useConfig } from '@/lib/ConfigContext';
import { buildBrandPalette, applyBrandPalette, BRAND_DEFAULTS } from '@/lib/brandColors';

/**
 * Componente invisible que sincroniza color_primario y color_acento de la
 * ConfiguracionNegocio con CSS vars globales en el `<html>`.
 *
 * Se monta UNA vez dentro de ConfigProvider y desde ahí cualquier componente
 * puede usar:
 *   - var(--brand-primary)
 *   - var(--brand-primary-glow)
 *   - var(--brand-accent)
 *   - var(--brand-accent-soft)
 *   - etc.
 *
 * No renderiza nada. No bloquea. No toca lógica de negocio.
 */
export default function BrandColorsApplier() {
  const { config } = useConfig() || {};
  const primario = config?.color_primario || BRAND_DEFAULTS.color_primario;
  const acento   = config?.color_acento   || BRAND_DEFAULTS.color_acento;

  useEffect(() => {
    const palette = buildBrandPalette(primario, acento);
    applyBrandPalette(palette);
  }, [primario, acento]);

  return null;
}
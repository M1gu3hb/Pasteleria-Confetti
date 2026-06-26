import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, RotateCcw, Palette } from 'lucide-react';
import { BRAND_DEFAULTS, buildBrandPalette } from '@/lib/brandColors';

/**
 * Sección "Colores del sistema" dentro de Identidad.
 *
 * - Color primario: dominante. Afecta glow del login, degradados, fondos premium.
 * - Color acento:   afecta sidebar activo, botones, badges, highlights.
 *
 * NO toca colores semánticos (rojo=error, verde=éxito, ámbar=warn).
 * NO escribe directo al `<html>` — el BrandColorsApplier lo hace tras invalidar.
 *
 * Persiste en ConfiguracionNegocio.color_primario y color_acento.
 * Compatible con color_secundario (legacy) sin tocarlo.
 */
export default function ColoresSistemaSection({ cfg }) {
  const queryClient = useQueryClient();
  const [primario, setPrimario] = useState(BRAND_DEFAULTS.color_primario);
  const [acento, setAcento] = useState(BRAND_DEFAULTS.color_acento);
  const [saving, setSaving] = useState(false);

  // HOTFIX persistencia: solo hidratar cuando cfg viene real del backend.
  // Antes con `cfg = {}` en el primer render se pisaban los colores con default.
  // También respondemos a updated_date para reflejar cambios remotos.
  useEffect(() => {
    if (!cfg?.id) return;
    setPrimario(cfg.color_primario || BRAND_DEFAULTS.color_primario);
    setAcento(cfg.color_acento || BRAND_DEFAULTS.color_acento);
  }, [cfg?.id, cfg?.updated_date]);

  // Paleta derivada en vivo para la vista previa (sin guardar todavía).
  const previewPalette = buildBrandPalette(primario, acento);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { color_primario: primario, color_acento: acento };
      if (cfg?.id) {
        await base44.entities.ConfiguracionNegocio.update(cfg.id, payload);
      } else {
        await base44.entities.ConfiguracionNegocio.create({
          nombre_negocio: 'Mi Negocio',
          ...payload,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Colores guardados');
    } catch (e) {
      toast.error('No se pudieron guardar los colores: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  const restaurarDefaults = () => {
    setPrimario(BRAND_DEFAULTS.color_primario);
    setAcento(BRAND_DEFAULTS.color_acento);
    toast.info('Colores restaurados. Recuerda guardar para aplicarlos.');
  };

  // Estilos en vivo para la mini vista previa (no inyecta al <html>).
  const previewStyle = {
    '--p': previewPalette['--brand-primary'],
    '--p-dark': previewPalette['--brand-primary-dark'],
    '--p-glow': previewPalette['--brand-primary-glow'],
    '--p-soft': previewPalette['--brand-primary-soft'],
    '--a': previewPalette['--brand-accent'],
    '--a-soft': previewPalette['--brand-accent-soft'],
    '--a-glow': previewPalette['--brand-accent-glow'],
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center gap-2 mb-1">
        <Palette className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Colores del sistema</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Personaliza la marca visual del POS. El primario afecta degradados y glow del login;
        el acento afecta botones, sidebar activo y highlights.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Primario */}
        <div className="space-y-1.5">
          <Label className="text-xs">Color primario (degradados / glow)</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={primario}
              onChange={e => setPrimario(e.target.value)}
              className="h-10 w-14 rounded border cursor-pointer bg-transparent"
              aria-label="Color primario"
            />
            <input
              type="text"
              value={primario}
              onChange={e => setPrimario(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono"
              placeholder="#1e40af"
            />
          </div>
        </div>
        {/* Acento */}
        <div className="space-y-1.5">
          <Label className="text-xs">Color de acento (botones / sidebar)</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={acento}
              onChange={e => setAcento(e.target.value)}
              className="h-10 w-14 rounded border cursor-pointer bg-transparent"
              aria-label="Color acento"
            />
            <input
              type="text"
              value={acento}
              onChange={e => setAcento(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono"
              placeholder="#38bdf8"
            />
          </div>
        </div>
      </div>

      {/* Vista previa: mini login + tarjeta + botón + sidebar item */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Vista previa</p>
        <div
          style={previewStyle}
          className="rounded-xl overflow-hidden border bg-[#0a1428]"
        >
          <div className="relative p-4 sm:p-5">
            {/* Glow simulado */}
            <div
              aria-hidden
              className="absolute -top-12 -left-12 w-48 h-48 rounded-full blur-3xl pointer-events-none"
              style={{ background: 'var(--p-glow)' }}
            />
            <div
              aria-hidden
              className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-70"
              style={{ background: 'var(--a-glow)' }}
            />

            <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* "Login" preview */}
              <div className="rounded-lg p-3 border border-white/10 bg-white/5 backdrop-blur-sm">
                <p className="text-white/60 text-[10px] uppercase tracking-widest">Login</p>
                <div className="mt-2 flex gap-1.5">
                  {[0, 1, 2, 3].map(i => (
                    <span
                      key={i}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        background: i < 2 ? 'var(--a)' : 'transparent',
                        border: '2px solid rgba(255,255,255,0.2)',
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 w-full text-xs text-white py-1.5 rounded-md font-medium"
                  style={{ background: 'var(--p)' }}
                >
                  Entrar
                </button>
              </div>

              {/* Sidebar item preview */}
              <div className="rounded-lg p-3 border border-white/10 bg-white/5">
                <p className="text-white/60 text-[10px] uppercase tracking-widest">Sidebar</p>
                <div className="mt-2 space-y-1">
                  <div className="px-2 py-1.5 rounded text-xs text-white/70">Dashboard</div>
                  <div
                    className="px-2 py-1.5 rounded text-xs text-white font-medium"
                    style={{ background: 'var(--a-soft)', boxShadow: '0 0 0 1px var(--a)' }}
                  >
                    Ventas
                  </div>
                  <div className="px-2 py-1.5 rounded text-xs text-white/70">Caja</div>
                </div>
              </div>

              {/* Tarjeta dashboard preview */}
              <div
                className="rounded-lg p-3 border"
                style={{
                  background: 'var(--p-soft)',
                  borderColor: 'var(--a-soft)',
                }}
              >
                <p className="text-white/60 text-[10px] uppercase tracking-widest">Tarjeta</p>
                <p className="text-white text-lg font-bold mt-1">$12,450</p>
                <p className="text-[10px]" style={{ color: 'var(--a)' }}>+8% hoy</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Los colores semánticos (rojo = error, verde = éxito, ámbar = aviso) se mantienen.
        </p>
      </div>

      <div className="flex gap-2 mt-4 flex-wrap">
        <Button onClick={save} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Guardando…' : 'Guardar colores'}
        </Button>
        <Button onClick={restaurarDefaults} type="button" variant="outline" className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Restaurar por defecto
        </Button>
      </div>
    </div>
  );
}
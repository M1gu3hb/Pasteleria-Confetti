import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, PlayCircle, RefreshCw } from 'lucide-react';
import {
  getCocinaVozConfig, setCocinaVozConfig, testVoiceCocina, isVoiceSupported,
  getCurrentVoiceInfo, recalcBestVoice, ensureVoicesLoaded,
} from '@/lib/voiceAlert';
import { unlockAudio } from '@/lib/sounds';
import { toast } from 'sonner';

/**
 * Control compacto en cabecera de Cocina:
 *  - Voz ON/OFF (local, por dispositivo).
 *  - Probar voz.
 *
 * No afecta el sonido básico de notificación (ese se controla aparte).
 * Solo afecta la lectura larga de pedidos nuevos.
 */
export default function CocinaVozControl() {
  const [cfg, setCfg] = useState(getCocinaVozConfig());
  const [voiceInfo, setVoiceInfo] = useState({ available: false });

  // Cargar voces (algunos navegadores las cargan async) y mostrar la actual.
  useEffect(() => {
    let mounted = true;
    ensureVoicesLoaded().then(() => {
      if (!mounted) return;
      try { setVoiceInfo(getCurrentVoiceInfo(cfg.lang || 'es-MX')); } catch {}
    });
    return () => { mounted = false; };
  }, [cfg.lang]);

  const toggle = () => {
    unlockAudio();
    const next = setCocinaVozConfig({ voz_activa: !cfg.voz_activa });
    setCfg(next);
    if (next.voz_activa && !isVoiceSupported()) {
      toast.info('La voz local no está soportada en este navegador.');
    } else {
      toast.success(next.voz_activa ? 'Voz cocina activada' : 'Voz cocina desactivada');
    }
  };

  const probar = () => {
    unlockAudio();
    if (!isVoiceSupported()) {
      toast.info('La voz local no está soportada en este navegador.');
      return;
    }
    testVoiceCocina();
  };

  const recalc = () => {
    const best = recalcBestVoice(cfg.lang || 'es-MX');
    setVoiceInfo(getCurrentVoiceInfo(cfg.lang || 'es-MX'));
    if (best) toast.success(`Voz seleccionada: ${best.name}`);
    else toast.info('No hay voces en español disponibles en este dispositivo.');
  };

  return (
    <div className="flex items-center gap-1.5" title={voiceInfo.available ? `Voz: ${voiceInfo.name} (${voiceInfo.lang})` : 'Sin voz disponible'}>
      <Button
        size="sm"
        variant={cfg.voz_activa ? 'default' : 'outline'}
        onClick={toggle}
        className="h-8 gap-1.5"
        title={cfg.voz_activa ? 'Voz cocina activa' : 'Voz cocina desactivada'}
      >
        {cfg.voz_activa ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        <span className="hidden sm:inline text-xs">Voz: {cfg.voz_activa ? 'ON' : 'OFF'}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={probar} className="h-8 gap-1.5" title="Probar voz">
        <PlayCircle className="w-4 h-4" />
        <span className="hidden md:inline text-xs">Probar</span>
      </Button>
      <Button size="sm" variant="outline" onClick={recalc} className="h-8 gap-1.5" title="Elegir mejor voz en español disponible">
        <RefreshCw className="w-4 h-4" />
        <span className="hidden md:inline text-xs">Mejor voz</span>
      </Button>
    </div>
  );
}
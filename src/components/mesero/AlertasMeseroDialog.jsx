import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, Headphones, MessageSquare, MicOff, PlayCircle, RefreshCw } from 'lucide-react';
import {
  getAlertConfig, setAlertConfig, testVoice, isVoiceSupported, speak,
  getCurrentVoiceInfo, recalcBestVoice, ensureVoicesLoaded,
} from '@/lib/voiceAlert';
import { playNewOrder, unlockAudio, setSoundsVolume } from '@/lib/sounds';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { asignacionActiva } from '@/lib/asignacionMesas';

/**
 * Modal de configuración personal de alertas para el mesero (audio + voz local).
 */
export default function AlertasMeseroDialog({ open, onClose }) {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const asignOn = asignacionActiva(config);
  const [cfg, setCfg] = useState(getAlertConfig());
  const [voiceOk, setVoiceOk] = useState(isVoiceSupported());
  const [voiceInfo, setVoiceInfo] = useState({ available: false });

  useEffect(() => {
    if (open) {
      setCfg(getAlertConfig());
      setVoiceOk(isVoiceSupported());
      // Asegurar que las voces del SO ya estén cargadas antes de mostrar info
      ensureVoicesLoaded().then(() => {
        try { setVoiceInfo(getCurrentVoiceInfo(getAlertConfig().lang || 'es-MX')); } catch {}
      });
    }
  }, [open]);

  // Refrescar info cuando cambia el idioma
  useEffect(() => {
    try { setVoiceInfo(getCurrentVoiceInfo(cfg.lang || 'es-MX')); } catch {}
  }, [cfg.lang]);

  const recalc = () => {
    const best = recalcBestVoice(cfg.lang || 'es-MX');
    setVoiceInfo(getCurrentVoiceInfo(cfg.lang || 'es-MX'));
    if (best) toast.success(`Voz seleccionada: ${best.name}`);
    else toast.info('No hay voces en español disponibles en este dispositivo.');
  };

  const update = (patch) => {
    const next = setAlertConfig(patch);
    setCfg(next);
    if (Object.prototype.hasOwnProperty.call(patch, 'volumen')) {
      setSoundsVolume(next.volumen);
    }
  };

  const activarAudio = () => {
    unlockAudio();
    // Algunos navegadores requieren un primer "speak" en gesto del usuario.
    if (isVoiceSupported()) {
      try {
        const u = new window.SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch {}
    }
    toast.success('Audio activado en este dispositivo');
  };

  const probar = () => {
    try { playNewOrder(); } catch {}
    if (cfg.modo === 'voz' || cfg.modo === 'sonido_voz') {
      // Solo decir nombre si la asignación está activa.
      testVoice((cfg.decir_nombre && asignOn) ? posUser?.nombre : '');
    } else {
      // Si solo sonido, hacer una pequeña frase para validar voz disponible
      if (!isVoiceSupported()) toast.info('Sonido reproducido. La voz local no está soportada en este navegador.');
    }
  };

  const MODOS = [
    { v: 'silencio', label: 'Silencio', Icon: MicOff },
    { v: 'sonido', label: 'Sonido básico', Icon: Headphones },
    { v: 'voz', label: 'Voz asistente', Icon: MessageSquare },
    { v: 'sonido_voz', label: 'Sonido + voz', Icon: Volume2 },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose && onClose(); }}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-primary" /> Alertas del mesero
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Esta configuración es personal de este dispositivo. Si tu navegador bloquea el audio, toca <strong>Activar audio</strong>.
          </p>

          <div>
            <Label className="text-xs">Modo de alerta</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {MODOS.map(m => {
                const active = cfg.modo === m.v;
                const Icon = m.Icon;
                return (
                  <button key={m.v} onClick={() => update({ modo: m.v })}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all text-left ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-white text-slate-600 hover:bg-muted'}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${!asignOn ? 'opacity-60' : ''}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium">Decir mi nombre</p>
              <p className="text-xs text-muted-foreground truncate">
                {asignOn
                  ? (posUser?.nombre ? `Ejemplo: "${posUser.nombre}, mesa 4 solicita cuenta."` : 'Sin nombre configurado')
                  : 'Disponible solo si la asignación de mesas está activa.'}
              </p>
            </div>
            <Switch
              checked={!!cfg.decir_nombre && asignOn}
              disabled={!asignOn}
              onCheckedChange={(v) => update({ decir_nombre: v })}
            />
          </div>

          <div>
            <Label className="text-xs">Volumen</Label>
            <input type="range" min="0" max="1" step="0.05" value={cfg.volumen ?? 0.9}
              onChange={(e) => update({ volumen: parseFloat(e.target.value) })}
              className="w-full" />
            <p className="text-[10px] text-muted-foreground">{Math.round((cfg.volumen ?? 0.9) * 100)}%</p>
          </div>

          <div>
            <Label className="text-xs">Idioma de voz</Label>
            <Select value={cfg.lang || 'es-MX'} onValueChange={(v) => update({ lang: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="es-MX">Español (México)</SelectItem>
                <SelectItem value="es-ES">Español (España)</SelectItem>
                <SelectItem value="es-US">Español (Estados Unidos)</SelectItem>
                <SelectItem value="en-US">Inglés (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Voz actual + acción para recalcular */}
          {voiceOk && (
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Voz actual del dispositivo</p>
                  {voiceInfo.available ? (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {voiceInfo.name} <span className="opacity-70">({voiceInfo.lang})</span>
                      {voiceInfo.local && <span className="ml-1 text-emerald-600">· local</span>}
                      {voiceInfo.manual && <span className="ml-1 text-primary">· manual</span>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Aún no se detecta voz en español. Toca "Elegir mejor voz".</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={recalc} className="gap-1.5 shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" /> Elegir mejor voz
                </Button>
              </div>
            </div>
          )}

          {!voiceOk && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              La voz local no está disponible en este navegador. Se usará solo sonido.
            </p>
          )}
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button variant="outline" onClick={activarAudio} className="gap-2">
            <Volume2 className="w-4 h-4" /> Activar audio
          </Button>
          <Button variant="outline" onClick={probar} className="gap-2">
            <PlayCircle className="w-4 h-4" /> Probar
          </Button>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
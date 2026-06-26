import { useEffect, useRef } from 'react';

// PARTE D — Componente invisible que reproduce un beep suave cuando aumenta el
// conteo de pedidos web pendientes. Respeta config.sonidos_activos.
// No renderiza nada: solo efecto de sonido vía AudioContext (sin assets externos).
export default function PedidoWebBeep({ count = 0, sonidosActivos = true }) {
  const prevCount = useRef(count);

  useEffect(() => {
    const prev = prevCount.current;
    // Solo suena si AUMENTÓ el número de pedidos pendientes.
    if (count > prev && sonidosActivos) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // Silencioso: si el navegador bloquea audio, no rompemos nada.
      }
    }
    prevCount.current = count;
  }, [count, sonidosActivos]);

  return null;
}
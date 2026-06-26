import React, { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { unlockAudio, isAudioUnlocked, playTest } from '@/lib/sounds';

/**
 * Botón pequeño que aparece solo si el audio del navegador NO está desbloqueado.
 * Al tocarlo, arma el AudioContext y reproduce un tono de prueba para confirmar.
 * Una vez desbloqueado, se oculta automáticamente.
 *
 * Útil en pantallas Cocina y Mesero, donde los sonidos de notificación son críticos.
 */
export default function SoundUnlockButton({ className = '' }) {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked());

  useEffect(() => {
    if (unlocked) return;
    // Recheck periódicamente por si se desbloqueó por otra interacción global.
    const id = setInterval(() => {
      if (isAudioUnlocked()) {
        setUnlocked(true);
        clearInterval(id);
      }
    }, 800);
    return () => clearInterval(id);
  }, [unlocked]);

  if (unlocked) return null;

  const handleClick = () => {
    unlockAudio();
    playTest();
    setUnlocked(true);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold shadow-md hover:bg-amber-600 active:scale-95 transition ${className}`}
    >
      <Volume2 className="w-3.5 h-3.5" />
      Activar sonidos
    </button>
  );
}
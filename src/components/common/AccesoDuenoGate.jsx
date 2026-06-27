import React, { useState } from 'react';
import { useConfig } from '@/lib/ConfigContext';
import { useTerminal } from '@/lib/TerminalContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { loginConPin } from '@/api/supabaseClient';
import ModalPinAdmin from './ModalPinAdmin';
import { Crown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/**
 * AccesoDuenoGate — Fase 2A.fix
 * Pantalla de un dispositivo marcado como "de dueño"
 * (localStorage confetti_modo_dueno:true).
 *
 * No muestra selector de sucursales: el dueño SIEMPRE entra con PIN.
 * Al validar PIN de dueño → activa modo admin (rol dueno) y loguea al
 * usuario admin real. children se renderiza una vez con sesión activa.
 *
 * Si por error el PIN es de administrador, ModalPinAdmin (soloDueno) lo
 * rechaza con mensaje claro.
 */
export default function AccesoDuenoGate({ children }) {
  const { config } = useConfig();
  const { adminMode, activarAdmin } = useTerminal();
  const { posUser, login } = usePOSAuth();
  const [showPin, setShowPin] = useState(false);

  const negocio = config?.nombre_negocio || 'Pastelería Confetti';

  const handleSuccess = async (duenoUser) => {
    try {
      // _pin solo para abrir la sesión; no debe persistir en posUser.
      const { _pin, ...duenoLimpio } = duenoUser || {};
      // Fase 4: abre la sesión Supabase REAL del dueño (global, pos_is_admin).
      // Sin esto la RLS no dejaría ver todas las sucursales. ModalPinAdmin ya
      // validó el PIN; loginConPin lo revalida y hace signInWithPassword.
      const op = await loginConPin(_pin, duenoLimpio.id);
      if (!op) {
        toast.error('No se pudo iniciar la sesión de dueño.');
        return;
      }
      // activarAdmin espera el UsuarioPOS COMPLETO (lee usuario.rol). Antes se
      // pasaba el string 'dueno' → usuario.rol quedaba undefined, se trataba
      // como administrador sin sucursal y devolvía { ok:false }, dejando
      // adminMode=false → la pantalla nunca dejaba pasar al POS.
      const res = await activarAdmin(duenoUser);
      if (res && res.ok === false) {
        console.error('[AccesoDuenoGate] activarAdmin:', res.error);
        return;
      }
      login({
        ...duenoLimpio,
        // Dispositivo de dueño: sin sucursal fija. El dueño elige en memoria.
        sucursal_id: null,
        sucursal_nombre: null,
      });
    } catch (err) {
      console.error('[AccesoDuenoGate] handleSuccess:', err);
    }
  };

  // Ya hay sesión de dueño activa → dejar pasar a la app.
  if (adminMode && posUser) {
    return children;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {config?.logo_url ? (
          <img src={config.logo_url} alt={negocio} className="w-20 h-20 object-contain mb-3" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <Sparkles className="w-9 h-9 text-primary" />
          </div>
        )}
        <h1 className="text-2xl font-heading font-black">{negocio}</h1>
        <p className="text-sm text-muted-foreground mt-1">Acceso de dueño</p>
        <p className="text-xs text-muted-foreground/80 mt-2 max-w-xs">
          Este dispositivo está configurado para el dueño. Ingresa tu PIN para continuar.
        </p>

        <button
          type="button"
          onClick={() => setShowPin(true)}
          className="mt-7 w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-lg active:scale-[0.99] transition-transform"
          style={{ touchAction: 'manipulation' }}
        >
          <Crown className="w-5 h-5" />
          Ingresar con PIN
        </button>
      </div>

      <ModalPinAdmin
        open={showPin}
        onOpenChange={setShowPin}
        onSuccess={handleSuccess}
        soloDueno
        title="Acceso de dueño"
        subtitle="Ingresa tu PIN de dueño"
      />
    </div>
  );
}
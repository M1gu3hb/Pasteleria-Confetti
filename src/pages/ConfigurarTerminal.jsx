import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { loginConPin } from '@/api/supabaseClient';
import { useConfig } from '@/lib/ConfigContext';
import { useTerminal } from '@/lib/TerminalContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import ModalPinAdmin from '@/components/common/ModalPinAdmin';
import { MapPin, Store, CheckCircle2, Sparkles, Crown } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ConfigurarTerminal — Fase 2A.fix
 * Pantalla inicial (sin PIN) para asignar la sucursal a ESTA terminal,
 * o entrar como DUEÑO (sin configurar terminal fija).
 * Se muestra solo si localStorage no tiene "confetti_terminal" ni
 * "confetti_modo_dueno".
 */
export default function ConfigurarTerminal({ onConfigurado }) {
  const { config } = useConfig();
  const { configurarTerminal, activarDispositivoDueno, activarAdmin } = useTerminal();
  const { login } = usePOSAuth();
  const [sucursales, setSucursales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [showPinDueno, setShowPinDueno] = useState(false);

  // Flujo "Soy dueño": valida PIN de dueño, abre su sesión Supabase global,
  // marca el dispositivo como de dueño (no terminal fija) y entra.
  const handleDuenoSuccess = async (duenoUser) => {
    try {
      // Fase 4: sesión Supabase REAL del dueño (global, pos_is_admin).
      const op = await loginConPin(duenoUser._pin, duenoUser.id);
      if (!op) {
        toast.error('No se pudo iniciar la sesión de dueño.');
        return;
      }
      activarDispositivoDueno();
      // FIX: activarAdmin espera el UsuarioPOS COMPLETO (lee usuario.rol).
      // Antes recibía el string 'dueno' → rol undefined → adminMode quedaba en
      // false y el dispositivo de dueño no dejaba entrar.
      const res = await activarAdmin(duenoUser);
      if (res && res.ok === false) {
        console.error('[ConfigurarTerminal] activarAdmin:', res.error);
        return;
      }
      login({ ...duenoUser, sucursal_id: null, sucursal_nombre: null });
    } catch (err) {
      console.error('[ConfigurarTerminal] handleDuenoSuccess:', err);
      toast.error('No se pudo iniciar el modo dueño');
    }
  };

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const list = await base44.entities.Sucursal.filter({ activa: true });
      const arr = Array.isArray(list) ? list : [];
      // Orden visual ascendente si existe
      arr.sort((a, b) => (Number(a?.orden_visual) || 0) - (Number(b?.orden_visual) || 0));
      setSucursales(arr);
    } catch (err) {
      console.error('[ConfigurarTerminal] cargar sucursales:', err);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const seleccionar = (suc) => {
    if (guardando || !suc?.id) return;
    setGuardando(true);
    try {
      const ok = configurarTerminal(suc);
      if (ok) {
        toast.success(`Terminal configurada: ${suc.nombre}`);
        if (typeof onConfigurado === 'function') onConfigurado(suc);
      } else {
        toast.error('No se pudo configurar la terminal');
        setGuardando(false);
      }
    } catch (err) {
      console.error('[ConfigurarTerminal] seleccionar:', err);
      toast.error('No se pudo guardar la sucursal');
      setGuardando(false);
    }
  };

  const negocio = config?.nombre_negocio || 'Pastelería Confetti';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          {config?.logo_url ? (
            <img src={config.logo_url} alt={negocio} className="w-20 h-20 object-contain mb-3" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Sparkles className="w-9 h-9 text-primary" />
            </div>
          )}
          <h1 className="text-2xl font-heading font-black">{negocio}</h1>
          <p className="text-sm text-muted-foreground mt-1">Configurar esta terminal</p>
          <p className="text-xs text-muted-foreground/80 mt-2 max-w-xs">
            Elige la sucursal donde está este dispositivo. Solo se hace una vez.
          </p>
        </div>

        {/* Lista de sucursales */}
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Cargando sucursales…</span>
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <p className="text-sm text-muted-foreground mb-3">No se pudieron cargar las sucursales.</p>
            <button
              type="button"
              onClick={cargar}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              Reintentar
            </button>
          </div>
        ) : sucursales.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No hay sucursales activas. Crea una desde Configuración.
          </div>
        ) : (
          <div className="space-y-3">
            {sucursales.map((suc) => (
              <button
                key={suc.id}
                type="button"
                onClick={() => seleccionar(suc)}
                disabled={guardando}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-border bg-card text-left transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.99] disabled:opacity-60"
                style={{ touchAction: 'manipulation' }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Store className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-lg truncate">{suc.nombre}</p>
                  {suc.direccion && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {suc.direccion}
                    </p>
                  )}
                </div>
                <CheckCircle2 className="w-5 h-5 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Separador + acceso de dueño — siempre visible (no depende de la
            carga de sucursales). */}
        <div className="mt-6 pt-5 border-t border-border">
          <button
            type="button"
            onClick={() => setShowPinDueno(true)}
            disabled={guardando}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 text-left transition-all hover:border-primary hover:bg-primary/10 active:scale-[0.99] disabled:opacity-60"
            style={{ touchAction: 'manipulation' }}
          >
            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold">Soy dueño</p>
              <p className="text-xs text-muted-foreground">Acceso administrativo (requiere PIN)</p>
            </div>
          </button>
        </div>
      </div>

      <ModalPinAdmin
        open={showPinDueno}
        onOpenChange={setShowPinDueno}
        onSuccess={handleDuenoSuccess}
        soloDueno
        title="Acceso de dueño"
        subtitle="Ingresa tu PIN de dueño"
      />
    </div>
  );
}
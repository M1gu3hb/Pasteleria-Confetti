import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '@/lib/TerminalContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { loginTerminal } from '@/api/supabaseClient';
import ConfigurarTerminal from '@/pages/ConfigurarTerminal';
import AccesoDuenoGate from './AccesoDuenoGate';

/**
 * TerminalGate — Fase 2A.fix
 * ------------------------------------------------------------------
 * Decide qué se muestra ANTES de la app operativa:
 *
 *  1. Dispositivo de DUEÑO (confetti_modo_dueno)  → AccesoDuenoGate
 *     (pide PIN de dueño directamente, sin selector de sucursales).
 *  2. Terminal NO configurada  → pantalla "Configurar esta terminal".
 *  3. Terminal configurada     → auto-login de un EMPLEADO virtual
 *     (rol 'caja', sin PIN) y entra al AppLayout (children).
 *
 * El modo administrador se activa aparte (ModalPinAdmin desde el Sidebar),
 * que hace login() con el admin real reemplazando al empleado virtual.
 *
 * NO toca Caja, useCajaAbierta ni CorteCaja.
 */
export default function TerminalGate({ children }) {
  const { terminal, modoDuenoDispositivo, isLoading: terminalLoading } = useTerminal();
  const { posUser, login, isLoading: authLoading } = usePOSAuth();
  const [sesionError, setSesionError] = useState(null);
  // Evita doble apertura de sesión terminal mientras posUser aún no se refleja.
  const autoLoginRef = useRef(false);

  // ── EL REF NO PUEDE SER UN LATCH PERMANENTE ─────────────────────────
  // `autoLoginRef` existe para que NO se abran dos sesiones de terminal a la
  // vez mientras `posUser` aún no se refleja. Sólo para eso.
  //
  // Pero TerminalGate es el `element` de la ruta de layout (`App.jsx`): NO se
  // desmonta NUNCA. Así que el ref sobrevivía a todo, y eso lo convertía en un
  // "ya se hizo una vez, no lo vuelvas a intentar jamás".
  //
  // El camino que lo rompe lo introdujo el arreglo de la sesión colgada
  // (`Sidebar.handleSalirAdmin`): si al salir de dueño/pastelero `loginTerminal`
  // falla por red, hace `logout()` → `posUser` pasa a null. El efecto se vuelve
  // a disparar, pero muere en `if (autoLoginRef.current) return`. Y como
  // `sesionError` sigue en null (lo limpió el auto-login inicial), tampoco se
  // renderiza el bloque de rescate con el botón "Reintentar", que es el ÚNICO
  // otro sitio que resetea el ref. Resultado: `if (!posUser)` → SPINNER
  // INFINITO, con el POS muerto hasta recargar la página.
  //
  // Al soltar el ref cuando desaparece `posUser`, el reintento vuelve a ser
  // posible. El guard real contra la doble apertura sigue siendo `if (posUser)
  // return` más el propio ref durante el await.
  useEffect(() => {
    if (!posUser) autoLoginRef.current = false;
  }, [posUser]);

  // Auto-login del empleado virtual cuando hay terminal y aún no hay usuario.
  // Fase 4: ANTES de loguear al empleado, abre la sesión Supabase de la cuenta
  // TERMINAL de la sucursal (scoped por RLS). Rol 'caja' = acceso operativo a
  // Caja/POS sin módulos admin. NO aplica en dispositivo de dueño (entra con PIN).
  useEffect(() => {
    if (terminalLoading || authLoading) return;
    if (modoDuenoDispositivo) return;
    if (!terminal) return;
    if (posUser) return;
    if (autoLoginRef.current) return;
    autoLoginRef.current = true;

    (async () => {
      const res = await loginTerminal(terminal.sucursal_id);
      if (!res.ok) {
        autoLoginRef.current = false;
        setSesionError(res.error || 'No se pudo abrir la sesión de la terminal.');
        return;
      }
      setSesionError(null);
      login({
        id: 'empleado_terminal',
        nombre: 'Empleado',
        rol: 'caja',
        es_empleado_virtual: true,
        sucursal_id: terminal.sucursal_id,
        sucursal_nombre: terminal.sucursal_nombre,
      });
    })();
  }, [terminal, modoDuenoDispositivo, posUser, terminalLoading, authLoading, login]);

  if (terminalLoading || authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Dispositivo de dueño → siempre pide PIN (sin selector de sucursales).
  if (modoDuenoDispositivo) {
    return <AccesoDuenoGate>{children}</AccesoDuenoGate>;
  }

  // Sin terminal → pantalla de configuración (sin PIN).
  if (!terminal) {
    return <ConfigurarTerminal />;
  }

  // Falló la apertura de la sesión terminal (Supabase) → no entrar a ciegas.
  if (sesionError) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground max-w-sm">
          No se pudo conectar la terminal con el servidor. Revisa la conexión e intenta de nuevo.
        </p>
        <p className="text-[11px] text-muted-foreground/60">{sesionError}</p>
        <button
          type="button"
          onClick={() => { autoLoginRef.current = false; setSesionError(null); }}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Con terminal pero el auto-login aún no resolvió → spinner breve.
  if (!posUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return children;
}
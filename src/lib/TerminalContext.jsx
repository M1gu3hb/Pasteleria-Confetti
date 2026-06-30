import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * TerminalContext — Fase 2A.fix
 * ------------------------------------------------------------------
 * Gestiona la configuración de la TERMINAL física (tablet/teléfono fijo),
 * el modo administrativo (dueño / administrador) y la sucursal que el
 * dueño está viendo en memoria.
 *
 * PERSISTENCIA (localStorage):
 *  - "confetti_terminal"   → sucursal fija del dispositivo (terminal).
 *  - "confetti_modo_dueno" → true si el dispositivo es de un dueño
 *                            (no se configura como terminal de sucursal).
 *
 * EN MEMORIA (NO persistente, se pierde al recargar — por diseño):
 *  - adminMode          → si hay sesión admin activa.
 *  - adminRole          → 'dueno' | 'administrador' | null.
 *  - sucursalActivaAdmin → sucursal que el dueño está viendo (ACCIÓN B).
 *
 * Dos acciones de sucursal DISTINTAS:
 *  - ACCIÓN A (cambiarTerminalFisica): reconfigura el dispositivo →
 *    escribe localStorage y el caller recarga la página.
 *  - ACCIÓN B (verSucursalAdmin): solo dueño, cambia la sucursal vista
 *    en memoria SIN tocar localStorage ni recargar.
 *
 * NO toca POSAuthContext, Caja, CorteCaja, useCajaAbierta ni schemas.
 */

const TERMINAL_KEY = 'confetti_terminal';
const MODO_DUENO_KEY = 'confetti_modo_dueno';
const TerminalContext = createContext(null);

// Lectura defensiva de localStorage. Si el entorno lo restringe, devuelve null
// sin romper la app.
function leerTerminal() {
  try {
    const raw = localStorage.getItem(TERMINAL_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && obj.sucursal_id) return obj;
    return null;
  } catch {
    return null;
  }
}

function leerModoDueno() {
  try {
    return localStorage.getItem(MODO_DUENO_KEY) === 'true';
  } catch {
    return false;
  }
}

export function TerminalProvider({ children }) {
  const [terminal, setTerminal] = useState(null);
  // Dispositivo de dueño: no es terminal fija, siempre entra con PIN.
  const [modoDuenoDispositivo, setModoDuenoDispositivo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- Estado admin SOLO en memoria. Nunca se persiste. ---
  const [adminMode, setAdminMode] = useState(false);
  // adminRole: 'dueno' | 'administrador' | null
  const [adminRole, setAdminRole] = useState(null);
  // adminUser: objeto completo del UsuarioPOS autenticado por PIN
  // ({ id, nombre, rol, sucursal_id, sucursal_nombre, ... }). Solo en memoria.
  // Fuente de verdad de la sucursal de un administrador.
  const [adminUser, setAdminUser] = useState(null);
  // Sucursal que el dueño está VIENDO (ACCIÓN B). No toca localStorage.
  const [sucursalActivaAdmin, setSucursalActivaAdmin] = useState(null);

  useEffect(() => {
    setTerminal(leerTerminal());
    setModoDuenoDispositivo(leerModoDueno());
    setIsLoading(false);
  }, []);

  // Guarda/actualiza la terminal (sucursal) en localStorage.
  // Usado por ConfigurarTerminal (primera vez).
  const configurarTerminal = useCallback((sucursal) => {
    if (!sucursal?.id) return false;
    const data = {
      sucursal_id: sucursal.id,
      sucursal_nombre: sucursal.nombre || '',
      folio_prefijo: sucursal.folio_prefijo || '',
      configurado_en: new Date().toISOString(),
    };
    try {
      localStorage.setItem(TERMINAL_KEY, JSON.stringify(data));
    } catch {
      // Si no se puede persistir, igual mantenemos en memoria para esta sesión.
    }
    setTerminal(data);
    return true;
  }, []);

  // ACCIÓN A — Cambiar la terminal física a otra sucursal.
  // Escribe localStorage. El caller debe recargar la página después.
  const cambiarTerminalFisica = useCallback((sucursal) => {
    return configurarTerminal(sucursal);
  }, [configurarTerminal]);

  // Marca este dispositivo como dispositivo de dueño (ConfigurarTerminal →
  // "Soy dueño"). No configura terminal fija de sucursal.
  const activarDispositivoDueno = useCallback(() => {
    try {
      localStorage.setItem(MODO_DUENO_KEY, 'true');
    } catch {
      // ignore
    }
    setModoDuenoDispositivo(true);
  }, []);

  // Activa la sesión admin recibiendo el UsuarioPOS COMPLETO autenticado.
  // - Normaliza el rol legacy con tilde ('dueño') a 'dueno'.
  // - Para 'administrador': EXIGE sucursal_id asignada. Si no la tiene,
  //   NO entra y devuelve { ok:false, error } para que el caller avise.
  // - Guarda adminUser en estado (fuente de la sucursal del administrador).
  // Devuelve { ok:boolean, error?:string }.
  const activarAdmin = useCallback(async (usuario) => {
    const rolRaw = usuario?.rol === 'dueño' ? 'dueno' : usuario?.rol;
    // 'pastelero' es global (no requiere sucursal). 'dueno' también es global.
    const rol = rolRaw === 'dueno' ? 'dueno' : rolRaw === 'pastelero' ? 'pastelero' : 'administrador';

    if (rol === 'administrador' && !usuario?.sucursal_id) {
      return {
        ok: false,
        error: 'Este administrador no tiene sucursal asignada. Contacta al dueño para configurar su cuenta.',
      };
    }

    // Fase 5.fix2 — obtener folio_prefijo real de la entidad Sucursal para
    // que sucursalEfectiva.folio_prefijo entregue A/B/C en modo administrador.
    let sucursalFolioPrefijo = '';
    if (usuario?.sucursal_id) {
      try {
        const sucursalData = await base44.entities.Sucursal.get(usuario.sucursal_id);
        sucursalFolioPrefijo = sucursalData?.folio_prefijo || '';
      } catch {
        sucursalFolioPrefijo = (usuario.sucursal_nombre || '').charAt(0).toUpperCase();
      }
    }

    setAdminUser(usuario ? { ...usuario, sucursal_folio_prefijo: sucursalFolioPrefijo } : null);
    setAdminRole(rol);
    setAdminMode(true);
    return { ok: true };
  }, []);

  // Sale de la sesión admin → vuelve a modo empleado.
  // La sucursal vista en memoria se descarta (vuelve a la del dispositivo).
  const salirAdmin = useCallback(() => {
    setAdminMode(false);
    setAdminRole(null);
    setAdminUser(null);
    setSucursalActivaAdmin(null);
  }, []);

  // ACCIÓN B — El dueño cambia qué sucursal está viendo (solo memoria).
  const verSucursalAdmin = useCallback((sucursal) => {
    // Fase 6 — null = Vista general del dueño (todas las sucursales).
    if (sucursal === null) { setSucursalActivaAdmin(null); return; }
    if (!sucursal?.id) return;
    setSucursalActivaAdmin({
      sucursal_id: sucursal.id,
      sucursal_nombre: sucursal.nombre || '',
      folio_prefijo: sucursal.folio_prefijo || '',
    });
  }, []);

  // Sucursal "efectiva" — jerarquía estricta por modo (Fase 2A.bugfix):
  //  CASO 2 — admin: SIEMPRE la sucursal asignada al usuario (adminUser),
  //           nunca la del localStorage/terminal.
  //  CASO 3 — dueño: la que está viendo en memoria (ACCIÓN B) o null/global.
  //  CASO 1 — empleado (sin adminMode): la del dispositivo (terminal).
  const sucursalEfectiva = (() => {
    // Pastelero: vista GLOBAL (todas las sucursales) → sin sucursal efectiva.
    if (adminMode && adminRole === 'pastelero') return null;
    if (adminMode && adminRole === 'administrador') {
      return adminUser?.sucursal_id
        ? { sucursal_id: adminUser.sucursal_id, sucursal_nombre: adminUser.sucursal_nombre || '', folio_prefijo: adminUser.sucursal_folio_prefijo || '' }
        : null;
    }
    if (adminMode && adminRole === 'dueno') {
      return sucursalActivaAdmin || null;
    }
    return terminal || null;
  })();

  return (
    <TerminalContext.Provider
      value={{
        terminal,
        modoDuenoDispositivo,
        isLoading,
        configurarTerminal,
        cambiarTerminalFisica,
        activarDispositivoDueno,
        adminMode,
        adminRole,
        adminUser,
        activarAdmin,
        salirAdmin,
        sucursalActivaAdmin,
        verSucursalAdmin,
        sucursalEfectiva,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
  return ctx;
}
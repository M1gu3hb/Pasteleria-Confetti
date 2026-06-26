import React, { createContext, useState, useContext, useEffect } from 'react';
import { ensureSession } from '@/api/supabaseClient';

// =====================================================================
// AuthContext (migrado): ya NO usa el auth de plataforma de Base44
// (createAxiosClient, /public-settings, base44.auth.me). El login de
// OPERADOR del POS vive en POSAuthContext (rol/PIN). Aquí solo se llama a
// ensureSession() al montar para que, si este dispositivo es una TERMINAL
// configurada, quede abierta su sesión Supabase (scoped por RLS a su
// sucursal) antes de las primeras queries. La sesión staging de Fase 2/3 ya
// NO se usa: el bootstrap es la cuenta terminal (ver supabaseClient.js).
// Se conserva la MISMA interfaz pública para no tocar a los consumidores.
// =====================================================================
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    ensureSession().finally(() => { if (mounted) setIsLoadingAuth(false); });
    return () => { mounted = false; };
  }, []);

  const logout = () => { /* el logout de operador lo maneja POSAuthContext */ };
  const navigateToLogin = () => { /* no aplica: gate por terminal/PIN */ };
  const checkUserAuth = async () => {};
  const checkAppState = async () => {};

  return (
    <AuthContext.Provider value={{
      user: null,
      isAuthenticated: true,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      authChecked: true,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

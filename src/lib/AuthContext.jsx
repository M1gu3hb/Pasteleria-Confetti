import React, { createContext, useState, useContext, useEffect } from 'react';
import { ensureSession } from '@/api/supabaseClient';

// =====================================================================
// AuthContext (migrado): ya NO usa el auth de plataforma de Base44
// (createAxiosClient, /public-settings, base44.auth.me). El login de
// OPERADOR del POS vive en POSAuthContext (rol/PIN). Aquí solo se asegura
// una sesión Supabase temporal (rol authenticated) para que apliquen las
// políticas RLS amplias en Fase 2/3. En Fase 4 esto se reemplaza por
// Supabase Auth real por usuario.
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

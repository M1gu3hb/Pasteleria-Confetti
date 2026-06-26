import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falla temprano y claro (regla: validar en los límites del sistema).
  console.error('[supabase] Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/**
 * Sesión temporal con rol `authenticated` (Fase 2/3) para que apliquen las
 * políticas RLS amplias del POS. NO es el login de operador (UsuarioPOS/PIN),
 * que sigue su propio flujo. En Fase 4 esto se reemplaza por Supabase Auth real
 * por usuario (y se elimina la cuenta de staging).
 */
let _sessionPromise = null;
export function ensureSession() {
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = (async () => {
    try {
      const { data: cur } = await supabase.auth.getSession();
      if (cur?.session) return cur.session;
      const email = import.meta.env.VITE_STAGING_AUTH_EMAIL;
      const password = import.meta.env.VITE_STAGING_AUTH_PASSWORD;
      if (email && password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) console.warn('[supabase] sesión temporal falló:', error.message);
      }
      const { data: after } = await supabase.auth.getSession();
      return after?.session ?? null;
    } catch (e) {
      console.warn('[supabase] ensureSession error:', e?.message || e);
      return null;
    }
  })();
  return _sessionPromise;
}

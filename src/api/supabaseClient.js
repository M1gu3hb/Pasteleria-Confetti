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

// =====================================================================
// Fase 4 — Auth real por sesión (reemplaza la sesión staging de Fase 2/3).
// ---------------------------------------------------------------------
// Tres tipos de sesión Supabase, que mapean al aislamiento RLS:
//   * TERMINAL  -> cuenta `caja` por sucursal (pos_is_admin=false). Empleado y
//                  administrador de esa sucursal operan SOBRE esta sesión.
//   * DUEÑO     -> cuenta real del dueño (pos_is_admin=true, global).
//   * (anon)    -> sin sesión: solo lo que permite la RLS anon (sucursales/
//                  categorías/vistas públicas). Pantallas pre-login.
//
// El modo ADMINISTRADOR NO abre sesión propia: valida su PIN (login_pos) y se
// queda sobre la sesión TERMINAL -> hereda el alcance de la sucursal. Por eso
// un administrador nunca ve otra sucursal aunque su rol sea "administrador".
// =====================================================================

// localStorage keys (mismas que TerminalContext — contrato compartido del POS).
const TERMINAL_KEY = 'confetti_terminal';
const MODO_DUENO_KEY = 'confetti_modo_dueno';

// Password fijo embebido de las cuentas terminal (decisión de Miguel, Opción A).
// Debe coincidir con el crypt() de la migración 0015. La RLS scoped (caja ->
// solo su sucursal) acota el blast radius; mismo modelo de confianza que la
// cuenta staging anterior. En .env como VITE_TERMINAL_PASSWORD.
const TERMINAL_PASSWORD = import.meta.env.VITE_TERMINAL_PASSWORD || 'POS-TERMINAL-CONFETTI';

const terminalEmail = (sucursalId) =>
  `terminal-${String(sucursalId || '').toLowerCase()}@pos.confetti.local`;

function readTerminalFromStorage() {
  try {
    const raw = localStorage.getItem(TERMINAL_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && obj.sucursal_id ? obj : null;
  } catch {
    return null;
  }
}

function readDuenoFlag() {
  try {
    return localStorage.getItem(MODO_DUENO_KEY) === 'true';
  } catch {
    return false;
  }
}

// Memo del bootstrap para deduplicar las primeras llamadas concurrentes
// (el adaptador llama ensureSession() antes de cada query). Se invalida tras
// cualquier cambio explícito de sesión para que la siguiente llamada relea.
let _bootstrap = null;
const resetBootstrap = () => { _bootstrap = null; };

/**
 * Asegura la sesión Supabase ANTES de las queries del adaptador.
 *  - Si ya hay sesión -> la devuelve.
 *  - Si este dispositivo es una TERMINAL configurada (y no es dispositivo de
 *    dueño) -> abre la sesión terminal de su sucursal (scoped por RLS).
 *  - En otro caso (sin terminal / dispositivo de dueño / pantalla de config)
 *    -> devuelve null (anon). El login de dueño/operador abre su sesión aparte.
 */
export function ensureSession() {
  if (_bootstrap) return _bootstrap;
  _bootstrap = (async () => {
    try {
      const { data: cur } = await supabase.auth.getSession();
      if (cur?.session) return cur.session;

      const term = readTerminalFromStorage();
      if (term?.sucursal_id && !readDuenoFlag()) {
        await loginTerminal(term.sucursal_id);
        const { data: after } = await supabase.auth.getSession();
        return after?.session ?? null;
      }
      return null;
    } catch (e) {
      console.warn('[supabase] ensureSession error:', e?.message || e);
      return null;
    }
  })();
  return _bootstrap;
}

/**
 * Abre (o reutiliza) la sesión TERMINAL de una sucursal. Idempotente: si la
 * sesión actual ya es la de esa terminal, no re-autentica.
 * Devuelve { ok, error? }.
 */
export async function loginTerminal(sucursalId) {
  if (!sucursalId) return { ok: false, error: 'Sucursal de terminal no definida' };
  const email = terminalEmail(sucursalId);
  try {
    const { data: cur } = await supabase.auth.getSession();
    if (cur?.session?.user?.email === email) return { ok: true };
    const { error } = await supabase.auth.signInWithPassword({ email, password: TERMINAL_PASSWORD });
    resetBootstrap();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Valida un PIN server-side vía RPC login_pos (compara contra pin_hash bcrypt)
 * SIN cambiar la sesión Supabase. Devuelve el operador
 * { id, email, nombre, rol, sucursal_id, sucursal_nombre } o null.
 * Lo usa el modo administrador (desbloqueo de UI sobre la sesión terminal).
 */
export async function validarPin(pin, userId = null) {
  if (!pin) return null;
  const { data, error } = await supabase.rpc('login_pos', { p_pin: pin, p_user_id: userId });
  if (error) {
    console.warn('[supabase] login_pos error:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

/**
 * Login completo por PIN: valida (login_pos) y ABRE la sesión Supabase del
 * operador (signInWithPassword con password derivado 'POS-'+pin). Lo usa el
 * DUEÑO (sesión global). El administrador NO lo usa: valida con validarPin y
 * se queda sobre la sesión terminal (no escala a sesión propia).
 * Devuelve el operador o null.
 */
export async function loginConPin(pin, userId = null) {
  const op = await validarPin(pin, userId);
  if (!op) return null;
  const { error } = await supabase.auth.signInWithPassword({
    email: op.email,
    password: `POS-${pin}`,
  });
  resetBootstrap();
  if (error) {
    console.warn('[supabase] signIn operador falló:', error.message);
    return null;
  }
  return op;
}

/**
 * Cierra la sesión del operador/dueño actual. No re-bootstrapea: el caller
 * decide (p. ej. Sidebar restaura la sesión terminal al salir de dueño).
 */
export async function logoutOperador() {
  try { await supabase.auth.signOut(); } catch { /* noop */ }
  resetBootstrap();
}

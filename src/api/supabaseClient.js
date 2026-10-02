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

// Auth efectivo: terminal técnica con sesión revocable por dispositivo;
// dueño global; administrador con identidad propia y sucursal asignada;
// pastelero global limitado a pedidos. El servidor revalida actividad y rol.
// La autorización PIN ocurre exclusivamente en pin-login con contador durable.

// localStorage keys (mismas que TerminalContext — contrato compartido del POS).
const TERMINAL_KEY = 'confetti_terminal';
const MODO_DUENO_KEY = 'confetti_modo_dueno';

// A terminal retains its own revocable Auth session on this device. No shared
// password is shipped. A new/reset device is authorized once with the owner's
// existing PIN modal; established terminals keep their current sessions.
const TERMINAL_SESSION_KEY = 'confetti:terminal-session:v1';
function guardarSesionTerminal(session) {
  if (/^terminal-[0-9a-f-]+@pos\.confetti\.local$/i.test(session?.user?.email || '')) {
    localStorage.setItem(TERMINAL_SESSION_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, email: session.user.email }));
  }
}
async function pinProtegido(pin, userId, modo) {
  const { data, error } = await supabase.functions.invoke('pin-login', { body: { pin, usuario_id: userId, modo } });
  if (error) throw new Error('No se pudo conectar para validar el PIN. Reintenta.');
  if (data?.espera_segundos > 0) throw new Error(`Demasiados intentos. Espera ${data.espera_segundos} segundos y reintenta.`);
  return data?.ok ? data : null;
}

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
    if (cur?.session?.user?.email === email) { guardarSesionTerminal(cur.session); return { ok: true }; }
    const saved = JSON.parse(localStorage.getItem(TERMINAL_SESSION_KEY) || 'null');
    if (saved?.email === email) {
      const { data, error } = await supabase.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
      if (!error && data?.session?.user?.email === email) { guardarSesionTerminal(data.session); resetBootstrap(); return { ok: true }; }
    }
    // Only a verified active owner may enroll a terminal on a new device.
    if (cur?.session) {
      await supabase.auth.setSession({ access_token: cur.session.access_token, refresh_token: cur.session.refresh_token });
      const { data, error } = await supabase.functions.invoke('terminal-login', { body: { sucursal_id: sucursalId } });
      if (!error && data?.token_hash) {
        const { data: sesion, error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
        if (!otpError && sesion?.session?.user?.email === email) { guardarSesionTerminal(sesion.session); resetBootstrap(); return { ok: true }; }
      }
    }
    return { ok: false, requiereEnrolamiento: true, error: 'El dueño debe autorizar esta terminal con su PIN.' };
  } catch { return { ok: false, error: 'No se pudo recuperar la sesión de terminal. Reintenta sin borrar los datos del dispositivo.' }; }
}

/** Valida PIN en el servidor sin cambiar la sesión. */
export async function validarPin(pin, userId = null) {
  const data = await pinProtegido(pin, userId, 'validar');
  return data?.operador || null;
}

/** Abre sesión del operador con un hash de un solo uso, sin contraseña derivada. */
export async function loginConPin(pin, userId = null) {
  const { data: actual } = await supabase.auth.getSession();
  guardarSesionTerminal(actual?.session);
  const data = await pinProtegido(pin, userId, 'sesion');
  if (!data?.token_hash) return null;
  const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
  resetBootstrap();
  if (error) throw new Error('No se pudo abrir la sesión. Reintenta con el PIN.');
  return data.operador;
}

/**
 * Cierra la sesión del operador/dueño actual. No re-bootstrapea: el caller
 * decide (p. ej. Sidebar restaura la sesión terminal al salir de dueño).
 */
export async function logoutOperador() {
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
  resetBootstrap();
}


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { loginConPin } from '@/api/supabaseClient';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLE_HOME_ROUTES, ROLE_LABELS } from '@/lib/constants';
import { Delete, User, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import LoginBrandColors from '@/components/common/LoginBrandColors';
import { ensureDefaultAdmin, isUsingDefaultAdminPin } from '@/lib/ensureDefaultAdmin';

export default function POSLogin() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  // HOTFIX P0 — Distinguir estados reales:
  //   usuariosFetched: true cuando un fetch terminó EXITOSAMENTE al menos 1 vez.
  //   usuariosCargando: true mientras hay un intento en vuelo (incluye retries).
  //   usuariosError: true SOLO después de agotar todos los reintentos sin éxito.
  // Empty real = usuariosFetched && !usuariosError && !usuariosCargando && usuarios.length === 0.
  const [usuariosFetched, setUsuariosFetched] = useState(false);
  const [usuariosCargando, setUsuariosCargando] = useState(true);
  const [usuariosError, setUsuariosError] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const { login, posUser } = usePOSAuth();
  const { config } = useConfig();
  const navigate = useNavigate();
  const hiddenInputRef = useRef(null);
  // Para cancelar la cadena de reintentos si el componente se desmonta
  // o si el usuario presiona "Reintentar" manualmente.
  const cargaTokenRef = useRef(0);

  useEffect(() => {
    if (posUser) navigate(ROLE_HOME_ROUTES[posUser.rol] || '/');
  }, [posUser, navigate]);

  // HOTFIX P0 — Carga robusta de usuarios con reintentos automáticos.
  //   - 4 intentos máximo (0ms, 700ms, 1500ms, 2800ms).
  //   - NO vacía la lista de usuarios previos durante reintentos: si ya
  //     teníamos usuarios buenos en memoria y un refetch falla, los
  //     conservamos hasta tener un fetch exitoso o agotar reintentos.
  //   - usuariosError SOLO se enciende DESPUÉS de agotar todos los intentos.
  //   - Usa cargaTokenRef para evitar race conditions si el usuario presiona
  //     "Reintentar" mientras una cadena anterior aún corre.
  const cargarUsuarios = useCallback(async () => {
    const miToken = ++cargaTokenRef.current;
    setUsuariosCargando(true);
    setUsuariosError(false);

    // Asegurar admin default (idempotente). Si falla, no abortamos.
    try { await ensureDefaultAdmin(); } catch { /* noop */ }

    // Delays entre reintentos (en ms). Total ~5 segundos de paciencia.
    const delays = [0, 700, 1500, 2800];
    let ultimoError = null;

    for (let i = 0; i < delays.length; i++) {
      if (cargaTokenRef.current !== miToken) return; // cancelado
      if (delays[i] > 0) {
        await new Promise((r) => setTimeout(r, delays[i]));
        if (cargaTokenRef.current !== miToken) return;
      }
      try {
        // Fase 4: lista desde la vista usuarios_login (anon-legible, sin
        // pin_hash y SIN cuentas terminal). Reemplaza la lectura directa de
        // usuarios_pos (ya bloqueada para anon).
        const list = await base44.entities.UsuarioLogin.filter({});
        if (cargaTokenRef.current !== miToken) return;
        if (Array.isArray(list)) {
          setUsuarios(list);
          setUsuariosFetched(true);
          setUsuariosError(false);
          setUsuariosCargando(false);
          return;
        }
        // Respuesta no-array: tratamos como fallo recuperable.
        ultimoError = new Error('Respuesta no válida del servidor');
      } catch (err) {
        ultimoError = err;
        console.warn(`[POSLogin] intento ${i + 1}/${delays.length} falló:`, err?.message || err);
      }
    }

    // Si llegamos aquí: agotamos todos los reintentos.
    if (cargaTokenRef.current !== miToken) return;
    console.error('[POSLogin] todos los intentos fallaron:', ultimoError);
    setUsuariosError(true);
    setUsuariosCargando(false);
  }, []);

  useEffect(() => {
    cargarUsuarios();
    return () => {
      // Cancelar cualquier cadena de reintentos pendiente al desmontar.
      cargaTokenRef.current++;
    };
  }, [cargarUsuarios]);

  // Aviso discreto: admin sigue usando PIN default 1234.
  const usingDefaultPin = isUsingDefaultAdminPin(usuarios);

  // Foco persistente
  useEffect(() => { hiddenInputRef.current?.focus(); }, [selectedUser]);

  const tryLogin = async (pinToUse) => {
    if (!pinToUse || pinToUse.length < 4) return;
    setLoading(true);
    try {
      // Fase 4: valida server-side y abre la sesión Supabase del operador
      // (login_pos + signInWithPassword). Reemplaza la comparación en cliente
      // `u.pin === pin` (la columna pin ya no existe).
      const op = await loginConPin(pinToUse, selectedUser?.id || null);
      if (op) {
        login(op);
        navigate(ROLE_HOME_ROUTES[op.rol] || '/');
        toast.success(`Bienvenido, ${op.nombre}`);
      } else {
        toast.error('PIN incorrecto');
        setPin('');
      }
    } catch (err) {
      console.error('[POSLogin] tryLogin:', err);
      toast.error('No se pudo validar el PIN.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pin.length === 4) tryLogin(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleKey = (key) => {
    if (loading) return;
    if (pin.length < 4) setPin(p => p + key);
  };

  // PARTE B — Teclado físico robusto:
  //  - Acepta 0-9 del teclado principal Y del numpad (e.key es "0".."9" en ambos).
  //  - Ignora autorepeat (e.repeat) para no llenar el PIN con una sola tecla mantenida.
  //  - No captura si el foco está en un input real visible (no nuestro hiddenInput),
  //    para no bloquear futuros campos (motivo, búsqueda, etc.).
  //  - Backspace / Delete borran un dígito. Enter intenta login con PIN completo.
  //  - Escape limpia PIN y deselecciona usuario.
  useEffect(() => {
    const onKey = (e) => {
      if (loading) return;
      if (e.repeat) return; // anti autorepeat
      // No bloquear cuando el usuario escribe en un input/textarea real.
      const t = e.target;
      const tag = t?.tagName || '';
      const isHidden = t === hiddenInputRef.current;
      const isEditableField =
        (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) &&
        !isHidden;
      if (isEditableField) return;

      // Dígitos: teclado principal y numpad ambos reportan e.key "0".."9".
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (pin.length < 4) setPin(p => p + e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setPin(p => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4) tryLogin(pin);
      } else if (e.key === 'Escape') {
        setPin(''); setSelectedUser(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, loading, usuarios, selectedUser]);

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const sistema = config.nombre_sistema || 'POS Pastelería Confetti';
  const negocio = config.nombre_negocio || 'Pastelería Confetti';

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        /* HOTFIX color primario — el fondo del login ahora deriva del color
           primario configurado. Antes era un hex hardcoded azul/morado
           (#04070f → #0a1428 → #0b1d3a) que ignoraba la paleta de marca.
           Ahora: negro profundo arriba → primary-dark → primary, creando
           un degradado premium que respeta la marca del restaurante.
           Las vars vienen de LoginBrandColors (CSS vars en <html>). */
        background: `
          radial-gradient(120% 80% at 80% 100%, var(--brand-primary-dark, #0a1428) 0%, transparent 60%),
          radial-gradient(100% 80% at 20% 0%, var(--brand-primary, #1e40af) 0%, transparent 50%),
          linear-gradient(180deg, #04070f 0%, #060912 40%, #0a0e1a 100%)
        `,
      }}
    >
      {/* Aplica color_primario/color_acento como CSS vars en <html>. */}
      <LoginBrandColors />

      {/* Glow decorativo — usa la paleta de marca dinámica.
          El fondo base siempre es oscuro/premium; solo cambian los tonos del glow. */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[120px]"
          style={{ background: 'var(--brand-primary-glow, rgba(37, 99, 235, 0.20))' }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] opacity-80"
          style={{ background: 'var(--brand-accent-glow, rgba(56, 189, 248, 0.18))' }}
        />
        {config.background_logo_url && (
          /* Marca de agua decorativa: más visible que antes (0.04 → 0.10)
             con un leve drop-shadow tintado de la marca para que se note
             como elemento premium sin competir con el logo principal. */
          <img
            src={config.background_logo_url}
            alt=""
            aria-hidden
            className="absolute right-[-10%] bottom-[-10%] w-[55vw] max-w-[700px] select-none brand-watermark"
            style={{
              opacity: 0.10,
              filter: 'drop-shadow(0 0 30px var(--brand-primary-glow, rgba(59,130,246,0.35)))',
              mixBlendMode: 'screen',
            }}
          />
        )}
      </div>

      {/* Hidden input */}
      <input ref={hiddenInputRef} type="text" inputMode="numeric" autoFocus
        value="" onChange={() => {}} className="sr-only" aria-label="PIN" />

      {/* HEADER central: logo + nombre + PIN + keypad */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        {/* Logo grande sin caja — drop-shadow usa color primario dinámico */}
        {config.logo_url ? (
          <img src={config.logo_url} alt={negocio}
            className="w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 object-contain mb-4"
            style={{ filter: 'drop-shadow(0 0 30px var(--brand-primary-glow, rgba(59,130,246,0.45)))' }}
          />
        ) : (
          <div className="w-28 h-28 mb-4 rounded-2xl flex items-center justify-center text-5xl font-bold text-white/80"
            style={{ background: 'var(--brand-primary-soft, rgba(37,99,235,0.20))' }}
          >M</div>
        )}

        <h1 className="text-3xl sm:text-4xl font-heading font-black text-white tracking-wide text-center">
          {negocio}
        </h1>
        <p className="text-white/60 text-sm mt-1 tracking-wider uppercase">{sistema}</p>

        {selectedUser && (
          <p
            className="mt-3 px-3 py-1 rounded-full border text-white/90 text-xs font-medium"
            style={{
              background: 'var(--brand-accent-soft, rgba(56,189,248,0.15))',
              borderColor: 'var(--brand-accent, rgba(96,165,250,0.4))',
            }}
          >
            Iniciando como: {selectedUser.nombre}
          </p>
        )}

        {/* PIN dots — usa color de acento dinámico */}
        <div className="flex justify-center gap-3 mt-6 mb-5">
          {[0,1,2,3].map(i => {
            const filled = i < pin.length;
            return (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${filled ? 'scale-110' : ''}`}
                style={filled ? {
                  background: 'var(--brand-accent, #60a5fa)',
                  borderColor: 'var(--brand-accent, #60a5fa)',
                  boxShadow: '0 0 12px var(--brand-accent-glow, rgba(96,165,250,0.8))',
                } : {
                  borderColor: 'rgba(255,255,255,0.2)',
                  background: 'transparent',
                }}
              />
            );
          })}
        </div>

        {/* Keypad — skeuomórfico SIN bandeja. Teclas flotantes sobre el fondo
            del login, con relieve físico real y tintadas con el color de marca. */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {keys.map((key, idx) => (
            key === '' ? <div key={idx} /> :
            key === '⌫' ? (
              <button key={idx} onClick={() => setPin(p => p.slice(0, -1))} disabled={loading}
                className="keypad-btn keypad-btn--del h-14 sm:h-16 rounded-xl text-white flex items-center justify-center">
                <Delete className="w-5 h-5 drop-shadow-md" />
              </button>
            ) : (
              <button key={idx} onClick={() => handleKey(key)} disabled={loading}
                className="keypad-btn h-14 sm:h-16 rounded-xl text-white text-xl sm:text-2xl font-heading font-bold">
                {key}
              </button>
            )
          ))}
        </div>
        {/* Skeuomorfismo (solo teclas) — gradiente teñido con --brand-primary:
            - Luz superior (highlight) + sombra inferior interior (volumen).
            - Sombra externa dura debajo: separación del fondo (3D).
            - Hover: glow del acento de marca.
            - Active: la tecla se HUNDE (translateY + sombra invertida).
            - Tecla ⌫: tinte rojo. Sin marco/bandeja detrás. */}
        <style>{`
          .keypad-btn {
            position: relative;
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.18) 0%,
                rgba(255, 255, 255, 0.08) 45%,
                rgba(0, 0, 0, 0.10) 55%,
                rgba(0, 0, 0, 0.28) 100%),
              var(--brand-primary-soft, rgba(37, 99, 235, 0.22));
            border: 1px solid var(--brand-primary, rgba(255, 255, 255, 0.18));
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.40),
              inset 0 2px 5px rgba(255, 255, 255, 0.10),
              inset 0 -2px 4px rgba(0, 0, 0, 0.35),
              0 3px 0 rgba(0, 0, 0, 0.55),
              0 6px 14px var(--brand-primary-glow, rgba(0, 0, 0, 0.45));
            text-shadow: 0 1px 1px rgba(0, 0, 0, 0.55), 0 0 8px rgba(255, 255, 255, 0.10);
            transition: transform 60ms ease-out, box-shadow 80ms ease-out, background 150ms;
            will-change: transform, box-shadow;
          }
          .keypad-btn:hover:not(:disabled) {
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.22) 0%,
                rgba(255, 255, 255, 0.10) 45%,
                rgba(0, 0, 0, 0.10) 55%,
                rgba(0, 0, 0, 0.28) 100%),
              var(--brand-accent-soft, var(--brand-primary-soft, rgba(96, 165, 250, 0.30)));
            border-color: var(--brand-accent, var(--brand-primary, rgba(96, 165, 250, 0.55)));
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.45),
              inset 0 2px 5px rgba(255, 255, 255, 0.12),
              inset 0 -2px 4px rgba(0, 0, 0, 0.35),
              0 3px 0 rgba(0, 0, 0, 0.55),
              0 6px 18px var(--brand-accent-glow, var(--brand-primary-glow, rgba(96, 165, 250, 0.45)));
          }
          .keypad-btn:active:not(:disabled),
          .keypad-btn:focus-visible:not(:disabled) {
            transform: translateY(3px);
            box-shadow:
              inset 0 2px 6px rgba(0, 0, 0, 0.70),
              inset 0 1px 2px rgba(0, 0, 0, 0.45),
              0 0 0 rgba(0, 0, 0, 0);
            outline: none;
          }
          .keypad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
          .keypad-btn--del {
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.18) 0%,
                rgba(255, 255, 255, 0.08) 45%,
                rgba(0, 0, 0, 0.10) 55%,
                rgba(0, 0, 0, 0.30) 100%),
              rgba(220, 60, 60, 0.22);
            border-color: rgba(239, 68, 68, 0.40);
          }
          .keypad-btn--del:hover:not(:disabled) {
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.22) 0%,
                rgba(255, 255, 255, 0.10) 45%,
                rgba(0, 0, 0, 0.10) 55%,
                rgba(0, 0, 0, 0.30) 100%),
              rgba(239, 68, 68, 0.35);
            border-color: rgba(239, 68, 68, 0.65);
          }
        `}</style>

        <p className="text-center text-white/40 text-[11px] mt-4">
          Toca tu nombre o escribe directamente tu PIN · Enter para entrar
        </p>

        {/* Banner discreto: el admin sigue usando PIN default. */}
        {usingDefaultPin && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 text-amber-200 text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5" />
            Por seguridad, cambia el PIN del administrador inicial (1234) en Configuración.
          </div>
        )}
      </div>

      {/* USUARIOS abajo, full-width */}
      <div className="relative z-10 border-t border-white/10 bg-black/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-white/60 text-[10px] uppercase tracking-widest mb-2 text-center sm:text-left">
            Usuarios disponibles
          </p>
          {/* HOTFIX P0 — Render correcto de estados:
              1. Tenemos usuarios previos válidos → mostrarlos (aunque haya
                 refetch en curso o error temporal). Nunca borrar pantalla buena.
              2. Cargando sin usuarios previos → spinner.
              3. Error real (todos los retries fallaron) sin usuarios → mensaje + Reintentar.
              4. Fetched OK + lista vacía → "Sin usuarios activos". */}
          {Array.isArray(usuarios) && usuarios.length > 0 ? (
            // Tenemos datos buenos: mostrarlos. Si hay un refetch en curso,
            // un spinner discreto avisa pero no oculta los usuarios.
            <>
              {usuariosCargando && (
                <div className="flex items-center justify-center gap-2 pb-2 text-white/40 text-[11px]">
                  <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                  <span>Actualizando…</span>
                </div>
              )}
            </>
          ) : usuariosCargando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-white/60 text-sm">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              <span>Cargando usuarios…</span>
            </div>
          ) : usuariosError ? (
            <div className="flex flex-col items-center gap-2 py-5 text-white/60 text-sm">
              <p>No pudimos cargar usuarios. Revisa conexión e intenta de nuevo.</p>
              <button
                type="button"
                onClick={cargarUsuarios}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20"
              >
                Reintentar
              </button>
            </div>
          ) : usuariosFetched ? (
            <div className="text-center py-6 text-white/40 text-sm">
              Sin usuarios activos. Crea uno desde Configuración.
            </div>
          ) : null}

          {/* Grid de usuarios — visible cuando hay datos.
              Se separa del bloque de estados para que un refetch en vuelo
              NO oculte los usuarios que el cajero ya está viendo. */}
          {Array.isArray(usuarios) && usuarios.length > 0 && (
            // PARTE B — Cards skeuomorphism para combinar con el keypad.
            // Gradiente, borde brillante, sombra interna + externa, hover que
            // "levanta" la tile, active que hunde. Color del avatar respeta el
            // color del usuario (u.color) si existe.
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
              {usuarios.map(u => {
                const active = selectedUser?.id === u.id;
                // Color del avatar: respeta u.color si lo configuró el admin;
                // si no, usa color de marca como fallback.
                const avatarBg = active
                  ? (u.color || 'var(--brand-accent, #3b82f6)')
                  : (u.color || 'rgba(255,255,255,0.10)');
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setSelectedUser(u); setPin(''); hiddenInputRef.current?.focus(); }}
                    className="user-tile group flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-white"
                    data-active={active ? 'true' : 'false'}
                  >
                    <div
                      className="user-tile__avatar w-11 h-11 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                      style={{ background: avatarBg }}
                    >
                      {u.nombre?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 w-full text-center">
                      <p className="text-white text-xs font-semibold truncate drop-shadow">{u.nombre}</p>
                      <p className="text-white/60 text-[10px] truncate">{ROLE_LABELS[u.rol]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* Skeuomorphism para las tiles — mismo lenguaje físico que el keypad.
            - Reposo: gradiente oscuro + borde con highlight + sombra externa.
            - Hover: se "levanta" (translateY -2px) + glow del acento de marca.
            - Active (seleccionado): borde brillante de acento + glow más intenso.
            - Press (mousedown): se hunde (translateY +2px). */}
        <style>{`
          .user-tile {
            position: relative;
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.10) 0%,
                rgba(255, 255, 255, 0.04) 45%,
                rgba(0, 0, 0, 0.18) 55%,
                rgba(0, 0, 0, 0.32) 100%),
              rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.10);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.18),
              inset 0 -1px 2px rgba(0, 0, 0, 0.40),
              0 2px 0 rgba(0, 0, 0, 0.40),
              0 4px 12px rgba(0, 0, 0, 0.35);
            transition: transform 80ms ease-out, box-shadow 120ms ease-out, background 150ms, border-color 150ms;
            will-change: transform, box-shadow;
          }
          .user-tile:hover {
            transform: translateY(-2px);
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.14) 0%,
                rgba(255, 255, 255, 0.06) 45%,
                rgba(0, 0, 0, 0.18) 55%,
                rgba(0, 0, 0, 0.32) 100%),
              var(--brand-accent-soft, rgba(96, 165, 250, 0.10));
            border-color: var(--brand-accent, rgba(96, 165, 250, 0.45));
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.25),
              inset 0 -1px 2px rgba(0, 0, 0, 0.40),
              0 4px 0 rgba(0, 0, 0, 0.40),
              0 8px 18px var(--brand-accent-glow, rgba(96, 165, 250, 0.30));
          }
          .user-tile:active {
            transform: translateY(1px);
            box-shadow:
              inset 0 2px 6px rgba(0, 0, 0, 0.55),
              inset 0 1px 2px rgba(0, 0, 0, 0.35),
              0 1px 0 rgba(0, 0, 0, 0.40);
          }
          .user-tile[data-active="true"] {
            transform: translateY(-1px);
            background:
              linear-gradient(180deg,
                rgba(255, 255, 255, 0.18) 0%,
                rgba(255, 255, 255, 0.08) 45%,
                rgba(0, 0, 0, 0.12) 55%,
                rgba(0, 0, 0, 0.28) 100%),
              var(--brand-accent-soft, rgba(59, 130, 246, 0.22));
            border-color: var(--brand-accent, #60a5fa);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.35),
              inset 0 -1px 2px rgba(0, 0, 0, 0.30),
              0 0 0 2px var(--brand-accent-soft, rgba(96, 165, 250, 0.35)),
              0 6px 22px var(--brand-accent-glow, rgba(59, 130, 246, 0.55));
          }
          .user-tile__avatar {
            box-shadow:
              inset 0 1px 1px rgba(255, 255, 255, 0.35),
              inset 0 -1px 2px rgba(0, 0, 0, 0.35),
              0 2px 4px rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.18);
          }
        `}</style>
      </div>
    </div>
  );
}
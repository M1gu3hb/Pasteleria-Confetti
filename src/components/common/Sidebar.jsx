import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loginConPin, loginTerminal, logoutOperador } from '@/api/supabaseClient';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useTerminal } from '@/lib/TerminalContext';
import { useConfig } from '@/lib/ConfigContext';
import { getNavForRole } from '@/lib/permissions';
import { isRouteAllowed } from '@/lib/packageConfig';
import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, ChefHat,
  Receipt, Scissors, Package, ShoppingBag, BookOpen, Tag, Settings,
  Landmark, LogOut, ChevronLeft, ChevronRight, Menu, X, FileText, Sparkles, QrCode,
  ShieldCheck, Store, Repeat, Crown, Eye, Cake, Globe
} from 'lucide-react';
import { toast } from 'sonner';
import ThemeToggle from './ThemeToggle';
import ModalPinAdmin from './ModalPinAdmin';
import CambiarSucursalDialog from './CambiarSucursalDialog';

// Modo empleado (sin admin): solo accesos operativos. POS se entra desde Caja.
const EMPLEADO_PATHS = ['/caja', '/pos', '/pedidos-pastel'];

const ICON_MAP = {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, ChefHat,
  Receipt, Scissors, Package, ShoppingBag, BookOpen, Tag, Settings, Landmark, FileText, QrCode, Cake, Globe,
};

// Orden recomendado por paquete (solo para ADMINISTRADOR).
// Para otros roles se respeta el orden natural devuelto por permissions.
const ORDER_ESENCIAL = ['/', '/caja', '/ventas', '/productos', '/registros', '/portal-qr', '/configuracion'];
const ORDER_OPERATIVO = ['/', '/caja', '/ventas', '/productos', '/inventario', '/compras', '/recetas', '/registros', '/portal-qr', '/configuracion'];
const ORDER_PRO = ['/', '/mesero', '/cocina', '/caja', '/ventas', '/productos', '/inventario', '/compras', '/recetas', '/registros', '/portal-qr', '/configuracion'];

function sortByPackage(items, paquete, role) {
  if (role !== 'administrador') return items;
  const order =
    paquete === 'esencial' ? ORDER_ESENCIAL :
    paquete === 'operativo' ? ORDER_OPERATIVO :
    ORDER_PRO;
  const idx = (path) => {
    const i = order.indexOf(path);
    return i === -1 ? 999 : i;
  };
  return [...items].sort((a, b) => idx(a.path) - idx(b.path));
}

export default function Sidebar({ collapsed, onToggle }) {
  const { posUser, login, logout } = usePOSAuth();
  const {
    terminal, modoDuenoDispositivo,
    adminMode, adminRole, activarAdmin, salirAdmin,
    sucursalEfectiva,
  } = useTerminal();
  const { config, paquete_modo } = useConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Modal PIN: 'admin' (entrar a modo admin) | 'terminal' (cambiar terminal física)
  const [pinIntent, setPinIntent] = useState(null);
  // Diálogo de sucursal: 'terminal' (ACCIÓN A) | 'ver' (ACCIÓN B) | null
  const [sucursalDialog, setSucursalDialog] = useState(null);

  const esDueno = adminRole === 'dueno';

  // Badge "Pedidos de Pastel": cuenta SOLO pedidos personalizados activos
  // (pendiente / confirmado / con_anticipo) y respeta la sucursal efectiva.
  // NUNCA cuenta productos_catalogo (esos tienen su badge en Caja → Pedidos).
  const badgeSucId = sucursalEfectiva?.sucursal_id || null;
  const { data: pedidosPastelPend } = useQuery({
    queryKey: ['pedidos_pastel_pendientes_badge', badgeSucId],
    queryFn: () => base44.entities.PedidoPastel.filter(
      badgeSucId ? { sucursal_id: badgeSucId } : {},
      '-created_date', 200
    ),
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });
  // Lógica por EXCLUSIÓN: cuenta todo pastel personalizado que aún no terminó
  // su flujo (incluye 'pagado' no entregado). Si en el futuro se agrega un
  // estado nuevo, cuenta automáticamente sin tocar código.
  const ESTADOS_TERMINADOS_PASTEL = ['entregado', 'cancelado'];
  const conteoWebPendientes = (Array.isArray(pedidosPastelPend) ? pedidosPastelPend : [])
    .filter(p =>
      p &&
      p.tipo_pedido !== 'productos_catalogo' &&
      !ESTADOS_TERMINADOS_PASTEL.includes(p.estado)
    ).length;

  // Cerrar al cambiar de ruta
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // PIN validado para ENTRAR a modo admin → activar con el usuario completo.
  // Fase 4 (mapeo sesión→RLS):
  //  - DUEÑO: abre su sesión Supabase REAL (global, pos_is_admin) → ve todas.
  //  - ADMINISTRADOR: NO cambia la sesión; se queda sobre la sesión TERMINAL
  //    (hereda su sucursal). Solo eleva la UI. Debe ser de ESTA sucursal.
  const handleAdminSuccess = async (adminUser) => {
    try {
      // _pin solo se usa para abrir la sesión; NUNCA debe persistir en posUser
      // (sessionStorage). Se separa aquí y se descarta.
      const { _pin, ...adminLimpio } = adminUser || {};
      const esDuenoLogin = adminLimpio?.adminRole === 'dueno';

      if (esDuenoLogin) {
        // Sesión global del dueño (ModalPinAdmin ya validó el PIN; loginConPin
        // lo revalida y hace signInWithPassword).
        const op = await loginConPin(_pin, adminLimpio.id);
        if (!op) {
          toast.error('No se pudo iniciar la sesión de dueño.');
          return;
        }
      } else if (terminal?.sucursal_id && adminLimpio?.sucursal_id !== terminal.sucursal_id) {
        // Administrador de OTRA sucursal: no eleva en esta terminal (la RLS lo
        // confinaría a la sucursal de la terminal de todos modos; esto da UX clara).
        toast.error('Este administrador es de otra sucursal y no puede entrar en esta terminal.');
        return;
      }
      // (Administrador de esta sucursal: NO se toca la sesión Supabase; opera
      //  sobre la sesión terminal scoped.)

      const res = await activarAdmin(adminLimpio);
      if (res && res.ok === false) {
        toast.error(res.error || 'No se pudo activar el modo administrador.');
        return;
      }
      // La sesión del POS conserva la sucursal real del usuario.
      // Sin fallback a la terminal: si el usuario no tiene sucursal, queda null
      // (el administrador sin sucursal ya fue bloqueado en activarAdmin).
      login({
        ...adminLimpio,
        sucursal_id: adminLimpio?.sucursal_id ?? null,
        sucursal_nombre: adminLimpio?.sucursal_nombre ?? null,
      });
      // PARTE C — al SUBIR de empleado a admin/dueño, llevar al Dashboard.
      // El Dashboard vive en la ruta "/" (ver App.jsx), no en "/Dashboard".
      navigate('/');
    } catch (err) {
      console.error('[Sidebar] handleAdminSuccess:', err);
      toast.error('No se pudo activar el modo administrador.');
    }
  };

  // PIN de dueño validado para ACCIÓN A (cambiar terminal física).
  // Solo abre el diálogo de selección; el cambio real + reload vive ahí.
  const handleTerminalPinSuccess = () => {
    setSucursalDialog('terminal');
  };

  // Router del éxito del modal PIN según la intención.
  const handlePinSuccess = (user) => {
    if (pinIntent === 'terminal') handleTerminalPinSuccess(user);
    else handleAdminSuccess(user);
  };

  // Salir de modo admin → volver al empleado virtual (sin sesión admin).
  // En dispositivo de dueño no hay empleado virtual: solo se cierra la sesión.
  const handleSalirAdmin = async () => {
    try {
      const wasDueno = esDueno; // capturar antes de que salirAdmin() lo limpie
      salirAdmin();
      if (modoDuenoDispositivo) {
        // Dispositivo de dueño → cerrar la sesión Supabase del dueño;
        // AccesoDuenoGate volverá a pedir PIN.
        await logoutOperador();
        logout();
        return;
      }
      // Terminal física: si veníamos de una sesión de DUEÑO (global), volver a
      // la sesión TERMINAL (scoped) antes de operar como empleado. Para
      // administrador no hubo cambio de sesión, así que no hay nada que restaurar.
      if (wasDueno && terminal?.sucursal_id) {
        await loginTerminal(terminal.sucursal_id);
      }
      login({
        id: 'empleado_terminal',
        nombre: 'Empleado',
        rol: 'caja',
        es_empleado_virtual: true,
        sucursal_id: terminal?.sucursal_id,
        sucursal_nombre: terminal?.sucursal_nombre,
      });
      navigate('/caja');
    } catch (err) {
      console.error('[Sidebar] handleSalirAdmin:', err);
    }
  };

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // Rol efectivo para el menú. permissions.js ya reconoce 'dueno' (sin tilde)
  // con permisos completos. Solo normalizamos el dato legacy con tilde
  // ('dueño') al valor de código 'dueno'.
  const rolParaNav = posUser?.rol === 'dueño' ? 'dueno' : posUser?.rol;

  // Filtra primero por rol y luego por paquete activo, y aplica orden
  const baseItems = getNavForRole(rolParaNav)
    .filter(item => isRouteAllowed(item.path, paquete_modo))
    // Garantía: nunca incluir la ruta /mesas (vista vieja)
    .filter(item => item.path !== '/mesas');
  let navItems = sortByPackage(baseItems, paquete_modo, rolParaNav);

  // Fase 3 — "Pedidos de Pastel" después de Caja. No vive en permissions.js
  // (solo lectura): se inyecta aquí. Visible para todos (empleado incluido).
  if (!navItems.some(i => i.path === '/pedidos-pastel')) {
    const idxCaja = navItems.findIndex(i => i.path === '/caja');
    const itemPastel = { label: 'Pedidos de Pastel', path: '/pedidos-pastel', icon: 'Cake' };
    if (idxCaja >= 0) navItems = [...navItems.slice(0, idxCaja + 1), itemPastel, ...navItems.slice(idxCaja + 1)];
    else navItems = [...navItems, itemPastel];
  }

  // Fase 7 — "Web Pública" después de "Pedidos de Pastel". Solo lectura aquí
  // (no vive en permissions.js). La restricción de rol se aplica más abajo.
  if (!navItems.some(i => i.path === '/web-publica')) {
    const idxPastel = navItems.findIndex(i => i.path === '/pedidos-pastel');
    const itemWeb = { label: 'Web Pública 🌐', path: '/web-publica', icon: 'Globe' };
    if (idxPastel >= 0) navItems = [...navItems.slice(0, idxPastel + 1), itemWeb, ...navItems.slice(idxPastel + 1)];
    else navItems = [...navItems, itemWeb];
  }

  // Fase 2A — Modo empleado: si NO está en modo admin, mostrar solo accesos
  // operativos (Caja). El menú admin completo solo aparece tras validar PIN.
  if (!adminMode) {
    navItems = navItems.filter(item => EMPLEADO_PATHS.includes(item.path));
  } else if (!esDueno) {
    // Administrador (no dueño): sin acceso a Configuración.
    navItems = navItems.filter(item => item.path !== '/configuracion');
  }

  // Fase 6 — Vista general del dueño: solo Dashboard, Pedidos de Pastel,
  // Ventas y Configuración. Cada sucursal gestiona sus propios productos
  // y registros financieros de forma independiente.
  if (adminMode && esDueno && !sucursalEfectiva) {
    const PATHS_VISTA_GENERAL = [
      '/dashboard', '/', '/pedidos-pastel', '/ventas',
      '/web-publica', '/configuracion'
    ];
    navItems = navItems.filter(item =>
      PATHS_VISTA_GENERAL.includes(item.path)
    );
  }

  const closeMobile = () => setMobileOpen(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0 ring-2 ring-white/10">
          {config.logo_url ? (
            <img src={config.logo_url} alt={config.nombre_negocio} className="w-full h-full object-contain p-1" />
          ) : (
            <Sparkles className="w-5 h-5 text-pink-300" />
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-display font-bold truncate tracking-wide">{config.nombre_negocio || 'Pastelería Confetti'}</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">POS Pastelería Confetti</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground hidden lg:block"
          aria-label={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Sucursal efectiva — terminal del dispositivo o, si el dueño eligió
          ver otra, la que está viendo en memoria. */}
      {sucursalEfectiva?.sucursal_nombre && (
        <div className={`px-3 py-2 border-b border-sidebar-border ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <span title={sucursalEfectiva.sucursal_nombre} className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" title={sucursalEfectiva.sucursal_nombre}>
                  {sucursalEfectiva.sucursal_nombre}
                </p>
                {/* Fase 6 — mensaje "Viendo (no es esta terminal)" oculto para el dueño */}
                {false && (
                  <p className="text-[10px] text-amber-400/90 leading-tight">Viendo (no es esta terminal)</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto space-y-0.5 px-2">
        {navItems.map(item => {
          const Icon = ICON_MAP[item.icon] || Tag;
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeMobile}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'text-white font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
              style={active ? {
                // Skeuomorphism premium: gradiente diagonal del primario al
                // acento (con fallback al sidebar-primary actual para no
                // cambiar nada con la paleta por defecto), borde superior
                // luminoso, sombra interior profunda y resplandor exterior.
                background:
                  'linear-gradient(135deg, var(--brand-primary, hsl(var(--sidebar-primary))) 0%, var(--brand-accent, hsl(var(--sidebar-primary))) 100%)',
                boxShadow: [
                  // Highlight superior (luz que cae): efecto de relieve
                  'inset 0 1px 0 rgba(255,255,255,0.25)',
                  // Sombra interior inferior: da profundidad de botón hundido sutil
                  'inset 0 -2px 4px rgba(0,0,0,0.20)',
                  // Sombra exterior premium con glow rosa Confetti (profundidad)
                  '0 2px 8px rgba(232,87,154,0.4)',
                  '0 1px 0 rgba(255,255,255,0.15) inset',
                ].join(', '),
                border: '1px solid rgba(255,255,255,0.10)',
              } : undefined}
            >
              {/* Rayita lateral secundaria — refuerzo visual del item activo
                  sin ser el efecto principal. Solo aparece cuando es active. */}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                  }}
                />
              )}
              <Icon
                className="w-5 h-5 shrink-0"
                style={active ? {
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                } : undefined}
              />
              {!collapsed && (
                <span className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="truncate">{item.label}</span>
                  {item.path === '/pedidos-pastel' && conteoWebPendientes > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-black bg-pink-500 text-white min-w-[18px] text-center shrink-0">
                      {conteoWebPendientes > 9 ? '9+' : conteoWebPendientes}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Fase 2A.fix — Controles de modo (empleado / dueño / administrador) */}
      <div className="px-2 pb-1 space-y-1.5">
        {!adminMode ? (
          // MODO EMPLEADO:
          //  - Entrar a modo administrador (pide PIN dueño/admin).
          //  - Cambiar sucursal de ESTA terminal (ACCIÓN A): pide PIN de dueño.
          //    Solo visible en terminal física (no en dispositivo de dueño).
          <>
            <button
              type="button"
              onClick={() => { setMobileOpen(false); setPinIntent('admin'); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/70 transition-colors ${collapsed ? 'justify-center' : ''}`}
              title="Modo administrador"
            >
              <ShieldCheck className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Modo administrador</span>}
            </button>
            {!modoDuenoDispositivo && (
              <button
                type="button"
                onClick={() => { setMobileOpen(false); setPinIntent('terminal'); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-sidebar-accent/50 text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors ${collapsed ? 'justify-center' : ''}`}
                title="Cambiar sucursal de esta terminal (requiere PIN de dueño)"
              >
                <Repeat className="w-5 h-5 shrink-0" />
                {!collapsed && <span>Cambiar sucursal de terminal</span>}
              </button>
            )}
          </>
        ) : (
          // MODO ADMIN: dueño ve "Ver datos de otra sucursal" (ACCIÓN B).
          // Administrador NO ve selector. Ambos pueden salir.
          <>
            {esDueno && (
              <button
                type="button"
                onClick={() => { setMobileOpen(false); setSucursalDialog('ver'); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-sidebar-accent/60 text-sidebar-foreground hover:bg-sidebar-accent transition-colors ${collapsed ? 'justify-center' : ''}`}
                title="Ver datos de otra sucursal"
              >
                <Eye className="w-5 h-5 shrink-0" />
                {!collapsed && <span>Ver otra sucursal</span>}
              </button>
            )}
            <button
              type="button"
              onClick={handleSalirAdmin}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors ${collapsed ? 'justify-center' : ''}`}
              title="Salir de modo administrador"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Salir de {esDueno ? 'dueño' : 'administrador'}</span>}
            </button>
          </>
        )}
      </div>

      {/* Theme toggle — visible en todas las páginas internas */}
      <div className="px-2 pb-1">
        {collapsed ? (
          <div className="flex justify-center pb-1">
            <ThemeToggle variant="icon" className="bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent" />
          </div>
        ) : (
          <ThemeToggle variant="sidebar" />
        )}
      </div>

      {/* User footer */}
      {posUser && (
        <div className="border-t border-sidebar-border p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {adminMode ? (esDueno ? <Crown className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />) : <Store className="w-4 h-4" />}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {adminMode ? posUser.nombre : 'Modo empleado'}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50">
                  {adminMode ? (esDueno ? 'Dueño' : 'Administrador') : 'Terminal operativa'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales Fase 2A.fix */}
      <ModalPinAdmin
        open={pinIntent !== null}
        onOpenChange={(o) => { if (!o) setPinIntent(null); }}
        onSuccess={handlePinSuccess}
        // Cambiar terminal física requiere PIN de dueño.
        soloDueno={pinIntent === 'terminal'}
        title={pinIntent === 'terminal' ? 'Cambiar sucursal de terminal' : 'Modo administrador'}
        subtitle={pinIntent === 'terminal' ? 'Ingresa el PIN de dueño para continuar' : 'Ingresa el PIN de dueño o administrador'}
      />
      <CambiarSucursalDialog
        open={sucursalDialog !== null}
        onOpenChange={(o) => { if (!o) setSucursalDialog(null); }}
        modo={sucursalDialog === 'ver' ? 'ver' : 'terminal'}
      />
    </div>
  );

  return (
    <>
      {/* Hamburguesa móvil/tablet (oculto en lg+) */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-[70] w-11 h-11 bg-sidebar rounded-xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
        aria-label="Abrir menú"
        style={{ touchAction: 'manipulation' }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Drawer móvil/tablet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeMobile}
            aria-label="Cerrar menú"
          />
          {/* Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] shadow-2xl bg-sidebar">
            {/* Botón cerrar grande, accesible */}
            <button
              type="button"
              onClick={closeMobile}
              className="absolute top-2 right-2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 active:scale-95 transition-transform"
              aria-label="Cerrar menú"
              style={{ touchAction: 'manipulation' }}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Sidebar escritorio */}
      <div className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 transition-all duration-300 shadow-xl ${collapsed ? 'w-16' : 'w-60'}`}>
        <SidebarContent />
      </div>
    </>
  );
}
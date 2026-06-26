import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, LayoutDashboard, Landmark, Receipt, Tag, Package, ShoppingBag,
  FileText, Settings, UtensilsCrossed, ChefHat, BookOpen,
} from 'lucide-react';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLES } from '@/lib/constants';
import { canAccessModule } from '@/lib/packageConfig';
import { unlockAudio } from '@/lib/sounds';

/**
 * Selector radial gestual para Administrador en móvil/tablet (<lg).
 *
 * Interacción:
 *  - Mantén presionado el FAB (long-press > 160ms) → abanico desplegado.
 *  - Sin soltar el dedo, arrastra → la opción más cercana se resalta y "sale hacia afuera".
 *  - Suelta sobre una opción → navega.
 *  - Suelta fuera → cierra sin navegar.
 *  - Tap rápido → no abre nada.
 *
 * Posición: esquina inferior DERECHA. Abanico hacia ARRIBA-IZQUIERDA.
 */
const HOLD_MS = 160;
const FAB_SIZE = 56;
const ITEM_SIZE = 50;
const HIT_RADIUS = 56;          // tolerancia para asignar la opción activa al dedo
const POP_OUT = 38;             // px adicionales que el ítem activo se "sale" hacia afuera

// Orden y filtrado por paquete: solo se muestran las rutas permitidas y en este orden.
const ORDERS = {
  esencial:   ['/', '/caja', '/ventas', '/productos', '/registros', '/configuracion'],
  operativo:  ['/', '/caja', '/ventas', '/productos', '/inventario', '/compras', '/recetas', '/registros', '/configuracion'],
  restaurante_pro: ['/', '/mesero', '/cocina', '/caja', '/ventas', '/productos', '/inventario', '/compras', '/recetas', '/registros', '/configuracion'],
};

const ITEM_DEFS = {
  '/':              { icon: LayoutDashboard,  color: '#6366F1', module: 'dashboard_basico',     label: 'Dashboard' },
  '/caja':          { icon: Landmark,         color: '#DC2626', module: 'caja_directa',         label: 'Caja' },
  '/ventas':        { icon: Receipt,          color: '#0EA5E9', module: 'ventas',               label: 'Ventas' },
  '/productos':     { icon: Tag,              color: '#F59E0B', module: 'productos_basicos',    label: 'Productos' },
  '/inventario':    { icon: Package,          color: '#10B981', module: 'inventario',           label: 'Inventario' },
  '/compras':       { icon: ShoppingBag,      color: '#8B5CF6', module: 'compras',              label: 'Compras' },
  '/recetas':       { icon: BookOpen,         color: '#EC4899', module: 'recetas',              label: 'Recetas' },
  '/mesero':        { icon: UtensilsCrossed,  color: '#E11D48', module: 'mesero',               label: 'Mesero' },
  '/cocina':        { icon: ChefHat,          color: '#EA580C', module: 'cocina',               label: 'Cocina' },
  '/registros':     { icon: FileText,         color: '#475569', module: 'registros_basicos',    label: 'Registros' },
  '/configuracion': { icon: Settings,         color: '#334155', module: 'configuracion_basica', label: 'Configuración' },
};

export default function MobileAdminRadialMenu() {
  const { posUser } = usePOSAuth();
  const { paquete_modo } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();

  // Móvil + tablet: <1024 (lg)
  const [isCompact, setIsCompact] = useState(typeof window !== 'undefined' && window.innerWidth < 1024);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const fabRef = useRef(null);
  const holdTimerRef = useRef(null);
  const fabCenterRef = useRef({ x: 0, y: 0 });
  const itemsLayoutRef = useRef([]);
  const pointerActiveRef = useRef(false);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Cerrar al cambiar ruta
  useEffect(() => { closeMenu(); /* eslint-disable-next-line */ }, [location.pathname]);

  // Items disponibles según paquete y orden definido
  const items = useMemo(() => {
    const order = ORDERS[paquete_modo] || ORDERS.restaurante_pro;
    return order
      .map(path => {
        const def = ITEM_DEFS[path];
        if (!def) return null;
        if (!canAccessModule(def.module, paquete_modo)) return null;
        return { path, ...def };
      })
      .filter(Boolean);
  }, [paquete_modo]);

  const N = items.length;
  // Ajuste dinámico del radio para que más ítems se separen mejor
  const RADIUS = 115 + Math.max(0, N - 6) * 8;
  // El primer item (Dashboard) debe quedar ARRIBA, el último (Configuración) ABAJO-IZQUIERDA.
  // En coordenadas pantalla (Y+ hacia abajo), 270° = arriba, 180° = izquierda.
  // Recorremos de 270° (arriba) a 180° (izquierda) para que el orden visual coincida con el lógico.
  const startAngle = 272;  // ~arriba (item 0)
  const endAngle = 182;    // ~izquierda (último item)
  const angleFor = (i) => N === 1 ? 225 : startAngle + ((endAngle - startAngle) * i) / (N - 1);

  const offsetFor = (i, popped = false) => {
    const rad = (angleFor(i) * Math.PI) / 180;
    const r = RADIUS + (popped ? POP_OUT : 0);
    return { dx: Math.cos(rad) * r, dy: Math.sin(rad) * r };
  };

  const closeMenu = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    setOpen(false);
    setActiveIdx(-1);
    pointerActiveRef.current = false;
  };

  const computeFabCenter = () => {
    const el = fabRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const computeItemsLayout = () => {
    const c = fabCenterRef.current;
    itemsLayoutRef.current = items.map((_, i) => {
      const { dx, dy } = offsetFor(i, false);
      return { x: c.x + dx, y: c.y + dy, idx: i };
    });
  };

  const updateActiveByPoint = (clientX, clientY) => {
    const layout = itemsLayoutRef.current;
    if (!layout.length) return;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (const it of layout) {
      const dx = clientX - it.x;
      const dy = clientY - it.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; bestIdx = it.idx; }
    }
    setActiveIdx(bestDist <= HIT_RADIUS ? bestIdx : -1);
  };

  // Gesto
  const onPointerDown = (e) => {
    e.preventDefault();
    unlockAudio();
    pointerActiveRef.current = true;
    fabCenterRef.current = computeFabCenter();
    const target = e.currentTarget;
    if (e.pointerId != null && target.setPointerCapture) {
      try { target.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    holdTimerRef.current = setTimeout(() => {
      if (!pointerActiveRef.current) return;
      computeItemsLayout();
      setOpen(true);
      setActiveIdx(-1);
    }, HOLD_MS);
  };

  const onPointerMove = (e) => {
    if (!pointerActiveRef.current || !open) return;
    updateActiveByPoint(e.clientX, e.clientY);
  };

  const onPointerUp = (e) => {
    const wasOpen = open;
    const idx = activeIdx;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    pointerActiveRef.current = false;
    if (e.pointerId != null && e.currentTarget.releasePointerCapture) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    if (wasOpen && idx >= 0 && items[idx]) {
      const path = items[idx].path;
      setOpen(false);
      setActiveIdx(-1);
      setTimeout(() => navigate(path), 70);
      return;
    }
    setOpen(false);
    setActiveIdx(-1);
  };

  const onPointerCancel = () => closeMenu();

  if (!isCompact) return null;
  if (posUser?.rol !== ROLES.ADMIN) return null;
  if (N === 0) return null;

  const activeItem = activeIdx >= 0 ? items[activeIdx] : null;

  return (
    <>
      {/* Backdrop solo cuando abierto */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/35 backdrop-blur-[2px] z-[55] lg:hidden pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Contenedor fijo abajo-derecha */}
      <div
        className="fixed bottom-5 right-5 z-[60] lg:hidden"
        style={{ touchAction: 'none' }}
      >
        {/* Label de la opción activa — JUSTO ARRIBA del FAB, visualmente conectado
            con los iconos. Anclado al contenedor, no al top de la pantalla.
            - `right: 0` y `bottom: FAB_SIZE + RADIUS + 28` lo posicionan sobre el abanico.
            - `max-width: calc(100vw - 40px)` evita que se salga horizontalmente.
            - `whitespace-nowrap` + truncate para que no se rompa feo. */}
        <AnimatePresence>
          {open && activeItem && (
            <motion.div
              key={activeItem.path}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.92 }}
              transition={{ duration: 0.14 }}
              className="absolute pointer-events-none"
              style={{
                right: 0,
                bottom: FAB_SIZE + RADIUS + 32,
                maxWidth: 'calc(100vw - 40px)',
                zIndex: 11,
              }}
            >
              <div
                className="px-4 py-2 rounded-2xl text-white text-sm font-heading font-bold shadow-2xl backdrop-blur-md flex items-center gap-2 whitespace-nowrap"
                style={{
                  background: 'rgba(15,23,42,0.94)',
                  boxShadow: `0 0 0 2px ${activeItem.color}, 0 10px 28px rgba(0,0,0,0.45)`,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: activeItem.color, boxShadow: `0 0 10px ${activeItem.color}` }}
                />
                <span className="truncate">{activeItem.label}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Items radiales */}
        <AnimatePresence>
          {open && items.map((it, i) => {
            const isActive = activeIdx === i;
            const { dx, dy } = offsetFor(i, isActive);
            const Icon = it.icon;
            return (
              <motion.div
                key={it.path}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: dx,
                  y: dy,
                  scale: isActive ? 1.55 : 1,
                  opacity: 1,
                }}
                exit={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 460,
                  damping: 24,
                  delay: open ? i * 0.018 : 0,
                }}
                className="absolute pointer-events-none"
                style={{
                  width: ITEM_SIZE,
                  height: ITEM_SIZE,
                  // Centra el ítem sobre el centro del FAB.
                  bottom: FAB_SIZE / 2 - ITEM_SIZE / 2,
                  right: FAB_SIZE / 2 - ITEM_SIZE / 2,
                  transformOrigin: 'center',
                  zIndex: isActive ? 10 : 1,
                }}
              >
                <div
                  className="w-full h-full rounded-full flex items-center justify-center text-white"
                  style={{
                    background: isActive
                      ? `radial-gradient(circle at 30% 25%, #ffffff 0%, ${it.color} 55%, ${it.color} 100%)`
                      : `linear-gradient(135deg, ${it.color} 0%, ${it.color}cc 100%)`,
                    boxShadow: isActive
                      ? `0 0 0 5px #ffffff, 0 0 0 9px ${it.color}99, 0 0 38px ${it.color}, 0 18px 36px rgba(0,0,0,0.5)`
                      : '0 6px 18px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.2) inset',
                    transition: 'box-shadow 120ms ease, background 120ms ease',
                  }}
                >
                  <Icon
                    className={isActive ? 'w-7 h-7' : 'w-5 h-5'}
                    style={isActive ? { color: it.color, filter: `drop-shadow(0 2px 4px ${it.color}80)` } : {}}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* FAB principal (gesto press-hold) */}
        <motion.button
          ref={fabRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          animate={{ scale: open ? 1.06 : 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          className="relative rounded-full flex items-center justify-center text-white select-none"
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            background: open
              ? 'linear-gradient(135deg, hsl(217,91%,62%) 0%, hsl(217,91%,48%) 100%)'
              : 'linear-gradient(135deg, hsl(217,91%,55%) 0%, hsl(217,91%,42%) 100%)',
            boxShadow: open
              ? '0 0 0 6px rgba(59,130,246,0.18), 0 12px 28px rgba(0,0,0,0.4), 0 2px 0 rgba(255,255,255,0.25) inset'
              : '0 8px 22px rgba(0,0,0,0.35), 0 2px 0 rgba(255,255,255,0.25) inset',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'none',
          }}
          aria-label="Mantén presionado para abrir el menú"
        >
          <Menu className="w-6 h-6" />
        </motion.button>
      </div>
    </>
  );
}
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { ShoppingCart, Send, X, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import ProductoFichaExpandible from './ProductoFichaExpandible';

/**
 * Barra inferior horizontal de carrito + bottom sheet para Mesero en móvil.
 * Expone via ref:  { close: () => void, isOpen: () => boolean }
 * para que el padre pueda cerrar el sheet ANTES de desmontar el Dialog de mesa
 * (evita conflictos de removeChild entre AnimatePresence y Radix Portal).
 */
const MeseroCartFAB = forwardRef(function MeseroCartFAB({
  carrito,
  totalCarrito,
  totalActual,
  detallesVenta,
  notaMesa,
  setNotaMesa,
  cambiarCantidad,
  enviarPedido,
  pedirCuenta,
  // HOTFIX FINAL — "Cerrar mesa sin venta": reemplaza "Solicitar cuenta"
  // cuando la mesa no tiene consumo (carrito vacío, sin detalles, total=0).
  cerrarMesaSinVenta,
  puedeCerrarMesaSinVenta,
  loading,
  estadoMesa,
  ventaActiva,
  formatCurrency,
  config,
  onUpdateNotas,
  onUpdateExclusiones,
}, ref) {
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    close: () => setOpen(false),
    isOpen: () => open,
  }), [open]);

  const safeCarrito = Array.isArray(carrito) ? carrito : [];
  const safeDetalles = Array.isArray(detallesVenta) ? detallesVenta : [];
  const safeTotalCarrito = Number.isFinite(totalCarrito) ? totalCarrito : 0;
  const safeTotalActual = Number.isFinite(totalActual) ? totalActual : 0;
  const fmt = typeof formatCurrency === 'function' ? formatCurrency : (n) => `$${(n || 0).toFixed(2)}`;
  const cantidad = safeCarrito.reduce((s, i) => s + (i?.cantidad || 0), 0);
  const puedePedirCuenta =
    !!ventaActiva && safeCarrito.length === 0 && estadoMesa !== 'cuenta_solicitada';
  const visible = cantidad > 0 || puedePedirCuenta;

  if (!visible) return null;

  const isCart = cantidad > 0;
  const colorMain = isCart ? 'hsl(4,72%,46%)' : 'hsl(217,91%,50%)';
  const colorMainEnd = isCart ? 'hsl(4,72%,34%)' : 'hsl(217,91%,38%)';

  return (
    <>
      {/* Barra inferior horizontal — móvil */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="md:hidden fixed left-3 z-[58]"
        style={{
          right: 'calc(72px + env(safe-area-inset-right, 0px))',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl text-white shadow-2xl active:scale-[0.98] transition-transform"
          style={{
            background: `linear-gradient(135deg, ${colorMain} 0%, ${colorMainEnd} 100%)`,
            boxShadow: '0 12px 28px rgba(0,0,0,0.38), 0 1px 0 rgba(255,255,255,0.25) inset',
          }}
        >
          <div className="relative shrink-0">
            {isCart ? <ShoppingCart className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            {isCart && (
              <span
                className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[10px] font-black flex items-center justify-center"
                style={{ color: 'hsl(4,72%,40%)' }}
              >
                {cantidad}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[11px] font-medium opacity-90 leading-tight">
              {isCart
                ? `${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`
                : (puedeCerrarMesaSinVenta ? 'Mesa sin consumo' : 'Mesa abierta')}
            </p>
            <p className="font-heading font-black text-base leading-tight truncate">
              {isCart
                ? `${fmt(safeTotalCarrito)} · Ver pedido`
                : (puedeCerrarMesaSinVenta ? 'Cerrar mesa' : 'Solicitar cuenta')}
            </p>
          </div>
          <span className="shrink-0 px-3 py-1.5 rounded-xl bg-white/20 text-xs font-bold">
            {isCart ? 'Confirmar' : 'Abrir'}
          </span>
        </button>
      </motion.div>

      {/* Bottom sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mesero-cart-sheet-wrapper"
            initial={false}
            className="md:hidden"
          >
            <motion.div
              key="mesero-cart-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[65] bg-black/55"
            />
            <motion.div
              key="mesero-cart-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-[66] bg-white rounded-t-3xl shadow-2xl flex flex-col"
              style={{ maxHeight: '88dvh' }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  <p className="font-heading font-bold text-sm">
                    {safeDetalles.length > 0 ? 'Pedido de la mesa' : 'Nuevo pedido'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-11 h-11 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {safeDetalles.length > 0 && (
                  <div className="rounded-xl bg-muted/30 p-3">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">Ya enviado a cocina</p>
                    {safeDetalles.map((d, i) => (
                      <div key={d?.id || `det-${i}`} className="flex justify-between text-xs py-0.5">
                        <span className="text-muted-foreground">{d?.producto_nombre || '—'} ×{d?.cantidad || 0}</span>
                        <span className="font-medium">{fmt(d?.subtotal || 0)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-bold border-t pt-1 mt-1">
                      <span>Subtotal enviado</span>
                      <span>{fmt(safeTotalActual)}</span>
                    </div>
                  </div>
                )}

                {safeCarrito.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      {safeDetalles.length > 0 ? 'Agregar al pedido' : 'Productos'}
                    </p>
                    {safeCarrito.map((item, i) => (
                      <ProductoFichaExpandible
                        key={item?.id || `cart-${i}`}
                        item={item}
                        onCambiarCantidad={cambiarCantidad}
                        onUpdateNotas={onUpdateNotas}
                        onUpdateExclusiones={onUpdateExclusiones}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">Aún no agregas productos</p>
                )}

                {safeCarrito.length > 0 && (
                  <div>
                    <Input value={notaMesa || ''} onChange={e => setNotaMesa?.(e.target.value)}
                      placeholder="Nota para cocina..." className="text-xs h-10" />
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t space-y-2 shrink-0 bg-white"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {safeCarrito.length > 0 && (
                  <>
                    <div className="flex justify-between font-black text-base">
                      <span>Nuevo</span>
                      <span className={config?.colorear_importes_monetarios !== false ? 'text-primary' : 'text-foreground'}>
                        {fmt(safeTotalCarrito)}
                      </span>
                    </div>
                    <Button
                      onClick={async () => {
                        // Cerrar sheet PRIMERO para que la animación termine antes
                        // de cualquier re-render del padre que pueda tocar el DOM.
                        setOpen(false);
                        try { await enviarPedido?.(); } catch (e) { console.error('[MeseroCartFAB] enviarPedido', e); }
                      }}
                      disabled={loading}
                      className="w-full h-12 text-base"
                      style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)' }}
                    >
                      <Send className="w-4 h-4 mr-1.5" />
                      {loading ? 'Enviando...' : 'Enviar a Cocina'}
                    </Button>
                  </>
                )}
                {puedePedirCuenta && (
                  puedeCerrarMesaSinVenta ? (
                    <Button
                      onClick={async () => {
                        setOpen(false);
                        try { await cerrarMesaSinVenta?.(); } catch (e) { console.error('[MeseroCartFAB] cerrarMesaSinVenta', e); }
                      }}
                      disabled={loading}
                      variant="outline"
                      className="w-full h-12"
                    >
                      <Receipt className="w-4 h-4 mr-1.5" />
                      Cerrar mesa
                    </Button>
                  ) : (
                    <Button
                      onClick={async () => {
                        setOpen(false);
                        try { await pedirCuenta?.(); } catch (e) { console.error('[MeseroCartFAB] pedirCuenta', e); }
                      }}
                      disabled={loading}
                      variant="outline"
                      className="w-full h-12"
                    >
                      <Receipt className="w-4 h-4 mr-1.5" />
                      Solicitar cuenta
                    </Button>
                  )
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default MeseroCartFAB;
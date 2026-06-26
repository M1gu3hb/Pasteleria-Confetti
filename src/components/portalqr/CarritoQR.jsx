import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, Plus, Minus, Trash2, Send, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';

/**
 * Carrito QR persistente.
 * - FAB inferior cuando hay items.
 * - Bottom sheet con lista, +/-, eliminar, nota general y "Enviar a cocina".
 * - El envío llama a props.onEnviar (delegado al PortalCliente que usa qrPedidoFlow).
 */
function descMods(item) {
  const arr = Array.isArray(item?._modificadores) ? item._modificadores : [];
  if (arr.length === 0) return '';
  return arr
    .map((g) => {
      const op = Array.isArray(g?.opciones) ? g.opciones : [];
      const nombres = op.map((o) => o?.nombre || '').filter(Boolean).join(', ');
      // Compatibilidad: leer grupo_nombre (estándar Cocina/Mesero) con
      // fallback a `grupo` por si llega un objeto antiguo.
      const nombre = g?.grupo_nombre || g?.grupo || '';
      return nombres ? `${nombre}: ${nombres}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

export default function CarritoQR({
  items,
  onChangeCantidad,
  onEliminar,
  onEnviar,
  enviando,
  notaGeneral,
  setNotaGeneral,
}) {
  const [open, setOpen] = useState(false);
  const safeItems = Array.isArray(items) ? items : [];
  const totalItems = safeItems.reduce((s, i) => s + (Number(i?.cantidad) || 0), 0);
  const subtotal = useMemo(
    () =>
      safeItems.reduce(
        (s, i) => s + (Number(i?.precio_venta) || 0) * (Number(i?.cantidad) || 0),
        0
      ),
    [safeItems]
  );

  if (totalItems === 0) return null;

  return (
    <>
      {/* FAB inferior */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 inset-x-4 z-30 max-w-md mx-auto rounded-2xl bg-primary text-primary-foreground shadow-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
      >
        <div className="relative">
          <ShoppingCart className="w-5 h-5" />
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {totalItems}
          </span>
        </div>
        <span className="flex-1 text-left font-bold text-sm">Ver mi pedido</span>
        <span className="font-heading font-black tabular-nums">{formatCurrency(subtotal)}</span>
      </button>

      {/* Bottom sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={(e) => {
              if (enviando) return;
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              className="bg-card text-card-foreground w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
            >
              <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary shrink-0" />
                <p className="flex-1 font-heading font-bold">Mi pedido</p>
                <button
                  type="button"
                  onClick={() => !enviando && setOpen(false)}
                  disabled={enviando}
                  className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {safeItems.map((item) => {
                  const cantidad = Number(item?.cantidad) || 0;
                  const precio = Number(item?.precio_venta) || 0;
                  const lineSubtotal = precio * cantidad;
                  const mods = descMods(item);
                  // 6B / 1.E — Líneas variables: mostrar "500 g" / "4 shots" y
                  // sin botones ± (cada línea variable es independiente).
                  const variableSnap = item?._variable || null;
                  const cantVariableTxt = variableSnap
                    ? formatearCantidadVariable({
                        tipo_venta: variableSnap.tipo_venta,
                        cantidad_variable: variableSnap.cantidad_variable,
                        unidad_variable: variableSnap.unidad_variable,
                        cantidad_porciones: variableSnap.cantidad_porciones,
                        nombre_porcion: variableSnap.nombre_porcion,
                      })
                    : '';
                  return (
                    <div
                      key={item._uid || item.id}
                      className="rounded-xl border p-3 flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item?.nombre || '—'}</p>
                        {variableSnap && cantVariableTxt && (
                          <p className="text-[11px] mt-0.5">
                            <span className="font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {cantVariableTxt}
                            </span>
                          </p>
                        )}
                        {mods && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 break-words">↳ {mods}</p>
                        )}
                        {item?.notas && (
                          <p className="text-[11px] italic text-muted-foreground mt-0.5 break-words">
                            “{item.notas}”
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                          {variableSnap ? (
                            <span className="font-bold text-foreground">{formatCurrency(lineSubtotal)}</span>
                          ) : (
                            <>
                              {cantidad} × {formatCurrency(precio)} ={' '}
                              <span className="font-bold text-foreground">{formatCurrency(lineSubtotal)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {!variableSnap && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onChangeCantidad?.(item._uid, -1)}
                              disabled={enviando}
                              className="w-7 h-7 rounded-full border flex items-center justify-center disabled:opacity-40"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-bold w-6 text-center tabular-nums text-sm">{cantidad}</span>
                            <button
                              type="button"
                              onClick={() => onChangeCantidad?.(item._uid, +1)}
                              disabled={enviando || cantidad >= 99}
                              className="w-7 h-7 rounded-full border flex items-center justify-center disabled:opacity-40"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onEliminar?.(item._uid)}
                          disabled={enviando}
                          className="text-[10px] text-rose-600 inline-flex items-center gap-1 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" /> Quitar
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Nota general para cocina <span className="opacity-60 normal-case">(opcional)</span>
                  </label>
                  <textarea
                    value={notaGeneral || ''}
                    onChange={(e) => setNotaGeneral?.(e.target.value.slice(0, 200))}
                    placeholder="Ej. todo junto, sin picante…"
                    rows={2}
                    className="w-full px-3 py-2 border rounded-xl bg-card mt-1 text-sm resize-none"
                  />
                </div>

                <div className="rounded-2xl p-3 bg-muted/40 flex items-center justify-between">
                  <span className="text-sm font-semibold">Subtotal</span>
                  <span className="font-heading font-black text-lg tabular-nums">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  El cobro final se confirma en caja. Este pedido se envía a preparación.
                </p>
              </div>

              <div className="sticky bottom-0 bg-card border-t px-4 py-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => !enviando && setOpen(false)}
                  disabled={enviando}
                  className="flex-1 h-12 rounded-xl border font-semibold disabled:opacity-50"
                >
                  Seguir viendo menú
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onEnviar?.();
                    // Cerrar al terminar (si fue exitoso, el carrito quedará vacío y FAB desaparece)
                    setOpen(false);
                  }}
                  disabled={enviando || totalItems === 0}
                  className="flex-[1.4] h-12 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {enviando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {enviando ? 'Enviando…' : 'Enviar a cocina'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
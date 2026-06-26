import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, Flame, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';

const ESTADO_COLORS = {
  nuevo: { dot: '#3B82C7', text: 'Nuevo' },
  en_preparacion: { dot: '#E68A33', text: 'En preparación' },
  listo: { dot: '#16A34A', text: 'Listo' },
};

/**
 * Card compacta tipo accordion para Cocina en móvil/tablet.
 * - Estado colapsado: mesa, hora, estado, contador de productos.
 * - Expandido: lista completa de productos con notas y botones de acción.
 */
export default function CocinaPedidoCardCompact({ pedido, onIniciar, onListo }) {
  const [open, setOpen] = useState(false);
  const items = pedido.items || [];
  const totalProductos = items.reduce((s, it) => s + (it.cantidad || 0), 0);
  const estado = ESTADO_COLORS[pedido.estado] || ESTADO_COLORS.nuevo;

  return (
    <Card
      className="overflow-hidden"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 3px 8px rgba(0,0,0,0.08)' }}
    >
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left active:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <CardHeader className="py-2.5 px-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: estado.dot, boxShadow: `0 0 0 3px ${estado.dot}25` }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-heading font-bold text-sm">
                  {pedido.mesa_numero ? `Mesa ${pedido.mesa_numero}` : 'Mostrador'}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {pedido.fecha_creacion
                    ? formatDistanceToNow(new Date(pedido.fecha_creacion), { addSuffix: true, locale: es })
                    : ''}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {totalProductos} {totalProductos === 1 ? 'producto' : 'productos'} · {estado.text}
              </p>
            </div>
            <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </div>
        </CardHeader>
      </button>

      {/* Contenido expandido */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent className="pt-0 pb-3 px-3.5">
              <div className="space-y-1 mb-3">
                {items.map((item, i) => {
                  // 6B / 1.F — Cantidad legible para items variables (g, kg, ml, l, shots, copas).
                  const cantidadVarTxt = formatearCantidadVariable(item || {});
                  const esVariable = !!cantidadVarTxt;
                  return (
                    <div key={i}>
                      <div className="flex items-center text-sm">
                        {esVariable ? (
                          <span className="font-bold mr-2 text-primary text-xs px-1.5 py-0.5 rounded bg-primary/10">
                            {cantidadVarTxt}
                          </span>
                        ) : (
                          <span className="font-bold mr-2 text-primary">{item.cantidad}×</span>
                        )}
                        <span className="font-medium">{item.producto_nombre}</span>
                      </div>
                      {item.notas && (
                        <p className="text-xs text-orange-700 italic ml-7 bg-orange-50 px-2 py-0.5 rounded mt-0.5">
                          ↳ {item.notas}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {pedido.notas && (
                <p className="text-xs italic bg-yellow-50 border border-yellow-200 px-2 py-1 rounded mb-2">
                  📝 {pedido.notas}
                </p>
              )}
              {pedido.estado === 'nuevo' && (
                <Button size="sm" className="w-full h-10" onClick={() => onIniciar(pedido)}
                  style={{ background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)' }}>
                  <Flame className="w-4 h-4 mr-1" />Preparar
                </Button>
              )}
              {pedido.estado === 'en_preparacion' && (
                <Button size="sm" className="w-full h-10" onClick={() => onListo(pedido)}
                  style={{ background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)' }}>
                  <CheckCircle className="w-4 h-4 mr-1" />Listo
                </Button>
              )}
              {pedido.estado === 'listo' && (
                <p className="text-xs text-center text-emerald-700 italic">
                  Esperando que el mesero recoja
                </p>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
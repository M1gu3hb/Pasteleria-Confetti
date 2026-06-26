import React from 'react';
import { Globe, User, Phone, Calendar, Package } from 'lucide-react';

export default function PedidoWebCajaCard({ pedido, onVer }) {
  if (!pedido) return null;
  // Prompt 6 — saldo pendiente para mostrar en la card (reusa modelo del pastel).
  const saldoPend = pedido.saldo_pendiente != null
    ? Number(pedido.saldo_pendiente)
    : Math.max(0, (Number(pedido.total_final) || 0) - (Number(pedido.total_abonado) || 0));
  return (
    <button
      type="button"
      onClick={() => onVer?.(pedido)}
      className="skeu-card w-full text-left rounded-2xl p-4 border-l-4 border-l-[#E8579A]
      flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all active:scale-[0.99]"
      style={{ touchAction: 'manipulation' }}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-pink-500 shrink-0" />
          <span className="font-mono font-bold text-sm text-pink-700">
            {pedido.folio}
          </span>
          {pedido.created_date && (
            <span className="text-xs text-muted-foreground">
              {new Date(pedido.created_date).toLocaleDateString('es-MX')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-700">
          <User className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium truncate">{pedido.cliente_nombre}</span>
          {pedido.cliente_telefono && (
            <>
              <Phone className="w-3.5 h-3.5 shrink-0 ml-1" />
              <span className="text-muted-foreground text-xs">
                {pedido.cliente_telefono}
              </span>
            </>
          )}
        </div>
        {pedido.fecha_entrega && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            Recoge: {pedido.fecha_entrega}
            {pedido.hora_entrega && ` a las ${pedido.hora_entrega}`}
          </div>
        )}
        {pedido.notas_generales && (
          <div className="flex items-start gap-1 text-xs text-muted-foreground">
            <Package className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{pedido.notas_generales}</span>
          </div>
        )}
        <div className="font-bold text-base text-gray-900">
          Total: ${(Number(pedido.total_final) || 0).toLocaleString('es-MX')}
          {saldoPend > 0 && (
            <span className="ml-2 text-xs font-semibold text-orange-600">
              Saldo: ${saldoPend.toLocaleString('es-MX')}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0">
        <span className="px-4 py-2 rounded-lg bg-pink-500 text-white text-sm font-semibold">
          Ver / cobrar
        </span>
      </div>
    </button>
  );
}
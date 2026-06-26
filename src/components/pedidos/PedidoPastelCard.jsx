import React from 'react';
import { Calendar, Phone, Cake } from 'lucide-react';
import { ESTADOS_PEDIDO } from '@/utils/pedidoPastelUtils';

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function PedidoPastelCard({ pedido, onVer, mostrarSucursal }) {
  if (!pedido) return null;
  const est = ESTADOS_PEDIDO[pedido.estado] || ESTADOS_PEDIDO.pendiente;
  const hoyStr = new Date().toISOString().slice(0, 10);
  const urgente = pedido.fecha_entrega && pedido.fecha_entrega <= hoyStr &&
    pedido.estado !== 'entregado' && pedido.estado !== 'cancelado';
  const resta = Number(pedido.resta) || 0;

  return (
    <button
      type="button"
      onClick={() => onVer?.(pedido)}
      className="skeu-card w-full p-4 rounded-2xl text-left transition-all active:scale-[0.99]"
      style={{ touchAction: 'manipulation', minHeight: 44 }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-base" title="Pastel personalizado">🎂</span>
          <p className="font-mono font-black text-lg text-[#E8579A]">{pedido.folio}</p>
          {pedido.origen === 'web' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black border bg-pink-100 text-pink-800 border-pink-300">
              🌐 WEB
            </span>
          )}
          {mostrarSucursal && pedido.sucursal_nombre && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              pedido.sucursal_nombre.includes('Xochimilco') ? 'bg-blue-100 text-blue-800 border-blue-300' :
              pedido.sucursal_nombre.includes('Topilejo')   ? 'bg-green-100 text-green-800 border-green-300' :
              pedido.sucursal_nombre.includes('Gregorio')   ? 'bg-amber-100 text-amber-800 border-amber-300' :
              'bg-slate-100 text-slate-700 border-slate-300'
            }`}>
              {pedido.sucursal_nombre}
            </span>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${est.badge}`}>
          {est.label}
        </span>
      </div>
      <div className="flex gap-3">
        {pedido.imagen_referencia_url && (
          <img src={pedido.imagen_referencia_url} alt="ref"
            className="w-14 h-14 rounded-lg object-cover border shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-display font-semibold text-sm truncate">{pedido.cliente_nombre}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="w-3 h-3" />{pedido.cliente_telefono}
          </p>
          <p className={`text-xs flex items-center gap-1 font-semibold ${urgente ? 'text-red-600' : 'text-muted-foreground'}`}>
            <Calendar className="w-3 h-3" />
            {pedido.fecha_entrega} {pedido.hora_entrega || ''}
            {urgente && ' ⚠'}
          </p>
          <p className="text-xs flex items-center gap-1 text-muted-foreground">
            <Cake className="w-3 h-3" />{pedido.kilos} kg{pedido.concepto ? ` · ${pedido.concepto}` : ''}
          </p>
          {pedido.nota_interna && (
            <p className="text-xs italic text-muted-foreground truncate">"{pedido.nota_interna}"</p>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed">
        <p className="font-heading font-black text-base">{fmt(pedido.total_final)}</p>
        {Number(pedido.a_cuenta) > 0 && (
          <p className="text-xs font-semibold text-orange-600">Resta: {fmt(resta)}</p>
        )}
      </div>
    </button>
  );
}
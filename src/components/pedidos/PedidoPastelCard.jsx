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
  // FASE 3 — saldo VIVO: usa saldo_pendiente (se actualiza con cada pago); si es
  // null (pedidos viejos) cae a resta (foto de la creación). Igual que el detalle.
  const saldoVivo = pedido.saldo_pendiente != null
    ? Number(pedido.saldo_pendiente)
    : (Number(pedido.resta) || 0);
  // Vino de la web: por `origen`, con refuerzo por el sello confiable
  // `creado_por_nombre='Web Confetti'` (que pone el RPC y no se sobreescribe).
  const esWeb = pedido.origen === 'web' || pedido.creado_por_nombre === 'Web Confetti';

  return (
    <button
      type="button"
      onClick={() => onVer?.(pedido)}
      className="skeu-card w-full p-4 rounded-2xl text-left transition-all active:scale-[0.99]"
      style={{ touchAction: 'manipulation', minHeight: 44 }}
    >
      {/* Encabezado: folio + estado en una línea limpia; chips (web/sucursal)
          debajo, de-saturados, para no competir con el estado. */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base shrink-0" title="Pastel personalizado">🎂</span>
          <p className="font-mono font-bold text-base text-[#E8579A] truncate">{pedido.folio}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${est.badge}`}>
          {est.label}
        </span>
      </div>
      {(esWeb || (mostrarSucursal && pedido.sucursal_nombre)) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {esWeb && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-pink-50 text-pink-700 border-pink-200">
              🌐 WEB
            </span>
          )}
          {mostrarSucursal && pedido.sucursal_nombre && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
              pedido.sucursal_nombre.includes('Xochimilco') ? 'bg-blue-50 text-blue-700 border-blue-200' :
              pedido.sucursal_nombre.includes('Topilejo')   ? 'bg-green-50 text-green-700 border-green-200' :
              pedido.sucursal_nombre.includes('Gregorio')   ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              {pedido.sucursal_nombre}
            </span>
          )}
        </div>
      )}
      <div className="flex gap-3">
        {pedido.imagen_referencia_url && (
          <img src={pedido.imagen_referencia_url} alt="ref"
            className="w-14 h-14 rounded-lg object-cover border shrink-0"
            style={{ imageOrientation: 'from-image' }} />
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
        {Number(pedido.a_cuenta) > 0 && saldoVivo > 0 && (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Resta: {fmt(saldoVivo)}</p>
        )}
      </div>
    </button>
  );
}
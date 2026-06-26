import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import NumericInput from '@/components/common/NumericInput';
import { formatCurrency } from '@/utils/financialUtils';
import { Banknote, CreditCard, Smartphone, Layers, Globe } from 'lucide-react';

const METODOS = [
  { key: 'efectivo', label: 'Efectivo', Icon: Banknote, color: 'border-green-400 bg-green-50 text-green-700' },
  { key: 'tarjeta', label: 'Tarjeta', Icon: CreditCard, color: 'border-blue-400 bg-blue-50 text-blue-700' },
  { key: 'transferencia', label: 'Transferencia', Icon: Smartphone, color: 'border-purple-400 bg-purple-50 text-purple-700' },
  { key: 'mixto', label: 'Mixto', Icon: Layers, color: 'border-orange-400 bg-orange-50 text-orange-700' },
];

/**
 * Modal de cobro para pedidos web de CATÁLOGO.
 * Permite elegir método (efectivo/tarjeta/transferencia/mixto) y cobra por el
 * total fijo del pedido (total_final). Al confirmar entrega los montos exactos
 * por método al callback onConfirm. NO toca inventario ni propinas — eso lo
 * maneja el handler de Caja (handleCobrarPedidoWeb).
 */
export default function CobrarPedidoWebDialog({ pedido, open, onOpenChange, onConfirm, loading }) {
  const total = Number(pedido?.total_final) || 0;
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoTarjeta, setMontoTarjeta] = useState('');
  const [montoTransferencia, setMontoTransferencia] = useState('');

  // Resetear estado cada vez que se abre con un pedido nuevo.
  useEffect(() => {
    if (open) {
      setMetodoPago('efectivo');
      setMontoEfectivo('');
      setMontoTarjeta('');
      setMontoTransferencia('');
    }
  }, [open, pedido?.id]);

  const cambio = useMemo(() => {
    if (metodoPago !== 'efectivo') return 0;
    const recibido = parseFloat(montoEfectivo) || 0;
    return Math.max(0, recibido - total);
  }, [metodoPago, montoEfectivo, total]);

  const sumaMixto = useMemo(() => {
    return (parseFloat(montoEfectivo) || 0) + (parseFloat(montoTarjeta) || 0) + (parseFloat(montoTransferencia) || 0);
  }, [montoEfectivo, montoTarjeta, montoTransferencia]);

  const mixtoCuadra = Math.abs(sumaMixto - total) < 0.01;

  const handleConfirm = () => {
    let mEfec = 0, mTar = 0, mTrans = 0;
    if (metodoPago === 'efectivo') { mEfec = total; }
    else if (metodoPago === 'tarjeta') { mTar = total; }
    else if (metodoPago === 'transferencia') { mTrans = total; }
    else if (metodoPago === 'mixto') {
      mEfec = parseFloat(montoEfectivo) || 0;
      mTar = parseFloat(montoTarjeta) || 0;
      mTrans = parseFloat(montoTransferencia) || 0;
    }
    onConfirm({
      metodo_pago: metodoPago,
      monto_efectivo: mEfec,
      monto_tarjeta: mTar,
      monto_transferencia: mTrans,
      cambio,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Globe className="w-5 h-5 text-pink-500" />
            Cobrar pedido web {pedido?.folio || ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {pedido?.cliente_nombre && (
            <p className="text-sm text-muted-foreground">
              Cliente: <span className="font-medium text-foreground">{pedido.cliente_nombre}</span>
            </p>
          )}

          <div className="flex justify-between font-black text-lg border-y py-2">
            <span>TOTAL A COBRAR</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Método de pago</Label>
            <div className="grid grid-cols-2 gap-2.5 mt-2">
              {METODOS.map(m => (
                <button key={m.key} type="button" onClick={() => setMetodoPago(m.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${metodoPago === m.key ? m.color + ' shadow-md' : 'border-border bg-white text-muted-foreground hover:bg-muted'}`}>
                  <m.Icon className="w-4 h-4 shrink-0" />{m.label}
                </button>
              ))}
            </div>
          </div>

          {metodoPago === 'efectivo' && (
            <div>
              <Label className="text-xs">Recibido</Label>
              <NumericInput value={montoEfectivo}
                onChange={e => setMontoEfectivo(e.target.value)}
                placeholder="0.00" className="text-xl font-bold h-12 mt-1.5" />
              {montoEfectivo && (
                <p className="text-sm font-bold mt-1.5 text-emerald-600">
                  Cambio: {formatCurrency(cambio)}
                </p>
              )}
            </div>
          )}

          {metodoPago === 'mixto' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Efectivo</Label><NumericInput value={montoEfectivo} onChange={e => setMontoEfectivo(e.target.value)} placeholder="0" className="mt-1" /></div>
                <div><Label className="text-xs">Tarjeta</Label><NumericInput value={montoTarjeta} onChange={e => setMontoTarjeta(e.target.value)} placeholder="0" className="mt-1" /></div>
                <div><Label className="text-xs">Transfer.</Label><NumericInput value={montoTransferencia} onChange={e => setMontoTransferencia(e.target.value)} placeholder="0" className="mt-1" /></div>
              </div>
              <p className={`text-[11px] font-semibold ${mixtoCuadra ? 'text-emerald-700' : 'text-rose-700'}`}>
                {mixtoCuadra
                  ? `✓ Cuadra: ${formatCurrency(sumaMixto)}.`
                  : `La suma (${formatCurrency(sumaMixto)}) debe ser igual al total (${formatCurrency(total)}).`}
              </p>
            </>
          )}
        </div>

        <DialogFooter className="mt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto" disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || (metodoPago === 'mixto' && !mixtoCuadra)}
            className="w-full sm:w-auto sm:min-w-[160px]"
            style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)' }}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
                Procesando…
              </span>
            ) : `Cobrar ${formatCurrency(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
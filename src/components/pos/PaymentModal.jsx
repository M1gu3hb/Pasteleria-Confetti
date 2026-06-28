import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/utils/financialUtils';
import { CheckCircle } from 'lucide-react';
import { construirPago } from '@/utils/metodoPago';
import MetodoPagoSelector from './MetodoPagoSelector';

export default function PaymentModal({ open, onClose, total, propinaMonto = 0, onConfirm, loading }) {
  // FASE 3 #3 — el método + reparto del mixto se manejan CONTROLADOS aquí; el
  // pago se computa SÍNCRONO con construirPago (sin rezago de useEffect → los
  // montos por método nunca quedan viejos respecto al total).
  const [metodo, setMetodo] = useState('efectivo');
  const [montosMixto, setMontosMixto] = useState({ efectivo: '', tarjeta: '', transferencia: '' });
  const [montoRecibido, setMontoRecibido] = useState('');
  const efectivoRef = useRef(null);

  // Total que efectivamente se cobra al cliente = venta + propina.
  const propinaSafe = Number.isFinite(Number(propinaMonto)) ? Number(propinaMonto) : 0;
  const totalACobrar = (Number(total) || 0) + propinaSafe;

  const { pago, valido: pagoValido } = construirPago(totalACobrar, metodo, montosMixto);
  const esEfectivo = metodo === 'efectivo';

  // FIX BUG PC: el focus-trap de Radix + autoFocus compiten en desktop. Focus
  // diferido y reset al abrir.
  useEffect(() => {
    if (open) {
      setMetodo('efectivo');
      setMontosMixto({ efectivo: '', tarjeta: '', transferencia: '' });
      setMontoRecibido('');
      const t = setTimeout(() => {
        try { efectivoRef.current?.focus(); } catch (_) {}
      }, 140);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cambio SOLO para efectivo único (el mixto y los demás métodos son exactos).
  const cambio = esEfectivo ? Math.max(0, (parseFloat(montoRecibido) || 0) - totalACobrar) : 0;
  // canPay: el selector valida método/cuadre del mixto; efectivo único exige
  // además que el monto recibido alcance el total.
  const canPay = pagoValido && (!esEfectivo || (parseFloat(montoRecibido) || 0) >= totalACobrar) && !loading;

  const handleConfirm = () => {
    // `total` (venta real) NO cambia. La propina se distribuye en el mismo cobro.
    onConfirm({
      metodo_pago: pago.metodo_pago,
      monto_efectivo: pago.monto_efectivo,
      monto_tarjeta: pago.monto_tarjeta,
      monto_transferencia: pago.monto_transferencia,
      cambio: esEfectivo ? cambio : 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Cobrar venta</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="text-center py-4 bg-muted rounded-xl">
            {propinaSafe > 0 && (
              <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                <div className="flex justify-between px-4">
                  <span>Subtotal venta</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between px-4 text-rose-600">
                  <span>Propina</span>
                  <span>+ {formatCurrency(propinaSafe)}</span>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Total a cobrar</p>
            <p className="text-3xl font-heading font-bold text-primary">{formatCurrency(totalACobrar)}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Método de pago</Label>
            <MetodoPagoSelector
              total={totalACobrar}
              metodo={metodo}
              montos={montosMixto}
              onMetodoChange={setMetodo}
              onMontosChange={setMontosMixto}
              disabled={loading}
            />
          </div>

          {esEfectivo && (
            <div className="space-y-2">
              <Label className="text-xs">Monto recibido</Label>
              <Input
                ref={efectivoRef}
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={montoRecibido}
                onChange={e => {
                  const v = (e.target.value || '').replace(',', '.');
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setMontoRecibido(v);
                }}
                placeholder="0.00"
                className="text-lg font-bold text-center h-12"
              />
              {parseFloat(montoRecibido) >= totalACobrar && (
                <div className="text-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-600">Cambio</p>
                  <p className="text-xl font-heading font-bold text-emerald-700">{formatCurrency(cambio)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canPay} className="gap-2">
            <CheckCircle className="w-4 h-4" /> {loading ? 'Procesando...' : 'Confirmar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

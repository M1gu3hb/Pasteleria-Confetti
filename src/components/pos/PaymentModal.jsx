import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/utils/financialUtils';
import { Banknote, CreditCard, Smartphone, CheckCircle } from 'lucide-react';

const METHODS = [
  { key: 'efectivo', label: 'Efectivo', icon: Banknote },
  { key: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { key: 'transferencia', label: 'Transferencia', icon: Smartphone },
];

export default function PaymentModal({ open, onClose, total, propinaMonto = 0, onConfirm, loading }) {
  const [method, setMethod] = useState('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const efectivoRef = useRef(null);

  // FIX BUG PC: el focus-trap de Radix + autoFocus compiten en desktop y a
  // veces bloquean la escritura en los primeros taps/clicks. Hacemos focus
  // diferido y reseteamos al abrir.
  useEffect(() => {
    if (open) {
      setMontoRecibido('');
      setMethod('efectivo');
      const t = setTimeout(() => {
        try { efectivoRef.current?.focus(); } catch (_) {}
      }, 140);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Total que efectivamente se cobra al cliente = venta + propina.
  const propinaSafe = Number.isFinite(Number(propinaMonto)) ? Number(propinaMonto) : 0;
  const totalACobrar = (Number(total) || 0) + propinaSafe;

  const cambio = method === 'efectivo' ? Math.max(0, (parseFloat(montoRecibido) || 0) - totalACobrar) : 0;
  const canPay = method !== 'efectivo' || (parseFloat(montoRecibido) || 0) >= totalACobrar;

  const handleConfirm = () => {
    // Importante: `total` (venta real) NO cambia. La propina se cobra aparte
    // y se distribuye en el mismo método de pago.
    onConfirm({
      metodo_pago: method,
      monto_efectivo: method === 'efectivo' ? totalACobrar : 0,
      monto_tarjeta: method === 'tarjeta' ? totalACobrar : 0,
      monto_transferencia: method === 'transferencia' ? totalACobrar : 0,
      cambio: method === 'efectivo' ? cambio : 0,
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
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => {
                const Icon = m.icon;
                return (
                  <Button key={m.key} variant={method === m.key ? 'default' : 'outline'}
                    onClick={() => setMethod(m.key)} className="flex flex-col h-auto py-3 gap-1">
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{m.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {method === 'efectivo' && (
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
          <Button onClick={handleConfirm} disabled={!canPay || loading} className="gap-2">
            <CheckCircle className="w-4 h-4" /> {loading ? 'Procesando...' : 'Confirmar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
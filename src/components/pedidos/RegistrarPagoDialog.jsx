import { mensajeOperacion } from '@/utils/errorOperacion';
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { construirPago } from '@/utils/metodoPago';
import MetodoPagoSelector from '@/components/pos/MetodoPagoSelector';
import { registrarPagoPedido, recuperarOperacionPedido } from '@/utils/registrarPagoPedido';
import { tieneIntencionPendiente } from '@/utils/intencionPersistente';

// Fase 4 — registra un abono con circuito financiero (Abono + PedidoPastel).
// PARTE A — además crea una Venta paralela contable por cada pago (parcial o
// total) para que el dinero entre al corte del día y aparezca en Dashboard/PDF.
export default function RegistrarPagoDialog({ pedido, cajaAbierta, posUser, sucursalEfectiva, hayCorteAtrasado, open, onClose, onPagoRegistrado }) {
  const saldoActual = Number.isFinite(Number(pedido?.saldo_pendiente))
    ? Number(pedido.saldo_pendiente)
    : Math.max(0, (Number(pedido?.total_final) || 0) - (Number(pedido?.total_abonado) || 0));
  const [monto, setMonto] = useState('');
  // FASE 3 #3 — método + reparto del mixto CONTROLADOS aquí; el pago se computa
  // SÍNCRONO con construirPago (sin rezago: los montos por método nunca quedan
  // viejos respecto al monto a abonar).
  const [metodo, setMetodo] = useState('efectivo');
  const [montosMixto, setMontosMixto] = useState({ efectivo: '', tarjeta: '', transferencia: '' });
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const cobrandoRef = useRef(false);
  const slotPago = `pago:${pedido?.sucursal_id}:${pedido?.id}`;
  const pendiente = tieneIntencionPendiente(slotPago);
  const { pago, valido: pagoValido } = construirPago(parseFloat(monto) || 0, metodo, montosMixto);

  useEffect(() => {
    if (open) { setMonto(saldoActual > 0 ? String(saldoActual) : ''); setMetodo('efectivo'); setMontosMixto({ efectivo: '', tarjeta: '', transferencia: '' }); setNotas(''); }
     
  }, [open]);

  const confirmar = async () => {
    if (cobrandoRef.current || loading || !pedido?.id) return;
    // PARTE F — detección de internet antes de cobrar.
    if (!navigator.onLine) {
      toast.error('Sin conexión a internet. No se puede procesar el cobro. Verifica tu conexión.');
      return;
    }
    // PARTE A — bloqueos de caja y corte atrasado antes de registrar pagos.
    if (!pendiente && !cajaAbierta?.id) {
      toast.error('Abre caja antes de registrar pagos.');
      return;
    }
    if (!pendiente && hayCorteAtrasado) {
      toast.error('Cierra el corte del día anterior antes de registrar pagos de hoy.');
      return;
    }
    const m = parseFloat(monto) || 0;
    if (!pendiente && m <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (!pendiente && m > saldoActual + 0.01) { toast.error(`El monto excede el saldo pendiente ($${saldoActual.toFixed(2)})`); return; }
    if (!pendiente && !pagoValido) { toast.error('Revisa el método de pago (si es mixto, la suma debe cuadrar el monto).'); return; }
    cobrandoRef.current = true;
    setLoading(true);
    try {
      // Lógica de cobro compartida (Abono + Venta paralela + recompute del pedido).
      // La MISMA que usa el anticipo al crear el pedido → no divergen.
      const res = pendiente ? await recuperarOperacionPedido(slotPago) : await registrarPagoPedido({ pedido, monto: m, pago, cajaAbierta, posUser, sucursalEfectiva, notas });
      toast.success(`Pago de $${Number(res.montoRegistrado).toFixed(2)} registrado${res.intencionRecuperada ? ' (intento recuperado)' : ''}`);
      onPagoRegistrado?.();
      onClose?.();
    } catch (err) {
      console.error('[RegistrarPago]', err);
      toast.error(err?.message?.includes('CONCILIAR_PAGO_CANCELADO') ? mensajeOperacion(err) : err?.message || 'No se pudo confirmar el pago. Reintenta para recuperar el mismo intento.');
    } finally {
      cobrandoRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose?.(); }}>
      <DialogContent className="sm:max-w-sm bg-gradient-to-b from-[#fff8f4] to-white dark:from-[#2E1D0E] dark:to-[#241608]">
        <DialogHeader><DialogTitle className="font-heading">Registrar pago</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {pendiente && <p className="text-sm">Hay un intento sin confirmar. Consultaremos el cobro original antes de permitir otro pago.</p>}
          <div className="text-center p-3 rounded-xl bg-muted/40 border">
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className="text-3xl font-heading font-black">${saldoActual.toFixed(2)}</p>
          </div>
          <div>
            <Label className="text-xs">Monto a abonar ($)</Label>
            <Input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
              className="skeu-input h-12 mt-1 font-bold text-xl" />
          </div>
          <MetodoPagoSelector
            total={parseFloat(monto) || 0}
            metodo={metodo}
            montos={montosMixto}
            onMetodoChange={setMetodo}
            onMontosChange={setMontosMixto}
            disabled={loading}
          />
          <div>
            <Label className="text-xs">Notas (opcional)</Label>
            <Input value={notas} onChange={e => setNotas(e.target.value)} className="skeu-input h-10 mt-1" />
          </div>
          <Button onClick={confirmar} disabled={loading || (!pendiente && !pagoValido)} className="w-full h-12 font-bold">
            {loading ? 'Confirmando…' : pendiente ? 'Recuperar pago pendiente' : 'Confirmar pago'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

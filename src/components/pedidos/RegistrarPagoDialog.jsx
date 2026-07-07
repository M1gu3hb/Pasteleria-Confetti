import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { construirPago } from '@/utils/metodoPago';
import MetodoPagoSelector from '@/components/pos/MetodoPagoSelector';
import { registrarPagoPedido } from '@/utils/registrarPagoPedido';

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
  // FASE 4 — cuando un pago liquida el pedido, mostramos la pregunta "¿ya se
  // entrega?" antes de cerrar (en vez de cerrar directo).
  const [liquidado, setLiquidado] = useState(false);

  const { pago, valido: pagoValido } = construirPago(parseFloat(monto) || 0, metodo, montosMixto);

  useEffect(() => {
    if (open) { setMonto(saldoActual > 0 ? String(saldoActual) : ''); setMetodo('efectivo'); setMontosMixto({ efectivo: '', tarjeta: '', transferencia: '' }); setNotas(''); setLiquidado(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirmar = async () => {
    if (loading || !pedido?.id) return;
    // PARTE F — detección de internet antes de cobrar.
    if (!navigator.onLine) {
      toast.error('Sin conexión a internet. No se puede procesar el cobro. Verifica tu conexión.');
      return;
    }
    // PARTE A — bloqueos de caja y corte atrasado antes de registrar pagos.
    if (!cajaAbierta?.id) {
      toast.error('Abre caja antes de registrar pagos.');
      return;
    }
    if (hayCorteAtrasado) {
      toast.error('Cierra el corte del día anterior antes de registrar pagos de hoy.');
      return;
    }
    const m = parseFloat(monto) || 0;
    if (m <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (m > saldoActual + 0.01) { toast.error(`El monto excede el saldo pendiente ($${saldoActual.toFixed(2)})`); return; }
    if (!pagoValido) { toast.error('Revisa el método de pago (si es mixto, la suma debe cuadrar el monto).'); return; }
    setLoading(true);
    try {
      // Lógica de cobro compartida (Abono + Venta paralela + recompute del pedido).
      // La MISMA que usa el anticipo al crear el pedido → no divergen.
      const res = await registrarPagoPedido({ pedido, monto: m, pago, cajaAbierta, posUser, sucursalEfectiva, notas });
      if (res.ventaError) {
        toast.error(`Error al registrar la venta paralela: ${res.ventaError}`);
      }
      toast.success(`Pago de $${m.toFixed(2)} registrado`);
      // FASE 4 — si este pago LIQUIDA el pedido (saldo 0), preguntar si ya se
      // entrega antes de cerrar. Si no liquida, cierra como siempre.
      if (res.saldoPendiente <= 0) {
        setLiquidado(true);
      } else {
        onPagoRegistrado?.();
        onClose?.();
      }
    } catch (err) {
      console.error('[RegistrarPago]', err);
      toast.error('No se pudo registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  // FASE 4 — cierre tras liquidar (refresca listas y cierra el diálogo/detalle).
  const cerrarTrasLiquidar = () => { onPagoRegistrado?.(); onClose?.(); };
  // "Sí, marcar entregado" — mismo efecto que el botón Entregado: saca el pedido
  // de la lista de pendientes. Solo cambia estado; NO toca dinero.
  const marcarEntregadoYCerrar = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await base44.entities.PedidoPastel.update(pedido.id, {
        estado: 'entregado',
        fecha_entrega_real: new Date().toISOString(),
      });
      toast.success('Pedido marcado como entregado');
    } catch (e) {
      console.error('[RegistrarPago] marcar entregado:', e);
      toast.error('No se pudo marcar como entregado.');
    } finally {
      setLoading(false);
      cerrarTrasLiquidar();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) { if (liquidado) cerrarTrasLiquidar(); else onClose?.(); } }}>
      <DialogContent className="sm:max-w-sm bg-gradient-to-b from-[#fff8f4] to-white dark:from-[#2E1D0E] dark:to-[#241608]">
        <DialogHeader><DialogTitle className="font-heading">{liquidado ? 'Pago completo' : 'Registrar pago'}</DialogTitle></DialogHeader>
        {liquidado ? (
          <div className="space-y-4">
            <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Este pago liquida el pedido.</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">¿El pastel ya se va a entregar?</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={marcarEntregadoYCerrar} disabled={loading}
                className="h-12 font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                Sí, marcar entregado
              </Button>
              <Button variant="outline" onClick={cerrarTrasLiquidar} disabled={loading} className="h-11">
                No, aún no
              </Button>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
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
          <Button onClick={confirmar} disabled={loading || !pagoValido} className="w-full h-12 font-bold">
            {loading ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
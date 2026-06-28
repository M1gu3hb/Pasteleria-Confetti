import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { generarFolioVenta } from '@/utils/pedidoPastelUtils';
import { construirPago } from '@/utils/metodoPago';
import MetodoPagoSelector from '@/components/pos/MetodoPagoSelector';

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

  const { pago, valido: pagoValido } = construirPago(parseFloat(monto) || 0, metodo, montosMixto);

  useEffect(() => {
    if (open) { setMonto(saldoActual > 0 ? String(saldoActual) : ''); setMetodo('efectivo'); setMontosMixto({ efectivo: '', tarjeta: '', transferencia: '' }); setNotas(''); }
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
      const abonoCreado = await base44.entities.Abono.create({
        pedido_id: pedido.id, sucursal_id: pedido.sucursal_id, sucursal_nombre: pedido.sucursal_nombre,
        monto: m, metodo_pago: pago.metodo_pago, afecta_caja: true,
        // FASE 3 A-FIX (Opción A): desglose por método del abono (mismo split que la
        // venta paralela). Los buckets de abonos suman estas columnas → el efectivo de
        // un abono mixto se trata IGUAL que cualquier efectivo (doble conteo consistente).
        monto_efectivo: pago.monto_efectivo,
        monto_tarjeta: pago.monto_tarjeta,
        monto_transferencia: pago.monto_transferencia,
        corte_caja_id: cajaAbierta?.id || null,
        registrado_por_id: posUser?.id, registrado_por_nombre: posUser?.nombre,
        fecha_abono: new Date().toISOString(), notas,
      });

      // PARTE A — Venta paralela contable. Cada abono recibido genera una Venta
      // que vive en el corte del día, aparece en Dashboard y en el PDF del corte.
      // El folio identifica el pago como "Pago de pedido", no venta de mostrador.
      const sucId = sucursalEfectiva?.sucursal_id || pedido.sucursal_id;
      const sucNombre = sucursalEfectiva?.sucursal_nombre || pedido.sucursal_nombre;
      // MINI-FIX — si no hay sucursal identificada, NO intentar la venta.
      if (!sucId) {
        console.error('[RegistrarPago] sucursal_id vacío - imposible crear venta paralela');
        toast.error('No se pudo registrar la venta: sucursal no identificada.');
      } else try {
        // MINI-FIX — prefijo ROBUSTO desde la entidad Sucursal del pedido.
        // sucursalEfectiva puede ser null (dueño en Vista general) → en ese caso
        // el prefijo se obtenía mal por nombre ("Xochimilco" → "X"). Ahora lo
        // leemos de la entidad Sucursal real (prefijo correcto: "A").
        let prefijo = sucursalEfectiva?.folio_prefijo;
        if (!prefijo) {
          const suc = await base44.entities.Sucursal.filter({ id: sucId }, null, 1);
          prefijo = Array.isArray(suc) && suc[0]?.folio_prefijo
            ? suc[0].folio_prefijo
            : 'X';
        }
        const folioVenta = await generarFolioVenta(sucId, prefijo);
        const ventaCreada = await base44.entities.Venta.create({
          folio: folioVenta,
          tipo_venta: 'mostrador',
          sucursal_id: sucId,
          sucursal_nombre: sucNombre,
          cliente_nombre: pedido.cliente_nombre,
          estado: 'pagada',
          metodo_pago: pago.metodo_pago,
          total: m,
          subtotal: m,
          monto_efectivo: pago.monto_efectivo,
          monto_tarjeta: pago.monto_tarjeta,
          monto_transferencia: pago.monto_transferencia,
          total_cobrado_con_propina: m,
          notas: `Pago de pedido ${pedido.folio} - ${pedido.cliente_nombre || 'sin nombre'}`,
          corte_caja_id: cajaAbierta.id,
          fecha_cierre: new Date().toISOString(),
          usuario_cajero_id: posUser?.id,
          usuario_cajero_nombre: posUser?.nombre,
        });
        // MINI-FIX — DetalleVenta para que el ticket/PDF muestre el concepto del
        // pago ("Adelanto de pago — PP-A-XXXX") en vez de aparecer sin producto.
        if (ventaCreada?.id) {
          await base44.entities.DetalleVenta.create({
            venta_id: ventaCreada.id,
            producto_id: null,   // FASE 3 A — línea de pago, sin producto de catálogo (columna nullable, migr 0023)
            producto_nombre: `Anticipo pedido ${pedido.folio}`,
            cantidad: 1,
            precio_unitario_snapshot: m,
            subtotal: m,
            costo_unitario_snapshot: 0,
            tipo_venta_snapshot: 'precio_fijo',
            estado_preparacion: 'entregado',
          });
        }
      } catch (errVenta) {
        // El abono ya quedó guardado. Si la venta paralela falla, avisamos pero
        // no revertimos el abono (no dejar pantalla blanca ni perder el pago).
        // MINI-FIX — log VISIBLE del error real para no volver a quedar a ciegas.
        console.error('[RegistrarPago] venta paralela:', errVenta);
        toast.error(`Error al registrar la venta paralela: ${errVenta?.message || 'desconocido'}`);
      }

      const abonos = await base44.entities.Abono.filter({ pedido_id: pedido.id });
      const totalAbonado = (Array.isArray(abonos) ? abonos : []).reduce((s, a) => s + (Number(a?.monto) || 0), 0);
      const saldoPendiente = Math.max(0, (Number(pedido.total_final) || 0) - totalAbonado);
      const estadoActual = pedido.estado;
      let nuevoEstado = estadoActual;
      if (saldoPendiente <= 0) nuevoEstado = 'pagado';
      else if (totalAbonado > 0 && !['entregado', 'cancelado', 'pagado'].includes(estadoActual)) nuevoEstado = 'con_anticipo';
      await base44.entities.PedidoPastel.update(pedido.id, {
        total_abonado: totalAbonado,
        saldo_pendiente: saldoPendiente,
        estado: nuevoEstado,
        ...((estadoActual === 'pendiente' || estadoActual === 'confirmado') ? { fecha_anticipo: new Date().toISOString() } : {}),
        ...(saldoPendiente <= 0 ? { fecha_pago_completo: new Date().toISOString() } : {}),
      });
      toast.success(`Pago de $${m.toFixed(2)} registrado`);
      onPagoRegistrado?.();
      onClose?.();
    } catch (err) {
      console.error('[RegistrarPago]', err);
      toast.error('No se pudo registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose?.(); }}>
      <DialogContent className="sm:max-w-sm bg-gradient-to-b from-[#fff8f4] to-white dark:from-[#2E1D0E] dark:to-[#241608]">
        <DialogHeader><DialogTitle className="font-heading">Registrar pago</DialogTitle></DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
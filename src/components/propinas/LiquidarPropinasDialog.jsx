import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, CheckCircle2, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/financialUtils';
import {
  filtrarVentasEnRango,
  agruparPropinasPorMesero,
  sumarPropinas,
} from '@/utils/tipsUtils';
import { usePOSAuth } from '@/lib/POSAuthContext';

/**
 * Dialog de liquidación de propinas.
 * - Selecciona rango y opcionalmente un mesero.
 * - Lista las ventas con propina pendiente del rango.
 * - Al confirmar: crea LiquidacionPropina + marca cada venta con propina_liquidada=true.
 * - NUNCA borra ventas ni propinas.
 */
const RANGOS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'quincena', label: 'Quincena (15 días)' },
  { id: 'month', label: 'Este mes' },
  { id: 'custom', label: 'Personalizado' },
];

export default function LiquidarPropinasDialog({ open, onClose, ventas = [], meseros = [], rangoInicial = 'today', meseroInicialId = '' }) {
  const queryClient = useQueryClient();
  const { posUser } = usePOSAuth();
  const [rango, setRango] = useState(rangoInicial);
  const [desde, setDesde] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [meseroId, setMeseroId] = useState(meseroInicialId);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setRango(rangoInicial);
      setMeseroId(meseroInicialId);
      setNotas('');
      setDesde(format(new Date(), 'yyyy-MM-dd'));
      setHasta(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open, rangoInicial, meseroInicialId]);

  const range = useMemo(() => {
    const now = new Date();
    if (rango === 'today') return { from: startOfDay(now), to: endOfDay(now) };
    if (rango === 'week') return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (rango === 'quincena') return { from: startOfDay(subDays(now, 14)), to: endOfDay(now) };
    if (rango === 'month') return { from: startOfMonth(now), to: endOfMonth(now) };
    try {
      return { from: startOfDay(new Date(desde)), to: endOfDay(new Date(hasta)) };
    } catch {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
  }, [rango, desde, hasta]);

  // Ventas pendientes de liquidar en el rango (y opcionalmente del mesero)
  const ventasFiltradas = useMemo(() => {
    const safe = Array.isArray(ventas) ? ventas : [];
    const enRango = filtrarVentasEnRango(safe, range.from, range.to);
    return enRango.filter(v => {
      if (v?.estado !== 'pagada') return false;
      if ((Number(v?.propina_monto) || 0) <= 0) return false;
      if (v?.propina_liquidada === true) return false;
      if (meseroId && meseroId !== '__all__' && v?.usuario_mesero_id !== meseroId) return false;
      return true;
    });
  }, [ventas, range, meseroId]);

  const desglose = useMemo(() => agruparPropinasPorMesero(ventasFiltradas), [ventasFiltradas]);
  const total = useMemo(() => sumarPropinas(ventasFiltradas), [ventasFiltradas]);

  const liquidar = async () => {
    if (ventasFiltradas.length === 0) {
      toast.error('No hay propinas pendientes en ese periodo');
      return;
    }
    setLoading(true);
    try {
      const folio = `LIQ-${format(new Date(), 'yyyyMMdd-HHmmss')}`;
      const liquidacion = await base44.entities.LiquidacionPropina.create({
        folio,
        fecha_liquidacion: new Date().toISOString(),
        rango_inicio: range.from.toISOString(),
        rango_fin: range.to.toISOString(),
        rango_tipo: rango === 'custom' ? 'personalizado' : (rango === 'today' ? 'dia' : rango === 'week' ? 'semana' : rango === 'quincena' ? 'quincena' : rango === 'month' ? 'mes' : 'personalizado'),
        mesero_id: meseroId && meseroId !== '__all__' ? meseroId : null,
        mesero_nombre: meseroId && meseroId !== '__all__'
          ? (meseros.find(m => m.id === meseroId)?.nombre || '')
          : 'Todos los meseros',
        total_liquidado: total,
        numero_ventas: ventasFiltradas.length,
        venta_ids: JSON.stringify(ventasFiltradas.map(v => v.id)),
        desglose_meseros: JSON.stringify(desglose),
        usuario_liquido_id: posUser?.id || '',
        usuario_liquido_nombre: posUser?.nombre || '',
        notas: notas || '',
      });

      // Marcar cada venta como liquidada (en paralelo, batch de 5)
      const batchSize = 5;
      const ahora = new Date().toISOString();
      for (let i = 0; i < ventasFiltradas.length; i += batchSize) {
        const batch = ventasFiltradas.slice(i, i + batchSize);
        await Promise.all(batch.map(v =>
          base44.entities.Venta.update(v.id, {
            propina_liquidada: true,
            propina_liquidacion_id: liquidacion?.id || folio,
            propina_liquidada_fecha: ahora,
          }).catch(err => {
            console.error('[Liquidar] error en venta', v.id, err);
          })
        ));
      }

      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
      queryClient.invalidateQueries({ queryKey: ['registros_ventas'] });
      queryClient.invalidateQueries({ queryKey: ['liquidaciones_propinas'] });
      toast.success(`Liquidación ${folio} registrada · ${formatCurrency(total)}`);
      onClose?.();
    } catch (err) {
      console.error('[LiquidarPropinasDialog]', err);
      toast.error('No se pudo registrar la liquidación: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose?.(); }}>
      <DialogContent className="sm:max-w-lg w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Liquidar propinas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Rango */}
          <div>
            <Label className="text-xs font-semibold">Periodo</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {RANGOS.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRango(r.id)}
                  className={`text-xs px-2 py-2 rounded-lg border-2 font-medium ${
                    rango === r.id
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-border text-muted-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {rango === 'custom' && (
            <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-muted/40">
              <div>
                <Label className="text-[10px] uppercase">Desde</Label>
                <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Hasta</Label>
                <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-9" />
              </div>
            </div>
          )}

          {/* Mesero */}
          <div>
            <Label className="text-xs font-semibold">Mesero</Label>
            <Select value={meseroId || '__all__'} onValueChange={v => setMeseroId(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los meseros</SelectItem>
                {meseros.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resumen */}
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                {format(range.from, "d MMM", { locale: es })} – {format(range.to, "d MMM yyyy", { locale: es })}
              </p>
              <p className="text-[10px] text-muted-foreground">{ventasFiltradas.length} ventas</p>
            </div>
            <p className="text-[10px] uppercase font-semibold text-emerald-700">Total a liquidar</p>
            <p className="font-heading font-black text-3xl text-emerald-700">{formatCurrency(total)}</p>
          </div>

          {/* Desglose */}
          {desglose.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground">Desglose</div>
              <div className="max-h-40 overflow-y-auto divide-y">
                {desglose.map((m, i) => (
                  <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{m.mesero_nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{m.num_ventas} ventas</p>
                    </div>
                    <p className="font-bold text-emerald-700">{formatCurrency(m.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <Label className="text-xs font-semibold">Notas (opcional)</Label>
            <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej. Entregado en efectivo" className="h-9 mt-1" />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            onClick={liquidar}
            disabled={loading || ventasFiltradas.length === 0}
            className="gap-2"
            style={{ background: 'linear-gradient(135deg, hsl(152,60%,40%) 0%, hsl(152,60%,32%) 100%)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loading ? 'Liquidando…' : `Liquidar ${formatCurrency(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
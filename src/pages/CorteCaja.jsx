import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { formatCurrency, formatPercent, generateFolio } from '@/utils/financialUtils';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DollarSign, Receipt, TrendingUp, Scissors, FileText } from 'lucide-react';
import { safeFormatDate } from '@/lib/safeFormat';
import CorteViewerDialog from '@/components/cortes/CorteViewerDialog';

export default function CorteCaja() {
  const { posUser } = usePOSAuth();
  const queryClient = useQueryClient();
  const [showCierre, setShowCierre] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState('');
  const [notas, setNotas] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [verCorte, setVerCorte] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data: ventasHoy = [] } = useQuery({
    queryKey: ['ventas_corte'],
    queryFn: () => base44.entities.Venta.filter({ estado: 'pagada' }),
    initialData: [],
  });

  const { data: gastos = [] } = useQuery({
    queryKey: ['gastos_hoy'],
    queryFn: () => base44.entities.GastoOperativo.list('-created_date', 100),
    initialData: [],
  });

  const { data: cortes = [] } = useQuery({
    queryKey: ['cortes'],
    queryFn: () => base44.entities.CorteCaja.list('-created_date', 20),
    initialData: [],
  });

  const corteAbierto = Array.isArray(cortes) ? cortes.find(c => c?.estado === 'abierto') : null;

  const resumen = useMemo(() => {
    const ventas = ventasHoy.filter(v => {
      if (!corteAbierto) return v.created_date?.startsWith(today);
      return new Date(v.created_date) >= new Date(corteAbierto.fecha_inicio);
    });
    const gastosHoy = gastos.filter(g => {
      if (!corteAbierto) return g.fecha === today;
      return new Date(g.created_date) >= new Date(corteAbierto.fecha_inicio);
    });
    return {
      numVentas: ventas.length,
      totalEfectivo: ventas.reduce((s, v) => s + (v.monto_efectivo || 0), 0),
      totalTarjeta: ventas.reduce((s, v) => s + (v.monto_tarjeta || 0), 0),
      totalTransferencia: ventas.reduce((s, v) => s + (v.monto_transferencia || 0), 0),
      totalGeneral: ventas.reduce((s, v) => s + (v.total || 0), 0),
      costoTotal: ventas.reduce((s, v) => s + (v.costo_total_snapshot || 0), 0),
      utilidadBruta: ventas.reduce((s, v) => s + (v.utilidad_bruta_snapshot || 0), 0),
      totalGastos: gastosHoy.reduce((s, g) => s + (g.monto || 0), 0),
      ticketPromedio: ventas.length > 0 ? ventas.reduce((s, v) => s + (v.total || 0), 0) / ventas.length : 0,
    };
  }, [ventasHoy, gastos, corteAbierto, today]);

  const margenProm = resumen.totalGeneral > 0
    ? ((resumen.utilidadBruta / resumen.totalGeneral) * 100)
    : 0;

  const efectivoEsperado = resumen.totalEfectivo || 0;
  const efectivoContadoNum = (() => {
    const n = parseFloat(efectivoContado);
    return isNaN(n) ? 0 : n;
  })();
  const efectivoContadoValido = efectivoContado !== '' && !isNaN(parseFloat(efectivoContado));
  const diferencia = efectivoContadoNum - efectivoEsperado;

  const handleAbrirCorte = async () => {
    const folio = generateFolio('CC');
    await base44.entities.CorteCaja.create({
      folio, estado: 'abierto', fecha_inicio: new Date().toISOString(),
      usuario_cajero_id: posUser?.id, usuario_cajero_nombre: posUser?.nombre,
    });
    queryClient.invalidateQueries({ queryKey: ['cortes'] });
    toast.success('Corte de caja abierto');
  };

  const handleCerrar = async () => {
    if (procesando) return;
    setProcesando(true);
    try {
      const folio = corteAbierto ? corteAbierto.folio : generateFolio('CC');
      const data = {
        folio, estado: 'cerrado', fecha_cierre: new Date().toISOString(),
        usuario_cajero_id: posUser?.id, usuario_cajero_nombre: posUser?.nombre,
        total_efectivo: resumen.totalEfectivo, total_tarjeta: resumen.totalTarjeta,
        total_transferencia: resumen.totalTransferencia, total_general: resumen.totalGeneral,
        costo_total_estimado: resumen.costoTotal, utilidad_bruta_total: resumen.utilidadBruta,
        margen_promedio: margenProm, numero_ventas: resumen.numVentas,
        ticket_promedio: resumen.ticketPromedio, total_gastos: resumen.totalGastos,
        efectivo_esperado: efectivoEsperado,
        efectivo_contado: efectivoContadoNum,
        diferencia_efectivo: diferencia,
        notas,
      };
      if (corteAbierto) {
        await base44.entities.CorteCaja.update(corteAbierto.id, data);
      } else {
        await base44.entities.CorteCaja.create({ ...data, fecha_inicio: new Date().toISOString() });
      }
      queryClient.invalidateQueries({ queryKey: ['cortes'] });
      setShowCierre(false);
      toast.success('Corte de caja cerrado exitosamente');
    } catch (err) {
      console.error('[CorteCaja] Error al cerrar:', err);
      toast.error('No se pudo cerrar el corte. Intenta de nuevo.');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Corte de caja" description="Resumen financiero del turno"
        actions={
          <div className="flex gap-2">
            {!corteAbierto && <Button variant="outline" size="sm" onClick={handleAbrirCorte}>Abrir corte</Button>}
            <Button size="sm" onClick={() => setShowCierre(true)}>Hacer corte</Button>
          </div>
        } />

      {corteAbierto && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          Corte abierto desde {safeFormatDate(corteAbierto.fecha_inicio, "d MMM, HH:mm")} · Folio: {corteAbierto.folio}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total ventas" value={formatCurrency(resumen.totalGeneral)} icon={DollarSign} subtitle={`${resumen.numVentas} transacciones`} />
        <StatCard title="Utilidad bruta" value={formatCurrency(resumen.utilidadBruta)} icon={TrendingUp} subtitle={`${margenProm.toFixed(1)}% margen`} />
        <StatCard title="Ticket promedio" value={formatCurrency(resumen.ticketPromedio)} icon={Receipt} />
        <StatCard title="Total gastos" value={formatCurrency(resumen.totalGastos)} icon={Scissors} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Efectivo</p>
          <p className="text-xl font-heading font-bold">{formatCurrency(resumen.totalEfectivo)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Tarjeta</p>
          <p className="text-xl font-heading font-bold">{formatCurrency(resumen.totalTarjeta)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Transferencia</p>
          <p className="text-xl font-heading font-bold">{formatCurrency(resumen.totalTransferencia)}</p>
        </Card>
      </div>

      {(Array.isArray(cortes) ? cortes : []).filter(c => c?.estado === 'cerrado').length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-heading">Cortes anteriores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(Array.isArray(cortes) ? cortes : []).filter(c => c?.estado === 'cerrado').slice(0, 10).map(c => (
              <div key={c.id} className="flex justify-between items-center gap-3 text-sm py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{c.folio}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {safeFormatDate(c.fecha_cierre, "d MMM yyyy, HH:mm", '')}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(c.total_general)}</p>
                  <p className="text-xs text-muted-foreground">{c.numero_ventas} ventas</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setVerCorte(c)}>
                  <FileText className="w-4 h-4 mr-1" /> Ver PDF
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CorteViewerDialog corte={verCorte} open={!!verCorte} onClose={() => setVerCorte(null)} />

      <Dialog open={showCierre} onOpenChange={setShowCierre}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Cierre de caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Total ventas</p><p className="font-bold">{formatCurrency(resumen.totalGeneral)}</p></div>
              <div><p className="text-xs text-muted-foreground">Utilidad bruta</p><p className="font-bold text-emerald-600">{formatCurrency(resumen.utilidadBruta)}</p></div>
              <div><p className="text-xs text-muted-foreground">Efectivo esperado</p><p className="font-bold">{formatCurrency(efectivoEsperado)}</p></div>
              <div><p className="text-xs text-muted-foreground">Margen prom.</p><p className="font-bold">{formatPercent(margenProm)}</p></div>
            </div>
            <div>
              <Label className="text-xs">Efectivo contado en caja</Label>
              <Input type="number" inputMode="decimal" value={efectivoContado} onChange={e => setEfectivoContado(e.target.value)} placeholder="0.00" className="text-lg font-bold" />
              {efectivoContadoValido && (
                <p className={`text-xs mt-1 font-medium ${diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Diferencia: {diferencia >= 0 ? '+' : ''}{formatCurrency(diferencia)}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones del corte..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCierre(false)}>Cancelar</Button>
            <Button onClick={handleCerrar} disabled={procesando}>{procesando ? 'Procesando...' : 'Cerrar caja'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
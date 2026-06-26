import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Heart, Calendar, Filter, History } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';
import { filtrarVentasEnRango, sumarPropinas, agruparPropinasPorMesero } from '@/utils/tipsUtils';
import LiquidarPropinasDialog from '@/components/propinas/LiquidarPropinasDialog';

const RANGOS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'quincena', label: 'Quincena' },
  { id: 'month', label: 'Este mes' },
  { id: 'custom', label: 'Personalizado' },
];

const ESTADOS = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'liquidadas', label: 'Liquidadas' },
];

export default function PropinasRegistros() {
  const [rango, setRango] = useState('week');
  const [desde, setDesde] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [estado, setEstado] = useState('todas');
  const [meseroId, setMeseroId] = useState('__all__');
  const [showLiquidar, setShowLiquidar] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const { data: ventas = [] } = useQuery({
    queryKey: ['registros_ventas'],
    queryFn: () => base44.entities.Venta.list('-fecha_cierre', 2000),
    initialData: [],
  });

  const { data: meseros = [] } = useQuery({
    queryKey: ['usuarios_pos_meseros'],
    queryFn: () => base44.entities.UsuarioPOS.filter({ activo: true }),
    initialData: [],
  });

  const { data: liquidaciones = [] } = useQuery({
    queryKey: ['liquidaciones_propinas'],
    queryFn: () => base44.entities.LiquidacionPropina.list('-fecha_liquidacion', 200).catch(() => []),
    initialData: [],
  });

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

  const ventasFiltradas = useMemo(() => {
    const safe = Array.isArray(ventas) ? ventas : [];
    let res = filtrarVentasEnRango(safe.filter(v => v?.estado === 'pagada' && (Number(v?.propina_monto) || 0) > 0), range.from, range.to);
    if (estado === 'pendientes') res = res.filter(v => v?.propina_liquidada !== true);
    if (estado === 'liquidadas') res = res.filter(v => v?.propina_liquidada === true);
    if (meseroId && meseroId !== '__all__') res = res.filter(v => v?.usuario_mesero_id === meseroId);
    return res;
  }, [ventas, range, estado, meseroId]);

  const total = sumarPropinas(ventasFiltradas);
  const pendientes = ventasFiltradas.filter(v => v?.propina_liquidada !== true);
  const totalPendientes = sumarPropinas(pendientes);
  const desglose = useMemo(() => agruparPropinasPorMesero(ventasFiltradas), [ventasFiltradas]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-bold text-sm">Filtros</h3>
          <div className="ml-auto flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setVerHistorial(v => !v)}>
              <History className="w-3.5 h-3.5 mr-1" /> {verHistorial ? 'Ocultar' : 'Ver'} liquidaciones
            </Button>
            <Button
              size="sm"
              onClick={() => setShowLiquidar(true)}
              disabled={totalPendientes <= 0}
              className="h-8 text-xs text-white"
              style={{ background: 'linear-gradient(135deg, hsl(152,60%,40%) 0%, hsl(152,60%,32%) 100%)' }}
            >
              <Wallet className="w-3.5 h-3.5 mr-1" /> Liquidar propinas
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {RANGOS.map(r => (
            <button key={r.id} type="button" onClick={() => setRango(r.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${rango === r.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
              {r.label}
            </button>
          ))}
        </div>

        {rango === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mb-3 p-2 rounded-lg bg-muted/40">
            <div><Label className="text-[10px] uppercase">Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-8 text-xs" /></div>
            <div><Label className="text-[10px] uppercase">Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-8 text-xs" /></div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] uppercase">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map(e => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase">Mesero</Label>
            <Select value={meseroId} onValueChange={setMeseroId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los meseros</SelectItem>
                {meseros.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={total} color="rose" />
        <SummaryCard label="Pendientes" value={totalPendientes} color="amber" highlight={totalPendientes > 0} />
        <SummaryCard label="Liquidadas" value={total - totalPendientes} color="emerald" />
        <SummaryCard label="Ventas con propina" value={ventasFiltradas.length} isCount color="slate" />
      </div>

      {/* Historial de liquidaciones */}
      {verHistorial && (
        <Card className="p-4 bg-white/80">
          <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> Historial de liquidaciones
          </h3>
          {liquidaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin liquidaciones registradas</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {liquidaciones.map(l => (
                <div key={l.id} className="flex items-center gap-3 flex-wrap p-2.5 rounded-lg border bg-white">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-mono font-bold text-xs">{l.folio}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {l.fecha_liquidacion ? format(new Date(l.fecha_liquidacion), "d MMM yyyy HH:mm", { locale: es }) : ''}
                      {l.mesero_nombre ? ` · ${l.mesero_nombre}` : ''}
                      {l.usuario_liquido_nombre ? ` · por ${l.usuario_liquido_nombre}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{l.numero_ventas || 0} ventas</Badge>
                  <p className="font-heading font-black text-emerald-700 min-w-[80px] text-right">{formatCurrency(l.total_liquidado)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Desglose por mesero */}
      {desglose.length > 0 && (
        <Card className="p-4 bg-white/80">
          <h3 className="font-heading font-bold text-sm mb-3">Por mesero</h3>
          <div className="space-y-1.5">
            {desglose.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                <div>
                  <p className="font-medium text-sm">{m.mesero_nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{m.num_ventas} ventas</p>
                </div>
                <p className="font-bold text-rose-600">{formatCurrency(m.total)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lista de ventas */}
      <Card className="p-0 bg-white/80 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            Propinas ({ventasFiltradas.length})
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {format(range.from, "d MMM", { locale: es })} – {format(range.to, "d MMM yyyy", { locale: es })}
          </p>
        </div>
        {ventasFiltradas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin propinas en el periodo</p>
        ) : (
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {ventasFiltradas.slice(0, 300).map(v => (
              <div key={v.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm hover:bg-muted/30">
                <div className="flex-1 min-w-[140px]">
                  <p className="font-mono font-bold text-xs">{v.folio}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {v.fecha_cierre ? format(new Date(v.fecha_cierre), "d MMM HH:mm", { locale: es }) : ''}
                    {v.mesa_numero ? ` · Mesa ${v.mesa_numero}` : ''}
                  </p>
                </div>
                <div className="min-w-[120px] text-xs text-muted-foreground truncate">
                  {v.usuario_mesero_nombre || 'Sin mesero'}
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">{v.metodo_pago || '—'}</Badge>
                <Badge
                  className={`text-[10px] ${v.propina_liquidada ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
                  variant="outline"
                >
                  {v.propina_liquidada ? 'Liquidada' : 'Pendiente'}
                </Badge>
                <Badge variant="secondary" className="text-[10px] capitalize">{v.propina_origen || '—'}</Badge>
                <p className="font-heading font-black min-w-[80px] text-right text-rose-600">
                  {formatCurrency(v.propina_monto)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <LiquidarPropinasDialog
        open={showLiquidar}
        onClose={() => setShowLiquidar(false)}
        ventas={ventas}
        meseros={meseros}
        rangoInicial={rango === 'custom' ? 'today' : rango}
        meseroInicialId={meseroId === '__all__' ? '' : meseroId}
      />
    </div>
  );
}

function SummaryCard({ label, value, color, highlight, isCount }) {
  const palette = {
    rose: 'text-rose-600',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
    slate: 'text-slate-700',
  }[color] || 'text-foreground';
  return (
    <div className={`rounded-xl bg-white border p-3 ${highlight ? 'ring-2 ring-amber-200' : ''}`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1">
        <Filter className="w-3 h-3" />{label}
      </p>
      <p className={`font-heading font-black text-lg mt-1 ${palette}`}>
        {isCount ? (value || 0) : formatCurrency(value || 0)}
      </p>
    </div>
  );
}
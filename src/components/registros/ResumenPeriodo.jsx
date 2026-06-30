import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/utils/financialUtils';
import { Calendar, FileDown, TrendingUp, Receipt, ShoppingBag, DollarSign, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useConfig } from '@/lib/ConfigContext';
import { useResumenPeriodo } from '@/lib/useResumenPeriodo';

const PERIODOS = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'year', label: 'Este año' },
  { id: 'custom', label: 'Personalizado' },
];

/**
 * REGISTROS FINANCIEROS POR PERIODO.
 *
 * FIX central: la suma y el conteo de ventas se calculan AHORA del lado de la
 * base (useResumenPeriodo: consulta por rango de fecha_cierre, paginando), no
 * cargando un tope de ~1000 y filtrando en el navegador. Esto evita el "$0 en
 * todos los períodos" con bases grandes.
 *
 * Sucursal: si hay una activa → filtra por sucursal_id. Vista general (sucId
 * null, dueño) → suma de las 3 sucursales.
 *
 * compras/gastos siguen llegando por props (volumen bajo, sin sucursal_id).
 */
export default function ResumenPeriodo({ compras = [], gastos = [], sucId = null, onPDF }) {
  const { config, paquete_modo } = useConfig();
  const colorize = config?.colorear_importes_monetarios !== false;
  const isEsencial = paquete_modo === 'esencial';
  const [periodo, setPeriodo] = useState('today');
  const [desde, setDesde] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { from, to, totals, margen, neto, cargando, refrescando } = useResumenPeriodo({
    periodo, desde, hasta, sucId, compras, gastos,
  });

  return (
    <Card className="p-4 bg-white/70 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold">Registros financieros por periodo</h2>
          {refrescando && (
            <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          )}
        </div>
        <Button size="sm" disabled={cargando}
          onClick={() => {
            // CAMBIOS_V2 Fase 07 — incluir el detalle de gastos del periodo en el PDF.
            const f = from?.getTime?.() || 0;
            const t = to?.getTime?.() || Date.now();
            const gastosPeriodo = (Array.isArray(gastos) ? gastos : []).filter(g => {
              const ts = new Date(g?.created_date || g?.fecha || 0).getTime();
              return Number.isFinite(ts) && ts >= f && ts <= t;
            });
            onPDF?.({ from, to, periodo, totals, margen, gastos: gastosPeriodo });
          }}>
          <FileDown className="w-4 h-4 mr-1" /> Generar PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {PERIODOS.map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${periodo === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'custom' && (
        <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-muted/40">
          <div>
            <Label className="text-[10px] uppercase">Desde</Label>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase">Hasta</Label>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      )}

      {cargando && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          Calculando registros del periodo…
        </div>
      )}

      <div className={`grid grid-cols-2 ${isEsencial ? 'lg:grid-cols-3' : 'lg:grid-cols-5'} gap-3 ${cargando ? 'opacity-60' : ''}`}>
        <Stat icon={DollarSign} label="Ingresos" value={cargando ? '—' : formatCurrency(totals.ingresos)} sub={cargando ? '' : `${totals.nVentas} ventas`} color={colorize ? "text-primary" : "text-foreground"} />
        <Stat icon={Hash} label="Número de ventas" value={cargando ? '—' : (totals.nVentas || 0).toLocaleString()} color={colorize ? "text-blue-600" : "text-foreground"} />
        <Stat icon={Receipt} label="Ticket promedio" value={cargando ? '—' : formatCurrency(totals.ticketPromedio)} color={colorize ? "text-primary" : "text-foreground"} />
        {/* CAMBIOS_V2 Fase 07 — gastos del periodo visibles también en Confetti */}
        {isEsencial && (
          <Stat icon={ShoppingBag} label="Gastos" value={cargando ? '—' : formatCurrency(totals.gastos || 0)} color={colorize ? "text-red-600" : "text-foreground"} />
        )}
        {!isEsencial && (
          <>
            <Stat icon={TrendingUp} label="Utilidad bruta" value={cargando ? '—' : formatCurrency(totals.utilidad)} sub={cargando ? '' : `${(Number.isFinite(Number(margen)) ? Number(margen) : 0).toFixed(1)}% margen`} color={colorize ? "text-emerald-600" : "text-foreground"} />
            <Stat icon={ShoppingBag} label="Compras" value={cargando ? '—' : formatCurrency(totals.compras)} color={colorize ? "text-amber-600" : "text-foreground"} />
          </>
        )}
      </div>

      {!isEsencial && (
        <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground">Neto del periodo (ingresos − compras − gastos)</p>
            <p className="text-[11px] text-muted-foreground">
              {format(from, "d MMM", { locale: es })} – {format(to, "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <p className={`font-heading font-black text-2xl ${colorize ? (neto >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-foreground'}`}>
            {cargando ? '—' : (neto >= 0 ? '' : '−') + formatCurrency(Math.abs(neto))}
          </p>
        </div>
      )}
      {isEsencial && (
        <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground">Total cobrado en el periodo</p>
            <p className="text-[11px] text-muted-foreground">
              {format(from, "d MMM", { locale: es })} – {format(to, "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <p className={`font-heading font-black text-2xl ${colorize ? 'text-primary' : 'text-foreground'}`}>
            {cargando ? '—' : formatCurrency(totals.ingresos)}
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="p-3 rounded-xl border bg-white/80">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <p className={`font-heading font-bold text-lg ${color || ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
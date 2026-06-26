import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/financialUtils';
import { BarChart3 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import { format, subDays, startOfMonth, startOfYear, isAfter, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useIsDark } from '@/lib/ThemeContext';

const PERIODOS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'ano', label: 'Este año' },
];

// Convierte cualquier entrada a número finito, fallback 0.
// Protege la gráfica de NaN / Infinity / undefined / strings vacíos.
const N = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Calcula un dominio seguro para el YAxis a partir de los valores
 * visibles en la gráfica, dejando un padding del 20% arriba y abajo
 * para que las barras nunca queden pegadas al borde / cortadas.
 *
 * - Si no hay datos válidos → [0, 100]
 * - Si todos los valores son 0 → [0, 100]
 * - Si solo hay positivos → [0, max * 1.20]
 * - Si solo hay negativos → [min * 1.20, 0]
 * - Si hay ambos → [min - 20% del rango, max + 20% del rango]
 *
 * Redondea a múltiplos "bonitos" para que los ticks de Recharts queden limpios.
 */
function getSafeYAxisDomain(data, keys) {
  const safeData = Array.isArray(data) ? data : [];
  const safeKeys = Array.isArray(keys) ? keys : [];
  if (safeData.length === 0 || safeKeys.length === 0) return [0, 100];

  const values = [];
  safeData.forEach(row => {
    safeKeys.forEach(k => {
      const v = Number(row?.[k]);
      if (Number.isFinite(v)) values.push(v);
    });
  });

  if (values.length === 0) return [0, 100];

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === 0 && max === 0) return [0, 100];

  const PAD = 0.20;
  let lo, hi;

  if (min >= 0) {
    lo = 0;
    hi = max * (1 + PAD);
  } else if (max <= 0) {
    lo = min * (1 + PAD);
    hi = 0;
  } else {
    const range = max - min;
    lo = min - range * PAD;
    hi = max + range * PAD;
  }

  // Redondear a múltiplos "limpios" para que los ticks queden parejos.
  const niceRound = (v, up) => {
    if (v === 0) return 0;
    const abs = Math.abs(v);
    const mag = Math.pow(10, Math.floor(Math.log10(abs)));
    const step = mag / 2; // medio paso → ticks más finos
    return up ? Math.ceil(v / step) * step : Math.floor(v / step) * step;
  };
  lo = niceRound(lo, false);
  hi = niceRound(hi, true);

  // Garantizar que lo < hi y ambos finitos.
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 100;
  if (lo === hi) hi = lo + 100;

  return [lo, hi];
}

export default function FinancialChart({ ventas = [], gastos = [] }) {
  const [periodo, setPeriodo] = useState('7d');
  const isDark = useIsDark();
  // Paleta adaptada por tema. Mantiene los colores de marca pero usa tonos
  // más legibles en modo oscuro (sin cambiar significado de cada barra).
  const gridColor = isDark ? '#334155' : '#e5e7eb';
  const axisColor = isDark ? '#94a3b8' : '#6b7280';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipFg = isDark ? '#f1f5f9' : '#0f172a';
  const tooltipBorder = isDark ? '#334155' : '#e5e7eb';
  const refLineColor = isDark ? '#475569' : '#94a3b8';

  const { data, totales } = useMemo(() => {
    // Defensa: ventas/gastos pueden venir undefined o no-array (carga inicial)
    const ventasSafe = Array.isArray(ventas) ? ventas : [];
    const gastosSafe = Array.isArray(gastos) ? gastos : [];

    const now = new Date();
    let start;
    let groupBy = 'day';

    if (periodo === 'hoy') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (periodo === '7d') start = subDays(now, 6);
    else if (periodo === '30d') { start = subDays(now, 29); groupBy = 'day'; }
    else if (periodo === 'mes') start = startOfMonth(now);
    else if (periodo === 'ano') { start = startOfYear(now); groupBy = 'month'; }
    else start = subDays(now, 6);

    const safeDate = (s) => {
      if (!s) return null;
      try {
        const d = typeof s === 'string' ? parseISO(s) : new Date(s);
        return isNaN(d?.getTime?.()) ? null : d;
      } catch { return null; }
    };

    const inRange = (d) => d && isAfter(d, subDays(start, 1));

    const ventasFil = ventasSafe.filter(v => {
      if (!v || v.estado !== 'pagada') return false;
      const d = safeDate(v.fecha_cierre || v.fecha_apertura);
      return inRange(d);
    });
    const gastosFil = gastosSafe.filter(g => {
      if (!g) return false;
      const d = safeDate(g.fecha);
      return inRange(d);
    });

    // Build buckets
    const buckets = {};
    const keyOf = (d) => groupBy === 'month'
      ? format(d, 'yyyy-MM')
      : format(d, 'yyyy-MM-dd');
    const labelOf = (d) => groupBy === 'month'
      ? format(d, 'MMM', { locale: es })
      : format(d, 'd MMM', { locale: es });
    const emptyBucket = (k, lab) => ({ key: k, label: lab, ventas: 0, costo: 0, utilidad: 0, gastos: 0, neta: 0 });

    // Pre-fill buckets so empty days show
    const cursor = new Date(start);
    const endDate = new Date(now);
    let guard = 0;
    while (cursor <= endDate && guard < 400) { // guard contra loops infinitos por fechas inválidas
      const k = keyOf(cursor);
      if (!buckets[k]) buckets[k] = emptyBucket(k, labelOf(cursor));
      if (groupBy === 'month') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
      guard++;
    }

    ventasFil.forEach(v => {
      const d = safeDate(v.fecha_cierre || v.fecha_apertura);
      if (!d) return;
      const k = keyOf(d);
      if (!buckets[k]) buckets[k] = emptyBucket(k, labelOf(d));
      // SOLO ventas reales (sin propina). v.total ya excluye propina_monto.
      const ventaReal = N(v.total);
      const costo = N(v.costo_total_snapshot);
      const utilidadSnap = v.utilidad_bruta_snapshot;
      const utilidad = Number.isFinite(Number(utilidadSnap))
        ? N(utilidadSnap)
        : (ventaReal - costo);
      buckets[k].ventas += ventaReal;
      buckets[k].costo += costo;
      buckets[k].utilidad += utilidad;
    });

    gastosFil.forEach(g => {
      const d = safeDate(g.fecha);
      if (!d) return;
      const k = keyOf(d);
      if (!buckets[k]) buckets[k] = emptyBucket(k, labelOf(d));
      buckets[k].gastos += N(g.monto);
    });

    Object.values(buckets).forEach(b => {
      // Normalizar todos los campos a número finito y calcular neta.
      b.ventas = N(b.ventas);
      b.costo = N(b.costo);
      b.utilidad = N(b.utilidad);
      b.gastos = N(b.gastos);
      b.neta = b.utilidad - b.gastos;
    });

    const arr = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));

    const tot = arr.reduce((acc, b) => ({
      ventas: acc.ventas + N(b.ventas),
      costo: acc.costo + N(b.costo),
      utilidad: acc.utilidad + N(b.utilidad),
      gastos: acc.gastos + N(b.gastos),
      neta: acc.neta + N(b.neta),
    }), { ventas: 0, costo: 0, utilidad: 0, gastos: 0, neta: 0 });
    tot.margen = tot.ventas > 0 ? (tot.utilidad / tot.ventas * 100) : 0;

    return { data: arr, totales: tot };
  }, [ventas, gastos, periodo]);

  // Dominio seguro del YAxis: considera TODAS las series visibles.
  const yDomain = useMemo(
    () => getSafeYAxisDomain(data, ['ventas', 'costo', 'gastos', 'neta']),
    [data]
  );
  const hasNegatives = Array.isArray(yDomain) && yDomain[0] < 0;

  return (
    <Card className="overflow-hidden border-2 bg-card text-card-foreground"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 20px rgba(0,0,0,0.06)' }}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Análisis financiero
        </CardTitle>
        <div className="flex gap-1 flex-wrap">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${periodo === p.key ? 'bg-primary text-primary-foreground shadow' : 'bg-card border text-muted-foreground'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <Mini label="Ventas" value={totales.ventas} color="#16a34a" />
          <Mini label="Costo" value={totales.costo} color="#f59e0b" />
          <Mini label="Utilidad bruta" value={totales.utilidad} color="#0ea5e9" />
          <Mini label="Gastos" value={totales.gastos} color="#ef4444" />
          <Mini label="Utilidad neta" value={totales.neta} color="#7c3aed" bold />
          <Mini label="Margen" value={`${(Number.isFinite(totales.margen) ? totales.margen : 0).toFixed(1)}%`} color="#0f172a" raw />
        </div>
        <div className="w-full h-72 sm:h-80 lg:h-72 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 12, left: 4, bottom: hasNegatives ? 20 : 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: axisColor }} stroke={gridColor} />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                stroke={gridColor}
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return '$0';
                  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
                  return `$${n.toFixed(0)}`;
                }}
                domain={yDomain}
                allowDataOverflow={false}
                width={48}
              />
              <Tooltip
                formatter={(v) => formatCurrency(v)}
                contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, color: tooltipFg, border: `1px solid ${tooltipBorder}` }}
                labelStyle={{ color: tooltipFg }}
                itemStyle={{ color: tooltipFg }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: axisColor }} />
              {hasNegatives && <ReferenceLine y={0} stroke={refLineColor} strokeWidth={1} />}
              <Bar dataKey="ventas" name="Ventas" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costo" name="Costo" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="neta" name="Utilidad neta" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, color, bold, raw }) {
  return (
    <div className="p-2 rounded-lg border bg-card text-card-foreground" style={{ borderColor: color + '40' }}>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm ${bold ? 'font-black' : 'font-bold'}`} style={{ color }}>
        {raw ? value : formatCurrency(value)}
      </p>
    </div>
  );
}
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Wallet, Award, ChevronRight, History } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import {
  filtrarVentasEnRango, sumarPropinas, agruparPropinasPorMesero,
} from '@/utils/tipsUtils';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import LiquidarPropinasDialog from '@/components/propinas/LiquidarPropinasDialog';
import { Link } from 'react-router-dom';
import { useIsDark } from '@/lib/ThemeContext';
import { useConfig } from '@/lib/ConfigContext';

/**
 * Sección de propinas para el Dashboard.
 * Dark-aware: en modo oscuro adopta paleta rosa profunda en lugar de bg claro.
 * Respeta colorear_importes_monetarios para importes en MetricMini.
 *
 * SIN cambios de lógica, solo estética.
 */
export default function PropinasDashboardSection() {
  const [showLiquidar, setShowLiquidar] = useState(false);
  const isDark = useIsDark();
  const { config } = useConfig();
  const colorize = config?.colorear_importes_monetarios !== false;

  const { data: ventas = [] } = useQuery({
    queryKey: ['propinas_dashboard_ventas'],
    queryFn: () => base44.entities.Venta.filter({ estado: 'pagada' }, '-fecha_cierre', 2000),
    initialData: [],
  });

  const { data: meseros = [] } = useQuery({
    queryKey: ['usuarios_pos_meseros'],
    queryFn: () => base44.entities.UsuarioPOS.filter({ activo: true }),
    initialData: [],
  });

  const stats = useMemo(() => {
    const safe = Array.isArray(ventas) ? ventas : [];
    const conPropina = safe.filter(v => (Number(v?.propina_monto) || 0) > 0);

    const hoyVentas = filtrarVentasEnRango(conPropina, startOfDay(new Date()), endOfDay(new Date()));
    const semVentas = filtrarVentasEnRango(conPropina, startOfDay(subDays(new Date(), 6)), endOfDay(new Date()));

    const propinasHoy = sumarPropinas(hoyVentas);
    const propinasSemana = sumarPropinas(semVentas);

    const pendientes = conPropina.filter(v => v?.propina_liquidada !== true);
    const liquidadas = conPropina.filter(v => v?.propina_liquidada === true);
    const totalPendientes = sumarPropinas(pendientes);
    const totalLiquidadas = sumarPropinas(liquidadas);

    const grupos = agruparPropinasPorMesero(semVentas);
    const topMesero = grupos[0] || null;

    return {
      hasTips: conPropina.length > 0,
      propinasHoy,
      propinasSemana,
      totalPendientes,
      totalLiquidadas,
      topMesero,
    };
  }, [ventas]);

  if (!stats.hasTips) return null;

  // Paleta principal de la card. En light: rosa pálido elegante.
  // En dark: rosa profundo legible.
  const cardBg = isDark
    ? 'linear-gradient(135deg, #1f0d12 0%, #2c1019 100%)'
    : 'linear-gradient(135deg, #fff5f7 0%, #fef2f5 100%)';
  const cardShadow = isDark
    ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 20px rgba(244,63,94,0.18)'
    : '0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 20px rgba(244,63,94,0.08)';
  const cardBorder = isDark ? 'border-rose-900/80' : 'border-rose-200/60';

  return (
    <>
      <Card className={`premium-sheen border-2 ${cardBorder}`}
        style={{ background: cardBg, boxShadow: cardShadow }}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            Propinas
          </CardTitle>
          <div className="flex gap-1.5 flex-wrap">
            <Link to="/registros?tab=propinas">
              <Button size="sm" variant="ghost" className="text-xs h-8">
                <History className="w-3.5 h-3.5 mr-1" /> Ver más
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setShowLiquidar(true)}
              className="text-xs h-8 text-white"
              style={{ background: 'linear-gradient(135deg, hsl(152,60%,40%) 0%, hsl(152,60%,32%) 100%)' }}
              disabled={stats.totalPendientes <= 0}
            >
              <Wallet className="w-3.5 h-3.5 mr-1" /> Liquidar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricMini label="Hoy" value={stats.propinasHoy} color="rose" isDark={isDark} colorize={colorize} />
            <MetricMini label="Esta semana" value={stats.propinasSemana} color="rose" isDark={isDark} colorize={colorize} />
            <MetricMini label="Pendientes" value={stats.totalPendientes} color="amber" highlight isDark={isDark} colorize={colorize} />
            <MetricMini label="Liquidadas" value={stats.totalLiquidadas} color="emerald" isDark={isDark} colorize={colorize} />
            <div className={`col-span-2 lg:col-span-1 rounded-xl border p-3 ${
              isDark ? 'bg-rose-950/50 border-rose-900' : 'bg-white/70 border-rose-200/60'
            }`}>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1">
                <Award className="w-3 h-3" /> Mesero top (semana)
              </p>
              {stats.topMesero ? (
                <>
                  <p className="font-heading font-bold text-sm truncate mt-1">{stats.topMesero.mesero_nombre}</p>
                  <p className={`font-bold text-sm ${
                    colorize ? (isDark ? 'text-rose-300' : 'text-rose-600') : 'text-foreground'
                  }`}>
                    {formatCurrency(stats.topMesero.total)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">—</p>
              )}
            </div>
          </div>

          {stats.totalPendientes > 0 && (
            <div className={`mt-3 px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              isDark
                ? 'bg-amber-950/60 border-amber-900 text-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span>Hay {formatCurrency(stats.totalPendientes)} de propinas pendientes por liquidar.</span>
              <Link to="/registros?tab=propinas" className="font-semibold flex items-center gap-1 shrink-0">
                Ver detalle <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <LiquidarPropinasDialog
        open={showLiquidar}
        onClose={() => setShowLiquidar(false)}
        ventas={ventas}
        meseros={meseros}
        rangoInicial="week"
      />
    </>
  );
}

function MetricMini({ label, value, color, highlight, isDark, colorize = true }) {
  const palette = {
    rose:    isDark
      ? { text: 'text-rose-300',    bg: 'bg-rose-950/50', border: 'border-rose-900' }
      : { text: 'text-rose-600',    bg: 'bg-white/70',    border: 'border-rose-200/60' },
    amber:   isDark
      ? { text: 'text-amber-300',   bg: 'bg-amber-950/50', border: 'border-amber-900' }
      : { text: 'text-amber-700',   bg: 'bg-white/70',     border: 'border-amber-200/60' },
    emerald: isDark
      ? { text: 'text-emerald-300', bg: 'bg-emerald-950/50', border: 'border-emerald-900' }
      : { text: 'text-emerald-700', bg: 'bg-white/70',       border: 'border-emerald-200/60' },
  }[color] || { text: 'text-foreground', bg: 'bg-card', border: 'border-border' };
  const ring = highlight
    ? (isDark ? 'ring-2 ring-amber-800/70' : 'ring-2 ring-amber-200')
    : '';
  // Si colorize=false, el monto va neutro (foreground); el fondo y borde de
  // identidad del estado SE MANTIENEN para distinguir tarjetas.
  const valueClass = colorize ? palette.text : 'text-foreground';
  return (
    <div className={`rounded-xl ${palette.bg} border ${palette.border} p-3 ${ring}`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</p>
      <p className={`font-heading font-black text-lg mt-1 ${valueClass}`}>{formatCurrency(value || 0)}</p>
    </div>
  );
}
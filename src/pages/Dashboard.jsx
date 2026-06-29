import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '@/lib/ConfigContext';
import { useTerminal } from '@/lib/TerminalContext';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { useIsDark } from '@/lib/ThemeContext';
import { sucursalIdDe } from '@/lib/sucursalQuery';
import { formatCurrency } from '@/utils/financialUtils';
import SucursalBadge from '@/components/common/SucursalBadge';
import PageHeader from '@/components/common/PageHeader';
import ColoredStatCard, { PAYMENT_COLORS } from '@/components/dashboard/ColoredStatCard';
import SucursalComparativaCard from '@/components/dashboard/SucursalComparativaCard';
import SucursalDonutCard from '@/components/dashboard/SucursalDonutCard';
import CortesRecientesDashboard from '@/components/dashboard/CortesRecientesDashboard';
import LoadingState from '@/components/common/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  DollarSign, Receipt, CreditCard, Banknote, Smartphone,
  AlertTriangle, ArrowRight, FileText, ShoppingCart, RefreshCw,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

// ── Sucursales fijas de Confetti (para la comparativa en vista general) ──
// Cada sucursal tiene un color distintivo para las cards y la dona.
const SUCURSALES = [
  { id: '057f9ba7-b340-4060-ace3-7f1646da36fa', nombre: 'Xochimilco / Principal', color: '#E8579A' },
  { id: '161185fa-adda-42cd-9568-b1d66dad5737', nombre: 'Topilejo', color: '#F59E0B' },
  { id: '07c59ab6-f5ef-4a3f-8d02-2d820f6ef1f8', nombre: 'San Gregorio', color: '#8B5CF6' },
];

// ¿El created_date cae en "hoy" zona México?
function esDeHoyMexico(iso) {
  if (!iso) return false;
  try {
    const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) === hoyMx;
  } catch {
    return false;
  }
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { config } = useConfig();
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalIdDe(sucursalEfectiva);
  const { hayCaja, status: cajaStatus, cajaAbierta } = useCajaAbierta();
  const cajaVerificando = cajaStatus === 'unknown';
  // ID del corte/caja abierto actual de la sucursal. El dashboard se basa en
  // ESTE id para reiniciar a 0 tras un corte: al cerrar caja y abrir una nueva,
  // el id cambia y solo cuentan las ventas de la nueva caja.
  const corteActualId = cajaAbierta?.id || null;

  // ── Ventas pagadas. Una sola fuente de verdad. ──
  // Filtra por sucursal si hay sucursal activa; trae todas si es vista general.
  const { data: ventasRaw, isPending: ventasLoading } = useQuery({
    queryKey: ['dashboard_ventas', sucId],
    queryFn: () => {
      // NO usamos $gte sobre created_date — Base44 lo maneja inconsistente y
      // devolvía vacío. Traemos las últimas 200 pagadas y filtramos en memoria.
      const base = sucId
        ? { estado: 'pagada', sucursal_id: sucId }
        : { estado: 'pagada' };
      return base44.entities.Venta.filter(base, '-created_date', 200);
    },
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  // ── Cortes (cajas) abiertos por sucursal — solo en VISTA GENERAL ──
  // En vista general no hay una sola caja: cada sucursal tiene la suya. Traemos
  // los cortes abiertos de todas las sucursales para reflejar EN VIVO solo lo
  // cobrado en la caja activa de cada una. Así, tras un corte en cualquier
  // sucursal, su total arranca en 0 también en la vista general.
  const { data: cortesAbiertosRaw } = useQuery({
    queryKey: ['dashboard_cortes_abiertos'],
    queryFn: () => base44.entities.CorteCaja.filter({ estado: 'abierto' }, '-created_date', 50),
    enabled: !sucId,
    placeholderData: (prev) => prev,
    staleTime: 5000,
    refetchInterval: 8000,
  });

  // Set de IDs de cortes abiertos (cierre_diario) para filtrar ventas en vivo.
  const cortesActivosIds = useMemo(() => {
    const arr = Array.isArray(cortesAbiertosRaw) ? cortesAbiertosRaw : [];
    return new Set(
      arr
        .filter((c) => c && (c.tipo_corte === 'cierre_diario' || !c.tipo_corte))
        .map((c) => c.id)
    );
  }, [cortesAbiertosRaw]);

  // Ventas del periodo que muestra el dashboard:
  //  - Sucursal específica: SOLO las ventas de la caja abierta actual
  //    (corte_caja_id === corteActualId). Así el dashboard arranca en 0 tras
  //    un corte y solo suma lo cobrado en la caja activa. Si no hay caja
  //    abierta, no hay periodo activo → arreglo vacío (todo en 0).
  //  - Vista general (sin sucursal): solo ventas cuyo corte_caja_id esté entre
  //    las cajas abiertas de las sucursales. Refleja en vivo lo mismo que ve
  //    cada sucursal individualmente.
  const ventasHoy = useMemo(() => {
    const arr = Array.isArray(ventasRaw) ? ventasRaw : [];
    if (sucId) {
      if (!corteActualId) return [];
      return arr.filter((v) => v && v.estado === 'pagada' && v.corte_caja_id === corteActualId);
    }
    return arr.filter((v) => v && v.estado === 'pagada' && cortesActivosIds.has(v.corte_caja_id));
  }, [ventasRaw, sucId, corteActualId, cortesActivosIds]);

  // ── Totales globales (sucursal activa o suma de todas) ──
  const stats = useMemo(() => {
    let total = 0, efectivo = 0, tarjeta = 0, transferencia = 0;
    for (const v of ventasHoy) {
      total += Number(v?.total) || 0;
      efectivo += Number(v?.monto_efectivo) || 0;
      tarjeta += Number(v?.monto_tarjeta) || 0;
      transferencia += Number(v?.monto_transferencia) || 0;
    }
    return { total, num: ventasHoy.length, efectivo, tarjeta, transferencia };
  }, [ventasHoy]);

  // ── Comparativo por sucursal (solo vista general) ──
  const comparativa = useMemo(() => {
    if (sucId) return [];
    const porSuc = SUCURSALES.map((s) => {
      const delLocal = ventasHoy.filter((v) => v?.sucursal_id === s.id);
      const totalLocal = delLocal.reduce((acc, v) => acc + (Number(v?.total) || 0), 0);
      return { ...s, total: totalLocal, tickets: delLocal.length };
    });
    const maxTotal = porSuc.reduce((m, s) => Math.max(m, s.total), 0);
    return porSuc.map((s) => ({ ...s, maxTotal }));
  }, [ventasHoy, sucId]);

  // ── Datos de la dona de métodos de pago ──
  const paymentData = [
    { name: 'Efectivo', value: stats.efectivo, fill: PAYMENT_COLORS.efectivo },
    { name: 'Tarjeta', value: stats.tarjeta, fill: PAYMENT_COLORS.tarjeta },
    { name: 'Transferencia', value: stats.transferencia, fill: PAYMENT_COLORS.transferencia },
  ].filter((d) => d.value > 0);

  const cargando = cajaVerificando || (ventasLoading && !ventasRaw);

  return (
    <div className="space-y-5">
      {/* Sección 1 — Encabezado */}
      <PageHeader
        title="Buen día"
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <span>
              {`${config?.nombre_negocio || 'Confetti'} · ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
            </span>
            {sucId ? (
              <SucursalBadge sucursalEfectiva={sucursalEfectiva} />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-muted/60 text-muted-foreground border-border">
                🌐 Vista general — 3 sucursales
              </span>
            )}
          </span>
        }
        actions={
          // Botón Actualizar — visible en AMBAS vistas (sucursal y general).
          // "Ir a Caja" solo en sucursal específica (no aplica a vista general).
          <div className="flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw className="w-3 h-3" />
              Actualizar
            </button>
            {sucId ? (
              <Link to="/caja">
                <Button size="sm"><ShoppingCart className="w-4 h-4 mr-1" /> Ir a Caja</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {/* Aviso "caja cerrada" — SOLO en sucursal específica, nunca en vista general */}
      {cajaVerificando ? (
        <div className="px-4 py-3 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-muted-foreground/40 border-t-primary rounded-full animate-spin" />
          <p className="flex-1">Verificando caja abierta…</p>
        </div>
      ) : (!hayCaja && sucId) ? (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="flex-1">
            <span className="font-semibold">No hay caja abierta.</span> Abre caja para comenzar operación.
          </p>
          <Link to="/caja"><Button size="sm" variant="outline">Ir a Caja</Button></Link>
        </div>
      ) : null}

      {cargando ? (
        <LoadingState label="Sincronizando datos del dashboard…" compact />
      ) : (
        <>
          {/* Sección 2 — Stats principales */}
          <div className="grid grid-cols-2 gap-3">
            <ColoredStatCard
              title="Ventas hoy"
              value={formatCurrency(stats.total)}
              icon={DollarSign}
              subtitle={`${stats.num} ${stats.num === 1 ? 'ticket' : 'tickets'}`}
              color="primary"
              accent
            />
            <ColoredStatCard
              title="Ventas del día"
              value={String(stats.num)}
              icon={Receipt}
              subtitle="tickets cobrados"
              color="slate"
            />
          </div>

          {/* Sección 3 (vista general) — Comparativo por sucursal */}
          {!sucId && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                Ventas de hoy por sucursal
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {comparativa.map((s) => (
                  <SucursalComparativaCard
                    key={s.id}
                    nombre={s.nombre}
                    total={s.total}
                    tickets={s.tickets}
                    color={s.color}
                  />
                ))}
              </div>
              {/* PARTE D — Dona comparativa de ventas por sucursal */}
              <div className="mt-3">
                <SucursalDonutCard
                  data={comparativa.map((s) => ({ nombre: s.nombre, total: s.total, color: s.color }))}
                />
              </div>
            </div>
          )}

          {/* Sección — Métodos de pago de hoy (3 cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PaymentCard label="Efectivo" value={stats.efectivo} color={PAYMENT_COLORS.efectivo} icon={Banknote} />
            <PaymentCard label="Tarjeta" value={stats.tarjeta} color={PAYMENT_COLORS.tarjeta} icon={CreditCard} />
            <PaymentCard label="Transferencia" value={stats.transferencia} color={PAYMENT_COLORS.transferencia} icon={Smartphone} />
          </div>

          {/* Sección — Gráfica de dona */}
          <PaymentDonutCard paymentData={paymentData} />
        </>
      )}

      {/* Sección — Cortes de caja recientes */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Cortes de caja recientes
          </CardTitle>
          <Link to="/registros?tab=cortes">
            <Button variant="ghost" size="sm" className="text-xs">
              Ver historial <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          <CortesRecientesDashboard sucId={sucId} mostrarSucursal={!sucId} />
          <p className="text-[11px] text-muted-foreground text-center">
            Mostrando los últimos 6 cortes. Consulta el historial completo en Registros.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Card de método de pago — estética Confetti, dark-aware. */
function PaymentCard({ label, value, color, icon: Icon }) {
  const { config } = useConfig();
  const isDark = useIsDark();
  const colorize = config?.colorear_importes_monetarios !== false;
  const valueColor = colorize ? color : (isDark ? '#f1f5f9' : '#0f172a');
  const bg = isDark
    ? `linear-gradient(135deg, #14202e 0%, ${color}33 100%)`
    : `linear-gradient(135deg, #ffffff 0%, ${color}12 100%)`;
  const sheen = isDark
    ? `0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 18px ${color}40`
    : `0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 18px ${color}20`;
  return (
    <div className="premium-sheen rounded-2xl p-4 border-2 relative overflow-hidden"
      style={{ background: bg, borderColor: isDark ? color + '80' : color + '40', boxShadow: sheen }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color }}>{label}</p>
          <p className="text-xl font-heading font-black mt-1 truncate" style={{ color: valueColor }}>
            {formatCurrency(value)}
          </p>
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: isDark ? color + '40' : color + '20',
              boxShadow: isDark
                ? `0 2px 4px ${color}40, 0 1px 0 rgba(255,255,255,0.08) inset`
                : `0 2px 4px ${color}30, 0 1px 0 rgba(255,255,255,0.5) inset`,
            }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Card con la dona de métodos de pago de hoy. */
function PaymentDonutCard({ paymentData }) {
  const isDark = useIsDark();
  const cardBg = isDark
    ? 'linear-gradient(135deg, hsl(222 40% 11%) 0%, hsl(222 40% 9%) 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #fafaf7 100%)';
  const cardShadow = isDark
    ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 20px rgba(0,0,0,0.35)'
    : '0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 20px rgba(0,0,0,0.06)';
  const safeData = Array.isArray(paymentData) ? paymentData : [];
  return (
    <Card className="premium-sheen border-2 text-card-foreground" style={{ background: cardBg, boxShadow: cardShadow }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading">Métodos de pago — hoy</CardTitle>
      </CardHeader>
      <CardContent>
        {safeData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin ventas hoy</p>
        ) : (
          <div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={safeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    paddingAngle={4} dataKey="value" nameKey="name"
                    stroke={isDark ? '#0f172a' : '#ffffff'} strokeWidth={2}>
                    {safeData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => formatCurrency(val)}
                    contentStyle={isDark
                      ? { backgroundColor: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }
                      : { fontSize: 12 }}
                    labelStyle={isDark ? { color: '#f1f5f9' } : undefined}
                    itemStyle={isDark ? { color: '#f1f5f9' } : undefined}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center flex-wrap gap-3 -mt-2">
              {safeData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                  <span className="font-medium">{d.name}:</span> {formatCurrency(d.value)}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { Banknote, CreditCard, Smartphone, TrendingUp, Receipt, DollarSign, Users, Coins, Wallet, PiggyBank, BarChart3 } from 'lucide-react';
import StatCard from '@/components/common/StatCard';

/**
 * Resumen del día — vista unificada para la pestaña "Resumen" de Caja.
 *
 * Separación contable estricta:
 *  - Ventas reales (`resumen.totalGeneral`): base de utilidad/margen.
 *  - Propinas (`resumen.totalPropinas`): NO suman a ventas ni utilidad.
 *  - Total cobrado = Ventas + Propinas (sólo informativo para cuadre).
 *
 * Defensivo: todos los accesos protegidos contra null/undefined.
 */
export default function ResumenDelDia({
  resumen = {},
  margenProm = 0,
  verCostos = false,
  ventasHoy = [],
  cajaAbierta = null,
  ventasPendientes = [],
  entregas = [],
  colorearImportes = true,
}) {
  const safeResumen = resumen || {};
  const totalGeneral = Number(safeResumen.totalGeneral) || 0;
  const totalPropinas = Number(safeResumen.totalPropinas) || 0;
  const totalCobrado = totalGeneral + totalPropinas;
  const utilidad = Number(safeResumen.utilidadBruta) || 0;
  const costoTotal = Number(safeResumen.costoTotal) || 0;
  const totalGastos = Number(safeResumen.totalGastos) || 0;
  const utilidadNeta = utilidad - totalGastos;
  const numVentas = Number(safeResumen.numVentas) || 0;
  const ticketProm = Number(safeResumen.ticketPromedio) || 0;

  // metodosPagoConPropinas viene como OBJETO desde desgloseMetodosPagoExacto:
  // { efectivo: {ventas, propinas, total}, tarjeta: {...}, transferencia: {...} }
  // Lo normalizamos a ARRAY para la tabla, conservando compatibilidad si en
  // el futuro alguien ya lo pasara como array.
  const metodosConPropinas = (() => {
    const raw = safeResumen.metodosPagoConPropinas;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const rows = [
        { key: 'efectivo',      label: 'Efectivo',      data: raw.efectivo },
        { key: 'tarjeta',       label: 'Tarjeta',       data: raw.tarjeta },
        { key: 'transferencia', label: 'Transferencia', data: raw.transferencia },
      ];
      return rows
        .map(r => ({
          key: r.key,
          label: r.label,
          ventas: Number(r.data?.ventas) || 0,
          propinas: Number(r.data?.propinas) || 0,
          total: Number(r.data?.total) || 0,
        }))
        // Mostrar solo filas con movimiento real
        .filter(r => r.ventas > 0 || r.propinas > 0 || r.total > 0);
    }
    return [];
  })();

  const totalesMetodos = metodosConPropinas.reduce(
    (acc, r) => ({
      ventas: acc.ventas + (Number(r?.ventas) || 0),
      propinas: acc.propinas + (Number(r?.propinas) || 0),
      total: acc.total + (Number(r?.total) || 0),
    }),
    { ventas: 0, propinas: 0, total: 0 }
  );

  const propinasPorMesero = Array.isArray(safeResumen.propinasPorMesero)
    ? safeResumen.propinasPorMesero
    : [];

  if (!cajaAbierta) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No hay caja abierta</p>
        <p className="text-xs mt-1">Abre caja para comenzar a ver el resumen del día.</p>
      </div>
    );
  }

  const colorMoney = colorearImportes ? 'text-emerald-600 dark:text-emerald-300' : 'text-foreground';
  const colorTip = colorearImportes ? 'text-rose-600 dark:text-rose-300' : 'text-foreground';

  return (
    <div className="space-y-4">
      {/* ===== KPIs principales: todas las cards con TÍTULO claro arriba y MONTO grande abajo ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          title="Ventas reales"
          value={formatCurrency(totalGeneral)}
          subtitle={`${numVentas} ${numVentas === 1 ? 'venta' : 'ventas'}`}
        />
        <StatCard
          icon={Coins}
          title="Propinas"
          value={formatCurrency(totalPropinas)}
          subtitle="No suman a ventas"
        />
        <StatCard
          icon={Receipt}
          title="Total cobrado"
          value={formatCurrency(totalCobrado)}
          subtitle="Ventas + propinas"
        />
        {verCostos && (
          <>
            <StatCard
              icon={TrendingUp}
              title="Utilidad bruta"
              value={formatCurrency(utilidad)}
              subtitle={`Margen ${formatPercent(margenProm)}`}
            />
            <StatCard
              icon={BarChart3}
              title="Costo de ventas"
              value={formatCurrency(costoTotal)}
              subtitle="Insumos consumidos"
            />
            <StatCard
              icon={Wallet}
              title="Gastos"
              value={formatCurrency(totalGastos)}
              subtitle="Operativos del periodo"
            />
            <StatCard
              icon={PiggyBank}
              title="Utilidad neta"
              value={formatCurrency(utilidadNeta)}
              subtitle="Bruta − Gastos"
            />
          </>
        )}
        <StatCard
          icon={Receipt}
          title="Tickets"
          value={String(numVentas)}
          subtitle={`Promedio ${formatCurrency(ticketProm)}`}
        />
      </div>

      {/* ===== Métodos de pago (ventas + propinas) — scroll horizontal interno solo en la tabla ===== */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="font-heading font-semibold text-sm">Métodos de pago</p>
          <p className="text-[10px] text-muted-foreground">Ventas y propinas exactas por método (no proporcional).</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[480px] divide-y">
            <div className="grid grid-cols-4 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Método</span>
              <span className="text-right">Ventas</span>
              <span className="text-right">Propinas</span>
              <span className="text-right">Total cobrado</span>
            </div>
            {metodosConPropinas.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Aún no hay cobros registrados en esta caja.
              </div>
            ) : (
              <>
                {metodosConPropinas.map((m, i) => {
                  const Icon = m?.key === 'efectivo' ? Banknote
                    : m?.key === 'tarjeta' ? CreditCard
                    : Smartphone;
                  return (
                    <div key={m?.key || i} className="grid grid-cols-4 px-4 py-2.5 text-sm items-center">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {m?.label || m?.key || '—'}
                      </span>
                      <span className="text-right font-mono">{formatCurrency(Number(m?.ventas) || 0)}</span>
                      <span className={`text-right font-mono ${colorTip}`}>{formatCurrency(Number(m?.propinas) || 0)}</span>
                      <span className="text-right font-mono font-semibold">{formatCurrency(Number(m?.total) || 0)}</span>
                    </div>
                  );
                })}
                {/* Fila de totales */}
                <div className="grid grid-cols-4 px-4 py-2.5 text-sm items-center bg-muted/20 font-semibold">
                  <span>Total</span>
                  <span className="text-right font-mono">{formatCurrency(totalesMetodos.ventas)}</span>
                  <span className={`text-right font-mono ${colorTip}`}>{formatCurrency(totalesMetodos.propinas)}</span>
                  <span className="text-right font-mono">{formatCurrency(totalesMetodos.total)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Fase 4 — Pagos de pedidos de pastel (abonos) ===== */}
      {(Number(safeResumen.abonosTotal) || 0) > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="font-heading font-semibold text-sm">Pagos de pedidos de pastel</p>
            <p className="text-[10px] text-muted-foreground">Anticipos y liquidaciones registrados en esta caja.</p>
          </div>
          <div className="px-4 py-3 mt-0 space-y-1">
            {(Number(safeResumen.abonosEfectivo) || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span>Efectivo (pedidos)</span>
                <span className="font-mono">{formatCurrency(Number(safeResumen.abonosEfectivo) || 0)}</span>
              </div>
            )}
            {(Number(safeResumen.abonosTarjeta) || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span>Tarjeta (pedidos)</span>
                <span className="font-mono">{formatCurrency(Number(safeResumen.abonosTarjeta) || 0)}</span>
              </div>
            )}
            {(Number(safeResumen.abonosTransferencia) || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span>Transferencia (pedidos)</span>
                <span className="font-mono">{formatCurrency(Number(safeResumen.abonosTransferencia) || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t">
              <span>Total pagos pedidos</span>
              <span className="font-mono">{formatCurrency(Number(safeResumen.abonosTotal) || 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== Fase 3 #6 — Entregas de pastel del día (informativo) ===== */}
      {Array.isArray(entregas) && entregas.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="font-heading font-semibold text-sm">Entregas de pastel del día</p>
            <p className="text-[10px] text-muted-foreground">Informativo — no suma a los totales ni al efectivo esperado.</p>
          </div>
          <div className="divide-y">
            {entregas.map((e, i) => (
              <div key={(e?.folio || '') + i} className="px-4 py-2.5 flex items-center justify-between text-sm gap-2">
                <span className="truncate">
                  Entregado <strong>{e?.nombre || 'Pastel'}</strong> — {e?.hora || '—'} — <span className="font-mono">{e?.folio || '—'}</span>
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-300 font-medium shrink-0">entregado</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Propinas por mesero (solo si hay) ===== */}
      {propinasPorMesero.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="font-heading font-semibold text-sm">Propinas por mesero</p>
          </div>
          <div className="divide-y">
            {propinasPorMesero.map((m, i) => (
              <div key={(m?.mesero_id || 'sin') + i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium truncate">{m?.mesero_nombre || 'Sin mesero'}</span>
                <span className={`font-mono font-semibold ${colorTip}`}>{formatCurrency(Number(m?.total) || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Métricas operativas extra ===== */}
      {Array.isArray(ventasPendientes) && ventasPendientes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard
            icon={Receipt}
            title="Pendientes por cobrar"
            value={String(ventasPendientes.length)}
            subtitle="Cuentas abiertas en mesa"
          />
        </div>
      )}
    </div>
  );
}
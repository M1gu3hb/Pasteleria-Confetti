import React from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { Banknote, CreditCard, Smartphone, Receipt } from 'lucide-react';
import StatCard from '@/components/common/StatCard';

/**
 * Resumen del día — vista unificada para la pestaña "Resumen" de Caja.
 *
 * F2 (limpieza Confetti): muestra SOLO efectivo, métodos de pago y número de
 * tickets, más las cards de pagos de pedidos (abonos) y entregas. Sin utilidad,
 * margen, costos, gastos ni propinas (el POS no maneja costos).
 *
 * Defensivo: todos los accesos protegidos contra null/undefined.
 */
export default function ResumenDelDia({
  resumen = {},
  cajaAbierta = null,
  entregas = [],
}) {
  const safeResumen = resumen || {};
  const numVentas = Number(safeResumen.numVentas) || 0;

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
        }))
        // Mostrar solo filas con movimiento real
        .filter(r => r.ventas > 0);
    }
    return [];
  })();

  const totalesMetodos = metodosConPropinas.reduce(
    (acc, r) => ({ ventas: acc.ventas + (Number(r?.ventas) || 0) }),
    { ventas: 0 }
  );

  if (!cajaAbierta) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No hay caja abierta</p>
        <p className="text-xs mt-1">Abre caja para comenzar a ver el resumen del día.</p>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {/* ===== KPIs (F2 limpieza): SOLO efectivo y tickets. Fuera utilidad,
           margen, costos, gastos y propinas — Confetti no los usa. ===== */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Banknote}
          title="Efectivo"
          value={formatCurrency(Number(safeResumen.totalEfectivo) || 0)}
          subtitle="Ventas en efectivo del día"
        />
        <StatCard
          icon={Receipt}
          title="Tickets"
          value={String(numVentas)}
          subtitle={`${numVentas} ${numVentas === 1 ? 'venta' : 'ventas'} en esta caja`}
        />
      </div>

      {/* ===== Métodos de pago (F2: solo Método / Monto, sin propinas) ===== */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="font-heading font-semibold text-sm">Métodos de pago</p>
          <p className="text-[10px] text-muted-foreground">Ventas por método en esta caja.</p>
        </div>
        <div className="divide-y">
          <div className="grid grid-cols-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Método</span>
            <span className="text-right">Monto</span>
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
                  <div key={m?.key || i} className="grid grid-cols-2 px-4 py-2.5 text-sm items-center">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      {m?.label || m?.key || '—'}
                    </span>
                    <span className="text-right font-mono">{formatCurrency(Number(m?.ventas) || 0)}</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-2 px-4 py-2.5 text-sm items-center bg-muted/20 font-semibold">
                <span>Total</span>
                <span className="text-right font-mono">{formatCurrency(totalesMetodos.ventas)}</span>
              </div>
            </>
          )}
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

    </div>
  );
}
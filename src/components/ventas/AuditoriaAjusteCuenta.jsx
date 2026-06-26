import React, { useMemo } from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { Pencil, Plus, Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * AuditoriaAjusteCuenta
 * =====================
 * Componente focalizado de SOLO LECTURA que muestra la auditoría de ajustes
 * aplicados a una venta. Lee de:
 *  - venta.cuenta_ajustada (boolean)
 *  - venta.total_antes_ajuste (number) — original ANTES del primer ajuste
 *  - venta.total_despues_ajuste (number) — total final
 *  - venta.ajuste_monto (number) — diferencia del último ajuste
 *  - venta.ajuste_usuario_nombre (string)
 *  - venta.ajuste_motivo (string)
 *  - venta.ajustes_cuenta (JSON string con histórico)
 *
 * NO toca cálculos. NO modifica datos. Solo muestra.
 * Se usa en el dialog de detalle de Ventas/Registros.
 */
export default function AuditoriaAjusteCuenta({ venta }) {
  // Parseo defensivo del histórico — nunca debe romper la UI.
  const historico = useMemo(() => {
    if (!venta?.ajustes_cuenta) return [];
    try {
      if (Array.isArray(venta.ajustes_cuenta)) return venta.ajustes_cuenta;
      if (typeof venta.ajustes_cuenta === 'string') {
        const parsed = JSON.parse(venta.ajustes_cuenta);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (err) {
      console.warn('[AuditoriaAjusteCuenta] parse fallo:', err);
      return [];
    }
  }, [venta?.ajustes_cuenta]);

  if (!venta?.cuenta_ajustada && historico.length === 0) return null;

  const totalAntes = Number(venta?.total_antes_ajuste);
  const totalDespues = Number(venta?.total_despues_ajuste);
  const diferencia = Number(venta?.ajuste_monto);
  const tieneTotalAntes = Number.isFinite(totalAntes);
  const tieneTotalDespues = Number.isFinite(totalDespues);
  const tieneDif = Number.isFinite(diferencia);

  return (
    <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Pencil className="w-4 h-4 text-amber-700 dark:text-amber-300" />
        <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Cuenta ajustada</p>
      </div>

      {/* Resumen rápido del último ajuste */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {tieneTotalAntes && (
          <div>
            <p className="text-muted-foreground">Total antes</p>
            <p className="font-bold tabular-nums">{formatCurrency(totalAntes)}</p>
          </div>
        )}
        {tieneTotalDespues && (
          <div>
            <p className="text-muted-foreground">Total después</p>
            <p className="font-bold tabular-nums">{formatCurrency(totalDespues)}</p>
          </div>
        )}
        {tieneDif && (
          <div>
            <p className="text-muted-foreground">Diferencia</p>
            <p
              className={`font-bold tabular-nums ${
                diferencia < 0
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : diferencia > 0
                  ? 'text-rose-700 dark:text-rose-300'
                  : ''
              }`}
            >
              {diferencia > 0 ? '+' : ''}
              {formatCurrency(diferencia)}
            </p>
          </div>
        )}
        {venta?.ajuste_usuario_nombre && (
          <div className="col-span-2 sm:col-span-1">
            <p className="text-muted-foreground">Cajero</p>
            <p className="font-semibold truncate">{venta.ajuste_usuario_nombre}</p>
          </div>
        )}
        {venta?.ajuste_fecha && (
          <div className="col-span-2 sm:col-span-2">
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-semibold">
              {(() => {
                try {
                  return format(new Date(venta.ajuste_fecha), "d MMM yyyy, HH:mm", { locale: es });
                } catch {
                  return venta.ajuste_fecha;
                }
              })()}
            </p>
          </div>
        )}
      </div>

      {venta?.ajuste_motivo && (
        <div className="text-xs">
          <p className="text-muted-foreground">Motivo</p>
          <p className="italic">"{venta.ajuste_motivo}"</p>
        </div>
      )}

      {/* Histórico detallado (si hay más de un ajuste) */}
      {historico.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-800 dark:text-amber-200 font-semibold select-none">
            Ver detalle de cambios ({historico.length} {historico.length === 1 ? 'ajuste' : 'ajustes'})
          </summary>
          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
            {historico.map((aj, i) => (
              <div key={i} className="rounded-md border bg-card/60 p-2 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {(() => {
                      try {
                        return format(new Date(aj.fecha), "d MMM, HH:mm", { locale: es });
                      } catch {
                        return aj.fecha || '';
                      }
                    })()}
                  </span>
                  <span className="font-semibold">{aj.usuario_nombre || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="tabular-nums">{formatCurrency(Number(aj.total_antes) || 0)}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="tabular-nums font-bold">{formatCurrency(Number(aj.total_despues) || 0)}</span>
                  <span
                    className={`ml-auto text-[10px] font-bold tabular-nums ${
                      Number(aj.diferencia) < 0
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : Number(aj.diferencia) > 0
                        ? 'text-rose-700 dark:text-rose-300'
                        : ''
                    }`}
                  >
                    {Number(aj.diferencia) > 0 ? '+' : ''}
                    {formatCurrency(Number(aj.diferencia) || 0)}
                  </span>
                </div>
                {aj.motivo && (
                  <p className="text-[11px] italic text-muted-foreground">"{aj.motivo}"</p>
                )}
                {Array.isArray(aj.cambios) && aj.cambios.length > 0 && (
                  <ul className="space-y-0.5">
                    {aj.cambios.map((c, k) => (
                      <li key={k} className="flex items-start gap-1 text-[11px]">
                        {c.tipo === 'agregado' && <Plus className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />}
                        {c.tipo === 'eliminado' && <Trash2 className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />}
                        {c.tipo === 'modificado' && <Pencil className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />}
                        <span className="flex-1">
                          <span className="font-semibold">{c.producto_nombre || '—'}</span>
                          {c.tipo === 'agregado' && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {Number(c.cantidad) || 0}× · {formatCurrency(Number(c.subtotal) || 0)}
                            </span>
                          )}
                          {c.tipo === 'eliminado' && (
                            <span className="text-muted-foreground">
                              {' '}
                              · era {Number(c.cantidad) || 0}× · {formatCurrency(Number(c.subtotal_original) || 0)}
                            </span>
                          )}
                          {c.tipo === 'modificado' && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {formatCurrency(Number(c.subtotal_original) || 0)} →{' '}
                              {formatCurrency(Number(c.subtotal_nuevo) || 0)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
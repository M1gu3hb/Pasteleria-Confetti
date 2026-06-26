import React from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeFormatDate } from '@/lib/safeFormat';

/**
 * PARTE F — Banner de bloqueo cuando la sucursal tiene un corte abierto de un
 * día anterior. No cierra nada automáticamente: invita a cerrar ese corte.
 *
 * onIrACerrar: callback que abre el flujo de cierre del corte atrasado
 * (en Caja se reusa el dialog de cierre diario sobre la caja abierta, que ES
 * justamente ese corte atrasado).
 */
export default function CorteAtrasadoBanner({ corte, onIrACerrar }) {
  if (!corte) return null;
  const fecha = safeFormatDate(
    corte.fecha_apertura || corte.fecha_inicio || corte.created_date,
    "d 'de' MMMM"
  );
  return (
    <div className="px-4 py-3 rounded-xl bg-red-50 border-2 border-red-300 text-sm text-red-900 flex items-start gap-3 dark:bg-red-950/40 dark:border-red-800">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-bold">⚠️ Quedó un corte abierto del {fecha} en {corte.sucursal_nombre || 'esta sucursal'}.</p>
        <p className="text-xs opacity-90">
          Antes de operar hoy, debes cerrar ese corte para que las ventas de hoy
          no se mezclen con las del día anterior.
        </p>
      </div>
      <Button size="sm" onClick={onIrACerrar} className="shrink-0"
        style={{ background: 'linear-gradient(135deg, hsl(0,72%,46%) 0%, hsl(0,72%,36%) 100%)' }}>
        <Lock className="w-4 h-4 mr-1" /> Cerrar corte {corte.folio}
      </Button>
    </div>
  );
}
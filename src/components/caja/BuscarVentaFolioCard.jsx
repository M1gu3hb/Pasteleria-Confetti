import React from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/financialUtils';
import { safeFormatDate } from '@/lib/safeFormat';
import { Ban, RotateCcw, Receipt, CheckCircle2 } from 'lucide-react';
import { TIPO_VENTA } from '@/utils/tipoVentaUtils';

/**
 * BuscarVentaFolioCard — Prompt 5c
 *
 * Muestra la venta encontrada por folio en Caja: info + productos.
 * Si NO está cancelada → botones "Cancelar venta" / "Devolver venta".
 * Si YA está cancelada → bloque informativo de solo lectura.
 *
 * Solo presentación. La acción real la maneja CancelarVentaDialog (5a),
 * que se abre desde el padre vía onCancelar/onDevolver.
 */
const METODO_LABEL = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta',
  transferencia: 'Transferencia', mixto: 'Mixto',
};
const ESTADO_LABEL = {
  abierta: 'Abierta', enviada: 'Enviada', en_preparacion: 'En preparación',
  lista: 'Lista', cuenta_solicitada: 'Cuenta solicitada',
  pagada: 'Pagada', cancelada: 'Cancelada',
};

export default function BuscarVentaFolioCard({ venta, detalles = [], onCancelar, onDevolver }) {
  if (!venta) return null;
  const dets = Array.isArray(detalles) ? detalles : [];
  const cancelada = venta?.estado === 'cancelada';
  const esDevolucion = venta?.tipo_cancelacion === 'devolucion';

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-3"
      style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(0,0,0,0.06)' }}>
      {/* Encabezado: folio + estado */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono font-bold text-lg leading-tight">{venta?.folio || '—'}</p>
          <p className="text-xs text-muted-foreground">
            {safeFormatDate(venta?.fecha_cierre || venta?.created_date, 'd MMM yyyy, HH:mm')}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${
          cancelada ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
          {ESTADO_LABEL[venta?.estado] || venta?.estado || '—'}
        </span>
      </div>

      {/* Datos clave */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">Sucursal</p>
          <p className="font-medium truncate">{venta?.sucursal_nombre || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Método</p>
          <p className="font-medium">{METODO_LABEL[venta?.metodo_pago] || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="font-bold">{formatCurrency(Number(venta?.total) || 0)}</p>
        </div>
        {venta?.cliente_nombre && (
          <div>
            <p className="text-[11px] text-muted-foreground">Cliente</p>
            <p className="font-medium truncate">{venta.cliente_nombre}</p>
          </div>
        )}
      </div>

      {/* Productos */}
      <div className="border-t pt-2">
        <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
          <Receipt className="w-3 h-3" /> Productos
        </p>
        {dets.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin productos registrados.</p>
        ) : (
          <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
            {dets.map((d, i) => {
              const tipoSnap = d?.tipo_venta_snapshot;
              const esVariable = tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA || tipoSnap === TIPO_VENTA.PORCION_CONTENEDOR;
              return (
                <div key={d?.id || i} className="flex justify-between text-sm py-0.5 border-b border-dashed">
                  <span className="min-w-0 truncate">
                    {d?.producto_nombre}
                    {esVariable ? (
                      <span className="ml-1 text-[11px] text-primary font-bold">
                        {tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA
                          ? `${Number(d?.cantidad_variable_snapshot) || 0} ${d?.unidad_variable_snapshot || ''}`
                          : `${Number(d?.cantidad_porciones_snapshot) || 0} ${d?.nombre_porcion_snapshot || ''}`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground"> ×{d?.cantidad}</span>
                    )}
                  </span>
                  <span className="font-medium shrink-0">{formatCurrency(Number(d?.subtotal) || 0)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Acciones / estado de cancelación */}
      {cancelada ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm space-y-1.5">
          <p className="font-bold text-red-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            {esDevolucion ? 'Venta devuelta (reembolso)' : 'Venta cancelada'}
          </p>
          {esDevolucion && (
            <div className="flex justify-between">
              <span className="text-red-700/80">Monto devuelto</span>
              <span className="font-bold text-red-700">{formatCurrency(Number(venta?.monto_devuelto) || 0)}</span>
            </div>
          )}
          <div>
            <span className="text-red-700/80">Motivo: </span>
            <span className="text-red-800">{venta?.motivo_cancelacion || '—'}</span>
          </div>
          <p className="text-[11px] text-red-700/80">
            {venta?.cancelado_por_nombre ? `Por ${venta.cancelado_por_nombre}` : ''}
            {venta?.fecha_cancelacion ? ` · ${safeFormatDate(venta.fecha_cancelacion, 'd MMM yyyy, HH:mm')}` : ''}
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button variant="outline" onClick={onCancelar}
            className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30">
            <Ban className="w-4 h-4 mr-1.5" /> Cancelar venta
          </Button>
          <Button variant="destructive" onClick={onDevolver} className="flex-1">
            <RotateCcw className="w-4 h-4 mr-1.5" /> Devolver venta
          </Button>
        </div>
      )}
    </div>
  );
}
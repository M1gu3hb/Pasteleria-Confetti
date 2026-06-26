import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Flame, CheckCircle, ChevronDown, BookOpen, AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import CocinaProductoDialog from './CocinaProductoDialog';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function CocinaKanbanCard({
  pedido, onIniciar, onListo, onQuitarListo,
  isHuerfano = false,
}) {
  const [confirmQuitar, setConfirmQuitar] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fichaItem, setFichaItem] = useState(null);
  const estado = pedido?.estado || 'nuevo';

  const timeLabel = (() => {
    try {
      const fecha = pedido?.fecha_creacion;
      if (!fecha) return '—';
      return formatDistanceToNow(new Date(fecha), { addSuffix: true, locale: es });
    } catch {
      return '—';
    }
  })();

  const items = Array.isArray(pedido?.items) ? pedido.items : [];
  const itemCount = items.length;
  const totalProductos = items.reduce((s, i) => s + (i?.cantidad || 0), 0);

  // Click en producto → abre ficha INTERNA de cocina (sin costos/márgenes/gramajes).
  // No navega a Recetas ni a Productos.
  const handleProductoClick = (e, item) => {
    e.stopPropagation();
    setFichaItem(item || null);
  };

  return (
    <div className="rounded-xl bg-white border overflow-hidden"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 6px rgba(0,0,0,0.07)' }}>

      {/* Badge huérfano — solo informativo, sin botón de archivar.
          Solo se muestra cuando la venta asociada REALMENTE no existe en BD. */}
      {isHuerfano && (
        <div className="px-2 pt-2">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-medium text-amber-800 truncate">
              Sin venta asociada
            </span>
          </div>
        </div>
      )}

      {/* Header compacto — siempre visible */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
        style={{ touchAction: 'manipulation' }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-sm leading-tight">
            {pedido?.mesa_numero ? `Mesa ${pedido.mesa_numero}` : 'Mostrador'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {timeLabel} · {totalProductos} producto{totalProductos !== 1 ? 's' : ''} ({itemCount} tipo{itemCount !== 1 ? 's' : ''})
          </p>
        </div>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </div>

      {/* Botón de acción — siempre visible, separado del toggle */}
      <div className="px-3 pb-2.5" onClick={e => e.stopPropagation()}>
        {estado === 'nuevo' && (
          <Button
            size="sm"
            className="w-full h-9 text-sm font-semibold"
            onClick={() => onIniciar && onIniciar(pedido)}
            style={{ background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)' }}
          >
            <Flame className="w-4 h-4 mr-1.5" />Preparar
          </Button>
        )}
        {estado === 'en_preparacion' && (
          <Button
            size="sm"
            className="w-full h-9 text-sm font-semibold"
            onClick={() => onListo && onListo(pedido)}
            style={{ background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)' }}
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />Listo
          </Button>
        )}
        {estado === 'listo' && (
          <p className="text-xs text-center text-emerald-700 font-medium italic py-1">
            Esperando que el mesero recoja
          </p>
        )}
      </div>

      {/* Detalle expandible */}
      {expanded && (
        <div className="border-t px-3 py-2.5 space-y-1.5 bg-muted/20">
          {/* Botón de emergencia: SOLO en pedidos "listo".
              Sirve si el mesero se olvidó de dar "Entregado" y el pedido
              se quedó atorado. NO borra venta, NO toca inventario, solo
              quita el pedido del tablero de cocina marcándolo entregado. */}
          {estado === 'listo' && onQuitarListo && (
            <div className="flex justify-end pb-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-red-300 text-red-700 hover:bg-red-50"
                onClick={(e) => { e.stopPropagation(); setConfirmQuitar(true); }}
                title="Quitar de la lista (no afecta venta ni inventario)"
              >
                <Trash2 className="w-3 h-3 mr-1" /> Quitar de la lista
              </Button>
            </div>
          )}
          {items.length > 0 ? (
            items.map((item, i) => {
              const hayModif = !!(item?.notas && String(item.notas).trim());
              // 6B / 1.F — Cantidad legible para items variables.
              const cantidadVarTxt = formatearCantidadVariable(item || {});
              const esVariable = !!cantidadVarTxt;
              return (
                <div key={i} className={hayModif ? 'rounded border-l-4 border-orange-400 pl-1 bg-orange-50/40 py-0.5' : ''}>
                  <button
                    type="button"
                    onClick={(e) => handleProductoClick(e, item)}
                    className="w-full flex items-start gap-1.5 text-sm text-left hover:bg-white rounded px-1 py-0.5 transition-colors group"
                    title="Ver ficha interna del producto"
                  >
                    {esVariable ? (
                      <span className="font-bold text-primary shrink-0 text-xs px-1.5 py-0.5 rounded bg-primary/10">
                        {cantidadVarTxt}
                      </span>
                    ) : (
                      <span className="font-bold text-primary shrink-0">{item?.cantidad || 0}×</span>
                    )}
                    <span className={`flex-1 ${hayModif ? 'font-bold text-orange-900' : 'font-medium'}`}>{item?.producto_nombre || '—'}</span>
                    {hayModif && <AlertCircle className="w-3 h-3 text-orange-600 mt-0.5" />}
                    {item?.producto_id && (
                      <BookOpen className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                    )}
                  </button>
                  {hayModif && (
                    <p className="text-[11px] text-orange-800 italic ml-6 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded mt-0.5 font-medium">
                      ↳ {item.notas}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground">Sin productos</p>
          )}
          {pedido?.notas && (
            <p className="text-[11px] italic bg-yellow-50 border border-yellow-200 px-2 py-1 rounded mt-1">
              📝 {pedido.notas}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground italic pt-1">
            Toca un producto para ver la ficha de cocina.
          </p>
        </div>
      )}

      <CocinaProductoDialog
        open={!!fichaItem}
        item={fichaItem}
        onClose={() => setFichaItem(null)}
      />

      <AlertDialog open={confirmQuitar} onOpenChange={setConfirmQuitar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este pedido de la lista de cocina?</AlertDialogTitle>
            <AlertDialogDescription>
              No se eliminará la venta ni los registros financieros. Solo se quita del tablero de cocina.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onQuitarListo?.(pedido); setConfirmQuitar(false); }}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
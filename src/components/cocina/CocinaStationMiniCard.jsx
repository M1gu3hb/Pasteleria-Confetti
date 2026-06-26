import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Flame, CheckCircle, Trash2, AlertCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIsDark } from '@/lib/ThemeContext';
import CocinaProductoDialog from './CocinaProductoDialog';

/**
 * F3.1: Subtarjeta COMPACTA por estación para vista "Todas las estaciones".
 *
 * Diseño "tipo llaves":
 *  - Una franja vertical con el color de la estación a la izquierda.
 *  - Badge de estación arriba.
 *  - Productos compactos.
 *  - Botón compacto a la derecha (en desktop) o abajo (móvil).
 *
 * NO toca lógica financiera, inventario, caja, tickets ni propinas.
 * Solo presentación + dispatch de acciones al padre.
 */
export default function CocinaStationMiniCard({
  pedido,
  onIniciar,
  onListo,
  onQuitarListo,
}) {
  const isDark = useIsDark();
  const [confirmQuitar, setConfirmQuitar] = useState(false);
  const [fichaItem, setFichaItem] = useState(null);

  const estado = pedido?.estado || 'nuevo';
  const items = Array.isArray(pedido?.items) ? pedido.items : [];
  const nombreEst =
    pedido?.estacion_preparacion_nombre ||
    (pedido?.estacion_preparacion_id ? 'Estación' : 'Cocina general');
  const colorEst = pedido?.estacion_preparacion_color || '#4A5568';

  // Color suave para fondo de la subtarjeta (no exagerar)
  const tintBg = isDark ? `${colorEst}1f` : `${colorEst}10`;
  const borderL = `${colorEst}cc`;

  const handleClick = (e, item) => {
    e.stopPropagation();
    setFichaItem(item || null);
  };

  // Botón compacto según estado
  const ActionButton = () => {
    if (estado === 'nuevo') {
      return (
        <Button
          size="sm"
          className="h-8 px-3 text-xs font-bold gap-1 shrink-0"
          onClick={() => onIniciar && onIniciar(pedido)}
          style={{
            background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 6px rgba(230,138,51,0.3)',
          }}
        >
          <Flame className="w-3.5 h-3.5" />
          Preparar
        </Button>
      );
    }
    if (estado === 'en_preparacion') {
      return (
        <Button
          size="sm"
          className="h-8 px-3 text-xs font-bold gap-1 shrink-0"
          onClick={() => onListo && onListo(pedido)}
          style={{
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 6px rgba(22,163,74,0.3)',
          }}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Listo
        </Button>
      );
    }
    // listo
    if (onQuitarListo) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 text-[11px] gap-1 shrink-0 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
          onClick={(e) => { e.stopPropagation(); setConfirmQuitar(true); }}
          title="Quitar de la lista (no afecta venta ni inventario)"
        >
          <Trash2 className="w-3 h-3" />
          Quitar
        </Button>
      );
    }
    return null;
  };

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        background: tintBg,
        borderLeft: `3px solid ${borderL}`,
      }}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        {/* Lado izquierdo: badge + productos */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border"
              style={{
                borderColor: `${colorEst}80`,
                color: colorEst,
                background: isDark ? `${colorEst}26` : '#ffffff',
              }}
            >
              {nombreEst}
            </span>
            {estado === 'listo' && (
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                · Listo
              </span>
            )}
            {estado === 'en_preparacion' && (
              <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                · En preparación
              </span>
            )}
          </div>

          <div className="space-y-0.5">
            {items.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sin productos</p>
            ) : (
              items.map((item, i) => {
                const notas = String(item?.notas || '').trim();
                const modificadoresArr = Array.isArray(item?.modificadores) ? item.modificadores : [];
                const lineasMod = modificadoresArr
                  .map((m) => {
                    const ops = Array.isArray(m?.opciones)
                      ? m.opciones.map((o) => o?.nombre).filter(Boolean).join(', ')
                      : '';
                    return ops ? `${m.grupo_nombre}: ${ops}` : '';
                  })
                  .filter(Boolean);
                const tieneExtras = !!notas || lineasMod.length > 0;

                return (
                  <button
                    type="button"
                    key={i}
                    onClick={(e) => handleClick(e, item)}
                    className="w-full text-left flex items-start gap-1.5 hover:bg-white/50 dark:hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
                    title="Ver ficha de cocina"
                  >
                    <span className="font-heading font-black text-sm text-primary tabular-nums shrink-0 leading-tight">
                      {item?.cantidad || 0}×
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-tight ${tieneExtras ? 'font-bold' : 'font-semibold'}`}>
                        {item?.producto_nombre || '—'}
                      </p>
                      {lineasMod.length > 0 && (
                        <p className="text-[10px] text-orange-700 dark:text-orange-300 leading-tight">
                          ↳ {lineasMod.join(' · ')}
                        </p>
                      )}
                      {notas && (
                        <p className="text-[10px] italic text-orange-700 dark:text-orange-300 leading-tight">
                          ↳ {notas}
                        </p>
                      )}
                    </div>
                    {tieneExtras && <AlertCircle className="w-3 h-3 text-orange-600 shrink-0 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Lado derecho: botón compacto */}
        <div className="shrink-0 self-center">
          <ActionButton />
        </div>
      </div>

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
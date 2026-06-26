import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Flame, CheckCircle, ChevronDown, BookOpen, AlertCircle, Trash2,
  AlertTriangle, Clock, UtensilsCrossed,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import CocinaProductoDialog from './CocinaProductoDialog';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { etiquetaMesaCocina } from '@/utils/pedidoCocinaValido';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIsDark } from '@/lib/ThemeContext';

/**
 * Card premium de Cocina.
 *
 * Comportamiento de expansión:
 *  - Desktop / tablet (>= md): expandido por defecto. El usuario puede colapsar.
 *  - Móvil: compacto por defecto. Toca para expandir.
 *
 * Estética skeuomorphism sutil:
 *  - Highlight superior (inset blanco) + sombra inferior con tinte por estado.
 *  - Barra de estado lateral con color de identidad (azul / naranja / verde).
 *  - Productos con cantidad grande, nombre, notas/modificadores destacados.
 *
 * Lógica intacta:
 *  - onIniciar / onListo / onQuitarListo no cambian.
 *  - Sin tocar voz/watchers ni estados de cocina.
 */
const useIsMdUp = () => {
  const [isMdUp, setIsMdUp] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 768
  );
  useEffect(() => {
    const onResize = () => setIsMdUp(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMdUp;
};

const ESTADO_THEME = {
  nuevo: {
    barColor: '#3B82C7',
    glow: 'rgba(59,130,199,0.18)',
    pillBg: '#3B82C7',
    accentBg: 'rgba(59,130,199,0.06)',
  },
  en_preparacion: {
    barColor: '#E68A33',
    glow: 'rgba(230,138,51,0.18)',
    pillBg: '#E68A33',
    accentBg: 'rgba(230,138,51,0.06)',
  },
  listo: {
    barColor: '#16A34A',
    glow: 'rgba(22,163,74,0.18)',
    pillBg: '#16A34A',
    accentBg: 'rgba(22,163,74,0.06)',
  },
};

export default function CocinaPedidoCardPremium({
  pedido, onIniciar, onListo, onQuitarListo, isHuerfano = false,
  mostrarEstacionBadge = false,
}) {
  const isDark = useIsDark();
  const isMdUp = useIsMdUp();
  const [confirmQuitar, setConfirmQuitar] = useState(false);
  // Desktop/tablet: expandido por defecto. Móvil: compacto por defecto.
  const [expanded, setExpanded] = useState(isMdUp);
  const [fichaItem, setFichaItem] = useState(null);

  // Si cambia el viewport (rotación tablet, etc.), reabrir/cerrar automático
  // SOLO al pasar el umbral, no en cada render.
  useEffect(() => {
    setExpanded(isMdUp);
  }, [isMdUp]);

  const estado = pedido?.estado || 'nuevo';
  const theme = ESTADO_THEME[estado] || ESTADO_THEME.nuevo;

  const timeLabel = (() => {
    try {
      const fecha = pedido?.fecha_creacion;
      if (!fecha) return '—';
      return formatDistanceToNow(new Date(fecha), { addSuffix: true, locale: es });
    } catch { return '—'; }
  })();

  const items = Array.isArray(pedido?.items) ? pedido.items : [];
  const itemCount = items.length;
  const totalProductos = items.reduce((s, i) => s + (i?.cantidad || 0), 0);

  const handleProductoClick = (e, item) => {
    e.stopPropagation();
    setFichaItem(item || null);
  };

  // Sombras premium dark-aware
  const cardShadow = isDark
    ? `0 1px 0 rgba(255,255,255,0.08) inset, 0 -2px 6px rgba(0,0,0,0.4) inset, 0 6px 18px rgba(0,0,0,0.45), 0 0 0 1px ${theme.glow}`
    : `0 1px 0 rgba(255,255,255,0.95) inset, 0 -1px 0 rgba(0,0,0,0.04) inset, 0 4px 14px rgba(0,0,0,0.08), 0 0 0 1px ${theme.glow}`;
  const cardBg = isDark
    ? `linear-gradient(180deg, hsl(222 40% 12%) 0%, hsl(222 40% 10%) 100%)`
    : `linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%)`;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border bg-card"
      style={{
        background: cardBg,
        boxShadow: cardShadow,
      }}
    >
      {/* Barra de estado lateral premium */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{
          background: `linear-gradient(180deg, ${theme.barColor} 0%, ${theme.barColor}aa 100%)`,
          boxShadow: `0 0 12px ${theme.barColor}66`,
        }}
        aria-hidden
      />

      {/* Badge huérfano informativo */}
      {isHuerfano && (
        <div className="pl-3 pr-2 pt-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
              Sin venta asociada
            </span>
          </div>
        </div>
      )}

      {/* 6A: ALERGIA / INDICACIONES CRÍTICAS — debe verse fuerte en cocina */}
      {pedido?.notas_alergias && (
        <div className="pl-4 pr-3 pt-2">
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg border-2 bg-amber-100 border-amber-500 dark:bg-amber-950/50 dark:border-amber-600">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-wide text-amber-900 dark:text-amber-200 leading-tight">
                ⚠️ Alergias / indicaciones
              </p>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-100 leading-snug">
                {pedido.notas_alergias}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 6A: CELEBRACIÓN ESPECIAL — sutil, no rompe layout */}
      {pedido?.celebracion_especial === true && (
        <div className="pl-4 pr-3 pt-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-pink-50 border-pink-300 dark:bg-pink-950/30 dark:border-pink-800/60">
            <span className="text-base leading-none">🎉</span>
            <p className="text-[11px] font-bold text-pink-800 dark:text-pink-200 leading-tight">
              {pedido?.tipo_celebracion ? `Celebración: ${pedido.tipo_celebracion}` : 'Celebración especial'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2.5 pl-4 pr-3 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        style={{ touchAction: 'manipulation' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${theme.barColor} 0%, ${theme.barColor}cc 100%)`,
            boxShadow: `0 2px 6px ${theme.barColor}55, 0 1px 0 rgba(255,255,255,0.2) inset`,
          }}
        >
          <UtensilsCrossed className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-black text-base leading-tight">
            {etiquetaMesaCocina(pedido)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeLabel}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white tabular-nums"
              style={{ background: theme.pillBg }}
            >
              {totalProductos} {totalProductos === 1 ? 'item' : 'items'} · {itemCount} tipo{itemCount !== 1 ? 's' : ''}
            </span>
            {/* F3: badge de estación (vista general) — solo visible cuando se pasa el flag */}
            {mostrarEstacionBadge && (() => {
              const nombreEst = pedido?.estacion_preparacion_nombre || (pedido?.estacion_preparacion_id ? 'Estación' : 'Cocina general');
              const colorEst = pedido?.estacion_preparacion_color || '#4A5568';
              return (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{
                    borderColor: colorEst + '99',
                    color: colorEst,
                    background: colorEst + '18',
                  }}
                  title={nombreEst}
                >
                  {nombreEst}
                </span>
              );
            })()}
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </div>

      {/* Botón de acción principal */}
      <div className="pl-4 pr-3 pb-3" onClick={(e) => e.stopPropagation()}>
        {estado === 'nuevo' && (
          <Button
            size="sm"
            className="w-full h-10 text-sm font-bold gap-1.5"
            onClick={() => onIniciar && onIniciar(pedido)}
            style={{
              background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)',
              boxShadow: '0 2px 0 rgba(255,255,255,0.2) inset, 0 4px 12px rgba(230,138,51,0.35)',
            }}
          >
            <Flame className="w-4 h-4" /> Preparar
          </Button>
        )}
        {estado === 'en_preparacion' && (
          <Button
            size="sm"
            className="w-full h-10 text-sm font-bold gap-1.5"
            onClick={() => onListo && onListo(pedido)}
            style={{
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              boxShadow: '0 2px 0 rgba(255,255,255,0.2) inset, 0 4px 12px rgba(22,163,74,0.35)',
            }}
          >
            <CheckCircle className="w-4 h-4" /> Listo
          </Button>
        )}
        {estado === 'listo' && (
          <div
            className="text-xs text-center font-semibold py-2 rounded-lg"
            style={{
              color: isDark ? '#86efac' : '#15803d',
              background: isDark ? 'rgba(22,163,74,0.12)' : 'rgba(22,163,74,0.08)',
              border: '1px dashed rgba(22,163,74,0.3)',
            }}
          >
            Esperando que el mesero recoja
          </div>
        )}
      </div>

      {/* Detalle expandible: en desktop arranca abierto */}
      {expanded && (
        <div
          className="pl-4 pr-3 pb-3 pt-2 space-y-2 border-t"
          style={{
            background: theme.accentBg,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          }}
        >
          {/* Botón emergencia: quitar de la lista — solo en "listo" */}
          {estado === 'listo' && onQuitarListo && (
            <div className="flex justify-end">
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

          {/* Productos */}
          {items.length > 0 ? (
            <div className="space-y-1.5">
              {items.map((item, i) => {
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
                // PASO A — Ingredientes excluidos (SIN). Cocina los muestra
                // como badges rojos destacados para que el cocinero los vea
                // antes de empezar a preparar. Tolera shape legacy:
                //   - array de strings: ["Tocino", "Cebolla"]
                //   - array de objetos: [{ ingrediente_nombre: "Tocino", ... }]
                const exclusionesArr = Array.isArray(item?.ingredientes_excluidos)
                  ? item.ingredientes_excluidos : [];
                const exclusionesNombres = exclusionesArr
                  .map((e) => {
                    if (typeof e === 'string') return e;
                    if (e && typeof e === 'object') return e.ingrediente_nombre || '';
                    return '';
                  })
                  .filter(Boolean);
                const tieneExclusiones = exclusionesNombres.length > 0;
                const tieneExtras = !!notas || lineasMod.length > 0 || tieneExclusiones;
                // 6B / 1.F — Si el item es variable, mostrar "500 g" / "4 shots"
                // en lugar de la cantidad cruda. precio_fijo intacto.
                const cantidadVarTxt = formatearCantidadVariable(item || {});
                const esVariable = !!cantidadVarTxt;

                return (
                  <div
                    key={i}
                    className={`rounded-lg overflow-hidden ${
                      tieneExtras
                        ? 'border-l-4 border-orange-400 bg-orange-50/60 dark:bg-orange-950/20'
                        : 'bg-card border'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleProductoClick(e, item)}
                      className="w-full flex items-start gap-2 text-left px-2.5 py-2 hover:bg-white/70 dark:hover:bg-white/5 transition-colors group"
                      title="Ver ficha interna del producto"
                    >
                      {esVariable ? (
                        <span
                          className="font-heading font-black text-sm text-primary shrink-0 tabular-nums leading-tight px-1.5 py-0.5 rounded-md bg-primary/10"
                          title="Cantidad variable"
                        >
                          {cantidadVarTxt}
                        </span>
                      ) : (
                        <span
                          className="font-heading font-black text-base text-primary shrink-0 tabular-nums leading-tight min-w-[28px]"
                        >
                          {item?.cantidad || 0}×
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight ${tieneExtras ? 'font-bold text-orange-900 dark:text-orange-100' : 'font-semibold'}`}>
                          {item?.producto_nombre || '—'}
                        </p>
                      </div>
                      {tieneExtras && <AlertCircle className="w-3.5 h-3.5 text-orange-600 mt-0.5 shrink-0" />}
                      {item?.producto_id && (
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
                      )}
                    </button>

                    {/* Modificadores destacados */}
                    {lineasMod.length > 0 && (
                      <div className="px-2.5 pb-1.5 pt-0 space-y-0.5">
                        {lineasMod.map((linea, idx) => (
                          <p
                            key={idx}
                            className="text-[11px] font-semibold text-orange-800 dark:text-orange-200 ml-9 bg-orange-100 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-700/40 px-2 py-0.5 rounded"
                          >
                            ↳ {linea}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* PASO A — INGREDIENTES EXCLUIDOS (SIN ...). Rojo intenso
                        para que cocina los note de inmediato. No tocan estado
                        ni inventario; solo informan al cocinero qué quitar. */}
                    {tieneExclusiones && (
                      <div className="px-2.5 pb-1.5 pt-0 ml-9 flex flex-wrap gap-1">
                        {exclusionesNombres.map((nombre, idx) => (
                          <span
                            key={`excl-${idx}`}
                            className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700/60 text-rose-800 dark:text-rose-200"
                          >
                            ✕ SIN {nombre}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notas libres */}
                    {notas && (
                      <p className="text-[11px] italic text-orange-800 dark:text-orange-200 ml-9 mr-2 mb-1.5 bg-orange-100/60 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700/40 px-2 py-0.5 rounded font-medium">
                        ↳ {notas}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin productos</p>
          )}

          {/* Nota general del pedido (mesa, no de un item) */}
          {pedido?.notas && (
            <div className="rounded-lg border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50 dark:bg-yellow-950/30 px-2.5 py-1.5">
              <p className="text-[11px] italic text-yellow-900 dark:text-yellow-200">
                📝 <span className="font-bold">Mesa:</span> {pedido.notas}
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic pt-1">
            Toca un producto para ver su ficha de cocina.
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
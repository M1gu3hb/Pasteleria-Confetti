import React from 'react';
import { Clock, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useIsDark } from '@/lib/ThemeContext';
import CocinaStationMiniCard from './CocinaStationMiniCard';
import { etiquetaMesaCocina } from '@/utils/pedidoCocinaValido';

/**
 * F3.1: Tarjeta agrupadora por MESA para vista "Todas las estaciones".
 *
 * Diseño "tipo llaves":
 *  - Header con número de mesa, tiempo, total items.
 *  - Subtarjetas compactas por estación (CocinaStationMiniCard).
 *
 * Recibe TODOS los pedidos de una misma mesa que están en un mismo estado
 * (columna nuevo / en_preparacion / listo).
 */
export default function CocinaMesaGroupCard({
  pedidos,
  onIniciar,
  onListo,
  onQuitarListo,
}) {
  const isDark = useIsDark();
  const arr = Array.isArray(pedidos) ? pedidos : [];
  if (arr.length === 0) return null;

  const first = arr[0] || {};
  const mesaLabel = etiquetaMesaCocina(first);

  // Pedido más antiguo del grupo para tiempo "hace X"
  const fechas = arr
    .map((p) => p?.fecha_creacion)
    .filter(Boolean)
    .map((f) => {
      try { return new Date(f).getTime(); } catch { return null; }
    })
    .filter((t) => Number.isFinite(t));
  const minTime = fechas.length > 0 ? Math.min(...fechas) : null;
  const timeLabel = (() => {
    if (!minTime) return '—';
    try {
      return formatDistanceToNow(new Date(minTime), { addSuffix: true, locale: es });
    } catch { return '—'; }
  })();

  // Total de items sumando todos los pedidos
  const totalItems = arr.reduce((s, p) => {
    const items = Array.isArray(p?.items) ? p.items : [];
    return s + items.reduce((a, it) => a + (Number(it?.cantidad) || 0), 0);
  }, 0);

  const cardBg = isDark
    ? `linear-gradient(180deg, hsl(222 40% 12%) 0%, hsl(222 40% 10%) 100%)`
    : `linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%)`;
  const cardShadow = isDark
    ? `0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 12px rgba(0,0,0,0.35)`
    : `0 1px 0 rgba(255,255,255,0.9) inset, 0 3px 10px rgba(0,0,0,0.06)`;

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: cardBg, boxShadow: cardShadow }}
    >
      {/* Header de la mesa */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,34%) 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 6px rgba(0,0,0,0.15)',
          }}
        >
          <UtensilsCrossed className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-black text-sm leading-tight">{mesaLabel}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 leading-tight">
            <Clock className="w-2.5 h-2.5" /> {timeLabel} · {totalItems} item{totalItems !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
          {arr.length} {arr.length === 1 ? 'estación' : 'estaciones'}
        </span>
      </div>

      {/* 6A: alergia / celebración a nivel mesa (compacto, no rompe llaves) */}
      {(() => {
        // Tomamos primer pedido con alergia/celebración (todos los pedidos de la
        // misma mesa comparten snapshot). Si no hay nada, no renderiza.
        const conAlergia = arr.find((p) => p?.notas_alergias);
        const conCele = arr.find((p) => p?.celebracion_especial === true);
        if (!conAlergia && !conCele) return null;
        return (
          <div className="px-2 pt-2 space-y-1.5">
            {conAlergia && (
              <div className="flex items-start gap-1.5 px-2 py-1 rounded-md border-2 bg-amber-100 border-amber-500 dark:bg-amber-950/50 dark:border-amber-600">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-amber-900 dark:text-amber-100 leading-snug">
                  Alergia: {conAlergia.notas_alergias}
                </p>
              </div>
            )}
            {conCele && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-pink-50 border-pink-300 dark:bg-pink-950/30 dark:border-pink-800/60">
                <span className="text-sm leading-none">🎉</span>
                <p className="text-[11px] font-bold text-pink-800 dark:text-pink-200 leading-tight">
                  {conCele?.tipo_celebracion ? `Celebración: ${conCele.tipo_celebracion}` : 'Celebración especial'}
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Subtarjetas por estación */}
      <div className="p-2 space-y-1.5">
        {arr.map((pedido) => (
          <CocinaStationMiniCard
            key={pedido.id}
            pedido={pedido}
            onIniciar={onIniciar}
            onListo={onListo}
            onQuitarListo={onQuitarListo}
          />
        ))}
      </div>
    </div>
  );
}
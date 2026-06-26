import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { History, ChevronDown, AlertTriangle, Clock, UtensilsCrossed, ChefHat } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { esPedidoValidoParaCocina, etiquetaMesaCocina } from '@/utils/pedidoCocinaValido';

/**
 * HISTORIAL DE COCINA — Solo lectura, operativo.
 *
 * Reglas:
 *  - Muestra pedidos con estado 'entregado' o 'cancelado'.
 *  - Filtra por turno actual: si hay caja abierta, desde fecha_apertura de la caja;
 *    si no, desde el inicio del día operativo (medianoche).
 *  - Filtra por scope del usuario (estaciones), igual que la cocina activa.
 *  - NO permite acciones (no se puede reabrir, no se puede borrar, no afecta BD).
 *  - Card compacta por defecto, expandible para ver detalle completo.
 *
 * NO toca:
 *   - Inventario · ventas · caja · pedidos activos · tickets · PDFs.
 */
export default function CocinaHistorialTab({ userScope, userEsCocinaGeneral, esRestaurantePro = false }) {
  const { cajaAbierta } = useCajaAbierta();

  // Fecha de corte: caja abierta o medianoche local.
  const fechaCorteIso = useMemo(() => {
    if (cajaAbierta?.fecha_apertura) return cajaAbierta.fecha_apertura;
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    return h.toISOString();
  }, [cajaAbierta]);

  // Carga histórica. Trae los últimos 300 pedidos y filtramos en memoria por
  // estado + fecha + scope. Refresca cada 8s (no agresivo) — solo es lectura.
  const { data: pedidosRaw, isPending } = useQuery({
    queryKey: ['pedidos_historial_cocina'],
    queryFn: () => base44.entities.PedidoPreparacion.list('-created_date', 300),
    placeholderData: (prev) => prev,
    staleTime: 5000,
    refetchInterval: 8000,
  });

  const cargando = isPending && !pedidosRaw;

  const pedidos = useMemo(() => {
    const arr = Array.isArray(pedidosRaw) ? pedidosRaw : [];
    const corte = new Date(fechaCorteIso).getTime();
    return arr
      .filter((p) => {
        // BUGFIX pedidos "Mostrador": el historial tampoco debe mostrar
        // pedidos de mostrador/caja/sin origen válido. Mismo filtro que activos.
        if (!esPedidoValidoParaCocina(p, esRestaurantePro)) return false;
        // Solo entregados/cancelados.
        if (!['entregado', 'cancelado'].includes(p?.estado)) return false;
        // Dentro del turno actual.
        const fechaEvt = p?.fecha_entregado || p?.fecha_listo || p?.fecha_creacion || p?.created_date;
        if (!fechaEvt) return false;
        const t = new Date(fechaEvt).getTime();
        if (!Number.isFinite(t) || t < corte) return false;
        // Filtro por estación (igual que pedidos activos).
        if (userScope?.mode === 'unassigned') return false;
        if (userScope?.mode === 'station') {
          if (p?.estacion_preparacion_id === userScope.stationId) return true;
          if (!p?.estacion_preparacion_id && userEsCocinaGeneral) return true;
          return false;
        }
        // 'all' → ver todo.
        return true;
      })
      .sort((a, b) => {
        const fa = new Date(a?.fecha_entregado || a?.fecha_listo || a?.created_date || 0).getTime();
        const fb = new Date(b?.fecha_entregado || b?.fecha_listo || b?.created_date || 0).getTime();
        return fb - fa; // más reciente primero
      });
  }, [pedidosRaw, fechaCorteIso, userScope, userEsCocinaGeneral, esRestaurantePro]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
        <span className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
        Cargando historial…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="w-3.5 h-3.5" />
        {cajaAbierta?.fecha_apertura ? (
          <span>
            Mostrando desde apertura de caja ·{' '}
            {format(new Date(cajaAbierta.fecha_apertura), "d MMM HH:mm", { locale: es })}
          </span>
        ) : (
          <span>Mostrando pedidos del día (desde 00:00)</span>
        )}
        <span className="ml-auto font-semibold">
          {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>

      {pedidos.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Sin pedidos completados en este turno.
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((p) => (
            <HistorialItem key={p.id} pedido={p} mostrarEstacion={userScope?.mode === 'all'} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Item compacto expandible. Skeuomorphism sutil, igual lenguaje visual que cocina. */
function HistorialItem({ pedido, mostrarEstacion }) {
  const [expanded, setExpanded] = useState(false);
  const items = Array.isArray(pedido?.items) ? pedido.items : [];
  const totalProductos = items.reduce((s, i) => s + (Number(i?.cantidad) || 0), 0);
  const esCancelado = pedido?.estado === 'cancelado';

  const tiempoTotal = (() => {
    try {
      const ini = pedido?.fecha_creacion || pedido?.created_date;
      const fin = pedido?.fecha_entregado || pedido?.fecha_listo;
      if (!ini || !fin) return null;
      const ms = new Date(fin).getTime() - new Date(ini).getTime();
      if (!Number.isFinite(ms) || ms <= 0) return null;
      const min = Math.round(ms / 60000);
      if (min < 1) return '< 1 min';
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60);
      return `${h}h ${min % 60}m`;
    } catch { return null; }
  })();

  const horaEntrega = (() => {
    try {
      const f = pedido?.fecha_entregado || pedido?.fecha_listo;
      if (!f) return '—';
      return format(new Date(f), "d MMM HH:mm", { locale: es });
    } catch { return '—'; }
  })();

  const colorEstado = esCancelado ? '#9CA3AF' : '#16A34A';
  const labelEstado = esCancelado ? 'Cancelado' : 'Entregado';

  return (
    <div
      className="rounded-xl border bg-card overflow-hidden"
      style={{
        boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 8px rgba(0,0,0,0.08)',
        opacity: esCancelado ? 0.75 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${colorEstado} 0%, ${colorEstado}cc 100%)`,
            boxShadow: `0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 6px ${colorEstado}55`,
          }}
        >
          <UtensilsCrossed className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-heading font-bold text-sm leading-tight">
              {etiquetaMesaCocina(pedido)}
            </p>
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
              style={{ background: colorEstado }}
            >
              {labelEstado}
            </span>
            {mostrarEstacion && pedido?.estacion_preparacion_nombre && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                style={{
                  borderColor: (pedido.estacion_preparacion_color || '#4A5568') + '66',
                  color: pedido.estacion_preparacion_color || '#4A5568',
                  background: (pedido.estacion_preparacion_color || '#4A5568') + '15',
                }}
              >
                {pedido.estacion_preparacion_nombre}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {horaEntrega}
            </span>
            {tiempoTotal && (
              <span className="text-[10px] text-muted-foreground">· {tiempoTotal}</span>
            )}
            <span className="text-[10px] text-muted-foreground">
              · {totalProductos} {totalProductos === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30 space-y-2">
          {/* Alergia visible aunque sea histórico — auditoría. */}
          {pedido?.notas_alergias && (
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                Alergias / indicaciones: {pedido.notas_alergias}
              </p>
            </div>
          )}
          {pedido?.celebracion_especial === true && (
            <p className="text-[11px] font-semibold text-pink-700 dark:text-pink-300">
              🎉 {pedido?.tipo_celebracion || 'Celebración especial'}
            </p>
          )}

          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin productos.</p>
          ) : (
            <ul className="space-y-1">
              {items.map((it, idx) => {
                const txtVar = formatearCantidadVariable(it || {});
                const notas = String(it?.notas || '').trim();
                const modificadoresArr = Array.isArray(it?.modificadores) ? it.modificadores : [];
                const lineasMod = modificadoresArr
                  .map((m) => {
                    const ops = Array.isArray(m?.opciones)
                      ? m.opciones.map((o) => o?.nombre).filter(Boolean).join(', ')
                      : '';
                    return ops ? `${m?.grupo_nombre || ''}: ${ops}` : '';
                  })
                  .filter(Boolean);
                return (
                  <li key={idx} className="text-xs">
                    <div className="flex items-start gap-2">
                      <span className="font-mono font-bold text-primary shrink-0">
                        {txtVar || `${it?.cantidad || 0}×`}
                      </span>
                      <span className="flex-1">{it?.producto_nombre || '—'}</span>
                    </div>
                    {lineasMod.map((linea, i) => (
                      <p key={i} className="ml-6 text-[10px] text-muted-foreground italic">
                        ↳ {linea}
                      </p>
                    ))}
                    {notas && (
                      <p className="ml-6 text-[10px] italic text-orange-700 dark:text-orange-300">
                        ↳ {notas}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {pedido?.notas && (
            <p className="text-[11px] italic text-muted-foreground">
              📝 Mesa: {pedido.notas}
            </p>
          )}

          <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap pt-1 border-t">
            <ChefHat className="w-3 h-3" />
            {pedido?.venta_folio && <span>Folio: {pedido.venta_folio}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
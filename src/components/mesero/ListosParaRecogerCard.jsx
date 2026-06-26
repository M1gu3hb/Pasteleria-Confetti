import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CheckCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { entregarPedidosListosDeMesa } from '@/utils/entregaPedidos';

/**
 * F3.2: Card "Listo para recoger" dentro del dialog de Mesa activa.
 *
 * Muestra qué estaciones tienen pedidos en estado 'listo' para esta venta,
 * con sus productos. Botón "Marcar entregado" llama a la utilidad
 * `entregarPedidosListosDeMesa` que solo toca pedidos en estado 'listo'.
 *
 * NO toca:
 *  - inventario
 *  - caja / cobro
 *  - tickets / PDFs
 *  - finanzas
 *
 * Solo actualiza PedidoPreparacion → 'entregado' y opcionalmente Mesa → 'ocupada'.
 *
 * Si no hay pedidos listos, NO se renderiza (devuelve null).
 */
export default function ListosParaRecogerCard({ mesa, ventaId, onAfterEntregar }) {
  const queryClient = useQueryClient();
  const [entregando, setEntregando] = useState(false);

  // Query local de pedidos listos de ESTA venta. Refetch corto para vista en vivo.
  // HOTFIX 6A.3: refetchInterval bajado a 1500ms para reflejar listos al
  // instante. Cocina invalida esta key además — pero el polling rápido
  // protege contra red lenta / orden de eventos.
  const { data: pedidos = [], isFetched } = useQuery({
    queryKey: ['pedidos_listos_mesero', ventaId || 'none'],
    queryFn: async () => {
      if (!ventaId) return [];
      try {
        const arr = await base44.entities.PedidoPreparacion.filter({ venta_id: ventaId });
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    },
    enabled: !!ventaId,
    refetchInterval: 1500,
    staleTime: 1500,
    // Mantener data previa durante el refetch (evita flicker básico).
    placeholderData: (prev) => prev,
  });

  // Solo los que están en 'listo'.
  const listos = useMemo(
    () => (Array.isArray(pedidos) ? pedidos : []).filter((p) => p?.estado === 'listo'),
    [pedidos]
  );

  // HOTFIX 6A.3 — LATCH REAL anti-parpadeo en móvil.
  // El problema: en móvil con red lenta o cuando hay un refetch en curso,
  // momentáneamente `listos.length === 0` y el card se oculta, luego vuelve.
  // Resultado visible: parpadeo + botón "Marcar entregado" inestable.
  //
  // Solución: mantenemos un snapshot del último estado conocido con pedidos
  // listos. Solo se LIMPIA cuando:
  //  - cambia ventaId (entramos a otra mesa),
  //  - el usuario marca entregado (limpieza manual desde handlers),
  //  - confirmamos que los pedidos del snapshot YA están entregados/cancelados
  //    en BD (refetch fresco devolvió esos ids con estado !== 'listo').
  const [lastKnownListos, setLastKnownListos] = useState([]);
  const ventaPrevRef = useRef(ventaId);

  // Reset al cambiar venta.
  useEffect(() => {
    if (ventaPrevRef.current !== ventaId) {
      ventaPrevRef.current = ventaId;
      setLastKnownListos([]);
    }
  }, [ventaId]);

  // Mantener snapshot cuando hay listos reales.
  useEffect(() => {
    if (!isFetched) return;
    if (listos.length > 0) {
      setLastKnownListos(listos);
      return;
    }
    // Caso especial: pedidos sí cargaron pero ninguno está en 'listo'.
    // Si el snapshot anterior YA fue confirmado como entregado/cancelado en BD,
    // lo limpiamos. Si no se puede confirmar, conservamos para evitar parpadeo.
    if (lastKnownListos.length > 0 && Array.isArray(pedidos)) {
      const map = new Map();
      pedidos.forEach((p) => { if (p?.id) map.set(p.id, p); });
      const todosEntregados = lastKnownListos.every((p) => {
        const fresh = map.get(p?.id);
        return fresh && ['entregado', 'cancelado'].includes(fresh.estado);
      });
      if (todosEntregados) {
        setLastKnownListos([]);
      }
      // Si NO todos están confirmados como entregados, mantenemos el snapshot
      // (puede ser un refetch parcial en curso). El próximo tick lo limpiará.
    }
  }, [listos, isFetched, pedidos, lastKnownListos]);

  // Lista efectiva: listos reales si hay, o snapshot si momentáneamente vacío.
  const listosEfectivos = listos.length > 0 ? listos : lastKnownListos;

  // HOTFIX MÓVIL — Guard síncrono adicional al `entregando`. React puede
  // demorar 1-2 frames en aplicar disabled en móvil con red lenta.
  // IMPORTANTE: declarado ANTES de cualquier early return para respetar
  // las rules-of-hooks de React.
  const enVueloEntregaRef = useRef(false);

  // Agrupar listos por estación para mostrar bonito (usar lista efectiva
  // con latch para no parpadear durante refetch).
  const grupos = useMemo(() => {
    const map = new Map();
    listosEfectivos.forEach((p) => {
      const key = p?.estacion_preparacion_id || p?.estacion_preparacion_nombre || '__general__';
      if (!map.has(key)) {
        map.set(key, {
          nombre: p?.estacion_preparacion_nombre || 'Cocina',
          color: p?.estacion_preparacion_color || '#4A5568',
          items: [],
          pedidoIds: [],
        });
      }
      const g = map.get(key);
      g.pedidoIds.push(p.id);
      const items = Array.isArray(p?.items) ? p.items : [];
      items.forEach((it) => {
        if (!it) return;
        g.items.push({
          producto_nombre: it.producto_nombre || '—',
          cantidad: Number(it.cantidad) || 0,
        });
      });
    });
    return Array.from(map.values());
  }, [listosEfectivos]);

  if (!ventaId) return null;
  // Esperar al primer fetch para no flashear el card.
  if (!isFetched) return null;
  // Si NO hay listos actuales NI en latch, ocultar.
  if (listosEfectivos.length === 0) return null;

  const nombresEst = grupos.map((g) => g.nombre).filter(Boolean);
  const titulo =
    nombresEst.length === 0
      ? 'Listo para recoger'
      : nombresEst.length === 1
        ? `Listo para recoger: ${nombresEst[0]}`
        : `Listo para recoger: ${nombresEst.slice(0, -1).join(', ')} y ${nombresEst[nombresEst.length - 1]}`;

  const labelBoton = grupos.length > 1 ? 'Entregar listos' : 'Marcar entregado';

  // HOTFIX 6A.2: invalidación + refetch coordinado.
  // Forzamos refetch INMEDIATO de cocina y mesero para que el pedido
  // desaparezca de ambos lados sin esperar el siguiente tick de polling.
  const refrescarTodo = () => {
    queryClient.invalidateQueries({ queryKey: ['pedidos_listos_mesero'] });
    queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
    queryClient.invalidateQueries({ queryKey: ['pedidos_listos_watcher'] });
    queryClient.invalidateQueries({ queryKey: ['mesas'] });
    queryClient.refetchQueries({ queryKey: ['pedidos_cocina'], type: 'active' }).catch(() => {});
    queryClient.refetchQueries({ queryKey: ['pedidos_listos_mesero'], type: 'active' }).catch(() => {});
    queryClient.refetchQueries({ queryKey: ['mesas'], type: 'active' }).catch(() => {});
  };

  // Optimistic update: marca localmente los pedidos como 'entregado'
  // para que el card desaparezca al instante.
  const optimisticEntregar = (pedidoIdsAEntregar) => {
    const key = ['pedidos_listos_mesero', ventaId || 'none'];
    queryClient.setQueryData(key, (prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      if (pedidoIdsAEntregar && pedidoIdsAEntregar.length > 0) {
        const wanted = new Set(pedidoIdsAEntregar);
        return arr.map((p) =>
          p && wanted.has(p.id) ? { ...p, estado: 'entregado' } : p
        );
      }
      // Entregar todos los listos
      return arr.map((p) => (p?.estado === 'listo' ? { ...p, estado: 'entregado' } : p));
    });
  };

  const handleEntregar = async () => {
    if (entregando || enVueloEntregaRef.current) return;
    enVueloEntregaRef.current = true;
    // Snapshot del latch ANTES del optimistic, por si el reintento del backend
    // también falla y necesitamos restaurar la UI.
    const latchPrevio = lastKnownListos;
    setEntregando(true);
    // Optimistic: quitar inmediatamente el card.
    optimisticEntregar(null);
    // HOTFIX 6A.3: limpiar el latch manualmente al entregar.
    setLastKnownListos([]);
    try {
      const res = await entregarPedidosListosDeMesa({
        mesaId: mesa?.id,
        ventaId,
      });
      if (res.ok) {
        toast.success(res.mensaje || 'Entregado');
      } else {
        // Caso típico móvil: el card estaba visible por latch pero el backend
        // aún no propagaba el estado 'listo' (a pesar del reintento interno).
        // Restauramos el latch para que el botón siga disponible y avisamos
        // con mensaje claro — sin pedir al usuario "salir y volver a entrar".
        if (latchPrevio.length > 0) {
          setLastKnownListos(latchPrevio);
          toast.message('Sincronizando pedidos, intenta de nuevo en un momento');
        } else {
          toast.error(res.mensaje || 'No se pudo entregar');
        }
      }
      refrescarTodo();
      if (typeof onAfterEntregar === 'function') {
        try { onAfterEntregar(res); } catch (e) { console.warn('[ListosCard] cb', e); }
      }
    } catch (e) {
      console.error('[ListosParaRecogerCard] handleEntregar:', e);
      toast.error('No se pudo entregar el pedido. Intenta de nuevo.');
      // Restaurar latch si falló para no perder la UI.
      if (latchPrevio.length > 0) setLastKnownListos(latchPrevio);
      refrescarTodo();
    } finally {
      setEntregando(false);
      enVueloEntregaRef.current = false;
    }
  };

  // Entregar SOLO una estación específica.
  const handleEntregarGrupo = async (grupo) => {
    if (entregando || !grupo?.pedidoIds?.length) return;
    setEntregando(true);
    optimisticEntregar(grupo.pedidoIds);
    // HOTFIX 6A.3: limpiar latch para los pedidos de esa estación.
    setLastKnownListos((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const set = new Set(grupo.pedidoIds);
      return arr.filter((p) => !set.has(p?.id));
    });
    try {
      const res = await entregarPedidosListosDeMesa({
        mesaId: mesa?.id,
        ventaId,
        pedidoIds: grupo.pedidoIds,
      });
      if (res.ok) {
        toast.success(res.mensaje || `Entregado: ${grupo.nombre}`);
      } else {
        toast.error(res.mensaje || 'No se pudo entregar');
      }
      refrescarTodo();
      if (typeof onAfterEntregar === 'function') {
        try { onAfterEntregar(res); } catch (e) { console.warn('[ListosCard] cb', e); }
      }
    } catch (e) {
      console.error('[ListosParaRecogerCard] handleEntregarGrupo:', e);
      toast.error('No se pudo entregar. Intenta de nuevo.');
      refrescarTodo();
    } finally {
      setEntregando(false);
    }
  };

  return (
    <div
      className="mx-4 mt-3 rounded-xl border-2 overflow-hidden
        bg-gradient-to-b from-emerald-50 to-emerald-100
        border-emerald-400
        dark:from-emerald-950/60 dark:to-emerald-900/40
        dark:border-emerald-600/70"
      style={{
        boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 3px 10px rgba(22,163,74,0.18)',
      }}
    >
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.25) inset, 0 2px 6px rgba(22,163,74,0.4)',
          }}
        >
          <CheckCheck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-black text-sm text-emerald-900 dark:text-emerald-100 leading-tight">
            {titulo}
          </p>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/80 leading-tight">
            Recoge y entrega al cliente
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleEntregar}
          disabled={entregando}
          className="h-8 px-3 text-xs font-bold gap-1 shrink-0 text-white"
          style={{
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 6px rgba(22,163,74,0.3)',
          }}
        >
          {entregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
          {labelBoton}
        </Button>
      </div>

      {/* Subtarjetas por estación con productos. Solo se ven si hay > 1
          estación o si tiene items. Compacto para no estorbar la vista. */}
      <div className="px-3 pb-3 space-y-1.5">
        {grupos.map((g, idx) => (
          <div
            key={`${g.nombre}-${idx}`}
            className="rounded-lg border bg-white/80 dark:bg-slate-900/60 dark:border-emerald-800/50 px-2.5 py-1.5 flex items-start gap-2"
            style={{ borderLeft: `3px solid ${g.color}` }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold leading-tight" style={{ color: g.color }}>
                {g.nombre}
              </p>
              {g.items.length > 0 && (
                <p className="text-[10px] text-muted-foreground dark:text-slate-300 leading-snug">
                  {g.items.map((it) => `${it.cantidad}× ${it.producto_nombre}`).join(' · ')}
                </p>
              )}
            </div>
            {/* Botón mini para entregar SOLO esta estación, útil cuando
                hay varias listas a la vez y el mesero recoge una primero. */}
            {grupos.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleEntregarGrupo(g)}
                disabled={entregando}
                className="h-7 px-2 text-[10px] gap-1 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                title={`Entregar solo ${g.nombre}`}
              >
                Entregar
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
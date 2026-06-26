import React, { useMemo, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Clock, CheckCircle, Flame, ChefHat, Layers, AlertTriangle, History } from 'lucide-react';
import CocinaPedidoCardPremium from '@/components/cocina/CocinaPedidoCardPremium';
import CocinaMesaGroupCard from '@/components/cocina/CocinaMesaGroupCard';
import CocinaHistorialTab from '@/components/cocina/CocinaHistorialTab';
import SoundUnlockButton from '@/components/common/SoundUnlockButton';
import CocinaVozControl from '@/components/cocina/CocinaVozControl';
import CocinaNuevoPedidoWatcher from '@/components/cocina/CocinaNuevoPedidoWatcher';
import { useIsDark } from '@/lib/ThemeContext';
import { COCINA_COLS } from '@/lib/darkPalettes';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLES } from '@/lib/constants';
import { COCINA_GENERAL_COLOR } from '@/utils/estacionUtils';
import { esPedidoValidoParaCocina } from '@/utils/pedidoCocinaValido';

const ESTADOS = ['nuevo', 'en_preparacion', 'listo'];
const ESTADO_LABELS = { nuevo: 'Nuevos', en_preparacion: 'En preparación', listo: 'Listos' };

/**
 * Determina si un pedido es REALMENTE huérfano.
 *
 * Reglas estrictas para evitar falsos positivos (incluido el bug clásico de
 * "huérfano fantasma" cuando la query de ventas refetchea más lento que la
 * query de pedidos):
 *
 *  1. Si tiene venta_id Y la venta existe en BD → NO es huérfano.
 *  2. Si tiene venta_id pero la venta aún no aparece en el map cargado →
 *     NO marcamos huérfano. Puede ser un pedido recién creado mientras el
 *     map de ventas todavía no se refrescó. Damos un margen razonable.
 *  3. Si tiene mesa_id o mesa_numero → NO es huérfano: viene de una mesa real,
 *     aunque por carga lenta la venta aún no esté en el snapshot local.
 *  4. Si NO tiene venta_id, NI mesa_id, NI mesa_numero, NI mesa_nombre → entonces
 *     sí es realmente huérfano (no hay forma de relacionarlo con nada).
 *
 * NO marcamos huérfano por:
 *   - venta no presente en el map local (puede ser race condition de queries).
 *   - mesa.venta_activa_id distinto.
 *   - mesa borrada.
 *   - pedido listo/entregado pendiente de cierre.
 */
function detectarHuerfano(pedido, ventasMap) {
  if (!pedido) return false;

  // 1) Venta existente en map → NO huérfano.
  if (pedido.venta_id && ventasMap && ventasMap[pedido.venta_id]) return false;

  // 2 y 3) Cualquier identificador de mesa o venta → NO huérfano.
  if (pedido.venta_id) return false;
  if (pedido.mesa_id) return false;
  if (pedido.mesa_numero) return false;
  if (pedido.mesa_nombre) return false;
  if (pedido.venta_folio) return false;

  // 4) Sin nada de lo anterior → realmente huérfano.
  return true;
}

export default function Cocina() {
  const queryClient = useQueryClient();
  const isDark = useIsDark();
  const { posUser } = usePOSAuth();
  const { config, paquete_modo } = useConfig();
  const estacionesActivas = config?.estaciones_preparacion_activas === true;
  // BUGFIX (cross-paquete): Cocina SOLO pertenece al flujo Restaurante Pro.
  // En Esencial/Operativo no existen Mesero/Cocina/Mesas; las ventas de Caja
  // son directas y NO deben generar ni mostrar pedidos de cocina. Si el sistema
  // no está en Restaurante Pro, Cocina no muestra ningún pedido (ni activos ni
  // historial). Esto oculta pedidos viejos "contaminados" de pruebas previas
  // SIN borrar datos financieros. Caja nunca crea PedidoPreparacion, así que
  // este filtro de visualización es la corrección correcta y de menor riesgo.
  const esRestaurantePro = paquete_modo === 'restaurante_pro';

  // === F3: Decidir scope de filtro según rol + estación del usuario ===
  // - admin → ve todos.
  // - cocina con puede_ver_todas_estaciones → ve todos.
  // - cocina con estacion_preparacion_id → ve solo su estación.
  // - cocina sin nada (cuando estaciones activas) → ve nada + alerta.
  // - Otros roles (caja/mesero) entrando a /cocina → ven todos (legacy, no rompemos).
  const userScope = useMemo(() => {
    const rol = posUser?.rol;
    if (!estacionesActivas) return { mode: 'all', label: null };
    if (rol === ROLES.ADMIN) return { mode: 'all', label: 'Vista general (admin)' };
    if (rol === ROLES.KITCHEN) {
      if (posUser?.puede_ver_todas_estaciones === true) {
        return { mode: 'all', label: 'Todas las estaciones' };
      }
      if (posUser?.estacion_preparacion_id) {
        return {
          mode: 'station',
          stationId: posUser.estacion_preparacion_id,
          label: posUser.estacion_preparacion_nombre || 'Estación',
          color: posUser.estacion_preparacion_color || COCINA_GENERAL_COLOR,
        };
      }
      // (raro: caía a unassigned sin id ni todas)
      return { mode: 'unassigned', label: null };
    }
    // Otros roles ven todo (no rompemos legacy).
    return { mode: 'all', label: null };
  }, [posUser, estacionesActivas]);

  // === Carga de pedidos ===
  // - Modo legacy (estaciones apagadas): filtra por area:'cocina' como siempre.
  // - Modo estaciones activas: trae TODOS los pedidos activos y filtra en memoria.
  //   No usamos filter({estacion_preparacion_id: ...}) en BD porque los pedidos
  //   legacy sin ese campo desaparecerían — y el requisito es que NO desaparezcan.
  //
  // HOTFIX MÓVIL — Anti-parpadeo Preparar/Listo:
  //  - staleTime ahora 2500ms (antes 1000): protege el optimistic update de ser
  //    pisado por un refetch del polling antes de que el servidor propague el cambio.
  //  - refetchInterval 3000ms (antes 2000): da margen al backend a propagar el update.
  //  - Las acciones manuales (iniciarPedido/marcarListo) ya NO hacen refetchQueries
  //    inmediato — solo invalidan. El siguiente tick de polling traerá el dato fresco
  //    y, como el optimistic update está aplicado, los datos coinciden → sin parpadeo.
  const { data: pedidos, isPending: pedidosLoading } = useQuery({
    queryKey: ['pedidos_cocina', estacionesActivas ? 'all' : 'legacy'],
    queryFn: () => estacionesActivas
      ? base44.entities.PedidoPreparacion.list('-created_date', 500)
      : base44.entities.PedidoPreparacion.filter({ area: 'cocina' }),
    placeholderData: (prev) => prev,
    staleTime: 2500,
    refetchInterval: 3000,
  });
  const cargandoPedidos = pedidosLoading && !pedidos;

  const { data: ventas } = useQuery({
    queryKey: ['ventas_para_cocina'],
    queryFn: () => base44.entities.Venta.list('-created_date', 500),
    placeholderData: (prev) => prev,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  const { data: mesas } = useQuery({
    queryKey: ['mesas'],
    queryFn: () => base44.entities.Mesa.list('-created_date', 500),
    placeholderData: (prev) => prev,
    staleTime: 20000,
    refetchInterval: 30000,
  });

  const ventasMap = useMemo(() => {
    const m = {};
    (Array.isArray(ventas) ? ventas : []).forEach(v => { if (v?.id) m[v.id] = v; });
    return m;
  }, [ventas]);

  // eslint-disable-next-line no-unused-vars
  const mesasMap = useMemo(() => {
    const m = {};
    (Array.isArray(mesas) ? mesas : []).forEach(x => { if (x?.id) m[x.id] = x; });
    return m;
  }, [mesas]);

  // Conocer si la estación del usuario es "Cocina general" (es_general:true).
  // Si lo es, también debe ver pedidos legacy sin estacion_preparacion_id
  // y pedidos que cayeron a fallback (sin id pero etiquetados Cocina general).
  const { data: estacionesAll = [] } = useQuery({
    queryKey: ['estaciones_preparacion_activas'],
    queryFn: () => base44.entities.EstacionPreparacion.filter({ activo: true }),
    initialData: [],
    enabled: estacionesActivas,
  });
  const userEsCocinaGeneral = useMemo(() => {
    if (userScope.mode !== 'station') return false;
    const est = (Array.isArray(estacionesAll) ? estacionesAll : []).find(
      (e) => e?.id === userScope.stationId
    );
    return est?.es_general === true;
  }, [userScope, estacionesAll]);

  // === F3: Filtrado por estación del usuario ===
  // Los pedidos sin estacion_preparacion_id se consideran "Cocina general" /
  // legacy. Se muestran siempre en vista 'all'. En vista 'station' solo se
  // muestran si el usuario es de la estación general.
  const pedidosFiltrados = useMemo(() => {
    const arr0 = Array.isArray(pedidos) ? pedidos : [];
    // BUGFIX cross-paquete: fuera de Restaurante Pro, Cocina no muestra pedidos.
    if (!esRestaurantePro) return [];
    // BUGFIX pedidos "Mostrador": dentro de Pro, ocultar pedidos que NO sean
    // del flujo real de cocina (mesero / portal_qr con venta y mesa). Esto
    // oculta pedidos viejos de mostrador/caja SIN borrarlos.
    const arr = arr0.filter((p) => esPedidoValidoParaCocina(p, esRestaurantePro));
    if (userScope.mode === 'unassigned') return [];
    if (userScope.mode === 'all') return arr;
    if (userScope.mode === 'station') {
      return arr.filter((p) => {
        // Match directo por id
        if (p?.estacion_preparacion_id === userScope.stationId) return true;
        // Pedido legacy / fallback sin estacion_preparacion_id → solo lo ve
        // el cocinero de la estación 'Cocina general'.
        if (!p?.estacion_preparacion_id && userEsCocinaGeneral) return true;
        return false;
      });
    }
    return arr;
  }, [pedidos, userScope, userEsCocinaGeneral, esRestaurantePro]);

  const activos = useMemo(
    () => (Array.isArray(pedidosFiltrados) ? pedidosFiltrados : []).filter(
      p => !['entregado', 'cancelado'].includes(p?.estado)
    ),
    [pedidosFiltrados]
  );

  const byEstado = useMemo(() => ESTADOS.reduce((acc, s) => {
    acc[s] = activos.filter(p => p?.estado === s);
    return acc;
  }, {}), [activos]);

  // F3.1: helper de actualización optimista del cache local de pedidos.
  // Aplica un cambio (partial) al pedido con id=pedidoId en TODAS las queries
  // cuyo key comienza por 'pedidos_cocina' (cualquier sub-key como 'all'/'legacy').
  const optimisticPatchPedido = (pedidoId, patch) => {
    try {
      queryClient.setQueriesData({ queryKey: ['pedidos_cocina'] }, (oldData) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((p) => (p?.id === pedidoId ? { ...p, ...patch } : p));
      });
    } catch (err) {
      console.warn('[Cocina] optimisticPatch:', err);
    }
  };

  // HOTFIX MÓVIL — Anti-doble-click guards síncronos.
  // En móvil un doble tap rápido puede disparar dos invocaciones antes de que
  // React aplique disabled del botón. Usamos un Set de ids "en vuelo" como guard
  // síncrono que rechaza la segunda llamada antes de cualquier async.
  const enVueloRef = useRef(new Set());

  const iniciarPedido = async (pedido) => {
    if (!pedido?.id) return;
    const guardKey = `iniciar:${pedido.id}`;
    if (enVueloRef.current.has(guardKey)) return;
    enVueloRef.current.add(guardKey);
    const ahora = new Date().toISOString();
    // 1) UI optimista: mover a "en_preparacion" inmediatamente.
    optimisticPatchPedido(pedido.id, { estado: 'en_preparacion', fecha_inicio: ahora });
    try {
      await base44.entities.PedidoPreparacion.update(pedido.id, {
        estado: 'en_preparacion',
        fecha_inicio: ahora,
      });
      if (pedido.mesa_id) {
        await base44.entities.Mesa.update(pedido.mesa_id, { estado: 'en_preparacion' }).catch(() => {});
      }
      // HOTFIX MÓVIL anti-parpadeo: NO hacemos refetchQueries inmediato.
      // El optimistic update ya muestra el cambio. El polling natural
      // (cada 3s) traerá la confirmación del servidor sin pisar la UI.
      // Solo invalidamos para marcar el cache como stale.
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['mesas'], refetchType: 'none' });
      toast.success('Pedido en preparación');
    } catch (e) {
      // Si falla, recargamos de BD para revertir el optimistic update.
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
      toast.error('No se pudo iniciar el pedido: ' + (e?.message || ''));
    } finally {
      enVueloRef.current.delete(guardKey);
    }
  };

  const marcarListo = async (pedido) => {
    if (!pedido?.id) return;
    const guardKey = `listo:${pedido.id}`;
    if (enVueloRef.current.has(guardKey)) return;
    enVueloRef.current.add(guardKey);
    const ahora = new Date().toISOString();
    // 1) UI optimista: mover a "listo" inmediatamente.
    optimisticPatchPedido(pedido.id, { estado: 'listo', fecha_listo: ahora });
    try {
      await base44.entities.PedidoPreparacion.update(pedido.id, {
        estado: 'listo',
        fecha_listo: ahora,
      });
      // F3: solo movemos la mesa a 'en_espera_entrega' si TODOS los pedidos
      // de esa mesa están listos. Si una estación termina pero otra sigue,
      // la mesa no debe cambiar de estado todavía.
      if (pedido.mesa_id && pedido.venta_id) {
        try {
          const pedidosMesa = await base44.entities.PedidoPreparacion.filter({ venta_id: pedido.venta_id }).catch(() => []);
          const arr = Array.isArray(pedidosMesa) ? pedidosMesa : [];
          const otrosActivos = arr.filter(
            (p) => p && p.id !== pedido.id &&
              !['entregado', 'cancelado', 'listo'].includes(p?.estado)
          );
          if (otrosActivos.length === 0) {
            // Todos los demás están listos/entregados/cancelados → marcar mesa lista.
            await base44.entities.Mesa.update(pedido.mesa_id, { estado: 'en_espera_entrega' }).catch(() => {});
          }
        } catch (e) {
          console.warn('[Cocina] revisar pedidos mesa:', e);
        }
      }
      // HOTFIX MÓVIL anti-parpadeo: invalidamos sin forzar refetch.
      // El polling natural (3s) y el polling del Mesero (1.5s para listos)
      // reflejarán el cambio sin pisar el optimistic update.
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['mesas'], refetchType: 'none' });
      // El card del Mesero usa polling propio de 1500ms — al invalidar (sin
      // forzar refetch) el siguiente tick lo traerá fresco. Forzar aquí podría
      // generar pisado de optimistic update si Mesero hace setQueryData en paralelo.
      queryClient.invalidateQueries({ queryKey: ['pedidos_listos_mesero'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['pedidos_listos_watcher'], refetchType: 'none' });
      toast.success('¡Pedido listo!');
    } catch (e) {
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
      toast.error('No se pudo marcar listo: ' + (e?.message || ''));
    } finally {
      enVueloRef.current.delete(guardKey);
    }
  };

  // Quitar un pedido de "Listos" como emergencia (mesero se olvidó de dar
  // "Entregado"). NO borra venta, NO toca inventario, NO afecta caja.
  const quitarPedidoListo = async (pedido) => {
    if (!pedido?.id) return;
    const guardKey = `quitar:${pedido.id}`;
    if (enVueloRef.current.has(guardKey)) return;
    enVueloRef.current.add(guardKey);
    const ahora = new Date().toISOString();
    // 1) UI optimista: marcar como entregado para que desaparezca del tablero.
    optimisticPatchPedido(pedido.id, {
      estado: 'entregado',
      fecha_entregado: ahora,
      ...(pedido.fecha_listo ? {} : { fecha_listo: ahora }),
    });
    try {
      await base44.entities.PedidoPreparacion.update(pedido.id, {
        estado: 'entregado',
        fecha_entregado: ahora,
        ...(pedido.fecha_listo ? {} : { fecha_listo: ahora }),
      });
      // HOTFIX MÓVIL: invalidamos sin forzar refetch (anti-parpadeo).
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'], refetchType: 'none' });
      toast.success('Pedido quitado de la lista');
    } catch (e) {
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
      toast.error('No se pudo quitar el pedido: ' + (e?.message || ''));
    } finally {
      enVueloRef.current.delete(guardKey);
    }
  };

  // Historial visible solo para usuarios con vista 'all' (admin, cocina con
  // puede_ver_todas_estaciones, o modo legacy sin estaciones). Una estación
  // específica NO ve historial global — respeta scope de pedidos activos.
  // IMPORTANTE: hooks ANTES de cualquier early return (rules-of-hooks).
  const puedeVerHistorial = esRestaurantePro && userScope.mode === 'all';
  const [vista, setVista] = useState('activos'); // 'activos' | 'historial'

  // BUGFIX cross-paquete: si NO es Restaurante Pro, Cocina queda vacía con un
  // aviso claro. No mostramos columnas ni historial: esos pedidos pertenecen
  // a un flujo que este paquete no usa.
  if (!esRestaurantePro) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-heading font-bold">Cocina</h1>
            <p className="text-xs text-muted-foreground">Disponible solo en Restaurante Pro</p>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-600" />
          <p className="font-bold text-base text-amber-900 dark:text-amber-200 mb-1">
            Cocina no se usa en este paquete
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Los paquetes Esencial y Operativo trabajan con venta directa de mostrador, sin Mesero ni Cocina.
            Las ventas de Caja se registran en Ventas, Registros y Corte de caja con normalidad.
          </p>
        </div>
      </div>
    );
  }

  // === F3: Pantalla especial si el usuario es cocina sin estación asignada ===
  if (userScope.mode === 'unassigned') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-heading font-bold">Cocina</h1>
            <p className="text-xs text-muted-foreground">Sin estación asignada</p>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-600" />
          <p className="font-bold text-base text-amber-900 dark:text-amber-200 mb-1">
            Este usuario de cocina no tiene estación asignada
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Pide al administrador que te asigne una estación o te marque como "Todas las estaciones" en
            <strong> Configuración → Usuarios POS</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #E68A33 0%, #B8651F 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
          <ChefHat className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-heading font-bold leading-tight">
            Cocina
            {userScope.mode === 'station' && userScope.label && (
              <span
                className="inline-flex items-center gap-1 ml-2 text-xs font-semibold px-2 py-0.5 rounded-full border align-middle"
                style={{
                  borderColor: (userScope.color || COCINA_GENERAL_COLOR) + '66',
                  color: userScope.color || COCINA_GENERAL_COLOR,
                  background: (userScope.color || COCINA_GENERAL_COLOR) + '15',
                }}
              >
                <Layers className="w-3 h-3" />
                {userScope.label}
              </span>
            )}
            {userScope.mode === 'all' && userScope.label && estacionesActivas && (
              <span className="inline-flex items-center gap-1 ml-2 text-xs font-semibold px-2 py-0.5 rounded-full border align-middle bg-primary/10 text-primary border-primary/30">
                <Layers className="w-3 h-3" />
                {userScope.label}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">{activos.length} pedido(s) activos</p>
        </div>
        <CocinaVozControl />
        <SoundUnlockButton />
      </div>

      {/* Watcher local: reproduce voz/sonido SOLO para pedidos NUEVOS, nunca para "listo". */}
      <CocinaNuevoPedidoWatcher pedidos={pedidosFiltrados} />

      {/* Tabs Activos / Historial — solo si el usuario ve todas las estaciones.
          Estación específica NO ve historial global para respetar privacidad
          operativa entre estaciones. */}
      {puedeVerHistorial && (
        <div className="flex gap-1.5 border-b">
          <button
            type="button"
            onClick={() => setVista('activos')}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              vista === 'activos'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChefHat className="w-4 h-4 inline mr-1" />
            Activos
          </button>
          <button
            type="button"
            onClick={() => setVista('historial')}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              vista === 'historial'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-4 h-4 inline mr-1" />
            Historial
          </button>
        </div>
      )}

      {/* Vista Historial — solo lectura, no afecta flujo activo */}
      {puedeVerHistorial && vista === 'historial' && (
        <CocinaHistorialTab
          userScope={userScope}
          userEsCocinaGeneral={userEsCocinaGeneral}
          esRestaurantePro={esRestaurantePro}
        />
      )}

      {/* F3.1: vista "tipo llaves" SOLO cuando estaciones activas + modo all.
          En el resto de casos (estación específica, legacy) se renderiza la
          tarjeta clásica CocinaPedidoCardPremium intacta. */}
      {(!puedeVerHistorial || vista === 'activos') && (
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {ESTADOS.map(estado => {
          const ICONS = { nuevo: Clock, en_preparacion: Flame, listo: CheckCircle };
          const baseColors = (isDark ? COCINA_COLS.dark : COCINA_COLS.light)[estado];
          const colors = { ...baseColors, Icon: ICONS[estado] };
          const C = colors.Icon;
          const innerShadow = isDark
            ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 14px rgba(0,0,0,0.45)'
            : '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px rgba(0,0,0,0.08)';

          const pedidosCol = Array.isArray(byEstado[estado]) ? byEstado[estado] : [];

          // Modo "tipo llaves" solo si estaciones activas Y el usuario ve todas.
          const usarVistaLlaves = estacionesActivas && userScope.mode === 'all';

          // Agrupar por mesa cuando aplica. Sin mesa_id válido → grupo "sin-mesa".
          let grupos = null;
          if (usarVistaLlaves) {
            const map = new Map();
            pedidosCol.forEach((p) => {
              const k = p?.mesa_id || `__nomesa__${p?.id || Math.random()}`;
              if (!map.has(k)) map.set(k, []);
              map.get(k).push(p);
            });
            // Ordenar grupos por el pedido más antiguo (para que la mesa que
            // lleva más tiempo esperando aparezca arriba).
            grupos = Array.from(map.entries()).sort((a, b) => {
              const fa = a[1].reduce((min, p) => {
                const t = p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : Infinity;
                return Math.min(min, t);
              }, Infinity);
              const fb = b[1].reduce((min, p) => {
                const t = p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : Infinity;
                return Math.min(min, t);
              }, Infinity);
              return fa - fb;
            });
          }

          return (
            <div key={estado}
              className="premium-sheen flex-1 rounded-2xl p-3"
              style={{
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                boxShadow: innerShadow,
              }}>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: colors.border + '40' }}>
                <C className="w-4 h-4" style={{ color: colors.border }} />
                <h3 className="font-heading font-bold" style={{ color: colors.text }}>{ESTADO_LABELS[estado]}</h3>
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: colors.border, color: 'white' }}>
                  {pedidosCol.length}
                </span>
              </div>
              <div className="space-y-2">
                {usarVistaLlaves ? (
                  grupos.map(([key, pedidosMesa]) => (
                    <CocinaMesaGroupCard
                      key={`mesa-${key}-${estado}`}
                      pedidos={pedidosMesa}
                      onIniciar={iniciarPedido}
                      onListo={marcarListo}
                      onQuitarListo={quitarPedidoListo}
                    />
                  ))
                ) : (
                  pedidosCol.map(pedido => (
                    <CocinaPedidoCardPremium
                      key={pedido.id}
                      pedido={pedido}
                      onIniciar={iniciarPedido}
                      onListo={marcarListo}
                      isHuerfano={detectarHuerfano(pedido, ventasMap)}
                      onQuitarListo={quitarPedidoListo}
                      // En estación específica con estaciones activas no
                      // mostramos badge (el usuario ya sabe su estación).
                      mostrarEstacionBadge={false}
                    />
                  ))
                )}
                {pedidosCol.length === 0 && (
                  cargandoPedidos ? (
                    <div className="text-center py-8 text-sm opacity-60" style={{ color: colors.text }}>Cargando pedidos…</div>
                  ) : (
                    <div className="text-center py-8 text-sm opacity-50" style={{ color: colors.text }}>Sin pedidos</div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
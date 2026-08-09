import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTerminal } from '@/lib/TerminalContext';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cake, Plus, Search } from 'lucide-react';
import SucursalBadge from '@/components/common/SucursalBadge';
import PedidoPastelCard from '@/components/pedidos/PedidoPastelCard';
import PedidoPastelDetalleDialog from '@/components/pedidos/PedidoPastelDetalleDialog';
import { useConfig } from '@/lib/ConfigContext';
import { ESTADOS_PEDIDO } from '@/utils/pedidoPastelUtils';
import { paletaSucursal } from '@/utils/coloresSucursal';

// Página de gestión de Pedidos de Pastel Personalizado (Fase 3).
// Filtrada por sucursal efectiva (dueño global = todas).
export default function PedidosPastel() {
  const { sucursalEfectiva, adminRole } = useTerminal();
  const { hayCaja } = useCajaAbierta();
  const { config } = useConfig();
  const sucId = sucursalEfectiva?.sucursal_id || null;
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const [filtroFecha, setFiltroFecha] = useState('todos');
  const [filtroOrigen, setFiltroOrigen] = useState('todos');
  const [pedidoVer, setPedidoVer] = useState(null);

  // FASE 1 — modo pastelero: ve TODAS las sucursales (sucId=null). Tabs para filtrar por una.
  const esPastelero = adminRole === 'pastelero';
  const [sucursalTab, setSucursalTab] = useState('todas');

  // Sucursales activas (dinámicas, ordenadas) para los tabs — solo el pastelero las necesita.
  const { data: sucursalesRaw } = useQuery({
    // Clave PROPIA (no 'sucursales_activas' a secas): otro componente usa esa clave con un queryFn
    // distinto (sin ordenar) → colisión de caché defeatearía el orden por orden_visual. Convención
    // del repo: sufijo por pantalla (p.ej. 'sucursales_activas_webpublica').
    queryKey: ['sucursales_activas_pedidos_pastel'],
    queryFn: async () => {
      const list = await base44.entities.Sucursal.filter({ activa: true });
      const arr = Array.isArray(list) ? list : [];
      arr.sort((a, b) => (Number(a?.orden_visual) || 0) - (Number(b?.orden_visual) || 0));
      return arr;
    },
    enabled: esPastelero,
    staleTime: 60000,
  });
  const sucursales = Array.isArray(sucursalesRaw) ? sucursalesRaw : [];

  // HALLAZGO 2 (límite 100): cuando el pastelero elige UNA sucursal, la query trae ESA sucursal
  // (por ID) en vez de filtrar en memoria sobre 100 GLOBALES. Para el resto de roles
  // `sucIdQuery === sucId` → mismo alcance de sucursal que hoy.
  const sucIdQuery = (esPastelero && sucursalTab !== 'todas') ? sucursalTab : sucId;

  // FASE B (v1.1.1): quitar el techo de 100 que ocultaba pedidos ACTIVOS. Antes se traían 100
  // (orden fecha_entrega) y el estado se filtraba EN MEMORIA → un activo con fecha_entrega lejana
  // quedaba fuera de la ventana de 100. Ahora el estado se filtra EN EL SERVIDOR:
  //  - 'activos' (default) → `$nin [entregado, cancelado]` (negativo, casa EXACTO con el filtro en
  //    memoria 'activos') → trae TODOS los activos sin importar la fecha, ninguno oculto.
  //  - un estado concreto → ese estado.  - 'todos' → sin filtro de estado.
  // + límite holgado (500) de respaldo: los activos reales de una pastelería caben de sobra. El
  // filtro en memoria (`filtrados`) queda como cinturón+tirantes. El adaptador soporta $nin (línea 78).
  const estadoCriteria =
    filtroEstado === 'activos' ? { estado: { $nin: ['entregado', 'cancelado'] } }
    : (filtroEstado !== 'todos' ? { estado: filtroEstado } : {});

  const { data: pedidosRaw, isLoading } = useQuery({
    queryKey: ['pedidos_pastel', sucIdQuery, filtroEstado],
    queryFn: () => base44.entities.PedidoPastel.filter(
      { ...(sucIdQuery ? { sucursal_id: sucIdQuery } : {}), ...estadoCriteria },
      'fecha_entrega',
      500,
    ),
    placeholderData: (prev) => prev,
    staleTime: 5000,
    // MINI-FIX notificaciones — refresca cada 15s para que un pedido web nuevo
    // aparezca en <20s sin recargar la app ni cambiar de sección.
    refetchInterval: 15000,
  });
  const pedidos = Array.isArray(pedidosRaw) ? pedidosRaw : [];

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10);
    const en7 = new Date(hoy.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const en30 = new Date(hoy.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    return pedidos.filter(p => {
      if (!p) return false;
      // CAMBIO 4c — Los pedidos de catálogo web NO aparecen aquí (van a Caja).
      // Solo pastel_personalizado. Pedidos legacy sin tipo_pedido se tratan
      // como personalizados (default histórico).
      if (p.tipo_pedido === 'productos_catalogo') return false;
      // FASE 1 — filtro por sucursal (modo pastelero), por sucursal_id (robusto, NO por nombre).
      // 'todas' no filtra. La query ya trae solo esa sucursal; esto es cinturón+tirantes.
      if (esPastelero && sucursalTab !== 'todas' && p.sucursal_id !== sucursalTab) return false;
      // Estado: por defecto solo activos (sin entregado/cancelado)
      if (filtroEstado === 'activos') {
        if (p.estado === 'entregado' || p.estado === 'cancelado') return false;
      } else if (filtroEstado !== 'todos' && p.estado !== filtroEstado) {
        return false;
      }
      // Origen (POS interno vs Web)
      if (filtroOrigen !== 'todos' && p.origen !== filtroOrigen) return false;
      // Fecha de entrega
      const fe = p.fecha_entrega || '';
      if (filtroFecha === 'hoy' && fe !== hoyStr) return false;
      if (filtroFecha === 'semana' && (fe < hoyStr || fe > en7)) return false;
      if (filtroFecha === 'mes' && (fe < hoyStr || fe > en30)) return false;
      // Búsqueda de texto
      if (q) {
        const blob = `${p.folio || ''} ${p.cliente_nombre || ''} ${p.cliente_telefono || ''} ${p.nota_interna || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [pedidos, busqueda, filtroEstado, filtroFecha, filtroOrigen, esPastelero, sucursalTab]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(330,70%,55%) 0%, hsl(330,70%,42%) 100%)' }}>
            <Cake className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-display font-bold">Pedidos de Pastel</h1>
          <SucursalBadge sucursalEfectiva={sucursalEfectiva} />
        </div>
        {/* El pastelero puede editar la nota y avanzar estados (0060), pero SIGUE sin
            poder CREAR pedidos (la política nueva es sólo FOR UPDATE): "Nuevo pedido"
            se mantiene oculto para no ofrecerle un botón que va a fallar. */}
        {!esPastelero && (hayCaja ? (
          <Link to="/pedidos-pastel/nuevo">
            <Button className="h-11 px-5 w-full sm:w-auto"
              style={{ background: 'linear-gradient(135deg, hsl(330,70%,55%) 0%, hsl(330,70%,42%) 100%)' }}>
              <Plus className="w-5 h-5 mr-1.5" />Nuevo pedido de pastel
            </Button>
          </Link>
        ) : (
          <Button disabled className="h-11 px-5 w-full sm:w-auto opacity-50"
            onClick={() => toast.error('Abre la caja para crear pedidos de pastel.')}>
            <Plus className="w-5 h-5 mr-1.5" />Nuevo pedido (caja cerrada)
          </Button>
        ))}
      </div>

      {/* FASE 1 — Tabs de sucursal SOLO en modo pastelero (lee todas las sucursales).
          Patrón visual de los tabs del mostrador (POS.jsx) + color por sucursal (helper).
          Responsive: overflow-x-auto para teléfono/tablet/POS. */}
      {esPastelero && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            variant={sucursalTab === 'todas' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSucursalTab('todas')}
            className="shrink-0"
          >
            Todas
          </Button>
          {sucursales.map((s) => {
            const activo = sucursalTab === s.id;
            const pal = paletaSucursal(s.nombre);
            return (
              <Button
                key={s.id}
                variant="outline"
                size="sm"
                onClick={() => setSucursalTab(s.id)}
                className={`shrink-0 ${activo ? pal.activo : pal.badge}`}
              >
                {s.nombre}
              </Button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative sm:col-span-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, cliente, teléfono o nota interna..."
            className="pl-9 h-11"
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos (sin entregados/cancelados)</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroFecha} onValueChange={setFiltroFecha}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Entrega" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Cualquier fecha</SelectItem>
            <SelectItem value="hoy">Entrega hoy</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="mes">Este mes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroOrigen} onValueChange={setFiltroOrigen}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Origen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los pedidos</SelectItem>
            <SelectItem value="pos_interno">Solo POS interno</SelectItem>
            <SelectItem value="web">Solo Web 🌐</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading && pedidos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="w-8 h-8 mx-auto border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin mb-3" />
          Cargando pedidos…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Cake className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay pedidos que coincidan</p>
          <p className="text-xs mt-1">Crea uno con "+ Nuevo pedido de pastel"</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(p => (
            <PedidoPastelCard key={p.id} pedido={p} onVer={setPedidoVer} mostrarSucursal={!sucId} />
          ))}
        </div>
      )}

      {/* Unificado: todo pastel personalizado (web o POS interno) abre el mismo
          modal — ticket Confetti arriba + botones de acción abajo. */}
      <PedidoPastelDetalleDialog
        pedido={pedidoVer}
        open={!!pedidoVer}
        onClose={() => setPedidoVer(null)}
      />
    </div>
  );
}
import React, { useState, useMemo, useEffect } from 'react';
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
import { ESTADOS_PEDIDO, fechaCDMX } from '@/utils/pedidoPastelUtils';
import { paletaSucursal } from '@/utils/coloresSucursal';

const ACCESOS_ESTADO = [
  { value: 'activos', label: 'Por entregar' },
  { value: 'entregado', label: 'Entregados' },
  { value: 'todos', label: 'Todos' },
];
const ACCESOS_PAGO = [
  { value: 'con_abono', label: 'Con abono' },
  { value: 'sin_abono', label: 'Sin abono' },
  { value: 'todos', label: 'Todos' },
];
const ACCESOS_FECHA = [
  { value: 'manana', label: 'Mañana' },
  { value: 'pasado_manana', label: 'Pasado mañana' },
  { value: 'semana', label: '7 días' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'todos', label: 'Todas' },
];
const COLORES_FILA = {
  pedidos: {
    fila: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    titulo: 'text-amber-900 dark:text-amber-200',
    activo: 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700 hover:text-white',
  },
  pagos: {
    fila: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
    titulo: 'text-emerald-900 dark:text-emerald-200',
    activo: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white',
  },
  fecha: {
    fila: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
    titulo: 'text-blue-900 dark:text-blue-200',
    activo: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white',
  },
};

function AccesosRapidos({ titulo, tono, opciones, valor, onChange }) {
  const colores = COLORES_FILA[tono];
  return (
    <div role="group" aria-label={titulo} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${colores.fila}`}>
      <p className={`w-14 shrink-0 text-xs font-semibold ${colores.titulo}`}>{titulo}</p>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {opciones.map(({ value, label }) => (
          <Button key={value} type="button" variant="outline" aria-pressed={valor === value}
            onClick={() => onChange(value)}
            className={`h-10 shrink-0 whitespace-nowrap px-2.5 text-xs font-semibold sm:text-sm ${
              valor === value ? colores.activo : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >{label}</Button>
        ))}
      </div>
    </div>
  );
}

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
  const [filtroPago, setFiltroPago] = useState('todos');
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

  // La sucursal seleccionada forma parte de la query y del filtro local de seguridad.
  const sucIdQuery = (esPastelero && sucursalTab !== 'todas') ? sucursalTab : sucId;

  // El detalle no debe volver a abrirse al cambiar entre sucursales.
  useEffect(() => { setPedidoVer(null); }, [sucIdQuery]);

  // El estado se filtra en el servidor, pero se recorren TODAS las páginas.
  // El viejo límite de 500 estaba a punto de ocultar los pedidos más recientes
  // del historial. id es único: mantiene el orden estable entre páginas.
  const estadoCriteria =
    filtroEstado === 'activos' ? { estado: { $nin: ['entregado', 'cancelado'] } }
    : (filtroEstado !== 'todos' ? { estado: filtroEstado } : {});

  const { data: pedidosRaw, isLoading, isError, refetch } = useQuery({
    queryKey: ['pedidos_pastel', sucIdQuery, filtroEstado],
    queryFn: async () => {
      const criteria = { ...(sucIdQuery ? { sucursal_id: sucIdQuery } : {}), ...estadoCriteria };
      const rows = await base44.entities.PedidoPastel.filterAll(criteria, 'id');
      return rows.sort((a, b) =>
        (a.fecha_entrega || '\uffff').localeCompare(b.fecha_entrega || '\uffff') || a.id.localeCompare(b.id));
    },
    // Al cambiar de sucursal o estado no mostrar pedidos de la consulta anterior.
    staleTime: 5000,
    // MINI-FIX notificaciones — refresca cada 15s para que un pedido web nuevo
    // aparezca en <20s sin recargar la app ni cambiar de sección.
    refetchInterval: 15000,
  });
  const pedidos = Array.isArray(pedidosRaw) ? pedidosRaw : [];

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const hoyStr = fechaCDMX();
    const manana = fechaCDMX(1);
    const pasadoManana = fechaCDMX(2);
    const en7 = fechaCDMX(7);
    const en30 = fechaCDMX(30);
    return pedidos.filter(p => {
      if (!p) return false;
      // CAMBIO 4c — Los pedidos de catálogo web NO aparecen aquí (van a Caja).
      // Solo pastel_personalizado. Pedidos legacy sin tipo_pedido se tratan
      // como personalizados (default histórico).
      if (p.tipo_pedido === 'productos_catalogo') return false;
      // También valida la sucursal sobre filas del caché, sin importar el rol.
      if (sucIdQuery && p.sucursal_id !== sucIdQuery) return false;
      // Estado: por defecto solo activos (sin entregado/cancelado)
      if (filtroEstado === 'activos') {
        if (p.estado === 'entregado' || p.estado === 'cancelado') return false;
      } else if (filtroEstado !== 'todos' && p.estado !== filtroEstado) {
        return false;
      }
      const abonado = Number(p.total_abonado ?? p.a_cuenta ?? 0);
      if (filtroPago === 'con_abono' && !(abonado > 0)) return false;
      if (filtroPago === 'sin_abono' && abonado > 0) return false;
      // Origen (POS interno vs Web)
      if (filtroOrigen !== 'todos' && p.origen !== filtroOrigen) return false;
      // Fecha de entrega
      const fe = p.fecha_entrega || '';
      if (filtroFecha === 'hoy' && fe !== hoyStr) return false;
      if (filtroFecha === 'manana' && fe !== manana) return false;
      if (filtroFecha === 'pasado_manana' && fe !== pasadoManana) return false;
      if (filtroFecha === 'semana' && (fe < hoyStr || fe > en7)) return false;
      if (filtroFecha === 'mes' && (fe < hoyStr || fe > en30)) return false;
      // Búsqueda de texto
      if (q) {
        const blob = `${p.folio || ''} ${p.cliente_nombre || ''} ${p.cliente_telefono || ''} ${p.nota_interna || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [pedidos, busqueda, filtroEstado, filtroFecha, filtroPago, filtroOrigen, sucIdQuery]);

  // Si se cambia de sucursal mientras un detalle está abierto, no conservar
  // una acción sobre un pedido de otra sucursal.
  const pedidoVisible = pedidoVer && (!sucIdQuery || pedidoVer.sucursal_id === sucIdQuery)
    ? pedidoVer : null;

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

      {/* Filtros detallados, independientes de los accesos rápidos. */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative sm:col-span-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => {
              setBusqueda(e.target.value);
              // El cliente puede volver meses después: al buscar, abrir el
              // historial completo y quitar un filtro de fecha olvidado.
              if (e.target.value.trim()) {
                if (filtroEstado !== 'todos') setFiltroEstado('todos');
                if (filtroFecha !== 'todos') setFiltroFecha('todos');
                if (filtroPago !== 'todos') setFiltroPago('todos');
                if (filtroOrigen !== 'todos') setFiltroOrigen('todos');
              }
            }}
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
            <SelectItem value="manana">Entrega mañana</SelectItem>
            <SelectItem value="pasado_manana">Entrega pasado mañana</SelectItem>
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

      <div className="space-y-1.5" aria-label="Accesos rápidos a filtros">
        <AccesosRapidos titulo="Pedidos" tono="pedidos" opciones={ACCESOS_ESTADO}
          valor={filtroEstado} onChange={setFiltroEstado} />
        <AccesosRapidos titulo="Pagos" tono="pagos" opciones={ACCESOS_PAGO}
          valor={filtroPago} onChange={setFiltroPago} />
        <AccesosRapidos titulo="Entrega" tono="fecha" opciones={ACCESOS_FECHA}
          valor={filtroFecha} onChange={setFiltroFecha} />
      </div>

      {!isLoading && !isError && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtrados.length} {filtrados.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
          {sucIdQuery ? ` · ${sucursalEfectiva?.sucursal_nombre || sucursales.find(s => s.id === sucIdQuery)?.nombre || 'Sucursal seleccionada'}` : ' · Todas las sucursales'}
        </p>
      )}

      {isError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          No se pudo actualizar la lista de pedidos. Puede estar incompleta.
          <button className="ml-3 underline" onClick={() => { void refetch(); }}>Reintentar</button>
        </div>
      )}

      {/* Lista */}
      {isLoading && pedidos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="w-8 h-8 mx-auto border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin mb-3" />
          Cargando pedidos…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Cake className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{isError ? 'No se pudo cargar la lista' : 'No hay pedidos que coincidan'}</p>
          {!isError && <p className="text-xs mt-1">
            {busqueda.trim()
              ? 'Comprueba el folio y la sucursal antes de capturar otro pedido.'
              : 'Crea uno con "+ Nuevo pedido de pastel"'}
          </p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(p => (
            <PedidoPastelCard key={p.id} pedido={p} onVer={setPedidoVer} mostrarSucursal={!sucIdQuery} />
          ))}
        </div>
      )}

      {/* Unificado: todo pastel personalizado (web o POS interno) abre el mismo
          modal — ticket Confetti arriba + botones de acción abajo. */}
      <PedidoPastelDetalleDialog
        pedido={pedidoVisible}
        open={!!pedidoVisible}
        onClose={() => setPedidoVer(null)}
      />
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
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
import { cargarPaginaPedidos } from '@/lib/pedidosAnteriores';

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
const ACCESOS_HORA = [
  { value: 'todos', label: 'Todas las horas' },
  { value: 'manana', label: 'Antes de 12:00' },
  { value: 'tarde', label: '12:00–17:59' },
  { value: 'noche', label: 'Desde 18:00' },
  { value: 'sin_hora', label: 'Sin hora' },
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
  hora: {
    fila: 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30',
    titulo: 'text-violet-900 dark:text-violet-200',
    activo: 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 hover:text-white',
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
            className={`h-11 shrink-0 whitespace-nowrap px-2.5 text-xs font-semibold sm:text-sm ${
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
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [vista, setVista] = useState('actuales');
  const [filtroFecha, setFiltroFecha] = useState('todos');
  const [filtroHora, setFiltroHora] = useState('todos');
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
  // La cabecera refleja el tab, no el alcance global de la cuenta pastelero.
  const sucursalVista = esPastelero && sucIdQuery
    ? { sucursal_id: sucIdQuery, sucursal_nombre: sucursales.find(s => s.id === sucIdQuery)?.nombre || 'Sucursal seleccionada' }
    : sucursalEfectiva;

  // El detalle no debe volver a abrirse al cambiar entre sucursales.
  useEffect(() => { setPedidoVer(null); }, [sucIdQuery]);

  // Páginas reales por sucursal y vista: nunca descargar años de pedidos cada 15 s.
  const filtros = useMemo(() => {
    const hoy = fechaCDMX();
    const rangos = {
      hoy: [hoy, hoy], manana: [fechaCDMX(1), fechaCDMX(1)],
      pasado_manana: [fechaCDMX(2), fechaCDMX(2)], semana: [hoy, fechaCDMX(7)],
      mes: [hoy, fechaCDMX(30)],
    };
    const rango = rangos[filtroFecha] || ['', ''];
    return { estado: filtroEstado, pago: filtroPago, origen: filtroOrigen,
      desde: rango[0], hasta: rango[1], hora: filtroHora, busqueda: busqueda.trim() };
  }, [filtroEstado, filtroPago, filtroOrigen, filtroFecha, filtroHora, busqueda, fechaCDMX()]);
  const { data, isPending: isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['pedidos_pastel', 'lista', sucIdQuery, vista, filtros],
    initialPageParam: null,
    queryFn: ({ pageParam }) => cargarPaginaPedidos({ sucursal: sucIdQuery, vista, filtros, cursor: pageParam }),
    getNextPageParam: pagina => pagina.hay_mas ? pagina.siguiente : undefined,
    staleTime: 5000, refetchInterval: 15000,
  });
  const resumen = data?.pages?.[0];
  // Segunda barrera: ni una respuesta antigua de otra sucursal llega a una tarjeta.
  const filtrados = useMemo(() => {
    const vistos = new Set();
    return (data?.pages || []).flatMap(p => p.pedidos).filter(p => {
      if (!p?.id || vistos.has(p.id) || p.tipo_pedido === 'productos_catalogo' ||
          (sucIdQuery && p.sucursal_id !== sucIdQuery)) return false;
      vistos.add(p.id); return true;
    });
  }, [data, sucIdQuery]);
  const pedidos = filtrados;
  const cambiarVista = siguiente => {
    setVista(siguiente); setBusqueda(''); setFiltroEstado('todos');
    setFiltroFecha('todos'); setFiltroHora('todos'); setFiltroPago('todos'); setFiltroOrigen('todos');
    setPedidoVer(null);
  };

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
          <SucursalBadge sucursalEfectiva={sucursalVista} />
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
        <div role="group" aria-label="Sucursales" className="flex gap-2 overflow-x-auto pb-1">
          <Button
            variant={sucursalTab === 'todas' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSucursalTab('todas')}
            aria-pressed={sucursalTab === 'todas'}
            className="h-11 shrink-0"
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
                aria-pressed={activo}
                className={`h-11 shrink-0 ${activo ? pal.activo : pal.badge}`}
              >
                {s.nombre}
              </Button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Vistas de pedidos">
        <Button type="button" className="h-14 text-base font-bold" variant={vista === 'actuales' ? 'default' : 'outline'}
          aria-pressed={vista === 'actuales'} onClick={() => cambiarVista('actuales')}>
          Pedidos actuales {resumen ? `(${resumen.conteos.actuales})` : ''}
        </Button>
        <Button type="button" className="h-14 text-base font-bold" variant={vista === 'anteriores' ? 'default' : 'outline'}
          aria-pressed={vista === 'anteriores'} onClick={() => cambiarVista(vista === 'anteriores' ? 'actuales' : 'anteriores')}>
          {vista === 'anteriores' ? 'Volver a pedidos actuales' : `Pedidos anteriores${resumen ? ` (${resumen.conteos.anteriores})` : ''}`}
        </Button>
      </div>
      {resumen && vista === 'actuales' && resumen.conteos.anteriores > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-900 dark:bg-blue-950 dark:text-blue-100" role="status">
          <p className="text-sm font-semibold">{resumen.conteos.anteriores} pedidos pagados con fecha pasada están en Pedidos anteriores.</p>
          <Button type="button" variant="outline" className="mt-2 h-11" onClick={() => cambiarVista('anteriores')}>Ver pedidos anteriores</Button>
        </div>
      )}
      {vista !== 'actuales' && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
        <div><h2 className="font-bold">{vista === 'anteriores' ? 'Pedidos anteriores' : 'Historial completo'}</h2>
          <p className="text-xs text-muted-foreground">{vista === 'anteriores'
            ? 'Pagados y con dos días de margen. Tras 30 días aquí, siguen en el historial completo.'
            : 'Todos los pedidos guardados de la sucursal seleccionada. Ningún pedido se borra.'}</p></div>
        <Button type="button" variant="outline" className="h-11" onClick={() => cambiarVista('actuales')}>Volver a pedidos actuales</Button>
      </div>}
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
                setVista('historial');
                if (filtroEstado !== 'todos') setFiltroEstado('todos');
                if (filtroFecha !== 'todos') setFiltroFecha('todos');
                if (filtroHora !== 'todos') setFiltroHora('todos');
                if (filtroPago !== 'todos') setFiltroPago('todos');
                if (filtroOrigen !== 'todos') setFiltroOrigen('todos');
              }
            }}
            aria-label="Buscar en todos los pedidos de esta sucursal"
            placeholder="Buscar en todo el historial: folio, cliente o teléfono..."
            className="pl-9 h-11"
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
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
        <AccesosRapidos titulo="Pagos" tono="pagos" opciones={ACCESOS_PAGO}
          valor={filtroPago} onChange={setFiltroPago} />
        <AccesosRapidos titulo="Entrega" tono="fecha" opciones={ACCESOS_FECHA}
          valor={filtroFecha} onChange={setFiltroFecha} />
        <AccesosRapidos titulo="Horario" tono="hora" opciones={ACCESOS_HORA}
          valor={filtroHora} onChange={setFiltroHora} />
      </div>

      {!isLoading && !isError && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtrados.length} de {resumen?.total ?? filtrados.length} {resumen?.total === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
          {sucIdQuery ? ` · ${sucursalEfectiva?.sucursal_nombre || sucursales.find(s => s.id === sucIdQuery)?.nombre || 'Sucursal seleccionada'}` : ' · Todas las sucursales'}
          {' · Por fecha y hora'}
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
              : 'Prueba otra vista o cambia los filtros.'}
          </p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(p => (
            <PedidoPastelCard key={p.id} pedido={p} onVer={setPedidoVer} mostrarSucursal={!sucIdQuery} />
          ))}
        </div>
      )}

      {hasNextPage && <div className="flex justify-center">
        <Button type="button" variant="outline" className="h-12 px-6 font-bold" disabled={isFetchingNextPage}
          onClick={() => { if (!isFetchingNextPage) void fetchNextPage(); }}>
          {isFetchingNextPage ? 'Cargando más pedidos…' : 'Cargar más pedidos'}
        </Button>
      </div>}
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer py-2 text-sm font-semibold">Más opciones e historial</summary>
        <Button type="button" variant="outline" className="mt-2 h-11" onClick={() => cambiarVista('historial')}>Consultar historial completo de pedidos</Button>
        <p className="mt-2 text-xs text-muted-foreground">Los pedidos con saldo pendiente permanecen en Actuales aunque su fecha haya pasado.</p>
      </details>

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

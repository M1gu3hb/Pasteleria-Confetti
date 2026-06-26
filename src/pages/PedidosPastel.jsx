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

// Página de gestión de Pedidos de Pastel Personalizado (Fase 3).
// Filtrada por sucursal efectiva (dueño global = todas).
export default function PedidosPastel() {
  const { sucursalEfectiva } = useTerminal();
  const { hayCaja } = useCajaAbierta();
  const { config } = useConfig();
  const sucId = sucursalEfectiva?.sucursal_id || null;
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const [filtroFecha, setFiltroFecha] = useState('todos');
  const [filtroOrigen, setFiltroOrigen] = useState('todos');
  const [pedidoVer, setPedidoVer] = useState(null);

  const { data: pedidosRaw, isLoading } = useQuery({
    queryKey: ['pedidos_pastel', sucId],
    queryFn: () => sucId
      ? base44.entities.PedidoPastel.filter({ sucursal_id: sucId }, 'fecha_entrega', 100)
      : base44.entities.PedidoPastel.list('fecha_entrega', 100),
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
  }, [pedidos, busqueda, filtroEstado, filtroFecha, filtroOrigen]);

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
        {hayCaja ? (
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
        )}
      </div>

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
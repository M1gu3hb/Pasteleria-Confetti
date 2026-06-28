import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useTerminal } from '@/lib/TerminalContext';
import { sucursalIdDe } from '@/lib/sucursalQuery';
import SucursalBadge from '@/components/common/SucursalBadge';
import { hasPermission } from '@/lib/permissions';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingState from '@/components/common/LoadingState';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Receipt, Search, Trash2, AlertTriangle, Printer, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import TicketViewerDialog from '@/components/tickets/TicketViewerDialog';
import AuditoriaAjusteCuenta from '@/components/ventas/AuditoriaAjusteCuenta';
import CancelarVentaDialog from '@/components/ventas/CancelarVentaDialog';
import { Ban, RotateCcw } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { Pencil } from 'lucide-react';

const ESTADO_COLORS = {
  pagada: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-red-100 text-red-700',
  abierta: 'bg-blue-100 text-blue-700',
  en_preparacion: 'bg-orange-100 text-orange-700',
};

export default function Ventas() {
  const { posUser } = usePOSAuth();
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalIdDe(sucursalEfectiva);
  const { config } = useConfig();
  const colorize = config?.colorear_importes_monetarios !== false;
  const queryClient = useQueryClient();
  const puedeLimpiar = hasPermission(posUser?.rol, 'limpiar_ventas');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  // PARTE H — Rango de fecha por defecto: últimos 7 días (protege rendimiento).
  const [filterRango, setFilterRango] = useState('7d');
  const [selectedVenta, setSelectedVenta] = useState(null);
  const [showLimpiar, setShowLimpiar] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [limpiando, setLimpiando] = useState(false);
  const [revertirInventario, setRevertirInventario] = useState(true);
  const [verTicket, setVerTicket] = useState(null);
  // Prompt 5a — cancelar/devolver venta desde el detalle.
  const [cancelarModo, setCancelarModo] = useState(null); // 'cancelacion' | 'devolucion' | null

  // No usar initialData:[] (genera "sin ventas" antes del primer fetch).
  // FASE 2C — Se filtra por sucursal efectiva. Sin sucursal (dueño global) trae
  // todas las sucursales (.list). El límite 200 acota el volumen.
  const { data: ventas, isPending: ventasLoading } = useQuery({
    queryKey: ['ventas_all', sucId],
    queryFn: () => sucId
      ? base44.entities.Venta.filter({ sucursal_id: sucId }, '-created_date', 200)
      : base44.entities.Venta.list('-created_date', 200),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const safeVentas = Array.isArray(ventas) ? ventas : [];
  const cargandoVentas = ventasLoading && !ventas;

  const { data: detalles = [] } = useQuery({
    queryKey: ['detalles_venta', selectedVenta?.id],
    queryFn: () => base44.entities.DetalleVenta.filter({ venta_id: selectedVenta.id }),
    enabled: !!selectedVenta,
    initialData: [],
  });

  // FASE 2C — Límite de fecha por defecto (30d / hoy / todo). En memoria sobre
  // la lista ya acotada a 200. Protege rendimiento visual sin reescribir query.
  const desdeTs = useMemo(() => {
    if (filterRango === 'todo') return 0;
    const ahora = new Date();
    if (filterRango === 'hoy') {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      return d.getTime();
    }
    if (filterRango === '7d') return ahora.getTime() - 7 * 24 * 60 * 60 * 1000;
    // '30d'
    return ahora.getTime() - 30 * 24 * 60 * 60 * 1000;
  }, [filterRango]);

  const filtered = useMemo(() => {
    return safeVentas.filter(v => {
      const matchSearch = !search || v.folio?.toLowerCase().includes(search.toLowerCase()) || v.usuario_cajero_nombre?.toLowerCase().includes(search.toLowerCase());
      const matchEstado = filterEstado === 'all' || v.estado === filterEstado;
      const refIso = v.fecha_cierre || v.created_date;
      const refTs = refIso ? new Date(refIso).getTime() : 0;
      const matchFecha = desdeTs === 0 || (Number.isFinite(refTs) && refTs >= desdeTs);
      return matchSearch && matchEstado && matchFecha;
    });
  }, [safeVentas, search, filterEstado, desdeTs]);

  const totalVentas = filtered.filter(v => v.estado === 'pagada').reduce((s, v) => s + (v.total || 0), 0);

  // Fase 6 — colores de badge por sucursal (solo vista global del dueño).
  const COLORES_SUCURSAL = {
    'Xochimilco / Principal': 'bg-blue-100 text-blue-800 border-blue-300',
    'Xochimilco':             'bg-blue-100 text-blue-800 border-blue-300',
    'Topilejo':               'bg-green-100 text-green-800 border-green-300',
    'San Gregorio':           'bg-amber-100 text-amber-800 border-amber-300',
  };
  const colorSucursal = (nombre) =>
    COLORES_SUCURSAL[nombre] || 'bg-slate-100 text-slate-700 border-slate-300';

  // FASE 5 (F5) — botón muerto NEUTRALIZADO: la función de limpieza de Base44 no
  // está migrada. En vez de fallar, avisa que está desactivada.
  const handleLimpiar = async () => {
    toast.info('Función desactivada por el momento.');
    setShowLimpiar(false);
    setConfirmText('');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Historial de ventas"
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <span>{`${filtered.length} transacciones · Total: ${formatCurrency(totalVentas)}`}</span>
            <SucursalBadge sucursalEfectiva={sucursalEfectiva} />
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Actualizar
            </button>
            {puedeLimpiar && (
              <Button variant="destructive" size="sm" onClick={() => setShowLimpiar(true)}>
                <Trash2 className="w-4 h-4 mr-1" />Limpiar ventas de prueba
              </Button>
            )}
          </div>
        } />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar folio o cajero..." value={search} onChange={e => setSearch(e.target.value)} className="skeu-input pl-10" />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pagada">Pagadas</SelectItem>
            <SelectItem value="abierta">Abiertas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRango} onValueChange={setFilterRango}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoy">Hoy</SelectItem>
            <SelectItem value="7d">Últimos 7 días</SelectItem>
            <SelectItem value="30d">Últimos 30 días</SelectItem>
            <SelectItem value="todo">Todo (puede tardar más)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cargandoVentas ? (
        <LoadingState label="Cargando ventas…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="Sin ventas" description="No hay transacciones registradas aún" />
      ) : (
        <div className="space-y-2">
          {filtered.map(v => (
            <Card key={v.id} className="skeu-card rounded-2xl p-4 transition-shadow border-0">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedVenta(v)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-bold">{v.folio}</span>
                    {!sucId && v.sucursal_nombre && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorSucursal(v.sucursal_nombre)}`}>
                        {v.sucursal_nombre}
                      </span>
                    )}
                    <Badge className={`${ESTADO_COLORS[v.estado] || 'bg-gray-100 text-gray-600'} text-[10px] border-0`}>
                      {v.estado}
                    </Badge>
                    {v.estado === 'cancelada' && v.tipo_cancelacion === 'devolucion' && (
                      <Badge className="text-[10px] border-0 bg-red-600 text-white">
                        💸 Reembolso {formatCurrency(Number(v.monto_devuelto) || 0)}
                      </Badge>
                    )}
                    {v.estado === 'cancelada' && v.tipo_cancelacion === 'cancelacion' && (
                      <Badge className="text-[10px] border-0 bg-amber-100 text-amber-800">
                        Cancelada (sin devolución)
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{v.tipo_venta}</Badge>
                    {v.mesa_numero && <Badge variant="outline" className="text-[10px]">Mesa {v.mesa_numero}</Badge>}
                    {/* Badge "Cuenta ajustada" — auditoría visible en lista */}
                    {v.cuenta_ajustada && (
                      <Badge
                        className="text-[10px] border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                        title={v.ajuste_motivo ? `Motivo: ${v.ajuste_motivo}` : 'Cuenta modificada en caja'}
                      >
                        <Pencil className="w-2.5 h-2.5 mr-0.5" />
                        Cuenta ajustada
                      </Badge>
                    )}
                    {/* Valoración del comensal (Prompt 6C). Solo lectura. */}
                    {v.satisfaccion_score && v.satisfaccion_emoji && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 border text-[10px] font-semibold"
                        title={v.satisfaccion_label || ''}
                      >
                        <span className="text-sm leading-none">{v.satisfaccion_emoji}</span>
                        <span>{v.satisfaccion_label || `${v.satisfaccion_score}/5`}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {v.fecha_cierre ? format(new Date(v.fecha_cierre), "d MMM yyyy, HH:mm", { locale: es }) : 'Abierta'}
                    {v.usuario_cajero_nombre && ` · ${v.usuario_cajero_nombre}`}
                  </div>
                  {v.satisfaccion_comentario && (
                    <p className="text-[11px] italic text-muted-foreground mt-0.5 line-clamp-2">
                      💬 “{v.satisfaccion_comentario}”
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-lg text-foreground">{formatCurrency(v.total)}</p>
                  <p className="text-xs text-muted-foreground">{v.metodo_pago || '—'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setVerTicket(v); }}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Ver ticket
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* LIMPIAR DIALOG */}
      <Dialog open={showLimpiar} onOpenChange={setShowLimpiar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Limpiar ventas de prueba
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <p className="font-bold mb-1">⚠ Esta acción es irreversible</p>
              <p className="text-xs">Esto borrará <strong>todas las ventas, cobros pendientes, pedidos y cortes</strong>. Dejará el dashboard en ceros y reseteará las mesas a libre.</p>
              <p className="text-xs mt-2">No se borrarán: productos, recetas, ingredientes, inventario, configuración, usuarios ni mesas.</p>
            </div>
            <label className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/30 cursor-pointer">
              <input type="checkbox" checked={revertirInventario}
                onChange={e => setRevertirInventario(e.target.checked)} className="mt-1" />
              <div>
                <p className="text-sm font-medium">También revertir consumo de inventario</p>
                <p className="text-[11px] text-muted-foreground">Regresa al stock lo que las ventas borradas habían descontado.</p>
              </div>
            </label>
            <div>
              <p className="text-xs mb-1">Escribe <span className="font-mono font-bold">LIMPIAR</span> para confirmar:</p>
              <Input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                placeholder="LIMPIAR" className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLimpiar(false); setConfirmText(''); }}>Cancelar</Button>
            <Button variant="destructive"
              disabled={confirmText !== 'LIMPIAR' || limpiando}
              onClick={handleLimpiar}>
              {limpiando ? 'Limpiando...' : 'Confirmar limpieza'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TicketViewerDialog venta={verTicket} open={!!verTicket} onClose={() => setVerTicket(null)} />

      {/* Prompt 5a — Cancelar / Devolver venta */}
      <CancelarVentaDialog
        open={!!cancelarModo}
        modo={cancelarModo || 'cancelacion'}
        venta={selectedVenta}
        posUser={posUser}
        onClose={() => setCancelarModo(null)}
        onDone={() => {
          setCancelarModo(null);
          setSelectedVenta(null);
          queryClient.invalidateQueries({ queryKey: ['ventas_all'] });
        }}
      />

      <Dialog open={!!selectedVenta} onOpenChange={() => setSelectedVenta(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Detalle: {selectedVenta?.folio}</DialogTitle>
          </DialogHeader>
          {selectedVenta && (
            <div className="space-y-4">
              {/* FIX BUG 2 — Vista de ticket limpio (sin costo/utilidad/margen).
                  Confetti no maneja costos/márgenes en el detalle de venta. */}
              <div className="rounded-xl border bg-muted/20 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Folio</span>
                  <span className="font-mono font-bold">{selectedVenta.folio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium">
                    {selectedVenta.fecha_cierre
                      ? format(new Date(selectedVenta.fecha_cierre), "d MMM yyyy, HH:mm", { locale: es })
                      : (selectedVenta.created_date
                          ? format(new Date(selectedVenta.created_date), "d MMM yyyy, HH:mm", { locale: es })
                          : '—')}
                  </span>
                </div>
                {selectedVenta.sucursal_nombre && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sucursal</span>
                    <span className="font-medium">{selectedVenta.sucursal_nombre}</span>
                  </div>
                )}
                {selectedVenta.cliente_nombre && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="font-medium">{selectedVenta.cliente_nombre}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pago</span>
                  <span className="font-medium capitalize">{selectedVenta.metodo_pago || '—'}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">Productos</p>
                <div className="space-y-1">
                  {Array.isArray(detalles) && detalles.length > 0 ? (
                    detalles.map((d, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                        <span>{d.producto_nombre} x{d.cantidad}</span>
                        <span className="font-medium">{formatCurrency(d.subtotal)}</span>
                      </div>
                    ))
                  ) : selectedVenta.notas ? (
                    // Pedidos web de catálogo guardan los productos como texto en notas.
                    <p className="text-sm py-1 whitespace-pre-line">{selectedVenta.notas}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic py-1">
                      Sin productos registrados en esta venta.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center border-t pt-3">
                <span className="font-heading font-bold">TOTAL</span>
                <span className={`font-heading font-black text-2xl ${colorize ? 'text-primary' : 'text-foreground'}`}>
                  {formatCurrency(selectedVenta.total)}
                </span>
              </div>

              {/* Auditoría de ajustes de cuenta (solo lectura, no afecta cálculos) */}
              <AuditoriaAjusteCuenta venta={selectedVenta} />

              {/* Prompt 5a — Cancelar / Devolver. Solo si NO está ya cancelada. */}
              {selectedVenta.estado === 'cancelada' ? (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                  <p className="font-semibold flex items-center gap-1.5">
                    {selectedVenta.tipo_cancelacion === 'devolucion'
                      ? <><RotateCcw className="w-4 h-4 text-destructive" /> Venta devuelta (reembolso)</>
                      : <><Ban className="w-4 h-4 text-amber-600" /> Venta cancelada</>}
                  </p>
                  {selectedVenta.tipo_cancelacion === 'devolucion' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reembolsado: {formatCurrency(Number(selectedVenta.monto_devuelto) || 0)}
                    </p>
                  )}
                  {selectedVenta.motivo_cancelacion && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Motivo: {selectedVenta.motivo_cancelacion}
                    </p>
                  )}
                  {selectedVenta.cancelado_por_nombre && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Por {selectedVenta.cancelado_por_nombre}
                      {selectedVenta.fecha_cancelacion
                        ? ` · ${format(new Date(selectedVenta.fecha_cancelacion), "d MMM yyyy, HH:mm", { locale: es })}`
                        : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    onClick={() => setCancelarModo('cancelacion')}
                  >
                    <Ban className="w-4 h-4 mr-1.5" /> Cancelar venta
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setCancelarModo('devolucion')}
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" /> Devolver venta (reembolso)
                  </Button>
                </div>
              )}

              {/* Valoración del comensal (Prompt 6C). Solo lectura. NO se imprime. */}
              {Number(selectedVenta?.satisfaccion_score) > 0 && (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Valoración del comensal</p>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl leading-none">{selectedVenta.satisfaccion_emoji || '⭐'}</span>
                    <div>
                      <p className="font-bold text-sm">{selectedVenta.satisfaccion_label || `${selectedVenta.satisfaccion_score}/5`}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedVenta.satisfaccion_origen === 'portal_qr' ? 'Desde Portal QR' : 'Desde el sistema'}
                      </p>
                    </div>
                  </div>
                  {selectedVenta.satisfaccion_comentario && (
                    <p className="text-sm italic mt-2 leading-snug">
                      “{selectedVenta.satisfaccion_comentario}”
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchVentasDelCorte, contarVentasDelCorte } from '@/lib/ventasCorte';
import { cierreBloqueadoPorLaBase } from '@/lib/cierreBloqueado';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { useTerminal } from '@/lib/TerminalContext';
import { formatCurrency, formatPercent, generateFolio } from '@/utils/financialUtils';
import { hasPermission } from '@/lib/permissions';
import { toast } from 'sonner';
import {
  Landmark, Search, DollarSign, CreditCard, Banknote, Smartphone,
  Receipt, TrendingUp, CheckCircle2, Layers, Scissors, Printer, FileText, ShoppingCart, Trash2,
  DoorOpen, Lock, AlertTriangle, ShoppingBag, Pencil, Cake, RefreshCw, Loader2, Coins
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import CorteViewerDialog from '@/components/cortes/CorteViewerDialog';
import CorteAutoDownloader from '@/components/cortes/CorteAutoDownloader';
import { printDocument } from '@/lib/print';
import CorteHistorialList from '@/components/cortes/CorteHistorialList';
import ResumenDelDia from '@/components/caja/ResumenDelDia';
import { desgloseMetodosPagoExacto } from '@/utils/tipsUtils';
import SafeBoundary from '@/components/common/SafeBoundary';
import AbrirCajaDialog from '@/components/caja/AbrirCajaDialog';
import CierreDiarioDialog from '@/components/caja/CierreDiarioDialog';
import GastosCajaTab from '@/components/caja/GastosCajaTab';
import { efectivoEsperadoDeResumen } from '@/utils/efectivoEsperado';
import MesasPendientesCierreDialog from '@/components/caja/MesasPendientesCierreDialog';
import AjustarCuentaDialog from '@/components/caja/AjustarCuentaDialog';
import { obtenerMesasPendientesCierre } from '@/utils/mesasPendientesCierre';
import { generarFolioCorte, generarFolioVenta } from '@/utils/pedidoPastelUtils';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { useCorteAtrasado } from '@/lib/useCorteAtrasado';
import PedidoWebCajaCard from '@/components/caja/PedidoWebCajaCard';
import PedidoWebBeep from '@/components/caja/PedidoWebBeep';
import CorteAtrasadoBanner from '@/components/caja/CorteAtrasadoBanner';
import BuscarVentaFolioCard from '@/components/caja/BuscarVentaFolioCard';
import CancelarVentaDialog from '@/components/ventas/CancelarVentaDialog';
import CancelarPedidoDialog from '@/components/pedidos/CancelarPedidoDialog';
import VentaLibreDialog from '@/components/pos/VentaLibreDialog';
import { registrarDevolucionAnticipo } from '@/utils/devolucionAnticipo';
import { obtenerEntregasDelCorte } from '@/utils/entregasCorte';
import PedidoPastelDetalleDialog from '@/components/pedidos/PedidoPastelDetalleDialog';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import { sumarSubtotalDetalles } from '@/utils/ventaTotales';
import {
  TIPO_VENTA,
  calcularCantidadBaseConsumo,
  calcularCostoVariable,
} from '@/utils/tipoVentaUtils';
import { validarStockParaCobro, mensajeFaltanteStock } from '@/utils/inventarioValidation';
import { parseIngredientesExcluidos, recetaLineaEstaExcluida } from '@/utils/exclusionesUtils';
import { desgloseIvaDesdeConfig } from '@/utils/ivaUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NumericInput from '@/components/common/NumericInput';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { safeFormatDate } from '@/lib/safeFormat';
import StatCard from '@/components/common/StatCard';

const METODOS = [
  { key: 'efectivo', label: 'Efectivo', Icon: Banknote, color: 'border-green-400 bg-green-50 text-green-700' },
  { key: 'tarjeta', label: 'Tarjeta', Icon: CreditCard, color: 'border-blue-400 bg-blue-50 text-blue-700' },
  { key: 'transferencia', label: 'Transferencia', Icon: Smartphone, color: 'border-purple-400 bg-purple-50 text-purple-700' },
  { key: 'mixto', label: 'Mixto', Icon: Layers, color: 'border-orange-400 bg-orange-50 text-orange-700' },
];

export default function Caja() {
  const { posUser } = usePOSAuth();
  const { config, paquete_modo } = useConfig();
  // FASE 2C — sucursal activa para segmentar caja y gastos.
  const { sucursalEfectiva, adminRole } = useTerminal();
  // El dueño en vista general no opera caja directamente → no le mostramos el
  // aviso "No hay caja abierta" (solo visual, no afecta lógica de cobro).
  const esDueno = adminRole === 'dueno';
  const queryClient = useQueryClient();
  const verCostos = hasPermission(posUser?.rol, 'ver_costos');
  // En Esencial y Operativo no hay flujo de mesero/cocina ⇒ no hay cobros pendientes
  const isCajaDirecta = paquete_modo === 'esencial' || paquete_modo === 'operativo';
  const [showTicketFinal, setShowTicketFinal] = useState(false);
  // FASE 2: feedback de impresión del ticket final (spinner + botón deshabilitado).
  const [imprimiendoTicketFinal, setImprimiendoTicketFinal] = useState(false);
  // FASE 3: venta libre (Entry B) — navega a /pos precargando el ítem de monto libre.
  const [showVentaLibreCaja, setShowVentaLibreCaja] = useState(false);
  const navigate = useNavigate();
  const [ticketFinalData, setTicketFinalData] = useState(null);
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detallesSeleccionados, setDetallesSeleccionados] = useState([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoTarjeta, setMontoTarjeta] = useState('');
  const [montoTransferencia, setMontoTransferencia] = useState('');
  // Propinas EXACTAS por método (solo en pago mixto con propina > 0).
  const [propinaEfectivo, setPropinaEfectivo] = useState('');
  const [propinaTarjeta, setPropinaTarjeta] = useState('');
  const [propinaTransferencia, setPropinaTransferencia] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [procesandoMsg, setProcesandoMsg] = useState('');
  const [showCierreExito, setShowCierreExito] = useState(false);
  const [corteCerrado, setCorteCerrado] = useState(null);
  const [verPDFCorte, setVerPDFCorte] = useState(null);
  const [autoDownloadCorte, setAutoDownloadCorte] = useState(null);

  // === Estados de los 3 modales nuevos ===
  const [showAbrirCaja, setShowAbrirCaja] = useState(false);
  const [showCierreDiario, setShowCierreDiario] = useState(false);
  const [accionLoading, setAccionLoading] = useState(false);
  // 6A: bloqueo de cierre si hay mesas abiertas
  const [mesasPendientes, setMesasPendientes] = useState(null); // array | null
  const [verificandoMesas, setVerificandoMesas] = useState(false);
  // === Propina pendiente al abrir una cuenta sin propina capturada ===
  const [showPropinaCaja, setShowPropinaCaja] = useState(false);
  // === Ajustar cuenta (PROMPT B) ===
  const [showAjustarCuenta, setShowAjustarCuenta] = useState(false);

  // Caja abierta global (fuente única de verdad). `status` tri-state
  // evita el "cerrada falsa" mientras carga.
  const { cajaAbierta, hayCaja, status: cajaStatus, fondoEsperado } = useCajaAbierta();
  const cajaVerificando = cajaStatus === 'unknown';

  // PARTE F — corte atrasado (de día anterior) abierto en esta sucursal.
  // Bloquea vender y abrir caja hasta que se cierre.
  const { corteAtrasado, hayCorteAtrasado } = useCorteAtrasado();

  // Fase 7 — Pedidos de catálogo web pendientes de cobro en ESTA sucursal.
  const {
    data: pedidosWebCaja = [],
    refetch: refetchPedidosWeb,
  } = useQuery({
    queryKey: ['pedidosWebEnCaja', sucursalEfectiva?.sucursal_id],
    queryFn: () => base44.entities.PedidoPastel.filter({
      tipo_pedido: 'productos_catalogo',
      origen: 'web',
      // FASE 3 (#2 findability): traer TODOS los estados activos (no solo
      // 'pendiente') para que el catálogo se pueda SEGUIR hasta entregar
      // (2º anticipo, liquidar, entregar), igual que el pastel. Excluye
      // terminados. Por exclusión = a prueba de estados futuros.
      estado: { $nin: ['entregado', 'cancelado'] },
      sucursal_id: sucursalEfectiva?.sucursal_id,
    }, '-created_date', 50),
    enabled: !!(sucursalEfectiva?.sucursal_id) && !!hayCaja,
    refetchInterval: 10000,
    staleTime: 5000,
  });
  const pedidosWebList = Array.isArray(pedidosWebCaja) ? pedidosWebCaja : [];
  // FASE 3 (#2 findability): la cola ahora trae TODOS los estados activos del
  // catálogo. Se separan en PENDIENTES (cobro inicial; manejan la notificación
  // de "nuevo") y EN PROCESO (con_anticipo/pagado/confirmado → 2º anticipo,
  // liquidar, entregar). Así el pedido no se "pierde" tras el primer anticipo.
  const pedidosWebPendientes = pedidosWebList.filter(p => p?.estado === 'pendiente');
  const pedidosWebEnProceso = pedidosWebList.filter(p => p?.estado !== 'pendiente');
  // PARTE D — badge notorio: parpadea solo mientras haya pedidos PENDIENTES NO
  // vistos (los nuevos por cobrar). Al hacer clic en la pestaña "Pedidos" se
  // marca como visto y deja de parpadear hasta que llegue otro nuevo.
  const [pedidosWebVistos, setPedidosWebVistos] = useState(0);
  const hayPedidosWebNuevos = pedidosWebPendientes.length > pedidosWebVistos;

  // Fase 7 — búsqueda de pedido web por folio (tab Buscar).
  const [busquedaFolioWeb, setBusquedaFolioWeb] = useState('');
  const [pedidoWebBuscado, setPedidoWebBuscado] = useState(null);

  // === Prompt 5c — Buscar VENTA por folio en Caja (cancelar/devolver) ===
  // Independiente del buscador de cobro (codigoBusqueda) y del de pedidos web.
  const [folioVentaBusqueda, setFolioVentaBusqueda] = useState('');
  const [ventaFolioEncontrada, setVentaFolioEncontrada] = useState(null);
  const [detallesVentaFolio, setDetallesVentaFolio] = useState([]);
  const [buscandoVentaFolio, setBuscandoVentaFolio] = useState(false);
  // modo: null | 'cancelacion' | 'devolucion' — abre CancelarVentaDialog del 5a.
  const [modoCancelarVenta, setModoCancelarVenta] = useState(null);
  // FASE 3 #5 — pedido de catálogo web a cancelar (abre CancelarPedidoDialog).
  const [pedidoWebACancelar, setPedidoWebACancelar] = useState(null);
  // PARTE B — modal de cobro del pedido web (método de pago + ticket).
  // Prompt 6 — pedido de catálogo abierto en el diálogo detallado (mismo flujo
  // del pastel: ticket + anticipo + entregar, SIN editar).
  const [pedidoWebDetalle, setPedidoWebDetalle] = useState(null);

  // BLOQUE 0: refetch de "cuenta solicitada" (flujo mesero/QR). Confetti es
  // pastelería SIN mesas, así que este poll casi siempre viene vacío; se subió
  // de 2s a 15s para no martillar la BD, sin afectar el uso real.
  //
  // HOTFIX P0: SIN initialData:[]. Con initialData la query nace como "data
  // ya cargada" y los consumidores muestran "0 pendientes" antes del primer
  // fetch. placeholderData mantiene los datos previos durante refetch.
  const { data: ventasPendientesRaw } = useQuery({
    queryKey: ['ventas_pendientes_caja'],
    queryFn: () => base44.entities.Venta.filter({ estado: 'cuenta_solicitada' }),
    refetchInterval: 15000,
    staleTime: 1000,
    placeholderData: (prev) => prev,
  });
  const ventasPendientes = Array.isArray(ventasPendientesRaw) ? ventasPendientesRaw : [];

  // Fase 4 — abonos del corte activo para incluir en resumen
  const { data: abonosCorteRaw } = useQuery({
    queryKey: ['abonos_corte', cajaAbierta?.id],
    queryFn: () => cajaAbierta?.id
      ? base44.entities.Abono.filter({ corte_caja_id: cajaAbierta.id }, '-fecha_abono', 200)
      : [],
    enabled: !!cajaAbierta?.id,
    refetchInterval: 15000,
    staleTime: 8000,
    placeholderData: (prev) => prev,
  });
  const safeAbonos = Array.isArray(abonosCorteRaw) ? abonosCorteRaw : [];

  // Fase 3 #6 — entregas de pastel del corte abierto (informativo, NO toca dinero).
  const { data: entregasCorteRaw } = useQuery({
    queryKey: ['entregas_corte', cajaAbierta?.id],
    queryFn: () => cajaAbierta?.id
      ? obtenerEntregasDelCorte({
          sucursalId: cajaAbierta.sucursal_id,
          desde: cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date,
          hasta: Date.now(),
        })
      : [],
    enabled: !!cajaAbierta?.id,
    refetchInterval: 15000,
    staleTime: 8000,
    placeholderData: (prev) => prev,
  });
  const entregasDelDia = Array.isArray(entregasCorteRaw) ? entregasCorteRaw : [];

  // INCIDENTE 2026-07-30 → 2026-08-08: antes esto era
  //   Venta.filter({ estado: 'pagada' })
  // sin límite, sin orden y sin filtro por corte. PostgREST corta en 1,000
  // filas y, al no haber ORDER BY, devolvía las 1,000 MÁS ANTIGUAS. Cuando
  // Xochimilco superó las 1,000 ventas pagadas (2026-07-30 01:08) las ventas
  // del día dejaron de llegar: el resumen daba 0 y el cierre GUARDABA 0.
  // Ahora la consulta va acotada al corte y paginada (ver ventasCorte.js), así
  // que no puede truncarse. La lógica de reparto venta↔corte NO cambia.
  const {
    data: ventasHoyRaw,
    isFetched: ventasCorteFetched,
    isPlaceholderData: ventasCortePlaceholder,
    isError: ventasCorteError,
    refetch: refetchVentasCorte,
  } = useQuery({
    queryKey: ['ventas_pagadas_caja', cajaAbierta?.id ?? null],
    queryFn: () => fetchVentasDelCorte(cajaAbierta),
    enabled: !!cajaAbierta?.id,
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  // OJO: `isSuccess` NO sirve aquí. Con `placeholderData` React Query lo pone en
  // true mientras sirve los datos del corte ANTERIOR (la queryKey lleva el id
  // del corte, así que al cambiar de corte hay un intervalo con datos ajenos).
  // Sólo damos por cargado lo que se haya traído para ESTE corte.
  // `isFetched` es true también cuando el fetch FALLÓ (React Query lo define
  // como dataUpdateCount>0 || errorUpdateCount>0), y con status 'error' NO se
  // aplica placeholderData — así que sin `!isError` una consulta agotada tras
  // sus reintentos se reportaba como "cargada" con la lista vacía.
  const ventasCorteCargadas =
    ventasCorteFetched && !ventasCortePlaceholder && !ventasCorteError;
  const ventasHoy = Array.isArray(ventasHoyRaw) ? ventasHoyRaw : [];

  const { data: gastosRaw } = useQuery({
    queryKey: ['gastos_hoy'],
    queryFn: () => base44.entities.GastoOperativo.list('-created_date', 100),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const gastos = Array.isArray(gastosRaw) ? gastosRaw : [];

  const { data: cortesRaw } = useQuery({
    queryKey: ['cortes'],
    queryFn: () => base44.entities.CorteCaja.list('-created_date', 20),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const cortes = Array.isArray(cortesRaw) ? cortesRaw : [];

  // corteAbierto = alias del cierre_diario abierto (single source of truth)
  const corteAbierto = cajaAbierta;
  const today = new Date().toISOString().slice(0, 10);

  // El resumen operativo se basa en la caja abierta actual.
  // Incluye ventas con corte_caja_id == cajaAbierta.id O ventas pagadas DESPUÉS
  // de fecha_apertura sin corte_caja_id (fallback para ventas en tránsito).
  // Si NO hay caja abierta, todos los KPIs operativos quedan en 0.
  const resumen = useMemo(() => {
    const safeVentas = Array.isArray(ventasHoy) ? ventasHoy : [];
    const safeGastos = Array.isArray(gastos) ? gastos : [];
    if (!cajaAbierta) {
      return {
        numVentas: 0, totalEfectivo: 0, totalTarjeta: 0, totalTransferencia: 0,
        totalGeneral: 0, costoTotal: 0, utilidadBruta: 0, totalGastos: 0, ticketPromedio: 0,
        gastosEfectivo: 0, gastosDelCorte: [], devolucionesEfectivo: 0,
      };
    }
    const aperturaIso = cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
    const apertura = aperturaIso ? new Date(aperturaIso).getTime() : 0;
    // FASE 2C — sucursal del corte abierto. Salvaguarda: las ventas sueltas
    // (fallback por fecha, sin corte_caja_id) deben ser de la misma sucursal.
    // Las ventas con corte_caja_id === cajaAbierta.id ya pertenecen al corte
    // (y por tanto a su sucursal), así que ese camino no necesita filtro extra.
    const corteSucId = cajaAbierta.sucursal_id || null;
    const mismaSucursal = (v) => !corteSucId || !v?.sucursal_id || v.sucursal_id === corteSucId;
    const ventas = safeVentas.filter(v => {
      if (!v) return false;
      if (v.corte_caja_id && v.corte_caja_id === cajaAbierta.id) return true;
      // Fallback: pagadas después de la apertura, sin corte asociado y de la
      // misma sucursal (salvaguarda multi-sucursal).
      if (!v.corte_caja_id && v.fecha_cierre && mismaSucursal(v)) {
        const t = new Date(v.fecha_cierre).getTime();
        return Number.isFinite(t) && t >= apertura;
      }
      return false;
    });
    const gastosCaja = safeGastos.filter(g => {
      if (!g) return false;
      // CAMBIOS_V2 Fase 07 — si el gasto está amarrado a un corte, debe ser ESTE
      // corte (scoping exacto por corte_caja_id). Si no (legacy), por sucursal+fecha.
      if (g.corte_caja_id) return g.corte_caja_id === cajaAbierta.id;
      if (corteSucId && g.sucursal_id && g.sucursal_id !== corteSucId) return false;
      const tCreated = g.created_date ? new Date(g.created_date).getTime() : 0;
      return tCreated >= apertura;
    });
    // CAMBIOS_V2 Fase 07 — solo los gastos EN EFECTIVO del corte restan del
    // efectivo esperado (tarjeta/transferencia NO salen del cajón).
    const gastosEfectivo = gastosCaja.reduce(
      (s, g) => s + (g?.metodo_pago === 'efectivo' ? (Number(g.monto) || 0) : 0), 0);
    // Fase 4 — totales de abonos por método.
    // FASE 3 A-FIX (Opción A): suma el DESGLOSE por método (monto_efectivo/tarjeta/
    // transferencia), NO filtra por metodo_pago. Así un abono MIXTO aporta su porción a
    // cada bucket igual que un abono de método único → el efectivo del mixto entra al
    // doble conteo de efectivo_esperado de forma CONSISTENTE (el quirk NO cambia). Las
    // filas existentes traen el desglose por el backfill de la migración 0025. Para
    // método único, monto_<metodo> = monto, así que el resultado es idéntico al anterior.
    const abonosEfectivo = safeAbonos.reduce((s, a) => s + (Number(a?.monto_efectivo) || 0), 0);
    const abonosTarjeta = safeAbonos.reduce((s, a) => s + (Number(a?.monto_tarjeta) || 0), 0);
    const abonosTransferencia = safeAbonos.reduce((s, a) => s + (Number(a?.monto_transferencia) || 0), 0);
    const abonosTotal = abonosEfectivo + abonosTarjeta + abonosTransferencia;
    // CAMBIOS_V2 FIX devoluciones — efectivo de las DEVOLUCIONES de anticipo (abonos
    // NEGATIVOS). Los anticipos POSITIVOS que entran ya están contados por su venta
    // paralela en totalEfectivo; solo las devoluciones (monto<0) restan del cajón.
    // Suma el monto_efectivo (que es negativo) SOLO de los abonos con monto<0.
    const devolucionesEfectivo = safeAbonos.reduce(
      (s, a) => s + ((Number(a?.monto) || 0) < 0 ? (Number(a?.monto_efectivo) || 0) : 0), 0);
    // Propinas: sumadas aparte. NO entran a totalGeneral / utilidad / costos.
    const totalPropinas = ventas.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0);
    // Desglose por mesero (solo se usa en Restaurante Pro)
    const propinasPorMesero = {};
    ventas.forEach(v => {
      const monto = Number(v?.propina_monto) || 0;
      if (monto <= 0) return;
      const key = v?.usuario_mesero_id || '__sin_mesero__';
      if (!propinasPorMesero[key]) {
        propinasPorMesero[key] = {
          mesero_id: v?.usuario_mesero_id || null,
          mesero_nombre: v?.usuario_mesero_nombre || 'Caja / venta directa',
          total: 0,
        };
      }
      propinasPorMesero[key].total += monto;
    });

    // === Desglose EXACTO por método de pago (sin reparto proporcional) ===
    // Usa propina_efectivo/tarjeta/transferencia cuando existen.
    // Para ventas antiguas aplica fallback seguro (ver desgloseMetodosPagoExacto).
    const metodosPagoExacto = desgloseMetodosPagoExacto(ventas);
    // Adaptador para componentes ya escritos: estructura idéntica.
    const metodosPagoConPropinas = metodosPagoExacto;

    return {
      numVentas: ventas.length,
      totalEfectivo: metodosPagoExacto.efectivo.ventas,
      totalTarjeta: metodosPagoExacto.tarjeta.ventas,
      totalTransferencia: metodosPagoExacto.transferencia.ventas,
      totalGeneral: ventas.reduce((s, v) => s + (v.total || 0), 0),
      costoTotal: ventas.reduce((s, v) => s + (v.costo_total_snapshot || 0), 0),
      utilidadBruta: ventas.reduce((s, v) => s + (v.utilidad_bruta_snapshot || 0), 0),
      totalGastos: gastosCaja.reduce((s, g) => s + (g.monto || 0), 0),
      gastosEfectivo,
      gastosDelCorte: gastosCaja,
      ticketPromedio: ventas.length > 0 ? ventas.reduce((s, v) => s + (v.total || 0), 0) / ventas.length : 0,
      totalPropinas,
      propinasPorMesero: Object.values(propinasPorMesero),
      metodosPagoConPropinas,
      abonosEfectivo,
      devolucionesEfectivo,
      abonosTarjeta,
      abonosTransferencia,
      abonosTotal,
    };
  }, [ventasHoy, gastos, cajaAbierta, safeAbonos]);

  const margenProm = resumen.totalGeneral > 0 ? (resumen.utilidadBruta / resumen.totalGeneral * 100) : 0;

  // === FIX 6B-B: Búsqueda histórica completa por folio/código ===
  // Caso real: cliente regresa horas/días después diciendo "me cobraron mal".
  // El cajero teclea el folio/código del ticket y debe encontrar la venta
  // aunque sea de ayer, antier o de una caja cerrada.
  //
  // Estrategia:
  //  1. Normalizar (trim + UPPERCASE) la query.
  //  2. Buscar primero en pendientes (más rápido) si aplica.
  //  3. Buscar en TODO el historial (`Venta.list` con límite grande).
  //  4. Si encuentra y está pagada → mostrar ticket en modo consulta (no cobrar
  //     dos veces — `handleCobrar` ya rechaza ventas sin total válido).
  //  5. Si encuentra pendiente → flujo de cobro normal.
  //  6. Si no encuentra → mensaje claro.
  const buscarVenta = async () => {
    const codigo = String(codigoBusqueda || '').trim().toUpperCase();
    if (!codigo) return;

    const norm = (s) => String(s || '').trim().toUpperCase();
    let candidatas = [];
    try {
      const lista = [];
      // En Pro priorizamos las pendientes para no chocar con búsqueda activa,
      // pero igualmente cargamos historial completo para soportar "venta vieja".
      if (!isCajaDirecta) {
        const pend = await base44.entities.Venta.filter({ estado: 'cuenta_solicitada' }).catch(() => []);
        lista.push(...(Array.isArray(pend) ? pend : []));
      }
      // Historial extenso. Si el negocio tiene más de 5000 ventas, el cliente
      // puede reportar al cajero el ticket exacto; el límite cubre meses normales.
      const hist = await base44.entities.Venta.list('-created_date', 5000).catch(() => []);
      lista.push(...(Array.isArray(hist) ? hist : []));
      // Deduplicar
      const seen = new Set();
      candidatas = lista.filter(v => {
        if (!v?.id || seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
    } catch (err) {
      console.error('[Caja] buscarVenta carga:', err);
      toast.error('No se pudo cargar el historial. Intenta de nuevo.');
      return;
    }

    const found = candidatas.find(v =>
      norm(v?.codigo_caja) === codigo ||
      norm(v?.folio) === codigo ||
      norm(v?.folio).includes(codigo) ||
      norm(v?.notas).includes(codigo)
    );

    if (!found) {
      toast.error('No se encontró una venta con ese folio.');
      return;
    }

    try {
      const detalles = await base44.entities.DetalleVenta.filter({ venta_id: found.id }).catch(() => []);
      // Ventas pagadas/canceladas → modo consulta (ticket histórico).
      // Caja no debe permitir cobrar dos veces (handleCobrar valida total > 0).
      if (found.estado === 'pagada' || found.estado === 'cancelada') {
        setTicketFinalData({ venta: found, detalles: Array.isArray(detalles) ? detalles : [] });
        setShowTicketFinal(true);
        if (found.estado === 'cancelada') {
          toast.info('Esta venta está cancelada (solo consulta).');
        }
      } else {
        // Pendientes (cuenta_solicitada, abierta, etc.) → flujo de cobro.
        setVentaSeleccionada(found);
        setDetallesSeleccionados(Array.isArray(detalles) ? detalles : []);
        // Esta es la OTRA puerta al cobro (búsqueda por folio, la que usan los
        // pedidos web) y no limpiaba NADA: aquí sobrevivían el método Y los
        // importes del ticket anterior. Mismo arranque que abrirVenta.
        limpiarCamposCobro();
      }
    } catch (err) {
      console.error('[Caja] buscarVenta detalle:', err);
      toast.error('Se encontró la venta pero no se pudieron cargar los productos.');
    }
  };

  // DINERO — deja los campos del cobro como al montar el componente.
  // Los mismos valores que `useState` arriba y que la limpieza tras un cobro
  // correcto. NO calcula nada: sólo borra estado de la venta ANTERIOR.
  //
  // El método de pago se resetea AQUÍ, y ésa es la corrección: antes se
  // limpiaban los importes pero `metodoPago` NO. Sobrevivía de un ticket al
  // siguiente, y sólo se reponía a 'efectivo' tras un cobro CORRECTO (más
  // abajo). Si el cajero abría un ticket, elegía «Tarjeta» y luego se salía
  // sin cobrar —lo normal: el cliente cambia de idea, se equivocó de ticket,
  // llega otro cliente—, el siguiente ticket se abría YA en «Tarjeta».
  // Cobrar sin mirar el selector registraba como TARJETA un cobro en
  // EFECTIVO: el dinero está en el cajón pero el corte no lo espera, y al
  // cuadrar aparece un SOBRANTE que nadie sabe explicar (o un FALTANTE en el
  // caso contrario). El cajero carga con la culpa de un fallo de la pantalla.
  //
  // Peor con «Mixto», que también sobrevivía: los importes SÍ se borraban, así
  // que quedaba mixto con los tres campos vacíos. Mixto es el único método sin
  // reparto automático (ver más abajo), y sin la guarda nueva eso guardaba la
  // venta como pagada con efectivo=0, tarjeta=0 y transferencia=0: el ticket
  // entero desaparecía del reparto por método.
  const limpiarCamposCobro = () => {
    setMetodoPago('efectivo');
    setMontoEfectivo('');
    setMontoTarjeta('');
    setMontoTransferencia('');
    setPropinaEfectivo('');
    setPropinaTarjeta('');
    setPropinaTransferencia('');
  };

  const abrirVenta = async (venta) => {
    const detalles = await base44.entities.DetalleVenta.filter({ venta_id: venta.id });
    const detallesArr = Array.isArray(detalles) ? detalles : [];

    // HOTFIX 6A — Rescate de totales en CERO al abrir cobro.
    // Si la venta llega con total <= 0 pero los detalles tienen subtotal real,
    // recalculamos y persistimos antes de mostrar el modal. Así el cajero ve
    // el total correcto y puede cobrar normalmente.
    let ventaFinal = venta;
    const ventaTotal = Number(venta?.total) || 0;
    const subtotalReal = sumarSubtotalDetalles(detallesArr);
    if (subtotalReal > 0 && ventaTotal <= 0) {
      try {
        const costoTotal = detallesArr.reduce(
          (s, d) => s + (Number(d?.costo_total_linea_snapshot) || 0), 0
        );
        await base44.entities.Venta.update(venta.id, {
          subtotal: subtotalReal,
          total: subtotalReal,
          costo_total_snapshot: costoTotal,
          utilidad_bruta_snapshot: subtotalReal - costoTotal,
          margen_snapshot: subtotalReal > 0 ? ((subtotalReal - costoTotal) / subtotalReal * 100) : 0,
        });
        ventaFinal = { ...venta, subtotal: subtotalReal, total: subtotalReal };
        toast.info('Totales recalculados desde los productos.');
      } catch (err) {
        console.error('[Caja] abrirVenta rescate totales:', err);
        // No bloqueamos — el cajero verá $0 y el botón "Borrar ticket en cero"
        // como ya estaba antes. Mejor que pantalla blanca.
      }
    }

    setVentaSeleccionada(ventaFinal);
    setDetallesSeleccionados(detallesArr);
    limpiarCamposCobro();
    // Solo abrir modal de propina si propinas están activas Y la venta lo requiere.
    // Tipos que requieren elección explícita en caja:
    //   - 'pendiente': mesero la dejó pendiente.
    //   - 'pendiente_cliente': cliente nunca entró al QR a elegir.
    //   - 'decidir_en_caja': cliente eligió explícitamente decidirla en caja.
    if (tipsEnabled(config)) {
      const tipo = venta?.propina_tipo;
      if (tipo === 'pendiente' || tipo === 'pendiente_cliente' || tipo === 'decidir_en_caja') {
        setShowPropinaCaja(true);
      }
      // Si no tiene tipo (ventas antiguas) NO forzamos modal; quedan en 0 propina.
    }
  };

  // Total a cobrar = venta real + propina (la venta real `total` NUNCA se modifica).
  const totalACobrarVenta = useMemo(() => {
    const t = Number(ventaSeleccionada?.total) || 0;
    const p = Number(ventaSeleccionada?.propina_monto) || 0;
    return t + p;
  }, [ventaSeleccionada]);

  const calcularCambio = () => {
    const recibido = parseFloat(montoEfectivo) || 0;
    return Math.max(0, recibido - totalACobrarVenta);
  };

  // ===== AJUSTAR CUENTA — refresco tras guardar =====
  // Recarga venta + detalles desde BD para reflejar el ajuste sin pantalla blanca.
  // Invalida queries de Caja, Mesa QR y pendientes para que TODOS vean lo nuevo.
  const recargarVentaAjustada = async () => {
    if (!ventaSeleccionada?.id) return;
    try {
      const [v, dets] = await Promise.all([
        base44.entities.Venta.get(ventaSeleccionada.id).catch(() => null),
        base44.entities.DetalleVenta.filter({ venta_id: ventaSeleccionada.id }).catch(() => []),
      ]);
      if (v) setVentaSeleccionada(v);
      setDetallesSeleccionados(Array.isArray(dets) ? dets : []);
      // Invalidaciones para Caja list, QR del comensal y pendientes globales.
      queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
      queryClient.invalidateQueries({ queryKey: ['mesa_por_token'] });
      queryClient.refetchQueries({ queryKey: ['ventas_pendientes_caja'], type: 'active' }).catch(() => {});
    } catch (err) {
      console.error('[Caja] recargarVentaAjustada:', err);
      toast.error('Ajuste guardado, pero no se pudo recargar. Cierra y vuelve a abrir la venta.');
    }
  };

  // Guarda la propina elegida en caja sobre la venta actual.
  const aplicarPropinaCaja = async (propinaData) => {
    if (!ventaSeleccionada?.id) { setShowPropinaCaja(false); return; }
    try {
      const payload = {
        propina_monto: Number(propinaData?.propina_monto) || 0,
        propina_porcentaje: Number(propinaData?.propina_porcentaje) || 0,
        propina_tipo: propinaData?.propina_tipo || 'sin_propina',
        propina_origen: 'caja',
      };
      await base44.entities.Venta.update(ventaSeleccionada.id, payload);
      setVentaSeleccionada(prev => prev ? { ...prev, ...payload } : prev);
      setShowPropinaCaja(false);
    } catch (err) {
      console.error('[Caja] aplicarPropinaCaja:', err);
      toast.error('No se pudo guardar la propina');
      setShowPropinaCaja(false);
    }
  };

  // Eliminar/cancelar tickets en CERO ($0.00) — para limpiar caja sin afectar ventas reales.
  const handleEliminarTicketCero = async (venta) => {
    if (!venta) return;
    const total = venta.total || 0;
    if (total > 0) {
      toast.error('Solo se pueden eliminar tickets con total $0.00');
      return;
    }
    if (!confirm(`¿Seguro que quieres borrar este ticket en cero (${venta.folio})?\nEsta acción no se puede deshacer.`)) return;
    try {
      await base44.entities.Venta.update(venta.id, {
        estado: 'cancelada',
        motivo_cancelacion: 'Ticket en $0.00 eliminado desde Caja',
        fecha_cierre: new Date().toISOString(),
        usuario_cajero_id: posUser?.id,
        usuario_cajero_nombre: posUser?.nombre,
      });
      // Liberar mesa si aplica
      if (venta.mesa_id) {
        await base44.entities.Mesa.update(venta.mesa_id, {
          estado: 'libre', venta_activa_id: null, personas_actuales: 0, cliente_temporal: '',
          atendido_por_id: '', atendido_por_nombre: '', atendido_por_color: '',
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setVentaSeleccionada(null);
      setDetallesSeleccionados([]);
      toast.success('Ticket en cero eliminado');
    } catch (err) {
      console.error('[Caja] Error eliminando ticket en cero:', err);
      toast.error('No se pudo eliminar el ticket');
    }
  };

  // ===== Fase 7 — Pedidos de catálogo web en Caja =====
  // FASE 3 #5 — antes era window.confirm() sin tipo/motivo/sello. Ahora abre el
  // CancelarPedidoDialog (mismo trato que una venta: tipo + motivo + sello).
  const handleCancelarPedidoWeb = (pedido) => {
    if (!pedido?.id) return;
    setPedidoWebACancelar(pedido);
  };

  // FASE 3 #4 — gancho de devolución de anticipo para la cola web de Caja.
  // Registra la salida en el corte ABIERTO (abono compensatorio negativo), exige
  // caja abierta y corte al día, y sella el pedido como devolución.
  const handleDevolverAnticipoWeb = async ({ pedido: p, motivo }) => {
    if (!cajaAbierta?.id) { toast.error('Abre caja antes de registrar una devolución.'); throw new Error('SIN_CAJA'); }
    if (hayCorteAtrasado) { toast.error('Cierra el corte del día anterior antes de registrar devoluciones.'); throw new Error('CORTE_ATRASADO'); }
    try {
      const res = await registrarDevolucionAnticipo({ pedido: p, motivo, cajaAbierta, posUser, sucursalEfectiva });
      refetchPedidosWeb();
      queryClient.invalidateQueries({ queryKey: ['abonos_corte', cajaAbierta.id] });
      queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
      toast.success(res.montoDevuelto > 0
        ? `Devolución registrada: $${res.montoDevuelto.toFixed(2)}`
        : 'Pedido cancelado (sin anticipo que devolver).');
    } catch (e) {
      console.error('[Caja] devolverAnticipoWeb:', e);
      toast.error('No se pudo registrar la devolución.');
      throw e;
    }
  };

  const handleBuscarFolioWeb = async () => {
    if (!busquedaFolioWeb.trim()) return;
    // 🔒 CANDADO 3 (corrección): el cobro por folio se LIMITA a la sucursal del
    // terminal. Antes este buscador NO filtraba por sucursal, así un operativo
    // podía cobrar un pedido de OTRA sucursal y el dinero caía en la caja
    // equivocada (la Venta paralela se sella con la sucursal del terminal).
    const sucId = sucursalEfectiva?.sucursal_id || null;
    if (!sucId) {
      toast.error('Selecciona la sucursal de la terminal para buscar pedidos.');
      return;
    }
    try {
      const resultados = await base44.entities.PedidoPastel.filter({
        folio: busquedaFolioWeb.trim(),
        tipo_pedido: 'productos_catalogo',
        sucursal_id: sucId,
      });
      if (Array.isArray(resultados) && resultados.length > 0) {
        setPedidoWebBuscado(resultados[0]);
      } else {
        setPedidoWebBuscado(null);
        toast.error('No se encontró un pedido web con ese folio en tu sucursal.');
      }
    } catch (e) {
      console.error('Error búsqueda folio web:', e);
    }
  };

  // === Prompt 5c — Buscar venta por folio (SIN límite de fecha) ===
  const handleBuscarVentaFolio = async () => {
    const folio = String(folioVentaBusqueda || '').trim();
    if (!folio) return;
    if (buscandoVentaFolio) return;
    setBuscandoVentaFolio(true);
    try {
      const resultados = await base44.entities.Venta.filter({ folio }).catch(() => []);
      const found = Array.isArray(resultados) && resultados.length > 0 ? resultados[0] : null;
      if (!found) {
        setVentaFolioEncontrada(null);
        setDetallesVentaFolio([]);
        toast.error('No se encontró ninguna venta con ese folio.');
        return;
      }
      const dets = await base44.entities.DetalleVenta.filter({ venta_id: found.id }).catch(() => []);
      setVentaFolioEncontrada(found);
      setDetallesVentaFolio(Array.isArray(dets) ? dets : []);
    } catch (err) {
      console.error('[Caja] handleBuscarVentaFolio:', err);
      toast.error('No se pudo buscar la venta. Intenta de nuevo.');
    } finally {
      setBuscandoVentaFolio(false);
    }
  };

  // Tras cancelar/devolver: recargar la venta encontrada (nuevo estado) y
  // refrescar las vistas de ingreso. CancelarVentaDialog ya invalida sus queries.
  const recargarVentaFolio = async () => {
    if (!ventaFolioEncontrada?.id) return;
    try {
      const v = await base44.entities.Venta.get(ventaFolioEncontrada.id).catch(() => null);
      if (v) setVentaFolioEncontrada(v);
      queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
    } catch (err) {
      console.error('[Caja] recargarVentaFolio:', err);
    }
  };

  const handleCobrar = async () => {
    if (!ventaSeleccionada?.id) { toast.error('No hay venta seleccionada'); return; }
    if (procesando) return;
    // PARTE F — detección de internet antes de cobrar.
    if (!navigator.onLine) {
      toast.error('Sin conexión a internet. No se puede procesar el cobro. Verifica tu conexión.');
      return;
    }
    if (!hayCaja) {
      toast.error('No hay caja abierta. Abre caja para cobrar.');
      return;
    }
    // PARTE F — bloquear venta si hay corte atrasado del día anterior.
    if (hayCorteAtrasado) {
      toast.error('Cierra el corte del día anterior antes de cobrar ventas de hoy.');
      return;
    }
    const total = ventaSeleccionada.total || 0;
    if (!total || total <= 0) {
      toast.error('La venta no tiene total válido');
      return;
    }
    if (!metodoPago) {
      toast.error('Selecciona un método de pago');
      return;
    }
    // Si la venta quedó marcada "decidir en caja" y aún no se eligió propina, forzar el modal.
    // Solo si propinas están activas; si están desactivadas, ignoramos el pendiente.
    // Se aplica a: 'pendiente' (mesero), 'pendiente_cliente' (QR sin elección),
    // y 'decidir_en_caja' (cliente delegó explícitamente en caja).
    const tiposQueForzanModal = ['pendiente', 'pendiente_cliente', 'decidir_en_caja'];
    if (tiposQueForzanModal.includes(ventaSeleccionada.propina_tipo) && tipsEnabled(config)) {
      setShowPropinaCaja(true);
      toast.error('Define la propina antes de cobrar (o "Sin propina").');
      return;
    }
    setProcesando(true);
    setProcesandoMsg('Procesando cobro…');

    // El cliente paga venta + propina. La venta real (`total`) NO se infla.
    const propinaMonto = Number(ventaSeleccionada.propina_monto) || 0;
    const totalACobrar = total + propinaMonto;

    let mEfec = parseFloat(montoEfectivo) || 0;
    let mTar = parseFloat(montoTarjeta) || 0;
    let mTrans = parseFloat(montoTransferencia) || 0;

    if (metodoPago === 'efectivo') { mEfec = totalACobrar; mTar = 0; mTrans = 0; }
    if (metodoPago === 'tarjeta') { mTar = totalACobrar; mEfec = 0; mTrans = 0; }
    if (metodoPago === 'transferencia') { mTrans = totalACobrar; mEfec = 0; mTar = 0; }

    // ── GUARDA: el mixto tiene que sumar el total ────────────────────────
    // ES SÓLO UNA GUARDA. No reparte, no reajusta, no redondea, no calcula
    // nada: lee lo que ya está calculado tres líneas arriba y se niega a
    // guardar un cobro incoherente. Si suma bien, el cobro sigue exactamente
    // igual que siempre.
    //
    // Por qué hacía falta: los otros tres métodos se auto-reparten (líneas de
    // arriba, `mEfec = totalACobrar`, etc.), así que es imposible que no
    // cuadren. «Mixto» es el ÚNICO que se guarda tal cual lo teclea el cajero,
    // y no había ninguna comprobación. Con los campos vacíos se guardaba la
    // venta como pagada con 0 + 0 + 0; con un dedazo (un 5 que no se pulsó,
    // un 0 de más) se guardaba con el reparto equivocado. En los dos casos la
    // venta queda cobrada y el corte descuadra, y no hay forma de saber
    // después cuánto entró en cajón y cuánto por terminal.
    //
    // Tolerancia y forma calcadas de la comprobación de propinas que ya vive
    // veinte líneas más abajo, para no introducir un criterio nuevo.
    if (metodoPago === 'mixto') {
      const sumaMetodos = mEfec + mTar + mTrans;
      if (Math.abs(sumaMetodos - totalACobrar) > 0.01) {
        toast.error(
          `Pago mixto: lo repartido (${formatCurrency(sumaMetodos)}) no coincide con el total a cobrar (${formatCurrency(totalACobrar)}). Corrige los importes.`
        );
        setProcesando(false);
        setProcesandoMsg('');
        return;
      }
    }

    // === Propinas EXACTAS por método (no proporcional) ===
    // Regla:
    //  - 1 solo método: 100% de la propina a ese método.
    //  - Mixto: el cajero debe haber ingresado el desglose; validamos que sume.
    let propEf = 0, propTa = 0, propTr = 0;
    if (propinaMonto > 0) {
      if (metodoPago === 'efectivo') {
        propEf = propinaMonto;
      } else if (metodoPago === 'tarjeta') {
        propTa = propinaMonto;
      } else if (metodoPago === 'transferencia') {
        propTr = propinaMonto;
      } else if (metodoPago === 'mixto') {
        propEf = parseFloat(propinaEfectivo) || 0;
        propTa = parseFloat(propinaTarjeta) || 0;
        propTr = parseFloat(propinaTransferencia) || 0;
        const sumaProp = propEf + propTa + propTr;
        if (Math.abs(sumaProp - propinaMonto) > 0.01) {
          toast.error(`La suma de propinas por método (${formatCurrency(sumaProp)}) debe coincidir con la propina total (${formatCurrency(propinaMonto)}).`);
          setProcesando(false);
          setProcesandoMsg('');
          return;
        }
      }
    }

    const cambio = metodoPago === 'efectivo' ? calcularCambio() : 0;
    // 6B / 1.G: costo_total se recalcula DESPUÉS del descuento de inventario
    // (más abajo) porque las líneas variables actualizan su costo en ese paso.
    // Aquí inicializamos con el costo actual (precio_fijo ya viene completo).
    let costoTotal = (detallesSeleccionados || []).reduce((s, d) => s + (d?.costo_total_linea_snapshot || 0), 0);
    let utilidadBruta = total - costoTotal;
    let margen = total > 0 ? (utilidadBruta / total * 100) : 0;

    // Asociar al corte abierto (caja del día) para que el PDF lo encuentre
    const corteAbiertoId = cajaAbierta?.id || null;

    // 🟡 HOTFIX bandera amarilla #2: bandera declarada FUERA del try para que
    // el catch final pueda leerla y diferenciar errores pre/post-cobro.
    // (Las `let` declaradas dentro de un try NO son visibles desde el catch.)
    let ventaQuedoPagada = false;

    try {
      // ====================================================
      // 6B / 1.J — VALIDACIÓN DE STOCK ANTES DE COBRAR
      // ====================================================
      // Cargamos inventario y recetas FRESCOS (no caché) y validamos.
      // Si falla y `permitir_venta_sin_stock` NO está activo:
      //   - BLOQUEAMOS el cobro (return + toast).
      //   - NO tocamos la venta, NO descontamos nada → cero stock negativo.
      // Si la carga falla por red, también bloqueamos: nunca cobrar sin validar.
      const permitirSinStock = config?.permitir_venta_sin_stock === true;
      setProcesandoMsg('Validando inventario…');
      let recetasAll = [];
      let ingredientesAll = [];
      // HOTFIX intermitente: reintento + fallback al caché de react-query.
      // Antes: si la primera llamada fallaba (429, red lenta), bloqueaba el cobro
      // aunque al reintentar segundos después sí funcionara. Ahora:
      //   1) intenta cargar fresco
      //   2) si falla, espera 800ms y reintenta UNA vez
      //   3) si vuelve a fallar, usa el caché existente (ingredientes_all)
      //   4) solo bloquea si AÚN así no hay datos.
      const cargarInventarioConRetry = async () => {
        const intentar = () => Promise.all([
          base44.entities.RecetaEscandallo.list('-created_date', 2000),
          base44.entities.Ingrediente.list('-created_date', 1000),
        ]);
        try {
          return await intentar();
        } catch (e1) {
          console.warn('[Caja 1.J] Reintentando carga de inventario:', e1?.message || e1);
          await new Promise(res => setTimeout(res, 800));
          try {
            return await intentar();
          } catch (e2) {
            console.warn('[Caja 1.J] Falló reintento, usando caché:', e2?.message || e2);
            const cachedIng = queryClient.getQueryData(['ingredientes_all']);
            // Recetas: si el caché tampoco está, recetasAll queda [] y los
            // productos precio_fijo se tratarán como "sin receta" (no bloquea).
            return [[], Array.isArray(cachedIng) ? cachedIng : []];
          }
        }
      };
      try {
        const [r, i] = await cargarInventarioConRetry();
        recetasAll = Array.isArray(r) ? r : [];
        ingredientesAll = Array.isArray(i) ? i : [];
      } catch (errCarga) {
        console.error('[Caja 1.J] No se pudo cargar inventario para validar:', errCarga);
        if (!permitirSinStock) {
          toast.error('No se pudo validar inventario. Intenta de nuevo en un momento.');
          setProcesando(false);
          setProcesandoMsg('');
          return;
        }
      }
      // Si después de reintento + caché seguimos sin ingredientes, y la venta
      // necesita validar (tiene líneas variables o detalles), avisamos pero
      // NO bloqueamos por error de red transitorio si NO hay líneas a validar.
      if (ingredientesAll.length === 0 && !permitirSinStock) {
        const necesitaValidar = (detallesSeleccionados || []).some(d => {
          const t = d?.tipo_venta_snapshot;
          return t === TIPO_VENTA.VARIABLE_MEDIDA || t === TIPO_VENTA.PORCION_CONTENEDOR;
        });
        if (necesitaValidar) {
          toast.error('No se pudo cargar inventario para validar productos variables. Reintenta.');
          setProcesando(false);
          setProcesandoMsg('');
          return;
        }
      }
      const val = validarStockParaCobro({
        detalles: detallesSeleccionados,
        recetasAll,
        ingredientesAll,
      });
      if (!val.ok) {
        // Reportar a consola la lista completa (útil para soporte).
        console.warn('[Caja 1.J] Stock insuficiente:', val);
        if (!permitirSinStock) {
          toast.error(mensajeFaltanteStock(val));
          setProcesando(false);
          setProcesandoMsg('');
          return;
        } else {
          // Modo explícito: el negocio aceptó vender sin stock → solo advertencia.
          toast.warning(mensajeFaltanteStock(val) + ' (Se cobrará igual: venta sin stock permitida).');
        }
      }

    setProcesandoMsg('Guardando venta…');
    await base44.entities.Venta.update(ventaSeleccionada.id, {
      estado: 'pagada',
      fecha_cierre: new Date().toISOString(),
      metodo_pago: metodoPago,
      monto_efectivo: mEfec,
      monto_tarjeta: mTar,
      monto_transferencia: mTrans,
      // Desglose EXACTO de propinas por método de pago.
      propina_efectivo: propEf,
      propina_tarjeta: propTa,
      propina_transferencia: propTr,
      total_cobrado_con_propina: totalACobrar,
      cambio,
      usuario_cajero_id: posUser?.id,
      usuario_cajero_nombre: posUser?.nombre,
      costo_total_snapshot: costoTotal,
      utilidad_bruta_snapshot: utilidadBruta,
      margen_snapshot: margen,
      corte_caja_id: corteAbiertoId,
    });
    ventaQuedoPagada = true;

    // === Descontar inventario — PARALELIZADO para reducir tiempo ===
    // Antes: cada Ingrediente.update / MovimientoInventario.create /
    // DescuentoInventarioVenta.create se hacía con `await` secuencial dentro
    // de loops `for`. Para una venta con 5 ingredientes y 10 descuentos eso
    // eran ~25 round-trips al backend en serie. Ahora cada bloque por
    // ingrediente se ejecuta en paralelo con Promise.all.
    //
    // 6B / 1.G — Soporte para productos VARIABLES.
    //   - precio_fijo: descuenta vía RecetaEscandallo (flujo histórico, intacto).
    //   - variable_medida / porcion_contenedor: descuenta el ingrediente_base
    //     por cantidad_base_consumo (g o ml). NO usa receta.
    // Ambos caminos agregan al mismo bucket consumoPorIng → un solo
    // Ingrediente.update + MovimientoInventario por ingrediente.
    try {
      setProcesandoMsg('Actualizando inventario…');
      // Cargar recetas e ingredientes en paralelo
      const [recetasAll, ingredientesAll] = await Promise.all([
        base44.entities.RecetaEscandallo.list('-created_date', 2000),
        base44.entities.Ingrediente.list('-created_date', 1000),
      ]);
      const ingMap = Object.fromEntries(ingredientesAll.map(i => [i.id, i]));
      const fechaIso = new Date().toISOString();

      // 6B / 1.G — Recalculo de costo/utilidad para líneas variables.
      // Si una línea es variable y aún no tiene costo_total_linea_snapshot,
      // lo recalculamos aquí (con el costo_por_unidad_base actual del ingrediente)
      // y actualizamos el DetalleVenta. Esto se refleja en costo_total_snapshot
      // y utilidad_bruta_snapshot de la Venta más abajo.
      const detalleUpdates = [];

      // Aggregate per ingrediente (in memory, rápido)
      const consumoPorIng = {};
      for (const det of detallesSeleccionados) {
        const tipoSnap = det?.tipo_venta_snapshot;
        const esVariable =
          tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA ||
          tipoSnap === TIPO_VENTA.PORCION_CONTENEDOR;

        if (esVariable && det?.ingrediente_base_id_snapshot) {
          // ----- PATH VARIABLE -----
          const ing = ingMap[det.ingrediente_base_id_snapshot];
          if (!ing) continue;

          // Cantidad en unidad base (g o ml). Si se guardó en el snapshot,
          // lo usamos. Si no, lo recalculamos de los snapshots disponibles.
          let cantBase = Number(det?.cantidad_base_consumo) || 0;
          if (cantBase <= 0) {
            cantBase = calcularCantidadBaseConsumo({
              tipo_venta: tipoSnap,
              cantidad_variable: det?.cantidad_variable_snapshot,
              unidad_variable: det?.unidad_variable_snapshot,
              cantidad_porciones: det?.cantidad_porciones_snapshot,
              ml_por_porcion: det?.ml_por_porcion_snapshot,
            });
          }
          if (cantBase <= 0) continue;

          const costoUnitBase = Number(ing.costo_por_unidad_base) || 0;
          const costoLinea = Math.round(cantBase * costoUnitBase * 100) / 100;

          if (!consumoPorIng[ing.id]) {
            consumoPorIng[ing.id] = { ing, cantidadTotal: 0, costoTotal: 0, detalles: [] };
          }
          consumoPorIng[ing.id].cantidadTotal += cantBase;
          consumoPorIng[ing.id].costoTotal += costoLinea;
          consumoPorIng[ing.id].detalles.push({
            det,
            l: null, // sin receta
            totalCant: cantBase,
            costoLinea,
            cantPorProd: cantBase, // por unidad lógica (cantidad=1)
          });

          // Si el detalle aún no tiene costo persistido, lo actualizamos.
          const costoActual = Number(det?.costo_total_linea_snapshot) || 0;
          if (Math.abs(costoActual - costoLinea) > 0.005) {
            const precioLinea = Number(det?.subtotal) || 0;
            const { utilidad_linea, margen_linea } = calcularCostoVariable({
              precio_total_linea: precioLinea,
              cantidad_base_consumo: cantBase,
              costo_por_unidad_base: costoUnitBase,
            });
            detalleUpdates.push(
              base44.entities.DetalleVenta.update(det.id, {
                costo_total_linea_snapshot: costoLinea,
                costo_unitario_snapshot: costoUnitBase,
                utilidad_linea_snapshot: utilidad_linea,
                margen_linea_snapshot: margen_linea,
                cantidad_base_consumo: cantBase,
              }).catch(() => {})
            );
            // Reflejar en memoria para que el cálculo de costoTotal abajo lo tome.
            det.costo_total_linea_snapshot = costoLinea;
            det.utilidad_linea_snapshot = utilidad_linea;
            det.margen_linea_snapshot = margen_linea;
            det.cantidad_base_consumo = cantBase;
          }
          continue;
        }

        // ----- PATH precio_fijo (LEGACY, intacto) -----
        // PASO B — Exclusiones "SIN ingrediente" capturadas por mesero.
        // Si la línea de receta corresponde a un ingrediente excluido, saltarla:
        // no se crea Movimiento, no se crea DescuentoInventarioVenta y no baja stock.
        const excluidos = parseIngredientesExcluidos(det?.ingredientes_excluidos_snapshot);
        const lineas = recetasAll.filter(r => r.producto_id === det.producto_id && r.activo !== false);
        for (const l of lineas) {
          if (recetaLineaEstaExcluida(l, excluidos)) continue;
          const merma = 1 + ((l.merma_porcentaje || 0) / 100);
          const cantPorProd = (l.cantidad_convertida_unidad_base || 0) * merma;
          const totalCant = cantPorProd * (det.cantidad || 0);
          if (totalCant <= 0) continue;
          const ing = ingMap[l.ingrediente_id];
          if (!ing) continue;
          if (!consumoPorIng[l.ingrediente_id]) {
            consumoPorIng[l.ingrediente_id] = { ing, cantidadTotal: 0, costoTotal: 0, detalles: [] };
          }
          const costoLinea = totalCant * (ing.costo_por_unidad_base || 0);
          consumoPorIng[l.ingrediente_id].cantidadTotal += totalCant;
          consumoPorIng[l.ingrediente_id].costoTotal += costoLinea;
          consumoPorIng[l.ingrediente_id].detalles.push({ det, l, totalCant, costoLinea, cantPorProd });
        }
      }

      // Persistir los updates de costo/utilidad de líneas variables (en paralelo).
      if (detalleUpdates.length > 0) {
        await Promise.all(detalleUpdates);
      }

      // 6B / 1.G — Si hubo líneas variables con costo recalculado, refrescar
      // los snapshots de la Venta. Solo si la diferencia con lo guardado arriba
      // es relevante (>1¢). Esto NO toca total/subtotal — solo costo/utilidad.
      try {
        const costoTotalFinal = (detallesSeleccionados || []).reduce(
          (s, d) => s + (Number(d?.costo_total_linea_snapshot) || 0), 0
        );
        if (Math.abs(costoTotalFinal - costoTotal) > 0.005) {
          costoTotal = costoTotalFinal;
          utilidadBruta = total - costoTotal;
          margen = total > 0 ? (utilidadBruta / total * 100) : 0;
          await base44.entities.Venta.update(ventaSeleccionada.id, {
            costo_total_snapshot: costoTotal,
            utilidad_bruta_snapshot: utilidadBruta,
            margen_snapshot: margen,
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[Caja 1.G] refresh costo Venta:', e);
      }

      // Ejecutar TODAS las operaciones de inventario en paralelo.
      // Cada ingrediente: stock + movimiento + sus N descuentos detallados.
      const ops = [];
      for (const key of Object.keys(consumoPorIng)) {
        const { ing, cantidadTotal, costoTotal, detalles } = consumoPorIng[key];
        const stockAnterior = ing.stock_actual || 0;
        const stockNuevo = Math.max(0, stockAnterior - cantidadTotal);

        ops.push(base44.entities.Ingrediente.update(ing.id, { stock_actual: stockNuevo }).catch(() => {}));
        ops.push(base44.entities.MovimientoInventario.create({
          ingrediente_id: ing.id,
          ingrediente_nombre: ing.nombre,
          tipo_movimiento: 'salida_venta',
          cantidad: -cantidadTotal,
          unidad_base: ing.unidad_base,
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          costo_unitario_en_momento: ing.costo_por_unidad_base || 0,
          costo_total_movimiento: costoTotal,
          referencia_tipo: 'venta',
          referencia_id: ventaSeleccionada.id,
          motivo: `Venta ${ventaSeleccionada.folio}`,
          usuario_id: posUser?.id,
          usuario_nombre: posUser?.nombre,
          fecha: fechaIso,
        }).catch(() => {}));
        for (const d of detalles) {
          ops.push(base44.entities.DescuentoInventarioVenta.create({
            venta_id: ventaSeleccionada.id,
            detalle_venta_id: d.det.id,
            producto_id: d.det.producto_id,
            ingrediente_id: ing.id,
            ingrediente_nombre: ing.nombre,
            cantidad_producto: d.det.cantidad || 0,
            cantidad_ingrediente_por_producto: d.cantPorProd,
            cantidad_total_descontada: d.totalCant,
            unidad_base: ing.unidad_base,
            costo_unitario_snapshot: ing.costo_por_unidad_base || 0,
            costo_total_descontado: d.costoLinea,
            fecha: fechaIso,
          }).catch(() => {}));
        }
      }
      await Promise.all(ops);

      queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
      queryClient.invalidateQueries({ queryKey: ['descuentos_hoy'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos_inv'] });
    } catch (err) {
      console.warn('Error descontando inventario:', err);
    }
    // === Fin inventario ===

    if (ventaSeleccionada.mesa_id) {
      // Limpiar "atendido_por" al cerrar la mesa (modo sin asignación).
      // El mesero_asignado_* fijo NO se toca: persiste entre sesiones.
      // No bloqueante: si tarda, no detiene el ticket.
      base44.entities.Mesa.update(ventaSeleccionada.mesa_id, {
        estado: 'limpieza',
        venta_activa_id: null,
        personas_actuales: 0,
        cliente_temporal: '',
        atendido_por_id: '',
        atendido_por_nombre: '',
        atendido_por_color: '',
      }).catch(() => {});
    }

    // BLOQUE 0 — OPTIMISTIC UPDATE:
    // Quitar la venta cobrada del listado de pendientes INMEDIATAMENTE,
    // sin esperar al próximo refetch. Si por algún motivo el cobro falla más
    // adelante, el siguiente refetch automático corregirá el estado.
    try {
      const ventaCobradaId = ventaSeleccionada.id;
      queryClient.setQueryData(['ventas_pendientes_caja'], (prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.filter((v) => v?.id !== ventaCobradaId);
      });
    } catch (e) {
      console.warn('[Caja] optimistic pendientes:', e);
    }

    // Invalidar TODO lo que se refleja en Caja, Ventas, Registros y Dashboard.
    queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
    queryClient.invalidateQueries({ queryKey: ['mesas'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_all'] }); // ← FIX: query de pages/Ventas.jsx
    queryClient.invalidateQueries({ queryKey: ['registros_ventas'] });
    queryClient.invalidateQueries({ queryKey: ['propinas_dashboard_ventas'] });
    queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
    // Refetch activo de pendientes para que el badge en el header baje al instante.
    queryClient.refetchQueries({ queryKey: ['ventas_pendientes_caja'], type: 'active' }).catch(() => {});

    setProcesandoMsg('Generando ticket…');
    // Construir SNAPSHOT defensivo de los datos del ticket ANTES de limpiar nada.
    // Si algo de aquí falla, atrapamos el error y la venta NO se rompe — solo
    // perdemos el ticket en pantalla (la venta ya quedó cobrada en BD).
    try {
      const ventaPagada = {
        ...(ventaSeleccionada || {}),
        estado: 'pagada',
        metodo_pago: metodoPago,
        monto_efectivo: mEfec,
        monto_tarjeta: mTar,
        monto_transferencia: mTrans,
        cambio,
      };
      const detallesSnap = Array.isArray(detallesSeleccionados) ? [...detallesSeleccionados] : [];
      setTicketFinalData({ venta: ventaPagada, detalles: detallesSnap });
      setShowTicketFinal(true);
    } catch (errTicket) {
      console.error('[Caja] No se pudo preparar ticket final:', errTicket);
      toast.error('Venta cobrada, pero no se pudo mostrar el ticket. Búscalo en historial.');
    }

    // Limpieza de estados del cobro (independiente del ticket)
    setVentaSeleccionada(null);
    setDetallesSeleccionados([]);
    setMetodoPago('efectivo');
    setMontoEfectivo('');
    setMontoTarjeta('');
    setMontoTransferencia('');
    setPropinaEfectivo('');
    setPropinaTarjeta('');
    setPropinaTransferencia('');
    toast.success(`¡Venta cobrada! Cambio: ${formatCurrency(cambio)}`);
    } catch (err) {
      console.error('[Caja] Error al cobrar venta:', err);
      // 🟡 HOTFIX bandera amarilla #2: mensaje correcto según el momento del fallo.
      // - Si venta NO quedó pagada → "No se pudo cobrar" (cajero puede reintentar).
      // - Si venta SÍ quedó pagada → confirmar cobro y avisar que el problema fue
      //   en un paso posterior (inventario/ticket). La venta YA está en Ventas/Registros.
      if (ventaQuedoPagada) {
        toast.warning(
          'Venta cobrada correctamente. Hubo un problema con inventario o ticket. ' +
          'Búscala en Ventas o Registros — no la cobres de nuevo.',
          { duration: 10000 }
        );
      } else {
        toast.error('No se pudo cobrar la venta. Intenta de nuevo.');
      }
    } finally {
      setProcesando(false);
      setProcesandoMsg('');
    }
  };

  const invalidarCajaQueries = () => {
    // Refresca TODOS los lugares donde se ven cortes o resúmenes derivados de ellos.
    // Al cerrar caja, el dashboard y registros deben actualizarse inmediatamente.
    queryClient.invalidateQueries({ queryKey: ['cortes'] });
    queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado'] });
    queryClient.invalidateQueries({ queryKey: ['cortes_historial'] });
    queryClient.invalidateQueries({ queryKey: ['registros_cortes'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
    queryClient.invalidateQueries({ queryKey: ['gastos_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
    queryClient.invalidateQueries({ queryKey: ['descuentos_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['propinas_dashboard_ventas'] });
    queryClient.invalidateQueries({ queryKey: ['registros_ventas'] });
    // Refetch inmediato de las queries activas más importantes:
    queryClient.refetchQueries({ queryKey: ['cortes'] }).catch(() => {});
    queryClient.refetchQueries({ queryKey: ['ventas_hoy'] }).catch(() => {});
  };

  // 1) ABRIR CAJA — crea CorteCaja tipo cierre_diario, estado abierto.
  const handleAbrirCaja = async (form) => {
    if (accionLoading) return;
    if (!posUser?.id) { toast.error('No hay usuario POS activo'); return; }
    // FASE 2C — No se puede abrir caja sin sucursal activa.
    const sucId = sucursalEfectiva?.sucursal_id || null;
    if (!sucId) {
      toast.error('No se puede abrir caja sin sucursal activa. Selecciona una sucursal primero.');
      return;
    }
    // PARTE F — no abrir caja nueva si quedó un corte atrasado abierto.
    if (hayCorteAtrasado) {
      toast.error('Hay un corte abierto de un día anterior. Ciérralo antes de abrir caja hoy.');
      setShowAbrirCaja(false);
      return;
    }
    setAccionLoading(true);
    try {
      // Validar que NO haya otra caja abierta PARA ESTA SUCURSAL (defensivo).
      // Dos sucursales pueden tener caja abierta a la vez sin bloquearse.
      const cortesFresh = await base44.entities.CorteCaja.list('-created_date', 50);
      const yaAbierta = (Array.isArray(cortesFresh) ? cortesFresh : []).find(c =>
        c?.estado === 'abierto' &&
        (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte) &&
        c?.sucursal_id === sucId
      );
      if (yaAbierta) {
        toast.error('Ya existe una caja abierta en esta sucursal. Ciérrala antes de abrir otra.');
        invalidarCajaQueries();
        setShowAbrirCaja(false);
        return;
      }
      const ahora = new Date().toISOString();
      await base44.entities.CorteCaja.create({
        folio: await generarFolioCorte(
          sucId,
          sucursalEfectiva?.folio_prefijo ||
          sucursalEfectiva?.sucursal_nombre?.charAt(0) || 'X'
        ),
        tipo_corte: 'cierre_diario',
        estado: 'abierto',
        fecha_inicio: ahora,
        fecha_apertura: ahora,
        sucursal_id: sucId,
        sucursal_nombre: sucursalEfectiva?.sucursal_nombre || '',
        usuario_cajero_id: posUser.id,
        usuario_cajero_nombre: posUser.nombre,
        usuario_apertura_id: posUser.id,
        usuario_apertura_nombre: posUser.nombre,
        efectivo_inicial_contado: form.efectivo_inicial_contado,
        fondo_esperado_apertura: form.fondo_esperado_apertura,
        diferencia_apertura: form.diferencia_apertura,
        notas_apertura: form.notas_apertura,
      });
      invalidarCajaQueries();
      setShowAbrirCaja(false);
      toast.success('Caja abierta. Ya puedes cobrar.');
    } catch (err) {
      console.error('[Caja] handleAbrirCaja:', err);
      // Carrera real entre dos dispositivos: la validación de arriba es
      // read-then-create (TOCTOU). Desde la migración 0052 existe un índice
      // único parcial que garantiza UNA caja abierta por sucursal, así que la
      // perdedora recibe 23505. Se muestra EXACTAMENTE el mismo mensaje que ya
      // veía el personal en ese caso; no es un mensaje ni un paso nuevo.
      const esDuplicado =
        err?.code === '23505' ||
        /duplicate key value|ux_cortes_una_caja_abierta/i.test(err?.message || '');
      if (esDuplicado) {
        toast.error('Ya existe una caja abierta en esta sucursal. Ciérrala antes de abrir otra.');
        invalidarCajaQueries();
        setShowAbrirCaja(false);
      } else {
        toast.error('No se pudo abrir la caja');
      }
    } finally {
      setAccionLoading(false);
    }
  };


  // 6A: Verificar mesas pendientes ANTES de abrir el dialog de cierre.
  // Si todas están libres, abre el dialog. Si hay alguna ocupada, muestra el
  // dialog de bloqueo con la lista.
  const intentarAbrirCierreDiario = async () => {
    if (verificandoMesas) return;
    if (!hayCaja) {
      toast.error('No hay caja abierta.');
      return;
    }
    setVerificandoMesas(true);
    try {
      const pendientes = await obtenerMesasPendientesCierre();
      if (Array.isArray(pendientes) && pendientes.length > 0) {
        setMesasPendientes(pendientes);
        return;
      }
      // Sin mesas pendientes → permitir cierre
      setShowCierreDiario(true);
    } catch (e) {
      console.error('[Caja] verificar mesas pendientes:', e);
      // En caso de error de red, no bloqueamos: dejamos abrir el dialog
      // (defensivo, mejor permitir que el cajero cierre que dejarlo varado).
      setShowCierreDiario(true);
    } finally {
      setVerificandoMesas(false);
    }
  };

  // 3) CIERRE DIARIO — cierra la caja, genera PDF, reinicia dashboard operativo.
  const handleCierreDiario = async (form) => {
    if (accionLoading) return;
    if (!cajaAbierta?.id) { toast.error('No hay caja abierta para cerrar'); return; }
    setAccionLoading(true);
    try {
      // 6A: segunda verificación anti-race. Si alguien abrió una mesa
      // mientras el dialog estaba abierto, bloqueamos aquí también.
      const pendientesFinales = await obtenerMesasPendientesCierre().catch(() => []);
      if (Array.isArray(pendientesFinales) && pendientesFinales.length > 0) {
        setMesasPendientes(pendientesFinales);
        setShowCierreDiario(false);
        setAccionLoading(false);
        return;
      }
      // ── GUARDA ANTI-CEROS (incidente 2026-07-30 → 2026-08-08) ──────────
      // El corte se guardaba con los totales que hubiera calculado el cliente,
      // sin comprobar que la lista de ventas se hubiera cargado de verdad. Si
      // venía vacía o truncada, se escribían CEROS sobre un día con ventas
      // reales (pasó en 10 cortes, 79,530 sin reflejar).
      // Ahora se contrasta contra el SERVIDOR antes de escribir: si el corte
      // tiene ventas pagadas pero el resumen calculó 0, se aborta.
      if (!ventasCorteCargadas) {
        toast.error('Aún no se cargaron las ventas del corte. Espera unos segundos e inténtalo de nuevo.');
        refetchVentasCorte();
        setAccionLoading(false);
        return;
      }
      // FALLA CERRADA a propósito: si la verificación NO se puede hacer, no se
      // cierra. Antes esto usaba `.catch(() => null)` y se saltaba la comprobación
      // justo en el escenario "no se pueden leer las ventas", que es exactamente
      // el que produjo los ceros. Es preferible pedir un reintento a guardar un
      // corte irrecuperable.
      let ventasEnServidor = null;
      try {
        ventasEnServidor = await contarVentasDelCorte(cajaAbierta.id);
      } catch (e) {
        console.error('[Caja] no se pudo verificar ventas del corte:', e);
      }
      // Se compara CANTIDAD contra cantidad, no sólo "cero". Una carga PARCIAL
      // (el servidor tiene 26 y el cliente sólo 12) también corrompe el corte y
      // antes pasaba la guarda por no ser exactamente 0. El resumen puede tener
      // MÁS (incluye las ventas en tránsito sin corte_caja_id, que el conteo no
      // cuenta), pero nunca MENOS que las ya ligadas al corte.
      if (ventasEnServidor === null || ventasEnServidor > Number(resumen.numVentas || 0)) {
        console.error('[Caja] cierre abortado. servidor=', ventasEnServidor,
          'resumen.numVentas=', resumen.numVentas);
        toast.error('No se pudieron leer las ventas de este corte. No se cerró la caja para no guardar totales en cero. Revisa la conexión e inténtalo de nuevo.');
        refetchVentasCorte();
        queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
        setAccionLoading(false);
        return;
      }

      const fechaCierreIso = new Date().toISOString();
      const data = {
        tipo_corte: 'cierre_diario',
        estado: 'cerrado',
        fecha_cierre: fechaCierreIso,
        usuario_cajero_id: posUser?.id,
        usuario_cajero_nombre: posUser?.nombre,
        total_efectivo: resumen.totalEfectivo,
        total_tarjeta: resumen.totalTarjeta,
        total_transferencia: resumen.totalTransferencia,
        total_general: resumen.totalGeneral,
        total_propinas: resumen.totalPropinas || 0,
        propinas_por_mesero: JSON.stringify(resumen.propinasPorMesero || []),
        costo_total_estimado: resumen.costoTotal,
        utilidad_bruta_total: resumen.utilidadBruta,
        margen_promedio: margenProm,
        numero_ventas: resumen.numVentas,
        ticket_promedio: resumen.ticketPromedio,
        total_gastos: resumen.totalGastos,
        // CAMBIOS_V2 FIX 1 — único origen de verdad: ventas efectivo + propinas
        // efectivo + abonos efectivo − gastos efectivo. EXACTAMENTE el mismo valor
        // que muestra el diálogo de cierre (ambos usan efectivoEsperadoDeResumen).
        efectivo_esperado: efectivoEsperadoDeResumen(resumen),
        efectivo_contado: form.efectivo_contado,
        diferencia_efectivo: form.diferencia_efectivo,
        dinero_dejado_en_caja: form.dinero_dejado_en_caja,
        utilidad_neta_estimada: form.utilidad_neta_estimada,
        notas: form.notas,
      };

      const cerrado = await base44.entities.CorteCaja.update(cajaAbierta.id, data);
      const corteId = cajaAbierta.id;

      // Asociar al corte ventas sueltas pagadas tras la apertura sin corte_caja_id
      try {
        const aperturaIso = cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
        const apertura = aperturaIso ? new Date(aperturaIso).getTime() : 0;
        const ventasSueltas = (Array.isArray(ventasHoy) ? ventasHoy : []).filter(v =>
          v?.estado === 'pagada' && !v?.corte_caja_id && v?.fecha_cierre &&
          new Date(v.fecha_cierre).getTime() >= apertura
        );
        await Promise.all(ventasSueltas.map(v =>
          base44.entities.Venta.update(v.id, { corte_caja_id: corteId }).catch(() => {})
        ));
      } catch (err) {
        console.warn('[Caja] asociar ventas al cierre:', err);
      }

      // Cola de sincronización (no bloqueante)
      try {
        const nowIso = new Date().toISOString();
        await Promise.all([
          base44.entities.IntegrationSyncLog.create({
            record_type: 'cash_cut', record_id: corteId, destination: 'google_sheets',
            status: 'pending_external_sync', attempts: 0, last_attempt_at: nowIso,
          }),
          base44.entities.IntegrationSyncLog.create({
            record_type: 'cash_cut_pdf', record_id: corteId, destination: 'google_drive',
            status: 'pending_external_sync', attempts: 0, last_attempt_at: nowIso,
          }),
        ]);
        queryClient.invalidateQueries({ queryKey: ['integration_sync_logs_pending'] });
      } catch (err) {
        console.warn('[Caja] IntegrationSyncLog:', err);
      }

      invalidarCajaQueries();
      queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
      // El PDF del corte lee con queryKey ['pdf_corte', corteId, sucId] y
      // staleTime:0. Invalidamos por si quedó cache de una apertura previa,
      // así el preview/descarga inmediatos salen hidratados y consistentes.
      queryClient.invalidateQueries({ queryKey: ['pdf_corte', corteId] });

      const corteFinal = cerrado || { ...data, id: corteId, folio: cajaAbierta.folio };
      setCorteCerrado(corteFinal);
      setShowCierreDiario(false);

      // Auto-descarga PDF si la config lo permite
      const autoPDF = config?.descargar_pdf_corte_auto !== false;
      if (autoPDF) setAutoDownloadCorte(corteFinal);

      setShowCierreExito(true);
      toast.success('¡Caja cerrada correctamente!');
    } catch (err) {
      console.error('[Caja] handleCierreDiario:', err);
      // Los guards de la base (0058 / 0064) rechazan el cierre cuando la
      // pantalla trae MENOS ventas de las que hay ligadas al corte. Hasta hoy
      // ese error se tragaba aquí y el cajero sólo leía "Intenta de nuevo",
      // reintentaba y volvía a fallar: un callejón sin salida.
      //
      // Se decide por MARCADOR, no por SQLSTATE, y NUNCA se vuelca el error
      // crudo a la pantalla: si no reconocemos el marcador, se muestra el
      // genérico de siempre.
      if (cierreBloqueadoPorLaBase(err)) {
        toast.error('Todavía no se guardó el corte', {
          duration: 60000,
          description: (
            <div className="space-y-2 text-sm leading-relaxed">
              <p className="font-semibold">
                La caja sigue abierta y no se perdió ninguna venta.
              </p>
              <p>La pantalla no alcanzó a cargar todas las ventas del día.</p>
              <p className="font-semibold">Haz esto:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Cierra la aplicación por completo y vuelve a abrirla.</li>
                <li>Entra a <strong>Caja → Resumen</strong> y comprueba que aparece el dinero del día.</li>
                <li>Vuelve a tocar <strong>Cierre diario</strong>.</li>
              </ol>
              <p>
                Si después de dos intentos sigue saliendo este aviso,{' '}
                <strong>deja la caja abierta y avisa a Miguel por WhatsApp</strong>. No pasa
                nada por dejarla abierta: las ventas están guardadas.
              </p>
            </div>
          ),
        });
      } else {
        toast.error('No se pudo cerrar la caja. Intenta de nuevo.');
      }
    } finally {
      setAccionLoading(false);
    }
  };

  return (
    <div className="space-y-4 px-1 sm:px-0 max-w-full overflow-x-hidden">
      {/* PARTE D — beep suave al llegar un nuevo pedido web (respeta sonidos_activos) */}
      <PedidoWebBeep count={pedidosWebPendientes.length} sonidosActivos={config?.sonidos_activos !== false} />
      {/* Header — responsive: stack en móvil, botones en grid 3-col */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,34%) 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <Landmark className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-heading font-bold">Caja</h1>
              <button
                onClick={() => queryClient.invalidateQueries()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                title="Refrescar datos sin salir de la sección"
              >
                <RefreshCw className="w-3 h-3" />
                Actualizar
              </button>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {cajaVerificando ? 'Verificando caja…'
                : hayCaja ? (
                  isCajaDirecta ? 'Punto de venta directo' : `${ventasPendientes.length} cobros pendientes`
                ) : 'Caja cerrada'}
            </p>
          </div>
        </div>

        {/* === BOTONES PRINCIPALES — grid en móvil para que se vean enteros ===
            En Restaurante Pro agregamos "Para llevar" a la izquierda de "Abrir caja",
            con la misma altura (size="sm") pero más ancho. Reutiliza /pos (sin lógica nueva). */}
        <div className={`grid ${!isCajaDirecta && hayCaja ? 'grid-cols-5' : 'grid-cols-4'} sm:flex gap-2 w-full sm:w-auto`}>
          {/* Fase 3/4 — Pedido de pastel personalizado (requiere caja abierta) */}
          {hayCaja ? (
            <Link to="/pedidos-pastel/nuevo" className="contents">
              <Button size="sm" title="Registrar pedido de pastel personalizado"
                className="px-2 sm:px-4"
                style={{ background: 'linear-gradient(135deg, hsl(330,70%,55%) 0%, hsl(330,70%,42%) 100%)' }}>
                <Cake className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Pastel personalizado</span>
                <span className="sm:hidden text-[10px]">Pastel</span>
              </Button>
            </Link>
          ) : (
            <Button size="sm" disabled title="Abre la caja para crear pedidos"
              className="px-2 sm:px-4 opacity-50 cursor-not-allowed"
              onClick={() => toast.error('Abre la caja para registrar pedidos de pastel.')}>
              <Cake className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Pastel (caja cerrada)</span>
              <span className="sm:hidden text-[10px]">Pastel</span>
            </Button>
          )}
          {!isCajaDirecta && hayCaja && (
            <Link to="/pos" className="contents">
              <Button
                size="sm"
                title="Venta directa sin mesa: cobra y entrega"
                className="px-4 sm:px-5"
                style={{ background: 'linear-gradient(135deg, hsl(217,91%,55%) 0%, hsl(217,91%,45%) 100%)' }}
              >
                <ShoppingBag className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Para llevar</span>
                <span className="sm:hidden text-[10px]">Llevar</span>
              </Button>
            </Link>
          )}
          <Button
            size="sm"
            onClick={() => setShowAbrirCaja(true)}
            disabled={hayCaja}
            variant={hayCaja ? 'outline' : 'default'}
            title={hayCaja ? 'Ya hay una caja abierta' : 'Abrir caja para comenzar operación'}
            className="px-2"
          >
            <DoorOpen className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Abrir caja</span>
            <span className="sm:hidden text-[10px]">Abrir</span>
          </Button>
          <Button
            size="sm"
            onClick={intentarAbrirCierreDiario}
            disabled={!hayCaja || verificandoMesas}
            title={!hayCaja ? 'Necesitas una caja abierta' : 'Cierre final del día'}
            className="px-2"
            style={hayCaja ? { background: 'linear-gradient(135deg, hsl(0,72%,46%) 0%, hsl(0,72%,36%) 100%)' } : undefined}
          >
            <Lock className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">{verificandoMesas ? 'Verificando…' : 'Cierre diario'}</span>
            <span className="sm:hidden text-[10px]">{verificandoMesas ? '…' : 'Cierre'}</span>
          </Button>
        </div>
      </div>

      {/* PARTE F — Banner de corte atrasado (bloquea operar hoy). Tiene
          prioridad sobre el resto de avisos. El botón abre el flujo de cierre
          del corte atrasado, que es justamente la caja abierta de la sucursal. */}
      {hayCorteAtrasado && (
        <CorteAtrasadoBanner corte={corteAtrasado} onIrACerrar={intentarAbrirCierreDiario} />
      )}

      {/* Aviso si NO hay caja abierta — solo si ya confirmamos el estado.
          Mientras cajaStatus === 'unknown' no afirmamos "cerrada" todavía. */}
      {cajaVerificando ? (
        <div className="px-4 py-3 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-muted-foreground/40 border-t-primary rounded-full animate-spin" />
          <p className="flex-1">Verificando estado de caja…</p>
        </div>
      ) : (!hayCaja && !esDueno) ? (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 text-sm text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">
            <p className="font-bold">No hay caja abierta</p>
            <p className="text-xs opacity-90">Abre caja para comenzar operación. No se puede cobrar ni generar tickets finales sin caja abierta.</p>
          </div>
          <Button size="sm" onClick={() => setShowAbrirCaja(true)} className="shrink-0">
            <DoorOpen className="w-4 h-4 mr-1" /> Abrir caja
          </Button>
        </div>
      ) : null}

      {/* Acción principal SOLO en Esencial/Operativo: grid 2-col con "Nueva venta" + "Cierre diario".
          En Restaurante Pro: "Para llevar" vive en el header (junto a Abrir caja). */}
      {hayCaja && isCajaDirecta && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Link to="/pos" className="block">
            <button
              className="w-full p-5 rounded-2xl border-2 border-primary bg-primary text-primary-foreground text-left transition-all hover:brightness-110 active:scale-[0.99]"
              style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.2) inset, 0 6px 18px rgba(0,0,0,0.15)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-heading font-black text-xl leading-tight">Nueva venta</p>
                  <p className="text-xs opacity-90">Selecciona productos y cobra al instante</p>
                </div>
              </div>
            </button>
          </Link>
          {/* FASE 3 — Venta libre (Entry B, modo empleado): navega a /pos con el
              ítem precargado y el cajero cobra por el flujo normal (sin checkout
              duplicado en Caja). */}
          <button
            onClick={() => setShowVentaLibreCaja(true)}
            className="w-full p-5 rounded-2xl border-2 border-border bg-card text-left transition-all hover:bg-muted active:scale-[0.99]"
            style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 6px 18px rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Coins className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-heading font-black text-xl leading-tight">Venta libre</p>
                <p className="text-xs text-muted-foreground">Cobra un monto sin producto (Mercado Pago, extras…)</p>
              </div>
            </div>
          </button>
          <button
            onClick={intentarAbrirCierreDiario}
            disabled={verificandoMesas}
            className="w-full p-5 rounded-2xl border-2 border-border bg-card text-left transition-all hover:bg-muted active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 6px 18px rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                <Lock className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="font-heading font-black text-xl leading-tight">{verificandoMesas ? 'Verificando…' : 'Cierre diario'}</p>
                <p className="text-xs text-muted-foreground">Finaliza el día y genera PDF</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* FASE 3 — Venta libre (Entry B): captura monto+nombre y navega a /pos con
          el ítem precargado; el cobro va por el flujo COMPLETO de POS. */}
      <VentaLibreDialog
        open={showVentaLibreCaja}
        onClose={() => setShowVentaLibreCaja(false)}
        confirmLabel="Cobrar"
        onConfirm={(item) => {
          setShowVentaLibreCaja(false);
          navigate('/pos', { state: { ventaLibre: item } });
        }}
      />

      {hayCaja && cajaAbierta && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Caja abierta desde {safeFormatDate(cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio, "d MMM, HH:mm")} · {cajaAbierta.folio}
            {cajaAbierta.usuario_apertura_nombre && ` · por ${cajaAbierta.usuario_apertura_nombre}`}
          </span>
        </div>
      )}

      <Tabs defaultValue={isCajaDirecta ? 'buscar' : 'cobros'}>
        {/* Tabs scrollable horizontalmente en móvil */}
        <TabsList className="mb-4 flex w-full overflow-x-auto justify-start no-scrollbar">
          {!isCajaDirecta && (
            <TabsTrigger value="cobros" className="shrink-0">Pendientes ({ventasPendientes.length})</TabsTrigger>
          )}
          <TabsTrigger
            value="pedidos"
            className="shrink-0 relative"
            onClick={() => setPedidosWebVistos(pedidosWebPendientes.length)}
          >
            Pedidos
            {pedidosWebList.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold ${hayPedidosWebNuevos ? 'bg-red-600 animate-pulse' : 'bg-pink-500'}`}>
                {pedidosWebList.length}
              </span>
            )}
            {/* Punto rojo parpadeante en la esquina cuando hay pedidos nuevos sin ver */}
            {hayPedidosWebNuevos && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="buscar" className="shrink-0">Buscar</TabsTrigger>
          <TabsTrigger value="gastos" className="shrink-0">Gastos</TabsTrigger>
          <TabsTrigger value="resumen" className="shrink-0">Resumen</TabsTrigger>
          <TabsTrigger value="historial" className="shrink-0">Historial</TabsTrigger>
        </TabsList>

        {/* COBROS PENDIENTES (solo Restaurante Pro) */}
        {!isCajaDirecta && (
        <TabsContent value="cobros">
          {ventasPendientes.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-300" />
              <p className="font-medium">Sin cobros pendientes</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ventasPendientes.map(v => {
                const esCero = !v.total || v.total <= 0;
                return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => esCero ? handleEliminarTicketCero(v) : abrirVenta(v)}
                  className={`skeu-card w-full p-4 rounded-2xl text-left transition-all active:scale-[0.98] ${esCero ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-[#E8579A]'}`}
                  style={{ touchAction: 'manipulation' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-heading font-bold text-base">Mesa {v.mesa_numero || '—'}</p>
                      <p className="text-xs text-muted-foreground">{v.folio}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${esCero ? 'bg-red-200 text-red-800' : 'bg-purple-200 text-purple-800'}`}>
                      {esCero ? 'En cero' : 'Cuenta'}
                    </span>
                  </div>
                  <p className={`text-2xl font-heading font-black ${config?.colorear_importes_monetarios !== false ? 'text-primary' : 'text-foreground'}`}>{formatCurrency(v.total)}</p>
                  {/* Badges QR — diferencian estado de la propina del comensal */}
                  {(v.propina_origen === 'portal_qr' || v.propina_origen === 'pendiente_portal_qr') && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {v.propina_origen === 'pendiente_portal_qr' || v.propina_tipo === 'pendiente_cliente' ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          QR: esperando propina
                        </span>
                      ) : v.propina_tipo === 'decidir_en_caja' ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          QR: decidir en caja
                        </span>
                      ) : v.propina_tipo === 'sin_propina' ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          QR: sin propina
                        </span>
                      ) : v.propina_tipo === 'porcentaje' && Number(v.propina_porcentaje) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                          QR: propina {v.propina_porcentaje}% ({formatCurrency(Number(v.propina_monto) || 0)})
                        </span>
                      ) : (Number(v.propina_monto) || 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                          QR: propina {formatCurrency(Number(v.propina_monto) || 0)}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          QR: cuenta solicitada
                        </span>
                      )}
                    </div>
                  )}
                  {v.codigo_caja && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Código: <span className="font-mono font-bold">{v.codigo_caja}</span>
                    </p>
                  )}
                  {v.personas > 0 && (
                    <p className="text-[10px] text-muted-foreground">{v.personas} personas{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}</p>
                  )}
                  <p className={`mt-2 text-xs font-semibold ${esCero ? 'text-red-700' : 'text-primary'}`}>
                    {esCero ? '🗑 Borrar ticket en cero →' : 'Toca para cobrar →'}
                  </p>
                </button>
                );
              })}
            </div>
          )}
        </TabsContent>
        )}

        {/* PEDIDOS WEB DE CATÁLOGO (Fase 7) — lista + búsqueda por folio */}
        <TabsContent value="pedidos">
          <div className="space-y-4">
            {/* Búsqueda de pedido web por folio */}
            <div className="max-w-sm">
              <p className="text-xs text-muted-foreground mb-2 font-medium">
                Buscar pedido web por folio (PP-A-0001)
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={busquedaFolioWeb}
                  onChange={e => setBusquedaFolioWeb(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleBuscarFolioWeb()}
                  placeholder="PP-A-0001"
                  className="skeu-input flex-1 px-3 py-2 text-sm rounded-lg uppercase"
                />
                <button
                  onClick={handleBuscarFolioWeb}
                  className="px-4 py-2 bg-pink-500 text-white text-sm font-medium rounded-lg hover:bg-pink-600 transition-colors"
                >
                  Buscar
                </button>
              </div>
              {pedidoWebBuscado && (
                <div className="mt-3">
                  <PedidoWebCajaCard
                    pedido={pedidoWebBuscado}
                    onVer={() => setPedidoWebDetalle(pedidoWebBuscado)}
                  />
                </div>
              )}
            </div>

            {/* Lista de pedidos web de catálogo ACTIVOS (FASE 3 #2 findability):
                PENDIENTES de cobro + EN PROCESO (con anticipo / por entregar),
                para seguir el pedido hasta entregarlo, igual que el pastel. */}
            {pedidosWebList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No hay pedidos web de catálogo activos.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {pedidosWebPendientes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Pendientes de cobro ({pedidosWebPendientes.length})
                    </p>
                    {pedidosWebPendientes.map(pedido => (
                      <PedidoWebCajaCard
                        key={pedido.id}
                        pedido={pedido}
                        onVer={() => setPedidoWebDetalle(pedido)}
                      />
                    ))}
                  </div>
                )}
                {pedidosWebEnProceso.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      En proceso — con anticipo / por entregar ({pedidosWebEnProceso.length})
                    </p>
                    {pedidosWebEnProceso.map(pedido => (
                      <PedidoWebCajaCard
                        key={pedido.id}
                        pedido={pedido}
                        onVer={() => setPedidoWebDetalle(pedido)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* BUSCAR */}
        <TabsContent value="buscar">
          <div className="max-w-sm mx-auto space-y-4">
            <div className="p-5 rounded-xl border bg-white space-y-3"
              style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(0,0,0,0.06)' }}>
              <p className="font-heading font-semibold">Buscar por código o folio</p>
              <div className="flex gap-2">
                <Input value={codigoBusqueda}
                  onChange={e => setCodigoBusqueda(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && buscarVenta()}
                  placeholder="Ej: M03-5821"
                  className="skeu-input font-mono text-lg h-12 tracking-wider" />
                <Button onClick={buscarVenta} className="h-12 px-4">
                  <Search className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* === Prompt 5c — Buscar venta por FOLIO para cancelar/devolver === */}
            <div className="p-5 rounded-xl border bg-white space-y-3"
              style={{ boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(0,0,0,0.06)' }}>
              <div>
                <p className="font-heading font-semibold">Cancelar o devolver una venta</p>
                <p className="text-xs text-muted-foreground">Busca por folio del ticket (de cualquier fecha).</p>
              </div>
              <div className="flex gap-2">
                <Input value={folioVentaBusqueda}
                  onChange={e => setFolioVentaBusqueda(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleBuscarVentaFolio()}
                  placeholder="Ej: CONF-A-V3745"
                  className="skeu-input font-mono text-base h-12 tracking-wide" />
                <Button onClick={handleBuscarVentaFolio} disabled={buscandoVentaFolio} className="h-12 px-4">
                  {buscandoVentaFolio
                    ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Search className="w-5 h-5" />}
                </Button>
              </div>
              {ventaFolioEncontrada && (
                <BuscarVentaFolioCard
                  venta={ventaFolioEncontrada}
                  detalles={detallesVentaFolio}
                  onCancelar={() => setModoCancelarVenta('cancelacion')}
                  onDevolver={() => setModoCancelarVenta('devolucion')}
                />
              )}
            </div>
          </div>
        </TabsContent>

        {/* GASTOS — CAMBIOS_V2 Fase 07: registrar gastos del corte abierto */}
        <TabsContent value="gastos">
          <GastosCajaTab
            cajaAbierta={cajaAbierta}
            posUser={posUser}
            sucursalEfectiva={sucursalEfectiva}
            gastos={resumen.gastosDelCorte || []}
          />
        </TabsContent>

        {/* RESUMEN — usa componente unificado con propinas + total cobrado */}
        <TabsContent value="resumen">
          {/* Botón Actualizar dentro del resumen (vista sucursal y vista general).
              Discreto, no obstruye las tarjetas. Refresca sin salir de sección. */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Resumen del día
            </h2>
            <button
              onClick={() => queryClient.invalidateQueries()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw className="w-3 h-3" />
              Actualizar
            </button>
          </div>
          <ResumenDelDia
            resumen={resumen}
            margenProm={margenProm}
            verCostos={verCostos}
            ventasHoy={ventasHoy}
            cajaAbierta={cajaAbierta}
            ventasPendientes={ventasPendientes}
            entregas={entregasDelDia}
            colorearImportes={config?.colorear_importes_monetarios !== false}
          />
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="historial">
          <CorteHistorialList limit={100} />
        </TabsContent>
      </Tabs>

      {/* COBRO DIALOG
          Ancho útil aumentado (sm:max-w-lg) + scroll vertical limpio para no
          cortar contenido en pantallas chicas. Solo CAMBIO VISUAL — la lógica
          (cobrar / ajustar / propinas / métodos) NO se toca. */}
      <Dialog open={!!ventaSeleccionada} onOpenChange={() => setVentaSeleccionada(null)}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="font-heading text-lg sm:text-xl">
              Cobrar — Mesa {ventaSeleccionada?.mesa_numero || ventaSeleccionada?.folio}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Aviso si la cuenta involucra el Portal QR del comensal */}
            {(ventaSeleccionada?.propina_origen === 'portal_qr' ||
              ventaSeleccionada?.propina_origen === 'pendiente_portal_qr') && (() => {
              const origen = ventaSeleccionada?.propina_origen;
              const tipo = ventaSeleccionada?.propina_tipo;
              const monto = Number(ventaSeleccionada?.propina_monto) || 0;
              let titulo = 'Cuenta solicitada desde QR';
              let mensaje = '';
              let palette = 'bg-blue-50 border-blue-200 text-blue-900';
              if (origen === 'pendiente_portal_qr' || tipo === 'pendiente_cliente') {
                titulo = 'QR: esperando propina del comensal';
                mensaje = 'El cliente aún no eligió propina en el QR. Puedes esperar o cobrar definiendo tú la propina.';
                palette = 'bg-amber-50 border-amber-200 text-amber-900';
              } else if (tipo === 'decidir_en_caja') {
                titulo = 'El cliente decidió en caja';
                mensaje = 'Define la propina aquí (porcentaje, monto o sin propina) antes de cobrar.';
                palette = 'bg-blue-50 border-blue-200 text-blue-900';
              } else if (tipo === 'sin_propina') {
                mensaje = 'El cliente eligió no dejar propina.';
              } else if (monto > 0) {
                mensaje = `Propina sugerida por el cliente: ${formatCurrency(monto)}. Puedes ajustarla o quitarla si lo pide.`;
              }
              return (
                <div className={`rounded-xl px-3 py-2.5 border text-xs flex items-start gap-2.5 ${palette}`}>
                  <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-bold leading-snug">{titulo}</p>
                    {mensaje && <p className="leading-relaxed break-words">{mensaje}</p>}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {detallesSeleccionados.map((d, i) => {
                // 6B / 1.G: líneas variables → "Barbacoa · 500 g"; precio_fijo → "Hamburguesa ×2"
                const tipoSnap = d?.tipo_venta_snapshot;
                const esVariable = tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA || tipoSnap === TIPO_VENTA.PORCION_CONTENEDOR;
                return (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-dashed">
                    <span>
                      {d?.producto_nombre}
                      {esVariable ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold">
                          {tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA
                            ? `${Number(d?.cantidad_variable_snapshot) || 0} ${d?.unidad_variable_snapshot || ''}`
                            : `${Number(d?.cantidad_porciones_snapshot) || 0} ${d?.nombre_porcion_snapshot || ''}`}
                        </span>
                      ) : (
                        <span> ×{d?.cantidad}</span>
                      )}
                    </span>
                    <span className="font-medium">{formatCurrency(d?.subtotal)}</span>
                  </div>
                );
              })}
            </div>
            {/* Subtotal + (IVA visual) + Propina + Total a cobrar.
                PASO 2 IVA: si hay IVA configurado, mostramos desglose visual
                del consumo. NO cambia ventaSeleccionada.total ni el cobro. */}
            {(() => {
              const ivaCaja = desgloseIvaDesdeConfig(ventaSeleccionada?.total || 0, config);
              return (
            <div className="border-t pt-2 space-y-1">
              {ivaCaja.aplica ? (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal s/IVA</span>
                    <span>{formatCurrency(ivaCaja.subtotalSinIva)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>IVA {ivaCaja.porcentaje}%</span>
                    <span>{formatCurrency(ivaCaja.ivaMonto)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t pt-1">
                    <span>Consumo (IVA incluido)</span>
                    <span>{formatCurrency(ventaSeleccionada?.total || 0)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(ventaSeleccionada?.total || 0)}</span>
                </div>
              )}
              {(Number(ventaSeleccionada?.propina_monto) || 0) > 0 && (
                <div className="flex justify-between text-sm text-rose-600">
                  <span>Propina {ventaSeleccionada?.propina_porcentaje > 0 ? `(${ventaSeleccionada.propina_porcentaje}%)` : ''}</span>
                  <span>+ {formatCurrency(Number(ventaSeleccionada?.propina_monto) || 0)}</span>
                </div>
              )}
              {(ventaSeleccionada?.propina_tipo === 'pendiente' ||
                ventaSeleccionada?.propina_tipo === 'pendiente_cliente' ||
                ventaSeleccionada?.propina_tipo === 'decidir_en_caja') && (
                <button
                  type="button"
                  onClick={() => setShowPropinaCaja(true)}
                  className="w-full text-left text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
                >
                  {ventaSeleccionada?.propina_tipo === 'decidir_en_caja'
                    ? 'Cliente eligió decidir en caja — toca para definir propina'
                    : ventaSeleccionada?.propina_tipo === 'pendiente_cliente'
                      ? 'Cliente no eligió propina en QR — toca para definirla'
                      : 'Propina pendiente — toca para definirla'}
                </button>
              )}
              <div className="flex justify-between font-black text-lg border-t pt-2">
                <span>TOTAL A COBRAR</span>
                <span className={config?.colorear_importes_monetarios !== false ? 'text-primary' : 'text-foreground'}>{formatCurrency(totalACobrarVenta)}</span>
              </div>
            </div>
              );
            })()}
            {(!ventaSeleccionada?.total || ventaSeleccionada.total <= 0) && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                Este ticket está en $0.00. No se puede cobrar. Puedes eliminarlo para limpiar la caja.
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Método de pago</Label>
              <div className="grid grid-cols-2 gap-2.5 mt-2">
                {METODOS.map(m => (
                  <button key={m.key} onClick={() => setMetodoPago(m.key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${metodoPago === m.key ? m.color + ' shadow-md' : 'border-border bg-white text-muted-foreground hover:bg-muted'}`}>
                    <m.Icon className="w-4 h-4 shrink-0" />{m.label}
                  </button>
                ))}
              </div>
            </div>
            {metodoPago === 'efectivo' && (
              <div>
                <Label className="text-xs">Recibido</Label>
                <NumericInput value={montoEfectivo}
                  onChange={e => setMontoEfectivo(e.target.value)}
                  placeholder="0.00" className="text-xl font-bold h-12 mt-1.5" />
                {montoEfectivo && (
                  <p className={`text-sm font-bold mt-1.5 ${calcularCambio() >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    Cambio: {formatCurrency(calcularCambio())}
                  </p>
                )}
              </div>
            )}
            {metodoPago === 'mixto' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Efectivo</Label><NumericInput value={montoEfectivo} onChange={e => setMontoEfectivo(e.target.value)} placeholder="0" className="mt-1" /></div>
                  <div><Label className="text-xs">Tarjeta</Label><NumericInput value={montoTarjeta} onChange={e => setMontoTarjeta(e.target.value)} placeholder="0" className="mt-1" /></div>
                  <div><Label className="text-xs">Transfer.</Label><NumericInput value={montoTransferencia} onChange={e => setMontoTransferencia(e.target.value)} placeholder="0" className="mt-1" /></div>
                </div>

                {/* ¿Cómo se pagó la propina? — exacta, no proporcional */}
                {(Number(ventaSeleccionada?.propina_monto) || 0) > 0 && (
                  <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-200">
                    <p className="text-xs font-bold text-rose-700 mb-2">
                      ¿Cómo se pagó la propina? <span className="font-mono">{formatCurrency(Number(ventaSeleccionada?.propina_monto) || 0)}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px]">Efectivo</Label>
                        <NumericInput value={propinaEfectivo} onChange={e => setPropinaEfectivo(e.target.value)} placeholder="0" className="mt-1 h-9" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Tarjeta</Label>
                        <NumericInput value={propinaTarjeta} onChange={e => setPropinaTarjeta(e.target.value)} placeholder="0" className="mt-1 h-9" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Transfer.</Label>
                        <NumericInput value={propinaTransferencia} onChange={e => setPropinaTransferencia(e.target.value)} placeholder="0" className="mt-1 h-9" />
                      </div>
                    </div>
                    {(() => {
                      const sP = (parseFloat(propinaEfectivo) || 0) + (parseFloat(propinaTarjeta) || 0) + (parseFloat(propinaTransferencia) || 0);
                      const pT = Number(ventaSeleccionada?.propina_monto) || 0;
                      const cuadra = Math.abs(sP - pT) < 0.01;
                      return (
                        <p className={`mt-2 text-[11px] font-semibold ${cuadra ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {cuadra
                            ? `✓ Cuadra: ${formatCurrency(sP)} de propina distribuida.`
                            : `La suma (${formatCurrency(sP)}) debe ser igual a la propina total (${formatCurrency(pT)}).`}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
          {/* Footer: en móvil columna apilada con orden lógico (Cobrar primero por
              ser la acción principal), en sm+ fila con wrap limpio sin encimes. */}
          <DialogFooter className="mt-2 flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setVentaSeleccionada(null)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            {/* PROMPT B — Ajustar cuenta. Solo si la venta NO está pagada/cancelada
                y tiene total > 0 (no tendría sentido ajustar un ticket en cero). */}
            {ventaSeleccionada &&
              ventaSeleccionada.estado !== 'pagada' &&
              ventaSeleccionada.estado !== 'cancelada' &&
              Number(ventaSeleccionada.total) > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAjustarCuenta(true)}
                  disabled={procesando}
                  className="w-full sm:w-auto border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  title="Modificar productos, cantidades o precios antes de cobrar"
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Ajustar cuenta
                </Button>
              )}
            {(!ventaSeleccionada?.total || ventaSeleccionada.total <= 0) ? (
              <Button
                variant="destructive"
                onClick={() => handleEliminarTicketCero(ventaSeleccionada)}
                className="w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4 mr-1" />Borrar ticket en cero
              </Button>
            ) : (
              <Button onClick={handleCobrar} disabled={procesando}
                className="w-full sm:w-auto sm:min-w-[160px]"
                style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)' }}>
                {procesando ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
                    {procesandoMsg || 'Procesando…'}
                  </span>
                ) : `Cobrar ${formatCurrency(totalACobrarVenta)}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TICKET FINAL DIALOG — envuelto en SafeBoundary para que un fallo de
          render NO produzca pantalla blanca: solo muestra fallback compacto. */}
      <Dialog open={showTicketFinal} onOpenChange={setShowTicketFinal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Venta cobrada</DialogTitle>
          </DialogHeader>
          <SafeBoundary
            label="TicketFinal"
            fallbackTitle="No se pudo mostrar el ticket."
            fallbackMessage="La venta se cobró correctamente. Puedes verla en el historial."
            onReset={() => setShowTicketFinal(false)}
          >
            <div className="bg-muted/30 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
              {ticketFinalData?.venta ? (
                <PreCuentaTicket
                  venta={ticketFinalData.venta}
                  detalles={Array.isArray(ticketFinalData.detalles) ? ticketFinalData.detalles : []}
                  config={config}
                  esFinal />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos del ticket.</p>
              )}
            </div>
          </SafeBoundary>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTicketFinal(false)}>Cerrar</Button>
            <Button
              onClick={async () => {
                if (imprimiendoTicketFinal) return; // evita doble impresión por doble clic
                setImprimiendoTicketFinal(true);
                try {
                  // FASE 2: `await` cubre todo el tiempo real de impresión (el helper
                  // devuelve la promesa nativa). Si falla, el helper ya avisó con toast.
                  await printDocument({ mode: 'thermal', title: `Ticket-${ticketFinalData?.venta?.folio || ''}` });
                } catch (err) {
                  console.error('[Caja] imprimir ticket:', err);
                } finally {
                  setImprimiendoTicketFinal(false);
                }
              }}
              disabled={imprimiendoTicketFinal}
              aria-busy={imprimiendoTicketFinal}
              className="transition-transform active:scale-95"
            >
              {imprimiendoTicketFinal
                ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" />Imprimiendo…</>)
                : (<><Printer className="w-4 h-4 mr-1" />Imprimir</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* === PROMPT B — AJUSTAR CUENTA === */}
      <AjustarCuentaDialog
        open={showAjustarCuenta}
        venta={ventaSeleccionada}
        detalles={detallesSeleccionados}
        config={config}
        posUser={posUser}
        onClose={() => setShowAjustarCuenta(false)}
        onSaved={async () => {
          setShowAjustarCuenta(false);
          await recargarVentaAjustada();
        }}
      />

      {/* === 3 MODALES NUEVOS === */}
      <AbrirCajaDialog
        open={showAbrirCaja}
        onOpenChange={setShowAbrirCaja}
        posUser={posUser}
        fondoEsperado={fondoEsperado}
        loading={accionLoading}
        onConfirm={handleAbrirCaja}
      />
      <CierreDiarioDialog
        open={showCierreDiario}
        onOpenChange={setShowCierreDiario}
        posUser={posUser}
        cajaAbierta={cajaAbierta}
        resumen={resumen}
        loading={accionLoading}
        onConfirm={handleCierreDiario}
        colorearImportes={config?.colorear_importes_monetarios !== false}
        esEsencial={paquete_modo === 'esencial'}
      />

      {/* CIERRE EXITO DIALOG */}
      <Dialog open={showCierreExito} onOpenChange={setShowCierreExito}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              Caja cerrada correctamente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-muted-foreground">Folio del corte</p>
              <p className="font-mono font-bold text-lg">{corteCerrado?.folio}</p>
              <p className="text-xs text-muted-foreground mt-2">Total cerrado</p>
              <p className={`font-heading font-black text-2xl ${config?.colorear_importes_monetarios !== false ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}`}>
                {formatCurrency(corteCerrado?.total_general || resumen.totalGeneral)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button onClick={() => { setVerPDFCorte(corteCerrado); setShowCierreExito(false); }} className="gap-2">
                <FileText className="w-4 h-4" /> Ver PDF de corte
              </Button>
              <Button variant="outline" onClick={() => { setVerPDFCorte(corteCerrado); setShowCierreExito(false); }} className="gap-2">
                <Printer className="w-4 h-4" /> Imprimir / descargar
              </Button>
              <Button variant="ghost" onClick={() => setShowCierreExito(false)}>Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6A: bloqueo cuando hay mesas abiertas */}
      <MesasPendientesCierreDialog
        open={Array.isArray(mesasPendientes) && mesasPendientes.length > 0}
        mesas={mesasPendientes || []}
        onClose={() => setMesasPendientes(null)}
      />

      {/* Prompt 6 — Pedido de catálogo web: mismo diálogo del pastel (ticket +
          anticipo + entregar, SIN editar). Reusa PedidoPastelDetalleDialog. */}
      <PedidoPastelDetalleDialog
        pedido={pedidoWebDetalle}
        open={!!pedidoWebDetalle}
        onClose={() => {
          setPedidoWebDetalle(null);
          refetchPedidosWeb();
          if (pedidoWebBuscado) { setPedidoWebBuscado(null); setBusquedaFolioWeb(''); }
        }}
      />

      {/* Prompt 5c — Cancelar/Devolver venta buscada por folio (reusa diálogo 5a) */}
      <CancelarVentaDialog
        open={!!modoCancelarVenta}
        modo={modoCancelarVenta || 'cancelacion'}
        venta={ventaFolioEncontrada}
        posUser={posUser}
        onClose={() => setModoCancelarVenta(null)}
        onDone={recargarVentaFolio}
      />

      {/* FASE 3 #5 — Cancelar pedido de catálogo web desde la cola de Caja
          (tipo/motivo/sello). La devolución de anticipo (#4) se conecta luego. */}
      <CancelarPedidoDialog
        open={!!pedidoWebACancelar}
        pedido={pedidoWebACancelar}
        posUser={posUser}
        onDevolverAnticipo={handleDevolverAnticipoWeb}
        onClose={() => setPedidoWebACancelar(null)}
        onDone={() => { refetchPedidosWeb(); setPedidoWebACancelar(null); }}
      />

      {/* PDF VIEWER (al cerrar caja o desde historial) */}
      <CorteViewerDialog corte={verPDFCorte} open={!!verPDFCorte} onClose={() => setVerPDFCorte(null)} />

      {/* Auto-descarga del PDF al finalizar corte (sin abrir imprimir) */}
      {autoDownloadCorte && (
        <CorteAutoDownloader
          corte={autoDownloadCorte}
          onDone={() => setAutoDownloadCorte(null)}
        />
      )}
    </div>
  );
}
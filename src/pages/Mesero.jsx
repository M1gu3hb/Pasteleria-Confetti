import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { formatCurrency, generateFolio } from '@/utils/financialUtils';
import { toast } from 'sonner';
import { UtensilsCrossed, Send, Receipt, ChefHat, Search, Users, Printer, Sparkles } from 'lucide-react';
import { getVentaSubtotal, sumarSubtotalDetalles } from '@/utils/ventaTotales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MESA_STATUS_CONFIG, ZONAS_MESA } from '@/lib/constants';
import MesaShape from '@/components/mesas/MesaShape';
import MesaGridMobile from '@/components/mesero/MesaGridMobile';
import MeseroCartFAB from '@/components/mesero/MeseroCartFAB';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import PropinaDialog from '@/components/propinas/PropinaDialog';
import SoundUnlockButton from '@/components/common/SoundUnlockButton';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import MesaHuerfanaDialog from '@/components/mesero/MesaHuerfanaDialog';
import ProductoFichaExpandible from '@/components/mesero/ProductoFichaExpandible';
import SolicitudesQRPanel from '@/components/mesero/SolicitudesQRPanel';
import SolicitudesQRCardList from '@/components/mesero/SolicitudesQRCardList';
import AlertasMeseroDialog from '@/components/mesero/AlertasMeseroDialog';
import SeleccionModificadoresDialog from '@/components/mesero/SeleccionModificadoresDialog';
import ListosParaRecogerCard from '@/components/mesero/ListosParaRecogerCard';
import AbrirMesaDialog from '@/components/mesero/AbrirMesaDialog';
import CantidadVariableDialog from '@/components/mesero/CantidadVariableDialog';
import { TIPO_VENTA, formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import PrecioProductoMesero, { VariableBadge } from '@/components/mesero/PrecioProductoMesero';
import { Bell, Volume2 } from 'lucide-react';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { useIsDark } from '@/lib/ThemeContext';
import { FLOOR_BG } from '@/lib/darkPalettes';
import { printDocument } from '@/lib/print';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import {
  asignacionActiva,
  filtrarMesasParaUsuario,
  responsableTexto,
  responsableColor,
  colorParaUsuario,
} from '@/lib/asignacionMesas';
import { ROLES } from '@/lib/constants';

const MAP_HEIGHT = 600;
// Hook simple para detectar móvil
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
};
const generarCodigoCaja = (numMesa) =>
  `M${String(numMesa).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

export default function MeseroWithBoundary() {
  return (
    <ErrorBoundary
      fallbackTitle="Ocurrió un error al mostrar esta mesa."
      fallbackMessage="Volvamos al mapa para que puedas continuar."
    >
      <Mesero />
    </ErrorBoundary>
  );
}

function Mesero() {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isDark = useIsDark();
  const floor = isDark ? FLOOR_BG.dark : FLOOR_BG.light;
  const { hayCaja: cajaAbiertaActiva, refetch: refetchCaja } = useCajaAbierta();

  const [zonaActiva, setZonaActiva] = useState('Interior');
  const [mesaActiva, setMesaActiva] = useState(null);
  const [ventaActiva, setVentaActiva] = useState(null);
  const [detallesVenta, setDetallesVenta] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [loading, setLoading] = useState(false);
  const [notaMesa, setNotaMesa] = useState('');

  // Open table modal (6A: ahora con alergias + celebración)
  const [showAbrirMesa, setShowAbrirMesa] = useState(false);
  const [mesaParaAbrir, setMesaParaAbrir] = useState(null);
  const [abriendoMesa, setAbriendoMesa] = useState(false);

  // Pre-cuenta print
  const [showPreCuenta, setShowPreCuenta] = useState(false);
  const [preCuentaData, setPreCuentaData] = useState(null);

  // Propina (RP — antes de pedir cuenta)
  const [showPropinaMesero, setShowPropinaMesero] = useState(false);

  // Reparación de mesa huérfana (estado != libre pero sin venta_activa_id)
  const [mesaHuerfana, setMesaHuerfana] = useState(null);
  const [liberandoHuerfana, setLiberandoHuerfana] = useState(false);

  // Solicitudes QR del Portal — panel modal
  const [showSolicitudesQR, setShowSolicitudesQR] = useState(false);
  // Configuración personal de alertas/voz del mesero
  const [showAlertasMesero, setShowAlertasMesero] = useState(false);
  // Modal de selección de modificadores al agregar producto
  const [productoParaPersonalizar, setProductoParaPersonalizar] = useState(null);
  // 6B / 1.D — Modal de cantidad/porción para productos variables
  const [productoVariable, setProductoVariable] = useState(null);
  const { data: solicitudesPendRaw = [] } = useQuery({
    queryKey: ['solicitudes_qr_mesero_count'],
    queryFn: () => base44.entities.SolicitudQR.filter({ estado: 'pendiente' }),
    initialData: [],
    refetchInterval: 6000,
    enabled: config?.portal_qr_activo === true,
  });
  // Cuenta filtrada según asignación
  const solicitudesActivas = useMemo(() => {
    const arr = Array.isArray(solicitudesPendRaw) ? solicitudesPendRaw : [];
    if (!posUser) return arr;
    if (posUser.rol === ROLES.ADMIN) return arr;
    if (posUser.rol !== ROLES.WAITER) return [];
    if (!asignacionActiva(config)) return arr;
    return arr.filter(s => !s?.mesero_destino_id || s.mesero_destino_id === posUser.id);
  }, [solicitudesPendRaw, posUser, config]);

  // Refs para evitar doble cierre y cerrar el sheet hijo antes que el Dialog
  const cartFabRef = useRef(null);
  const isClosingRef = useRef(false);
  // HOTFIX MÓVIL — Guard síncrono anti doble tap en "Enviar a Cocina".
  // En móvil, React batching puede tardar 1-2 frames en aplicar `disabled` al
  // botón. Un usuario impaciente puede tocar 2 veces antes del primer paint
  // con disabled=true → dos invocaciones a enviarPedido → DOS pedidos creados.
  // Este ref se setea SÍNCRONO al inicio de enviarPedido y se libera al final.
  const enviandoPedidoRef = useRef(false);

  // Sin initialData:[] (evita "no hay mesas" antes del primer fetch).
  const { data: mesasRaw, isPending: mesasLoading } = useQuery({
    queryKey: ['mesas'],
    queryFn: () => base44.entities.Mesa.filter({ activo: true }),
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
    staleTime: 3000,
  });
  const mesasRawSafe = Array.isArray(mesasRaw) ? mesasRaw : [];
  const cargandoMesas = mesasLoading && !mesasRaw;

  // Filtro por asignación: admin ve todas, mesero ve sus asignadas si está activo.
  const mesas = useMemo(
    () => filtrarMesasParaUsuario(mesasRawSafe, posUser, config),
    [mesasRawSafe, posUser, config]
  );
  const asignActiva = asignacionActiva(config);
  const sinMesasAsignadas = asignActiva && posUser?.rol === ROLES.WAITER && mesas.length === 0 && mesasRawSafe.length > 0;

  // Helper que MesaShape/MesaGridMobile usan para pintar la banda de color.
  const getResponsable = useCallback((mesa) => {
    const nombre = responsableTexto(mesa, config);
    const color = responsableColor(mesa, config);
    if (!nombre && !color) return null;
    return { nombre, color };
  }, [config]);

  // HOTFIX 6A.3: removemos initialData:[] para distinguir "todavía cargando"
  // de "ya cargó y está vacío". En móvil con red lenta, mostrar "Sin productos"
  // antes del primer fetch era el bug visible.
  const { data: productos, isFetched: productosFetched, isLoading: productosLoading } = useQuery({
    queryKey: ['productos_pos'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true, visible_en_pos: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const productosArr = Array.isArray(productos) ? productos : [];
  const cargandoProductos = !productosFetched && productosLoading;

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    // FIX: filtrar activo:true para que categorías eliminadas no sigan
    // apareciendo como pills en el listado de productos del mesero.
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }, 'orden'),
    initialData: [],
  });

  // F3: estaciones activas — solo si la feature está activa. Si está apagada,
  // la query queda deshabilitada y enviarPedido toma el path legacy intacto.
  const { data: estaciones = [] } = useQuery({
    queryKey: ['estaciones_preparacion_activas'],
    queryFn: () => base44.entities.EstacionPreparacion.filter({ activo: true }),
    initialData: [],
    enabled: config?.estaciones_preparacion_activas === true,
  });

  const productosFiltrados = useMemo(() => {
    let list = productosArr;
    if (categoriaFiltro !== 'todas') list = list.filter(p => p?.categoria_id === categoriaFiltro);
    if (busquedaProducto) {
      const q = busquedaProducto.toLowerCase();
      list = list.filter(p => (p?.nombre || '').toLowerCase().includes(q));
    }
    return list;
  }, [productosArr, categoriaFiltro, busquedaProducto]);

  const totalCarrito = useMemo(() =>
    carrito.reduce((s, i) => s + i.precio_venta * i.cantidad, 0), [carrito]);
  const totalActual = useMemo(() =>
    detallesVenta.reduce((s, d) => s + (d.subtotal || 0), 0), [detallesVenta]);

  const mesasZona = (mesas || []).filter(m => (m?.zona || 'Interior') === zonaActiva);
  const zonasConCount = ZONAS_MESA.map(z => ({
    zona: z, count: (mesas || []).filter(m => (m?.zona || 'Interior') === z).length,
  })).filter(z => z.count > 0);

  // — Click on mesa
  const onMesaClick = async (mesa) => {
    if (!mesa || !mesa.id) {
      toast.error('Mesa inválida');
      return;
    }
    try {
      // Bloqueo defensivo: si la asignación está activa y la mesa no es mía y no soy admin,
      // no debería poder abrirla. (En la práctica ya no la verá, pero protegemos por si llega.)
      if (asignActiva && posUser?.rol === ROLES.WAITER &&
          mesa.mesero_asignado_id && mesa.mesero_asignado_id !== posUser.id) {
        toast.error(`Esta mesa está asignada a ${mesa.mesero_asignado_nombre || 'otro mesero'}.`);
        return;
      }
      if (mesa.estado === 'libre') {
        setMesaParaAbrir(mesa);
        setShowAbrirMesa(true);
        return;
      }
      if (mesa.estado === 'limpieza') {
        if (!confirm('¿Marcar mesa como limpia y disponible?')) return;
        await base44.entities.Mesa.update(mesa.id, {
          estado: 'libre', venta_activa_id: null, personas_actuales: 0, cliente_temporal: '',
          atendido_por_id: '', atendido_por_nombre: '', atendido_por_color: '',
          // 6A: limpieza de datos temporales del cliente anterior
          notas_alergias: '',
          celebracion_especial: false,
          tipo_celebracion: '',
        });
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        toast.success(`Mesa ${mesa.numero} lista`);
        return;
      }
      // Mesa huérfana: estado != libre pero sin venta_activa_id ⇒ ofrecer reparación
      if (!mesa.venta_activa_id) {
        setMesaHuerfana(mesa);
        return;
      }
      // Open existing sale
      setLoading(true);
      setCarrito([]);
      setBusquedaProducto('');
      setCategoriaFiltro('todas');
      setMesaActiva(mesa);
      if (mesa.venta_activa_id) {
        const venta = await base44.entities.Venta.get(mesa.venta_activa_id).catch(() => null);
        const detalles = venta ? await base44.entities.DetalleVenta.filter({ venta_id: venta.id }).catch(() => []) : [];
        setVentaActiva(venta || null);
        setDetallesVenta(Array.isArray(detalles) ? detalles : []);
      } else {
        setVentaActiva(null);
        setDetallesVenta([]);
      }
    } catch (err) {
      console.error('[Mesero] onMesaClick error:', err);
      toast.error('No se pudo abrir la mesa');
      setVentaActiva(null);
      setDetallesVenta([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmarAbrirMesa = async (formData) => {
    if (!mesaParaAbrir?.id) {
      toast.error('Mesa inválida');
      setShowAbrirMesa(false);
      return;
    }
    if (abriendoMesa) return;
    setAbriendoMesa(true);
    try {
      const personas = parseInt(formData?.personas) || 1;
      const cliente = (formData?.cliente_nombre || '').trim();
      const alergias = (formData?.notas_alergias || '').trim();
      const celebracion = formData?.celebracion_especial === true;
      const tipoCele = (formData?.tipo_celebracion || '').trim();
      const folio = generateFolio('M' + (mesaParaAbrir.numero || '0'));
      const venta = await base44.entities.Venta.create({
        folio, tipo_venta: 'mesa', estado: 'abierta',
        mesa_id: mesaParaAbrir.id, mesa_numero: mesaParaAbrir.numero,
        personas,
        cliente_nombre: cliente,
        notas: formData?.notas || '',
        notas_alergias: alergias,
        celebracion_especial: celebracion,
        tipo_celebracion: celebracion ? tipoCele : '',
        usuario_mesero_id: posUser?.id, usuario_mesero_nombre: posUser?.nombre,
        fecha_apertura: new Date().toISOString(),
        subtotal: 0, total: 0,
      });
      if (!venta?.id) throw new Error('No se pudo crear la venta');
      // En modo SIN asignación: registrar al mesero como "atendido_por" si no había nadie.
      // En modo CON asignación: NO sobrescribimos mesero_asignado_*.
      const updateMesa = {
        estado: 'esperando_orden',
        venta_activa_id: venta.id,
        personas_actuales: personas,
        cliente_temporal: cliente,
        notas_alergias: alergias,
        celebracion_especial: celebracion,
        tipo_celebracion: celebracion ? tipoCele : '',
      };
      if (!asignActiva && posUser?.id && posUser?.rol === ROLES.WAITER) {
        updateMesa.atendido_por_id = posUser.id;
        updateMesa.atendido_por_nombre = posUser.nombre || '';
        updateMesa.atendido_por_color = colorParaUsuario(posUser);
      }
      await base44.entities.Mesa.update(mesaParaAbrir.id, updateMesa).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setShowAbrirMesa(false);
      // Open the sale dialog directly
      setMesaActiva({ ...mesaParaAbrir, ...updateMesa });
      setVentaActiva(venta);
      setDetallesVenta([]);
      const numeroOk = mesaParaAbrir.numero;
      setMesaParaAbrir(null);
      toast.success(`Mesa ${numeroOk} abierta`);
    } catch (err) {
      console.error('[Mesero] confirmarAbrirMesa error:', err);
      toast.error('No se pudo abrir la mesa. Intenta de nuevo.');
      setShowAbrirMesa(false);
    } finally {
      setAbriendoMesa(false);
    }
  };

  // Cierre seguro: solo limpia estados locales, no toca BD ni la mesa.
  // 1. Cierra el bottom sheet hijo PRIMERO (evita que AnimatePresence intente desmontar
  //    un nodo después de que Radix ya removió el portal padre → causa removeChild).
  // 2. Espera 2 frames a que terminen las animaciones de salida.
  // 3. Limpia el estado local.
  // Usa isClosingRef para evitar doble ejecución (X custom + onOpenChange + ESC).
  const cerrarDialog = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    try {
      // Cerrar primero el sheet del carrito si está abierto
      if (cartFabRef.current?.isOpen?.()) {
        cartFabRef.current.close();
      }
    } catch (e) {
      console.error('[Mesero] cerrar sheet hijo:', e);
    }
    // Esperar a que terminen animaciones de salida del sheet antes de
    // desmontar el Dialog padre. 2 rAF ≈ ~32ms es suficiente para Framer.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          setMesaActiva(null);
          setVentaActiva(null);
          setDetallesVenta([]);
          setCarrito([]);
          setNotaMesa('');
          setLoading(false);
        } catch (err) {
          console.error('[Mesero] cerrarDialog error:', err);
        } finally {
          // Reset del flag tras un pequeño margen para permitir reapertura
          setTimeout(() => { isClosingRef.current = false; }, 100);
        }
      });
    });
  }, []);

  // Detecta si el producto tiene modificadores activos con opciones activas.
  // Si los tiene, abrimos modal de personalización; si no, agregamos directo.
  const productoTieneModificadores = (producto) => {
    const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
    return arr.some((g) =>
      g?.activo !== false &&
      String(g?.nombre || '').trim() &&
      (Array.isArray(g.opciones) ? g.opciones : [])
        .some((o) => o?.activo !== false && String(o?.nombre || '').trim())
    );
  };

  const agregarAlCarrito = (producto) => {
    // 6B / 1.D — Si es producto variable, abrir modal de cantidad/porción.
    // El flujo de modificadores y precio_fijo queda intacto.
    if (
      producto?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
      producto?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
    ) {
      setProductoVariable(producto);
      return;
    }
    if (productoTieneModificadores(producto)) {
      // Abrir modal — la confirmación se procesa en confirmarPersonalizacion
      setProductoParaPersonalizar(producto);
      return;
    }
    setCarrito(prev => {
      const existe = prev.find(i => i.id === producto.id);
      if (existe) return prev.map(i => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { ...producto, cantidad: 1, notas: '', _notaUsuario: '', _exclusiones: [], _modificadores: [] }];
    });
  };

  // 6B / 1.D — Confirma el modal de cantidad/porción y agrega línea nueva al carrito.
  // Cada línea variable es independiente (no agrupa) porque cada cantidad puede diferir.
  // El item lleva flag `_variable` con todos los snapshots; `precio_venta` y `cantidad`
  // se setean para que totalCarrito, ProductoFichaExpandible y enviarPedido funcionen
  // sin tocar su lógica (precio_venta * cantidad = precio_total_linea con cantidad=1).
  const confirmarCantidadVariable = (snapshot) => {
    const producto = productoVariable;
    if (!producto || !snapshot) {
      setProductoVariable(null);
      return;
    }
    const precioLinea = Number(snapshot?.precio_total_linea) || 0;
    setCarrito((prev) => ([
      ...prev,
      {
        ...producto,
        // En carrito: cantidad lógica = 1 (la cantidad real está en _variable)
        cantidad: 1,
        // precio_venta efectivo = precio total ya calculado (incluye cantidad real)
        precio_venta: precioLinea,
        notas: '',
        _notaUsuario: '',
        _exclusiones: [],
        _modificadores: [],
        _variable: snapshot, // bandera con todos los snapshots para enviarPedido
      },
    ]));
    setProductoVariable(null);
  };

  // Confirma el modal de personalización: agrega línea NUEVA al carrito
  // (no agrupa con líneas iguales sin modificadores, porque cada combinación
  // de opciones puede ser distinta — más simple y correcto).
  const confirmarPersonalizacion = ({ modificadores, notas }) => {
    const producto = productoParaPersonalizar;
    if (!producto) return;
    // Texto plano para mostrar en carrito/cocina (sin JSON crudo).
    const textoMod = (Array.isArray(modificadores) ? modificadores : [])
      .filter((m) => m && Array.isArray(m.opciones) && m.opciones.length > 0)
      .map((m) => `${m.grupo_nombre}: ${m.opciones.map((o) => o.nombre).filter(Boolean).join(', ')}`)
      .join(' · ');
    const notasFinales = [textoMod, (notas || '').trim()].filter(Boolean).join(' · ');
    setCarrito((prev) => ([
      ...prev,
      {
        ...producto,
        cantidad: 1,
        notas: notasFinales,
        _notaUsuario: (notas || '').trim(),
        _exclusiones: [],
        _modificadores: Array.isArray(modificadores) ? modificadores : [],
      },
    ]));
    setProductoParaPersonalizar(null);
  };

  // Actualiza la nota final que viajará a cocina para un item del carrito.
  const actualizarNotasItem = (id, nuevasNotas) => {
    setCarrito(prev => prev.map(i =>
      i?.id === id
        ? { ...i, notas: nuevasNotas || '', _notaUsuario: nuevasNotas || i._notaUsuario || '' }
        : i
    ));
  };
  const actualizarExclusionesItem = (id, exclusiones) => {
    setCarrito(prev => prev.map(i =>
      i?.id === id ? { ...i, _exclusiones: Array.isArray(exclusiones) ? exclusiones : [] } : i
    ));
  };

  const cambiarCantidad = (id, delta) => {
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad + delta } : i).filter(i => i.cantidad > 0));
  };

  const enviarPedido = async () => {
    // HOTFIX MÓVIL — Guard síncrono anti-doble-tap. Si ya estamos enviando,
    // ignoramos esta segunda invocación inmediatamente (antes de cualquier
    // await/setState). Esto evita la creación de pedidos fantasma duplicados.
    if (enviandoPedidoRef.current) return;
    if (!Array.isArray(carrito) || carrito.length === 0) { toast.error('El carrito está vacío'); return; }
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;
    if (!mesaRef?.id) { toast.error('No hay mesa activa'); return; }
    if (!mesaRef?.numero && mesaRef?.numero !== 0) { toast.error('Mesa sin número válido'); return; }
    if (!ventaRef?.id) { toast.error('No hay venta activa para esta mesa'); return; }
    // Validar que todos los items del carrito tengan id y nombre — evita crear
    // pedidos con líneas vacías o "fantasmas" si el carrito quedó en mal estado.
    const itemsInvalidos = carrito.filter(i => !i?.id || !i?.nombre);
    if (itemsInvalidos.length > 0) {
      toast.error('Algunos productos del carrito están dañados. Recarga la mesa.');
      return;
    }

    enviandoPedidoRef.current = true;
    setLoading(true);
    try {
      // HOTFIX 6A — Robustez ante 429/timeout en DetalleVenta.create:
      // 1. Cada create se hace con catch individual (no rompe el Promise.all).
      // 2. Si un create falla, conservamos el "shadow" del carrito como fuente
      //    de verdad para el cálculo de subtotal (precios reales del POS).
      // 3. La venta SIEMPRE se actualiza con el subtotal calculado a partir
      //    del carrito + detalles previos. Así NUNCA queda en $0.00.
      const carritoSnapshots = carrito.map(item => {
        const modificadoresArr = Array.isArray(item?._modificadores) ? item._modificadores : [];
        const precio = Number(item.precio_venta) || 0;
        const cantidad = Number(item.cantidad) || 0;
        const costo = Number(item.costo_calculado_actual) || 0;
        // PASO A — Normalizar exclusiones a array estructurado.
        // Tolerante: si vienen como strings (legacy) las dejamos solo con nombre.
        const exclusionesRaw = Array.isArray(item?._exclusiones) ? item._exclusiones : [];
        const exclusionesEstr = exclusionesRaw.map((e) => {
          if (typeof e === 'string') {
            return { ingrediente_id: '', ingrediente_nombre: e, unidad: '', cantidad_base_excluida: 0 };
          }
          if (e && typeof e === 'object') {
            return {
              ingrediente_id: String(e.ingrediente_id || ''),
              ingrediente_nombre: String(e.ingrediente_nombre || ''),
              unidad: String(e.unidad || ''),
              cantidad_base_excluida: Number(e.cantidad_base_excluida) || 0,
            };
          }
          return null;
        }).filter(Boolean);
        // 6B / 1.D — Snapshots variable. Si el item viene con _variable, agregamos
        // los campos del schema 6B. NO cambia el cálculo financiero: subtotal sigue
        // siendo precio_venta * cantidad (con cantidad=1 y precio_venta=precio_total_linea).
        const variableSnap = item?._variable || null;
        const variableFields = variableSnap ? {
          tipo_venta_snapshot: variableSnap.tipo_venta,
          unidad_variable_snapshot: variableSnap.unidad_variable || '',
          cantidad_variable_snapshot: Number(variableSnap.cantidad_variable) || 0,
          // cantidad_base_consumo se llena en el cobro (1.G) — aquí solo el snapshot visual
          ingrediente_base_id_snapshot: variableSnap.ingrediente_base_id || '',
          ingrediente_base_nombre_snapshot: variableSnap.ingrediente_base_nombre || '',
          precio_por_unidad_snapshot: Number(variableSnap.precio_por_unidad_snapshot) || 0,
          nombre_porcion_snapshot: variableSnap.nombre_porcion || '',
          ml_por_porcion_snapshot: Number(variableSnap.ml_por_porcion) || 0,
          cantidad_porciones_snapshot: Number(variableSnap.cantidad_porciones) || 0,
        } : {};
        return {
          payload: {
            venta_id: ventaRef.id,
            producto_id: item.id,
            producto_nombre: item.nombre,
            cantidad,
            precio_unitario_snapshot: precio,
            costo_unitario_snapshot: costo,
            subtotal: precio * cantidad,
            costo_total_linea_snapshot: costo * cantidad,
            utilidad_linea_snapshot: (precio - costo) * cantidad,
            margen_linea_snapshot: precio > 0 ? ((precio - costo) / precio * 100) : 0,
            notas_producto: item.notas || '',
            modificadores_snapshot: modificadoresArr.length > 0 ? JSON.stringify(modificadoresArr) : '',
            // PASO A — Snapshot estructurado de ingredientes excluidos.
            // Se guarda como JSON string (mismo patrón que modificadores_snapshot)
            // para no requerir cambios de schema en esta etapa.
            // En el PASO B, Caja parseará este JSON al descontar inventario.
            ingredientes_excluidos_snapshot: exclusionesEstr.length > 0
              ? JSON.stringify(exclusionesEstr)
              : '',
            estado_preparacion: 'pendiente',
            area_preparacion_snapshot: item.area_preparacion || 'cocina',
            ...variableFields,
          },
          // Shadow para el cálculo si el create falla
          shadow: { subtotal: precio * cantidad, costo_total_linea_snapshot: costo * cantidad },
          // PASO A — Lo pasamos también al builder de items para cocina.
          ingredientes_excluidos: exclusionesEstr,
        };
      });

      const results = await Promise.all(
        carritoSnapshots.map(({ payload }) =>
          base44.entities.DetalleVenta.create(payload).catch((err) => {
            console.error('[Mesero] DetalleVenta.create falló:', err);
            return null;
          })
        )
      );

      // Detectar fallos para avisar al usuario (pero no abortar — la venta
      // sigue siendo válida, los detalles que sí se guardaron están en BD,
      // y los totales se calculan desde shadow para reflejar la realidad).
      const fallidos = results.filter(r => !r).length;
      if (fallidos > 0) {
        toast.warning(`${fallidos} producto(s) tardaron en guardarse. Sigo con el pedido.`);
      }

      // Detalles "efectivos": los creados en BD + shadow para los que fallaron.
      const nuevosDetallesEfectivos = results.map((r, i) =>
        r || { ...carritoSnapshots[i].payload, _fallback: true }
      );

      const detallesPrev = Array.isArray(detallesVenta) ? detallesVenta : [];
      const todosDetalles = [...detallesPrev, ...nuevosDetallesEfectivos];
      // Usar suma defensiva — tolera detalles con shape distinto.
      const subtotal = sumarSubtotalDetalles(todosDetalles);
      const costoTotal = todosDetalles.reduce((s, d) => s + (Number(d?.costo_total_linea_snapshot) || 0), 0);
      await base44.entities.Venta.update(ventaRef.id, {
        estado: 'enviada', subtotal, total: subtotal,
        costo_total_snapshot: costoTotal,
        utilidad_bruta_snapshot: subtotal - costoTotal,
        margen_snapshot: subtotal > 0 ? ((subtotal - costoTotal) / subtotal * 100) : 0,
      }).catch((err) => {
        console.error('[Mesero] Venta.update totales falló:', err);
        toast.error('No se pudieron guardar los totales. Revisa la cuenta en Caja.');
      });

      // F3: si estaciones están activas, agrupar carrito por estación
      // y crear UN PedidoPreparacion por estación. Si está apagado,
      // comportamiento legacy idéntico (un único pedido con area:'cocina').
      const estacionesActivasNow = config?.estaciones_preparacion_activas === true;
      const buildItemsParaPedido = (items) => items.map(item => {
        const variableSnap = item?._variable || null;
        // PASO A — Exclusiones estructuradas para Cocina (mismo formato que en DetalleVenta).
        const exclusionesRaw = Array.isArray(item?._exclusiones) ? item._exclusiones : [];
        const exclusionesEstr = exclusionesRaw.map((e) => {
          if (typeof e === 'string') {
            return { ingrediente_id: '', ingrediente_nombre: e, unidad: '', cantidad_base_excluida: 0 };
          }
          if (e && typeof e === 'object') {
            return {
              ingrediente_id: String(e.ingrediente_id || ''),
              ingrediente_nombre: String(e.ingrediente_nombre || ''),
              unidad: String(e.unidad || ''),
              cantidad_base_excluida: Number(e.cantidad_base_excluida) || 0,
            };
          }
          return null;
        }).filter(Boolean);
        const baseItem = {
          producto_id: item.id,
          producto_nombre: item.nombre,
          cantidad: item.cantidad,
          notas: item.notas || '',
          // Modificadores elegidos — viajan al pedido para que Cocina los vea
          // como líneas estructuradas (sin JSON crudo).
          modificadores: Array.isArray(item?._modificadores) ? item._modificadores : [],
          // PASO A — Ingredientes excluidos (SIN). Estructurado para Cocina y futuro Paso B.
          ingredientes_excluidos: exclusionesEstr,
          estado: 'pendiente',
        };
        // 6B / 1.D — Si es variable, añadir snapshot para que Cocina lo vea legible.
        if (variableSnap) {
          baseItem.tipo_venta = variableSnap.tipo_venta;
          if (variableSnap.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA) {
            baseItem.unidad_variable = variableSnap.unidad_variable || '';
            baseItem.cantidad_variable = Number(variableSnap.cantidad_variable) || 0;
          } else if (variableSnap.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR) {
            baseItem.nombre_porcion = variableSnap.nombre_porcion || '';
            baseItem.cantidad_porciones = Number(variableSnap.cantidad_porciones) || 0;
          }
        }
        return baseItem;
      });

      // 6A: snapshot de alergias/celebración de la mesa (fuente: mesa o venta).
      const alergiasSnap = (mesaRef?.notas_alergias || ventaRef?.notas_alergias || '').trim();
      const celebSnap = mesaRef?.celebracion_especial === true || ventaRef?.celebracion_especial === true;
      const tipoCeleSnap = (mesaRef?.tipo_celebracion || ventaRef?.tipo_celebracion || '').trim();

      if (!estacionesActivasNow) {
        // === MODO LEGACY (igual que antes) ===
        await base44.entities.PedidoPreparacion.create({
          venta_id: ventaRef.id,
          venta_folio: ventaRef.folio,
          mesa_id: mesaRef.id,
          mesa_numero: mesaRef.numero,
          area: 'cocina',
          estado: 'nuevo',
          fecha_creacion: new Date().toISOString(),
          notas: notaMesa || '',
          origen_pedido: 'mesero',
          notas_alergias: alergiasSnap,
          celebracion_especial: celebSnap,
          tipo_celebracion: celebSnap ? tipoCeleSnap : '',
          items: buildItemsParaPedido(carrito),
        });
      } else {
        // === MODO ESTACIONES ===
        // Agrupar por estación resuelta desde Producto → Categoría → Estación.
        const { agruparItemsPorEstacion } = await import('@/utils/preparacionEstacionUtils');
        // Resolver por producto en memoria — los productos del carrito ya tienen
        // categoria_id/categoria_nombre porque vienen del listado de productos POS.
        const grupos = agruparItemsPorEstacion(carrito, null, categorias, estaciones, config);
        const fechaCreacion = new Date().toISOString();
        await Promise.all(Array.from(grupos.values()).map((grp) => {
          const info = grp?.info || null;
          return base44.entities.PedidoPreparacion.create({
            venta_id: ventaRef.id,
            venta_folio: ventaRef.folio,
            mesa_id: mesaRef.id,
            mesa_numero: mesaRef.numero,
            // Mantener 'area' como fallback legacy — Cocina vieja sigue filtrando por area.
            area: 'cocina',
            estado: 'nuevo',
            fecha_creacion: fechaCreacion,
            notas: notaMesa || '',
            origen_pedido: 'mesero',
            estacion_preparacion_id: info?.estacion_preparacion_id || '',
            estacion_preparacion_nombre: info?.estacion_preparacion_nombre || '',
            estacion_preparacion_color: info?.estacion_preparacion_color || '',
            notas_alergias: alergiasSnap,
            celebracion_especial: celebSnap,
            tipo_celebracion: celebSnap ? tipoCeleSnap : '',
            items: buildItemsParaPedido(grp.items || []),
          });
        }));
      }

      await base44.entities.Mesa.update(mesaRef.id, { estado: 'pedido_enviado', venta_activa_id: ventaRef.id }).catch(() => {});
      // F3.1 + BLOQUE 0: invalidar+refetch para que el pedido aparezca en vivo
      // en Cocina y en el watcher de "listos" del propio Mesero, sin polling.
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos_listos_watcher'] });
      queryClient.refetchQueries({ queryKey: ['pedidos_cocina'], type: 'active' }).catch(() => {});
      toast.success('¡Pedido enviado a cocina!');
      setCarrito([]);
      setNotaMesa('');
      setVentaActiva({ ...ventaRef, total: subtotal, subtotal });
      // Estado local sincronizado con detalles efectivos (incluyendo shadow).
      setDetallesVenta(todosDetalles);
      // HOTFIX flujo mesero — cerrar modal y volver al mapa SOLO después del
      // éxito completo (Detalles + Venta + Mesa + Pedido actualizados).
      // Si algo falla arriba, el catch maneja el error y NO se cierra.
      // setLoading(false) ocurre primero para no quedar en estado loading
      // congelado si el dialog tarda en desmontar.
      setLoading(false);
      cerrarDialog();
    } catch (err) {
      console.error('[Mesero] enviarPedido error:', err);
      toast.error('No se pudo enviar el pedido. Intenta de nuevo.');
      setLoading(false);
    } finally {
      // HOTFIX MÓVIL — Liberar guard siempre (éxito o error) para permitir
      // un nuevo envío posterior. Pequeño delay para que el optimistic update
      // se vea antes de que el botón se vuelva a habilitar.
      setTimeout(() => { enviandoPedidoRef.current = false; }, 300);
    }
  };

  // F3.2: callback tras entregar desde ListosParaRecogerCard.
  // El card hace el update real (solo pedidos 'listo' → 'entregado'). Aquí
  // solo refrescamos el estado local de la mesa si la BD ya la cambió.
  //
  // HOTFIX flujo mesero — Cerrar modal y volver al mapa SOLO si la entrega
  // fue exitosa (res?.ok === true). El card ya hizo el update real en BD
  // antes de invocar este callback, así que aquí solo cerramos. Si res.ok
  // es falso o no viene, mantenemos el modal abierto para que el usuario
  // vea el error mostrado por el card.
  const handleAfterEntregar = useCallback((res) => {
    if (res?.mesaCambiada) {
      setMesaActiva((prev) => (prev ? { ...prev, estado: 'ocupada' } : prev));
    }
    if (res?.ok === true) {
      // Pequeño delay para que el optimistic update del card se vea antes
      // de desmontar el dialog (mejor UX: el usuario ve el "Entregado" antes
      // de regresar al mapa). 250ms es suficiente sin sentirse lento.
      setTimeout(() => {
        try { cerrarDialog(); } catch (e) { console.warn('[Mesero] cerrar tras entregar:', e); }
      }, 250);
    }
  }, [cerrarDialog]);

  // pedirCuenta: PRIMERO mostramos modal de propina, después se confirma en finalizarCuenta.
  //
  // FIX BUG PC: La validación NO depende solo del estado local `detallesVenta` que
  // en PC puede quedar desincronizado tras refetchs. Si el estado local está vacío
  // pero existe `ventaActiva`, re-consultamos a la BD (DetalleVenta + PedidoPreparacion)
  // como fuente de verdad. Si encontramos consumo real, refrescamos el estado local
  // y continuamos. Solo bloqueamos cuando confirmamos que la mesa realmente está vacía.
  const pedirCuenta = async () => {
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;
    let detallesRef = Array.isArray(detallesVenta) ? detallesVenta : [];

    if (!mesaRef?.id) { toast.error('No hay mesa activa'); return; }
    if (!ventaRef?.id) { toast.error('No hay consumo activo para solicitar cuenta'); return; }

    // FIX BUG: si la caja se acaba de abrir desde Caja mientras el mesero
    // sigue dentro del dialog, el snapshot local puede estar viejo (hasta 8s).
    // Forzamos un refetch puntual y revalidamos contra el resultado fresco.
    let cajaOk = cajaAbiertaActiva;
    if (!cajaOk && typeof refetchCaja === 'function') {
      try {
        const r = await refetchCaja();
        const cortesFresh = Array.isArray(r?.data) ? r.data : [];
        cajaOk = cortesFresh.some(c =>
          c?.estado === 'abierto' &&
          (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte)
        );
      } catch (e) {
        console.warn('[Mesero] refetchCaja:', e);
      }
    }
    if (!cajaOk) {
      toast.error('No se puede solicitar cuenta porque la caja está cerrada. Abre caja primero.');
      return;
    }

    // Anti-doble solicitud: si ya está en cuenta_solicitada (estado en mesa o venta),
    // no permitir generar otra. Releemos la venta fresca de BD para no fiarnos de caché.
    if (mesaRef.estado === 'cuenta_solicitada' || ventaRef.estado === 'cuenta_solicitada') {
      toast.info('La cuenta ya fue solicitada para esta mesa.');
      return;
    }
    try {
      const ventaFresca = await base44.entities.Venta.get(ventaRef.id).catch(() => null);
      if (ventaFresca?.estado === 'cuenta_solicitada' || ventaFresca?.estado === 'pagada') {
        toast.info('La cuenta ya fue solicitada para esta mesa.');
        setVentaActiva(ventaFresca);
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        return;
      }
    } catch {}

    // Si el estado local no tiene detalles, validamos contra la BD antes de bloquear.
    // Esto corrige el bug en PC/móvil donde un refetch dejaba el estado local vacío
    // aunque la venta sí tuviera productos y pedidos enviados a cocina.
    //
    // HOTFIX MÓVIL — Reintento ante datos stale.
    // En móvil con red lenta o un timeout temporal, la primera consulta puede
    // devolver [] aunque sí haya datos. Reintentamos 1 vez tras 500ms antes
    // de mostrar "no hay productos" para evitar el falso negativo de "salir
    // y volver a entrar para que aparezca".
    if (detallesRef.length === 0) {
      const fetchConsumo = async () => {
        const [detallesBD, pedidosBD] = await Promise.all([
          base44.entities.DetalleVenta.filter({ venta_id: ventaRef.id }).catch(() => null),
          base44.entities.PedidoPreparacion.filter({ venta_id: ventaRef.id }).catch(() => null),
        ]);
        return {
          detalles: Array.isArray(detallesBD) ? detallesBD : [],
          pedidos: Array.isArray(pedidosBD) ? pedidosBD : [],
          // Detectar si hubo error real (null) vs vacío real ([])
          huboError: detallesBD === null || pedidosBD === null,
        };
      };
      try {
        let r = await fetchConsumo();
        // Reintento si llegó vacío Y hubo error transitorio, o si simplemente
        // está sospechosamente vacío en una mesa que no acaba de abrirse.
        if (r.detalles.length === 0 && r.pedidos.length === 0) {
          await new Promise(res => setTimeout(res, 500));
          r = await fetchConsumo();
        }
        if (r.detalles.length > 0) {
          // Hay consumo real → sincronizar estado y continuar
          detallesRef = r.detalles;
          setDetallesVenta(r.detalles);
        } else if (r.pedidos.length > 0) {
          // Hay pedido en cocina pero sin detalles guardados (caso raro) → permitir
          detallesRef = r.detalles;
        } else if (r.huboError) {
          toast.error('No se pudo sincronizar el consumo. Verifica tu conexión e intenta de nuevo.');
          return;
        } else {
          toast.error('Esta mesa aún no tiene productos enviados a cocina');
          return;
        }
      } catch (err) {
        console.error('[Mesero] pedirCuenta validación BD:', err);
        toast.error('No se pudo validar el consumo. Intenta de nuevo.');
        return;
      }
    }

    // HOTFIX 6A — Rescate de totales en CERO antes de generar precuenta.
    // Si la venta tiene detalles con subtotal real pero `ventaActiva.total`
    // está en 0 (por 429, refetch, o venta vieja), recalculamos y persistimos
    // antes de pasar a precuenta/caja. NO duplica detalles. Solo actualiza
    // los campos numéricos de la Venta. Sin esto, precuenta y caja muestran $0.
    try {
      const ventaTotal = Number(ventaRef?.total) || 0;
      const ventaSubtotal = Number(ventaRef?.subtotal) || 0;
      const subtotalReal = sumarSubtotalDetalles(detallesRef);
      if (subtotalReal > 0 && (ventaTotal <= 0 || ventaSubtotal <= 0)) {
        const costoTotal = (detallesRef || []).reduce(
          (s, d) => s + (Number(d?.costo_total_linea_snapshot) || 0), 0
        );
        await base44.entities.Venta.update(ventaRef.id, {
          subtotal: subtotalReal,
          total: subtotalReal,
          costo_total_snapshot: costoTotal,
          utilidad_bruta_snapshot: subtotalReal - costoTotal,
          margen_snapshot: subtotalReal > 0 ? ((subtotalReal - costoTotal) / subtotalReal * 100) : 0,
        });
        // Reflejar en estado local para que el resto del flujo use el total correcto.
        ventaRef.total = subtotalReal;
        ventaRef.subtotal = subtotalReal;
        setVentaActiva((prev) => prev ? { ...prev, total: subtotalReal, subtotal: subtotalReal } : prev);
      }
    } catch (errFix) {
      console.error('[Mesero] pedirCuenta rescate totales:', errFix);
      // No bloqueamos — seguimos con el flujo. El precuenta tiene fallback propio.
    }

    // Si propinas están desactivadas, saltar el modal y solicitar cuenta directo.
    if (!tipsEnabled(config)) {
      finalizarPedirCuenta({
        propina_monto: 0, propina_porcentaje: 0,
        propina_tipo: 'sin_propina', propina_origen: 'mesero',
      });
      return;
    }

    // === FLUJO QR-DISPARADO (mesero_dispara | ambos) ===
    // Si la propina QR está activa Y el modo de cuenta delega al cliente,
    // el mesero NO elige propina aquí. Marcamos la venta como "esperando
    // selección del comensal" y el QR del cliente abrirá automáticamente
    // la pantalla de propina por polling.
    const modoCuenta = config?.portal_qr_cuenta_modo || 'mesero_dispara';
    const propinaQRActiva =
      config?.portal_qr_activo === true &&
      config?.portal_qr_permitir_propina_cliente !== false;
    const delegaAlCliente =
      propinaQRActiva && (modoCuenta === 'mesero_dispara' || modoCuenta === 'ambos');

    if (delegaAlCliente) {
      finalizarPedirCuenta({
        propina_monto: 0,
        propina_porcentaje: 0,
        propina_tipo: 'pendiente_cliente',
        propina_origen: 'pendiente_portal_qr',
      });
      return;
    }

    // Flujo clásico: abrir modal de propina del mesero.
    setShowPropinaMesero(true);
  };

  // Finaliza el flujo de solicitar cuenta tras elegir propina (o "decidir en caja").
  const finalizarPedirCuenta = async (propinaData) => {
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;
    const detallesRef = Array.isArray(detallesVenta) ? detallesVenta : [];

    setLoading(true);
    setShowPropinaMesero(false);
    try {
      const numeroMesa = mesaRef?.numero || 0;
      const codigo = generarCodigoCaja(numeroMesa);
      const notasPrev = ventaRef?.notas || '';
      const nuevasNotas = notasPrev ? `${notasPrev} | COD: ${codigo}` : `COD: ${codigo}`;

      const payloadVenta = {
        estado: 'cuenta_solicitada',
        codigo_caja: codigo,
        notas: nuevasNotas,
        propina_monto: Number(propinaData?.propina_monto) || 0,
        propina_porcentaje: Number(propinaData?.propina_porcentaje) || 0,
        propina_tipo: propinaData?.propina_tipo || 'sin_propina',
        propina_origen: propinaData?.propina_origen || 'mesero',
      };

      // HOTFIX PASO 3 — Solicitar cuenta IDEMPOTENTE y blindado para móvil.
      // 1. Update venta primero (es la fuente de verdad financiera).
      // 2. Update mesa (visual). Si falla, NO bloqueamos — la venta ya cambió.
      // 3. Si la venta falla, abortamos para no dejar estado mezclado.
      try {
        await base44.entities.Venta.update(ventaRef.id, payloadVenta);
      } catch (errVenta) {
        console.error('[Mesero] finalizarPedirCuenta: Venta.update falló:', errVenta);
        toast.error('No se pudo actualizar la venta. Intenta de nuevo.');
        setLoading(false);
        return;
      }
      // Mesa: tolerante. Si falla, intentamos una vez más antes de avisar.
      let mesaActualizada = false;
      try {
        await base44.entities.Mesa.update(mesaRef.id, { estado: 'cuenta_solicitada' });
        mesaActualizada = true;
      } catch (errMesa1) {
        console.warn('[Mesero] finalizarPedirCuenta: Mesa.update fallo 1, reintento:', errMesa1);
        try {
          await base44.entities.Mesa.update(mesaRef.id, { estado: 'cuenta_solicitada' });
          mesaActualizada = true;
        } catch (errMesa2) {
          console.error('[Mesero] finalizarPedirCuenta: Mesa.update fallo 2:', errMesa2);
        }
      }
      if (!mesaActualizada) {
        // La venta ya está en cuenta_solicitada (Caja la verá). Avisamos pero
        // no bloqueamos el flujo — el siguiente refetch de mesas la sincroniza.
        toast.warning('Cuenta solicitada. La mesa puede tardar unos segundos en actualizarse visualmente.');
      }
      // BLOQUE 0 + PASO 3: invalidaciones completas para que TODOS vean el cambio en ≤3s:
      //  - mesas: vista Mesero/Mesas/Admin.
      //  - ventas_pendientes_caja: Caja muestra cobro pendiente.
      //  - mesa_por_token: Portal QR del comensal detecta el cambio sin esperar polling.
      //  - solicitudes_qr_watcher: por si había una solicitud previa del cliente "pendiente".
      try {
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
        queryClient.invalidateQueries({ queryKey: ['mesa_por_token'] });
        queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_watcher'] });
        queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero_count'] });
        queryClient.refetchQueries({ queryKey: ['ventas_pendientes_caja'], type: 'active' }).catch(() => {});
      } catch (e) {
        console.warn('[Mesero] invalidate post pedirCuenta:', e);
      }

      const ventaActualizada = { ...ventaRef, ...payloadVenta };
      setPreCuentaData({ venta: ventaActualizada, detalles: detallesRef, mesa: mesaRef, codigo });
      cerrarDialog();
      setTimeout(() => setShowPreCuenta(true), 200);

      // Mensaje contextual: si delegamos al QR, el mesero debe saber que espera al cliente.
      if (propinaData?.propina_tipo === 'pendiente_cliente') {
        toast.success(`Cuenta solicitada · Cód: ${codigo}. Esperando propina desde el QR del comensal.`);
      } else {
        toast.success(`Cuenta solicitada. Código: ${codigo}`);
      }
    } catch (err) {
      console.error('[Mesero] finalizarPedirCuenta error:', err);
      toast.error('No se pudo solicitar la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const imprimirPreCuenta = () => {
    printDocument({ mode: 'thermal', title: `PreCuenta-${preCuentaData?.venta?.folio || ''}` });
  };

  // HOTFIX FINAL — "Cerrar mesa sin venta".
  // Permite al mesero cerrar una mesa abierta por error / sin consumo, sin pasar
  // por cobro ni generar ticket. Reglas duras (defensivas en este orden):
  //   1) Debe haber mesa y venta activas.
  //   2) Estado de la mesa debe ser 'esperando_orden' (mesa abierta sin pedido enviado).
  //      En cuanto se envía un pedido a cocina la mesa pasa a 'pedido_enviado' / siguientes
  //      → ahí YA HAY CONSUMO REAL y NO debe permitirse cerrar sin venta.
  //   3) `detallesVenta` local debe estar vacío.
  //   4) Doble verificación contra BD: DetalleVenta y PedidoPreparacion vacíos.
  //   5) `total` y `subtotal` de la venta deben ser 0.
  // Si todo ok: marcamos la Venta como `cancelada` con motivo claro (no aparece como
  // pagada, no afecta Dashboard / Caja / Registros financieros) y liberamos la mesa.
  const puedeCerrarMesaSinVenta = useMemo(() => {
    if (!mesaActiva || !ventaActiva) return false;
    if (mesaActiva.estado !== 'esperando_orden') return false;
    if ((Array.isArray(detallesVenta) ? detallesVenta : []).length > 0) return false;
    const t = Number(ventaActiva?.total) || 0;
    const s = Number(ventaActiva?.subtotal) || 0;
    if (t > 0 || s > 0) return false;
    return true;
  }, [mesaActiva, ventaActiva, detallesVenta]);

  const cerrarMesaSinVenta = async () => {
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;
    if (!mesaRef?.id || !ventaRef?.id) {
      toast.error('No hay mesa o venta activa');
      return;
    }
    if (loading) return;
    if (!confirm('¿Cerrar esta mesa sin venta? No se registrará ningún cobro.')) return;

    setLoading(true);
    try {
      // Verificación final contra BD para evitar carrera (otro dispositivo pudo
      // enviar pedido entre que se abrió el dialog y se confirmó el cierre).
      const [detallesBD, pedidosBD] = await Promise.all([
        base44.entities.DetalleVenta.filter({ venta_id: ventaRef.id }).catch(() => []),
        base44.entities.PedidoPreparacion.filter({ venta_id: ventaRef.id }).catch(() => []),
      ]);
      if ((Array.isArray(detallesBD) ? detallesBD : []).length > 0 ||
          (Array.isArray(pedidosBD) ? pedidosBD : []).length > 0) {
        toast.error('Esta mesa ya tiene consumo. Solicita la cuenta normalmente.');
        // Sincronizar estado local para que el botón cambie a "Solicitar cuenta".
        if (Array.isArray(detallesBD)) setDetallesVenta(detallesBD);
        setLoading(false);
        return;
      }

      // Marcar venta como cancelada (no pagada, no entra a totales).
      await base44.entities.Venta.update(ventaRef.id, {
        estado: 'cancelada',
        motivo_cancelacion: 'Mesa cerrada sin consumo',
        fecha_cierre: new Date().toISOString(),
        total: 0,
        subtotal: 0,
      });

      // Liberar mesa (mismos campos que `liberarMesaHuerfana` para consistencia).
      await base44.entities.Mesa.update(mesaRef.id, {
        estado: 'libre',
        venta_activa_id: null,
        personas_actuales: 0,
        cliente_temporal: '',
        atendido_por_id: '',
        atendido_por_nombre: '',
        atendido_por_color: '',
        notas_alergias: '',
        celebracion_especial: false,
        tipo_celebracion: '',
      }).catch(() => {});

      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
      const numeroOk = mesaRef.numero;
      cerrarDialog();
      toast.success(`Mesa ${numeroOk} cerrada sin venta`);
    } catch (err) {
      console.error('[Mesero] cerrarMesaSinVenta:', err);
      toast.error('No se pudo cerrar la mesa. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Liberar una mesa huérfana (sin venta_activa_id). NO borra ventas reales.
  const liberarMesaHuerfana = async () => {
    const mesaRef = mesaHuerfana;
    if (!mesaRef?.id) {
      setMesaHuerfana(null);
      return;
    }
    setLiberandoHuerfana(true);
    try {
      await base44.entities.Mesa.update(mesaRef.id, {
        estado: 'libre',
        venta_activa_id: null,
        personas_actuales: 0,
        cliente_temporal: '',
        atendido_por_id: '',
        atendido_por_nombre: '',
        atendido_por_color: '',
        // 6A: limpiar datos temporales al liberar mesa huérfana
        notas_alergias: '',
        celebracion_especial: false,
        tipo_celebracion: '',
      });
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      toast.success(`Mesa ${mesaRef.numero} liberada`);
      setMesaHuerfana(null);
    } catch (err) {
      console.error('[Mesero] liberarMesaHuerfana error:', err);
      toast.error('No se pudo liberar la mesa. Intenta de nuevo.');
    } finally {
      setLiberandoHuerfana(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — flex-wrap para que en móvil no se desborde la fila de botones
          (Solicitudes / Alertas / Audio). En desktop queda en una línea. */}
      <div className="flex items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,34%) 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-bold leading-tight">Mesero</h1>
            <p className="text-xs text-muted-foreground truncate">Toca una mesa para abrir o gestionar</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {config?.portal_qr_activo === true && (
            <Button
              type="button"
              size="sm"
              variant={(solicitudesActivas?.length || 0) > 0 ? 'default' : 'outline'}
              onClick={() => setShowSolicitudesQR(true)}
              className="gap-1.5 relative shrink-0"
            >
              <Bell className="w-4 h-4" />
              <span>Solicitudes</span>
              {(solicitudesActivas?.length || 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {solicitudesActivas.length}
                </span>
              )}
            </Button>
          )}
          {/* Configuración personal de voz/alertas — solo para meseros */}
          {posUser?.rol === ROLES.WAITER && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAlertasMesero(true)}
              className="gap-1.5 shrink-0"
              title="Configurar mi voz y alertas"
            >
              <Volume2 className="w-4 h-4" />
              <span>Alertas</span>
            </Button>
          )}
          <SoundUnlockButton />
        </div>
      </div>

      {/* Zone tabs */}
      {zonasConCount.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {zonasConCount.map(({ zona, count }) => (
            <button key={zona} onClick={() => setZonaActiva(zona)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${zonaActiva === zona ? 'bg-primary text-white shadow-md' : 'bg-white border text-muted-foreground'}`}>
              {zona} <span className="opacity-60">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Aviso si mesero sin mesas asignadas */}
      {sinMesasAsignadas && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 text-sm text-amber-900 flex items-start gap-2">
          <UtensilsCrossed className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">
            <p className="font-bold">No tienes mesas asignadas</p>
            <p className="text-xs opacity-90">Pide al administrador que te asigne mesas desde Configuración → Mesas.</p>
          </div>
        </div>
      )}

      {/* MAP — Desktop usa posiciones libres; mobile usa grid.
          Fondo "madera" dark-aware (FLOOR_BG). */}
      {isMobile ? (
        <div className="rounded-2xl border-2 p-3"
          style={{
            background: floor.bg,
            borderColor: floor.border,
            boxShadow: isDark
              ? 'inset 0 2px 6px rgba(0,0,0,0.5)'
              : 'inset 0 2px 6px rgba(0,0,0,0.1)',
          }}>
          <MesaGridMobile mesas={mesasZona} onMesaClick={onMesaClick} getResponsable={getResponsable} loading={cargandoMesas} />
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border-2"
          style={{
            height: MAP_HEIGHT,
            background: floor.bg,
            backgroundImage: floor.dotPattern,
            backgroundSize: '24px 24px',
            borderColor: floor.border,
            boxShadow: isDark
              ? 'inset 0 4px 14px rgba(0,0,0,0.6), inset 0 -2px 6px rgba(255,255,255,0.05)'
              : 'inset 0 4px 10px rgba(0,0,0,0.15), inset 0 -2px 6px rgba(255,255,255,0.5)',
          }}>
          {mesasZona.map(mesa => {
            const resp = getResponsable(mesa);
            return (
              <MesaShape
                key={mesa.id}
                mesa={mesa}
                onClick={() => onMesaClick(mesa)}
                responsableColor={resp?.color || null}
                responsableNombre={resp?.nombre || ''}
              />
            );
          })}
          {mesasZona.length === 0 && !sinMesasAsignadas && !cargandoMesas && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/60">
              <div className="text-center">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay mesas en {zonaActiva}.</p>
                <p className="text-xs">Configúralas en Configuración → Mapa de mesas.</p>
              </div>
            </div>
          )}
          {cargandoMesas && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70">
              <div className="text-center">
                <div className="w-10 h-10 rounded-2xl bg-muted/60 mx-auto mb-2 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5 animate-pulse" />
                </div>
                <p className="text-sm">Cargando mapa de mesas…</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cards persistentes de solicitudes QR debajo del mapa */}
      <SolicitudesQRCardList />

      {/* Legend — chips dark-aware (fondo card sólido) */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(MESA_STATUS_CONFIG).filter(([k]) => !['pagada', 'cancelada'].includes(k)).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border text-card-foreground">
            <div className="w-3 h-3 rounded-full border" style={{ background: v.fill, borderColor: v.stroke }} />
            <span className="text-muted-foreground">{v.label}</span>
          </div>
        ))}
      </div>

      {/* === ABRIR MESA DIALOG (6A) === */}
      <AbrirMesaDialog
        open={showAbrirMesa}
        onOpenChange={(v) => { if (!v && !abriendoMesa) { setShowAbrirMesa(false); setMesaParaAbrir(null); } }}
        mesa={mesaParaAbrir}
        loading={abriendoMesa}
        onConfirm={confirmarAbrirMesa}
      />

      {/* === MESA DIALOG === */}
      <Dialog
        open={!!mesaActiva}
        onOpenChange={(open) => {
          // Solo procesar cierres y solo si no estamos ya cerrando
          if (!open && !isClosingRef.current) cerrarDialog();
        }}
      >
        <DialogContent
          // Botón X nativo de Radix agrandado para móvil con clases Tailwind ":[&>button.absolute]:..."
          // Esto modifica el botón nativo SIN reemplazarlo (evita conflictos de DOM con el portal).
          // onOpenAutoFocus: evita que Radix enfoque automáticamente el primer input
          // (el buscador "Buscar producto"), lo que abría el teclado en móvil/tablet
          // al abrir una mesa. Ahora el teclado solo aparece si el usuario toca el input.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sm:max-w-3xl w-screen h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-lg rounded-none flex flex-col p-0 gap-0 max-w-full
            [&>button.absolute]:w-11 [&>button.absolute]:h-11 [&>button.absolute]:rounded-full [&>button.absolute]:bg-muted [&>button.absolute]:opacity-100 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:top-3 [&>button.absolute]:right-3 [&>button.absolute>svg]:w-5 [&>button.absolute>svg]:h-5"
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="font-heading flex items-center gap-2 flex-wrap pr-14">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
              Mesa {mesaActiva?.numero}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{
                background: MESA_STATUS_CONFIG[mesaActiva?.estado]?.fill,
                color: MESA_STATUS_CONFIG[mesaActiva?.estado]?.text,
              }}>
                {MESA_STATUS_CONFIG[mesaActiva?.estado]?.label}
              </span>
              {ventaActiva?.personas > 0 && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" />{ventaActiva.personas}
                </span>
              )}
              {ventaActiva?.cliente_nombre && (
                <span className="text-xs font-normal text-muted-foreground">· {ventaActiva.cliente_nombre}</span>
              )}
              {/* 6A: badge celebración — discreto, nunca tapa el bloque de listos */}
              {(mesaActiva?.celebracion_especial === true || ventaActiva?.celebracion_especial === true) && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800/60 inline-flex items-center gap-1"
                  title={mesaActiva?.tipo_celebracion || ventaActiva?.tipo_celebracion || 'Celebración'}
                >
                  🎉 {(mesaActiva?.tipo_celebracion || ventaActiva?.tipo_celebracion || 'Celebración')}
                </span>
              )}
              {/* 6A: badge alergia — texto compacto, sin banner gigante */}
              {(mesaActiva?.notas_alergias || ventaActiva?.notas_alergias) && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60 inline-flex items-center gap-1"
                  title={mesaActiva?.notas_alergias || ventaActiva?.notas_alergias}
                >
                  ⚠ Alergia
                </span>
              )}
            </DialogTitle>
            {/* 6A: línea pequeña con el detalle de alergia bajo el título.
                NO se renderiza encima del bloque "Listo para recoger". */}
            {(mesaActiva?.notas_alergias || ventaActiva?.notas_alergias) && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-snug">
                <span className="font-semibold">Alergia / indicaciones:</span>{' '}
                {mesaActiva?.notas_alergias || ventaActiva?.notas_alergias}
              </p>
            )}
          </DialogHeader>

          {/* F3.2: Card "Listo para recoger" — se auto-muestra solo cuando
              hay pedidos en estado 'listo' para la venta activa. Maneja
              estaciones (Postres, Alimentos, Barra...) y la entrega solo
              afecta pedidos listos, NUNCA los en preparación o nuevos.
              Mantiene compat con flujos sin estaciones (muestra "Cocina"). */}
          {/* F3.3: fallback robusto — si ventaActiva aún no se hidrata pero la
              mesa ya tiene venta_activa_id, usamos ese id para que la card
              aparezca igual sin esperar a que termine de cargar la venta. */}
          {(ventaActiva?.id || mesaActiva?.venta_activa_id) && (
            <ListosParaRecogerCard
              mesa={mesaActiva}
              ventaId={ventaActiva?.id || mesaActiva?.venta_activa_id}
              onAfterEntregar={handleAfterEntregar}
            />
          )}

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden md:border-r">
              <div className="px-4 py-3 space-y-2 border-b bg-muted/30 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)}
                    placeholder="Buscar producto..." className="pl-9 h-9" />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button onClick={() => setCategoriaFiltro('todas')}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${categoriaFiltro === 'todas' ? 'bg-primary text-white' : 'bg-white border text-muted-foreground'}`}>
                    Todas
                  </button>
                  {categorias.map(c => (
                    <button key={c.id} onClick={() => setCategoriaFiltro(c.id)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${categoriaFiltro === c.id ? 'bg-primary text-white' : 'bg-white border text-muted-foreground'}`}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 pb-32 md:pb-3 grid grid-cols-2 gap-2 content-start">
                {/* HOTFIX 6A.3: loading explícito antes de mostrar "Sin productos".
                    Antes en móvil con red lenta salía "Sin productos" falso. */}
                {cargandoProductos ? (
                  <div className="col-span-2 flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                    <p className="text-xs">Cargando productos…</p>
                  </div>
                ) : (
                  <>
                    {productosFiltrados.map(p => {
                      const tieneOpc = productoTieneModificadores(p);
                      const colorize = config?.colorear_importes_monetarios !== false;
                      return (
                        <button key={p.id} onClick={() => agregarAlCarrito(p)}
                          className="p-3 rounded-xl border bg-white text-left hover:bg-muted/30 active:scale-95 transition-all relative"
                          style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 4px rgba(0,0,0,0.06)' }}>
                          <p className="font-semibold text-sm leading-tight">{p?.nombre}</p>
                          <PrecioProductoMesero producto={p} colorize={colorize} />
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <ChefHat className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground capitalize">{p?.area_preparacion || 'cocina'}</span>
                            <VariableBadge producto={p} />
                            {tieneOpc && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                                Opciones
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {productosFiltrados.length === 0 && productosArr.length > 0 && (
                      <p className="col-span-2 text-center text-sm text-muted-foreground py-8">
                        Sin resultados para tu búsqueda
                      </p>
                    )}
                    {productosArr.length === 0 && productosFetched && (
                      <p className="col-span-2 text-center text-sm text-muted-foreground py-8">
                        Sin productos disponibles
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="hidden md:flex w-full md:w-72 flex-col shrink-0">
              {(detallesVenta || []).length > 0 && (
                <div className="px-4 py-3 border-b bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">PEDIDO ACTUAL</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(detallesVenta || []).map((d, i) => (
                      <div key={d?.id || `det-d-${i}`} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{d?.producto_nombre || '—'} ×{d?.cantidad || 0}</span>
                        <span className="font-medium">{formatCurrency(d?.subtotal || 0)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold border-t pt-1 mt-1 text-right">Total: {formatCurrency(totalActual || 0)}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {(detallesVenta || []).length > 0 ? 'AGREGAR AL PEDIDO' : 'NUEVO PEDIDO'}
                </p>
                {(carrito || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Selecciona productos</p>
                ) : (
                  <div className="space-y-2">
                    {(carrito || []).map((item, idx) => (
                      <ProductoFichaExpandible
                        key={item?.id || `cart-d-${idx}`}
                        item={item}
                        onCambiarCantidad={cambiarCantidad}
                        onUpdateNotas={actualizarNotasItem}
                        onUpdateExclusiones={actualizarExclusionesItem}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t space-y-2 shrink-0">
                {carrito.length > 0 && (
                  <>
                    <Input value={notaMesa} onChange={e => setNotaMesa(e.target.value)}
                      placeholder="Nota para cocina..." className="text-xs h-8" />
                    <div className="flex justify-between text-sm font-bold">
                      <span>Nuevo</span>
                      <span className={config?.colorear_importes_monetarios !== false ? 'text-primary' : 'text-foreground'}>{formatCurrency(totalCarrito)}</span>
                    </div>
                    <Button onClick={enviarPedido} disabled={loading} className="w-full"
                      style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)' }}>
                      <Send className="w-4 h-4 mr-1" />
                      {loading ? 'Enviando...' : 'Enviar a Cocina'}
                    </Button>
                  </>
                )}
                {ventaActiva && carrito.length === 0 && mesaActiva?.estado !== 'cuenta_solicitada' && (
                  puedeCerrarMesaSinVenta ? (
                    <Button onClick={cerrarMesaSinVenta} disabled={loading} variant="outline" className="w-full">
                      <Receipt className="w-4 h-4 mr-1" />
                      Cerrar mesa
                    </Button>
                  ) : (
                    <Button onClick={pedirCuenta} disabled={loading} variant="outline" className="w-full">
                      <Receipt className="w-4 h-4 mr-1" />
                      Solicitar cuenta
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Carrito flotante móvil — solo dentro del dialog de mesa */}
          <MeseroCartFAB
            ref={cartFabRef}
            carrito={carrito}
            totalCarrito={totalCarrito}
            totalActual={totalActual}
            detallesVenta={detallesVenta}
            notaMesa={notaMesa}
            setNotaMesa={setNotaMesa}
            cambiarCantidad={cambiarCantidad}
            enviarPedido={enviarPedido}
            pedirCuenta={pedirCuenta}
            cerrarMesaSinVenta={cerrarMesaSinVenta}
            puedeCerrarMesaSinVenta={puedeCerrarMesaSinVenta}
            loading={loading}
            estadoMesa={mesaActiva?.estado}
            ventaActiva={ventaActiva}
            formatCurrency={formatCurrency}
            config={config}
            onUpdateNotas={actualizarNotasItem}
            onUpdateExclusiones={actualizarExclusionesItem}
          />
        </DialogContent>
      </Dialog>

      {/* === SOLICITUDES QR DIALOG === */}
      <Dialog open={showSolicitudesQR} onOpenChange={setShowSolicitudesQR}>
        <DialogContent className="sm:max-w-3xl w-[calc(100%-1rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Solicitudes QR
            </DialogTitle>
          </DialogHeader>
          <SolicitudesQRPanel />
        </DialogContent>
      </Dialog>

      {/* === ALERTAS PERSONALES DEL MESERO === */}
      <AlertasMeseroDialog
        open={showAlertasMesero}
        onClose={() => setShowAlertasMesero(false)}
      />

      {/* === MODAL DE PERSONALIZACIÓN / MODIFICADORES === */}
      <SeleccionModificadoresDialog
        producto={productoParaPersonalizar}
        open={!!productoParaPersonalizar}
        onClose={() => setProductoParaPersonalizar(null)}
        onConfirm={confirmarPersonalizacion}
      />

      {/* 6B / 1.D — MODAL CANTIDAD / PORCIÓN para productos variables */}
      <CantidadVariableDialog
        open={!!productoVariable}
        producto={productoVariable}
        onClose={() => setProductoVariable(null)}
        onConfirm={confirmarCantidadVariable}
      />

      {/* === MESA HUÉRFANA — REPARACIÓN === */}
      <MesaHuerfanaDialog
        mesa={mesaHuerfana}
        open={!!mesaHuerfana}
        loading={liberandoHuerfana}
        onCancel={() => { if (!liberandoHuerfana) setMesaHuerfana(null); }}
        onConfirm={liberarMesaHuerfana}
      />

      {/* === MODAL DE PROPINA (antes de solicitar cuenta) === */}
      <PropinaDialog
        open={showPropinaMesero}
        onOpenChange={setShowPropinaMesero}
        subtotal={Number(ventaActiva?.total) || totalActual || 0}
        loading={loading}
        allowPendiente
        origen="mesero"
        porcentajesSugeridos={getPorcentajesSugeridos(config)}
        onConfirm={finalizarPedirCuenta}
      />

      {/* === PRE-CUENTA TICKET DIALOG === */}
      <Dialog open={showPreCuenta} onOpenChange={setShowPreCuenta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Pre-cuenta lista</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
            {preCuentaData && (
              <PreCuentaTicket
                venta={preCuentaData.venta}
                detalles={preCuentaData.detalles}
                mesa={preCuentaData.mesa}
                config={config}
                codigo={preCuentaData.codigo} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreCuenta(false)}>Cerrar</Button>
            <Button onClick={imprimirPreCuenta}>
              <Printer className="w-4 h-4 mr-1" />Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
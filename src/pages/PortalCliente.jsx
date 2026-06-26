import React, { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/utils/financialUtils';
import { Bell, Sparkles, CheckCircle2, AlertTriangle, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import AtencionFAB from '@/components/portalqr/AtencionFAB';
import ProductoPlaceholder from '@/components/portalqr/ProductoPlaceholder';
import PedirCuentaQR from '@/components/portalqr/PedirCuentaQR';
import AbrirMesaQRDialog from '@/components/portalqr/AbrirMesaQRDialog';
import ProductoQRDialog from '@/components/portalqr/ProductoQRDialog';
import CarritoQR from '@/components/portalqr/CarritoQR';
import ValoracionEmoji from '@/components/portalqr/ValoracionEmoji';
import { abrirMesaDesdeQR, enviarPedidoQR, findVentaActivaMesa } from '@/utils/qrPedidoFlow';
import { getTiposSolicitudHabilitados, TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import ThemeToggle from '@/components/common/ThemeToggle';

/**
 * Vista pública del comensal (sin sidebar, sin POS).
 * Ruta: /qr/:token
 */
export default function PortalClienteWithBoundary() {
  return (
    <ErrorBoundary
      fallbackTitle="No se pudo cargar el menú."
      fallbackMessage="Por favor, llama a un mesero para que te ayude."
    >
      <PortalCliente />
    </ErrorBoundary>
  );
}

const SPAM_WINDOW_MS = 90 * 1000; // 90 seg entre solicitudes del mismo tipo

function PortalCliente() {
  const { token } = useParams();
  const [tabSeccion, setTabSeccion] = useState('todas');
  const [enviado, setEnviado] = useState(null); // {tipo, time}
  const [enviandoTipo, setEnviandoTipo] = useState(null);
  const [lastSentMap, setLastSentMap] = useState({});
  const [solicitudActivaId, setSolicitudActivaId] = useState(null);
  const [solicitudAtendida, setSolicitudAtendida] = useState(false);
  // Vista "Pedir cuenta" con precuenta + propina (solo tipo='cuenta')
  const [showPedirCuenta, setShowPedirCuenta] = useState(false);

  // === PEDIDO QR (Prompt 6C) ===
  const [carrito, setCarrito] = useState([]); // items con _uid único
  const [notaGeneralCarrito, setNotaGeneralCarrito] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [showAbrirMesaQR, setShowAbrirMesaQR] = useState(false);
  const [abriendoMesa, setAbriendoMesa] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [showValoracion, setShowValoracion] = useState(false);
  const [valoracionVentaId, setValoracionVentaId] = useState(null);

  // Cliente de queries para sincronizar updates locales tras abrir mesa.
  const queryClient = useQueryClient();

  // Config pública
  const { data: configs = [], isLoading: loadingConfig, isFetched: configFetched } = useQuery({
    queryKey: ['config_publica_qr'],
    queryFn: () => base44.entities.ConfiguracionNegocio.list(),
    initialData: [],
  });
  const config = configs?.[0] || null;

  // Mesa por token. HOTFIX 6A.3: refetchInterval bajo para que cambios hechos
  // por mesero/cocina lleguen rápido al QR (mesero abre la mesa antes del
  // cliente → QR debe verla abierta en ≤3s sin refrescar).
  const { data: mesas = [], isLoading: loadingMesa, isFetched: mesaFetched } = useQuery({
    queryKey: ['mesa_por_token', token],
    queryFn: () => base44.entities.Mesa.filter({ qr_token: token }),
    initialData: [],
    enabled: !!token,
    refetchInterval: 4000,
    staleTime: 2000,
  });
  const mesa = mesas?.[0] || null;

  // Hasta que NO termine el primer fetch de config y mesa, no decidimos
  // si el portal está disponible (antes parpadeaba "Portal no disponible").
  const cargando = loadingConfig || loadingMesa || !configFetched || (!!token && !mesaFetched);

  const modoMenu = config?.portal_qr_modo_menu || 'productos_pos';
  const portalActivo = config?.portal_qr_activo === true;
  // FLUJO PRINCIPAL: el mesero dispara la cuenta y el QR muestra propina en vivo.
  // 'mesero_dispara' (default): el cliente NO ve botón "Pedir cuenta" en el FAB.
  // 'cliente_solicita': el cliente sí puede pedir cuenta desde el QR.
  // 'ambos': cualquiera puede iniciar.
  const cuentaModo = config?.portal_qr_cuenta_modo || 'mesero_dispara';
  const clientePuedeIniciarCuenta = cuentaModo === 'cliente_solicita' || cuentaModo === 'ambos';

  // Lista de tipos visible en el FAB de atención del comensal.
  // BANDERA 3 corregida: aunque el modo sea 'mesero_dispara', mantenemos el
  // botón visible (si está activo en config) — pero al tocarlo NO abrirá la
  // pantalla de propina; solo creará un aviso al mesero. Esto le da al cliente
  // una vía clara de notificar "ya quiero la cuenta" sin saltarse al mesero.
  const tiposHabilitados = useMemo(() => {
    return getTiposSolicitudHabilitados(config) || [];
  }, [config]);

  // Productos visibles
  // HOTFIX 6A.2: usar isFetched para distinguir "todavía cargando" de "ya cargó y está vacío".
  // Removemos initialData:[] porque generaba el flash "sin productos" antes del primer fetch.
  const productosQueryEnabled = portalActivo && !!mesa && (modoMenu === 'productos_pos' || modoMenu === 'mixto');
  const {
    data: productos = [],
    isFetched: productosFetched,
    isLoading: productosLoading,
  } = useQuery({
    queryKey: ['productos_menu_qr'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true, visible_en_menu_digital: true }),
    enabled: productosQueryEnabled,
  });
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_menu_qr'],
    // FIX: filtrar activo:true para que categorías eliminadas no sigan apareciendo
    // como pills en el Portal QR del cliente.
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }, 'orden'),
    initialData: [],
    enabled: productosQueryEnabled,
  });
  // Solo consideramos "productos listos para mostrar vacío" cuando la query
  // está habilitada Y ya terminó el primer fetch.
  const productosListos = !productosQueryEnabled || (productosFetched && !productosLoading);

  // Secciones de menú subido
  const { data: secciones = [] } = useQuery({
    queryKey: ['menu_qr_secciones_publico'],
    queryFn: () => base44.entities.MenuQRSeccion.filter({ activo: true }),
    initialData: [],
    enabled: portalActivo && !!mesa && (modoMenu === 'menu_subido' || modoMenu === 'mixto'),
  });

  const productosFiltrados = useMemo(() => {
    const arr = Array.isArray(productos) ? productos : [];
    if (tabSeccion === 'todas') return arr;
    if (tabSeccion.startsWith('cat-')) {
      const id = tabSeccion.slice(4);
      return arr.filter(p => p?.categoria_id === id);
    }
    return arr;
  }, [productos, tabSeccion]);

  const seccionesUtiles = useMemo(() => (Array.isArray(secciones) ? secciones : []).sort((a, b) => (a?.orden || 0) - (b?.orden || 0)), [secciones]);

  // Limpiar estado "enviado" tras 3 seg
  useEffect(() => {
    if (!enviado) return;
    const t = setTimeout(() => setEnviado(null), 3500);
    return () => clearTimeout(t);
  }, [enviado]);

  // Polling: si tenemos una solicitudActivaId y aún no fue atendida, revisar cada 4s.
  useEffect(() => {
    if (!solicitudActivaId || solicitudAtendida) return;
    let cancel = false;
    const interval = setInterval(async () => {
      try {
        const s = await base44.entities.SolicitudQR.get(solicitudActivaId).catch(() => null);
        if (cancel) return;
        if (s && (s.estado === 'atendida' || s.estado === 'resuelta')) {
          setSolicitudAtendida(true);
        }
      } catch {}
    }, 4000);
    return () => { cancel = true; clearInterval(interval); };
  }, [solicitudActivaId, solicitudAtendida]);

  // === POLLING DE VENTA: detecta cuando el mesero solicita la cuenta ===
  // Cada 4 segundos consulta la venta activa de la mesa. Mantiene en estado
  // la última venta vista (para mostrar tarjeta persistente y permitir
  // reabrir PedirCuentaQR aunque el cliente cierre el modal).
  // - Auto-abre PedirCuentaQR UNA SOLA VEZ por venta.id (no en loop).
  // - Si el cliente cierra, queda visible una tarjeta para reabrirlo.
  const [autoOpenedVentaId, setAutoOpenedVentaId] = useState(null);
  const [ventaActivaMesa, setVentaActivaMesa] = useState(null);
  // HOTFIX 6A.2: indica si ya hicimos el primer chequeo de venta activa.
  // Antes de esto, NO debemos decidir "mesa libre" (causaba que QR pidiera
  // abrir mesa aunque ya estuviera abierta desde Mesero).
  const [ventaCheckDone, setVentaCheckDone] = useState(false);
  useEffect(() => {
    if (!portalActivo || !mesa?.id) return;
    let cancel = false;
    const checkVenta = async () => {
      try {
        const estadosActivos = ['abierta', 'enviada', 'en_preparacion', 'lista', 'cuenta_solicitada'];
        const ventas = await base44.entities.Venta.filter({ mesa_id: mesa.id }).catch(() => []);
        const safe = Array.isArray(ventas) ? ventas : [];
        const v = safe
          .filter(x => x && estadosActivos.includes(x.estado))
          .sort((a, b) => new Date(b?.fecha_apertura || b?.created_date || 0) - new Date(a?.fecha_apertura || a?.created_date || 0))[0] || null;
        if (cancel) return;
        setVentaActivaMesa(v || null);
        // Marcar primer chequeo completado SIEMPRE (haya o no venta).
        setVentaCheckDone(true);
        if (!v) return;
        // ¿El mesero solicitó cuenta y delegó la propina al QR?
        const esperandoCliente =
          v.estado === 'cuenta_solicitada' &&
          (v.propina_tipo === 'pendiente_cliente' || v.propina_origen === 'pendiente_portal_qr');
        if (esperandoCliente && autoOpenedVentaId !== v.id && !showPedirCuenta) {
          setAutoOpenedVentaId(v.id);
          setShowPedirCuenta(true);
        }
      } catch {}
    };
    // Primer chequeo inmediato + intervalo cada 2.5s para detección rápida.
    checkVenta();
    const interval = setInterval(checkVenta, 2500);
    return () => { cancel = true; clearInterval(interval); };
  }, [portalActivo, mesa?.id, autoOpenedVentaId, showPedirCuenta]);

  // HOTFIX 6A.3 — Cargar DetalleVenta de la venta activa en vivo y pasarlos
  // como hint a PedirCuentaQR. Sin esto, el QR mostraba "total $150" pero
  // la lista de "Mi consumo" vacía por unos segundos. Ahora cuando el cliente
  // abre la cuenta, ya tiene los productos listos sin esperar a la query interna.
  const [detallesActivosMesa, setDetallesActivosMesa] = useState([]);
  useEffect(() => {
    if (!ventaActivaMesa?.id) {
      setDetallesActivosMesa([]);
      return;
    }
    let cancel = false;
    const load = async () => {
      try {
        const det = await base44.entities.DetalleVenta.filter({ venta_id: ventaActivaMesa.id }).catch(() => []);
        if (cancel) return;
        setDetallesActivosMesa(Array.isArray(det) ? det : []);
      } catch (e) {
        if (!cancel) console.warn('[PortalCliente] cargar detalles activos:', e);
      }
    };
    load();
    // Refrescar cada 3s mientras haya venta activa (el cliente pidió/agregó).
    const interval = setInterval(load, 3000);
    return () => { cancel = true; clearInterval(interval); };
  }, [ventaActivaMesa?.id]);

  // Tarjeta persistente "Tu cuenta fue solicitada" — visible cuando el mesero
  // disparó la cuenta y el cliente todavía no ha elegido propina (o la cerró).
  // También muestra confirmación cuando el cliente ya eligió.
  const esperandoEleccionCliente =
    !!ventaActivaMesa &&
    ventaActivaMesa.estado === 'cuenta_solicitada' &&
    (ventaActivaMesa.propina_tipo === 'pendiente_cliente' ||
      ventaActivaMesa.propina_origen === 'pendiente_portal_qr');
  const yaEligioCliente =
    !!ventaActivaMesa &&
    ventaActivaMesa.estado === 'cuenta_solicitada' &&
    ventaActivaMesa.propina_origen === 'portal_qr';
  const cuentaDecideEnCaja =
    yaEligioCliente && ventaActivaMesa?.propina_tipo === 'decidir_en_caja';

  // === Flags para Pedido QR (Prompt 6C) ===
  // Solo si el paquete es Restaurante Pro, asignación de mesas activa, portal activo
  // y el switch "Permitir pedidos desde Portal QR" está encendido.
  const pedidosQRActivos =
    (config?.paquete_modo || 'restaurante_pro') === 'restaurante_pro' &&
    config?.asignacion_mesas_activa === true &&
    portalActivo &&
    config?.portal_qr_permitir_pedidos_cliente === true;

  const tieneMeseroAsignado = !!mesa?.mesero_asignado_id;
  // HOTFIX 6A.3: "mesa ya abierta" se detecta por MÚLTIPLES señales para
  // que el QR no vuelva a pedir abrir mesa después de abrirla:
  //   1. ventaActivaMesa (polling)
  //   2. mesa.venta_activa_id (estado de la mesa según BD)
  //   3. mesa.estado !== 'libre'
  // Si CUALQUIERA indica que hay mesa abierta, NO se debe pedir abrir.
  const mesaYaAbierta =
    !!ventaActivaMesa ||
    !!mesa?.venta_activa_id ||
    (mesa?.estado && mesa.estado !== 'libre');
  // Solo declaramos "mesa libre" cuando YA terminó el primer chequeo de venta
  // activa Y todas las señales coinciden en que no hay venta.
  const mesaLibreParaAbrir =
    ventaCheckDone && !mesaYaAbierta && pedidosQRActivos && tieneMeseroAsignado;
  const cuentaYaSolicitada =
    !!ventaActivaMesa &&
    (ventaActivaMesa.estado === 'cuenta_solicitada' ||
      ventaActivaMesa.estado === 'pagada' ||
      ventaActivaMesa.estado === 'cancelada');
  const mesaPermitePedirAhora =
    !!ventaActivaMesa &&
    !cuentaYaSolicitada &&
    tieneMeseroAsignado &&
    pedidosQRActivos;

  // === HANDLERS PEDIDO QR ===
  const handleClickProducto = (producto) => {
    if (!pedidosQRActivos) return;
    // HOTFIX 6A.2: si aún no terminó el primer chequeo de venta, esperar.
    // Evita que el dialog "Abrir mesa" salga falsamente sobre una mesa ya abierta.
    if (!ventaCheckDone) {
      toast.info('Cargando estado de la mesa…');
      return;
    }
    if (cuentaYaSolicitada) {
      toast.info('La cuenta ya fue solicitada. Llama al mesero si necesitas algo más.');
      return;
    }
    if (mesaLibreParaAbrir) {
      setShowAbrirMesaQR(true);
      return;
    }
    if (!mesaPermitePedirAhora) {
      if (!tieneMeseroAsignado) {
        toast.error('Esta mesa aún no tiene mesero asignado. Pide apoyo al personal.');
      } else {
        toast.info('No se pueden agregar productos en este momento.');
      }
      return;
    }
    setProductoSeleccionado(producto);
  };

  const handleAddToCart = ({ producto, cantidad, notas, modificadores, _variable }) => {
    if (!producto?.id) return;
    const _uid = `cart-${producto.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // 6B / 1.E — Si llega snapshot _variable, el precio_venta efectivo es
    // el precio total de la línea (cantidad lógica = 1, igual que en Mesero).
    const precioEfectivo = _variable
      ? Number(_variable.precio_total_linea) || 0
      : Number(producto.precio_venta) || 0;
    setCarrito((prev) => [
      ...prev,
      {
        _uid,
        id: producto.id,
        nombre: producto.nombre || '',
        precio_venta: precioEfectivo,
        costo_calculado_actual: Number(producto.costo_calculado_actual) || 0,
        area_preparacion: producto.area_preparacion || 'cocina',
        cantidad: Math.max(1, parseInt(cantidad, 10) || 1),
        notas: (notas || '').trim(),
        _modificadores: Array.isArray(modificadores) ? modificadores : [],
        _variable: _variable || null,
      },
    ]);
    setProductoSeleccionado(null);
  };

  const handleChangeCantidad = (uid, delta) => {
    setCarrito((prev) =>
      prev
        .map((i) =>
          i._uid === uid ? { ...i, cantidad: Math.max(0, (Number(i.cantidad) || 0) + delta) } : i
        )
        .filter((i) => Number(i.cantidad) > 0)
    );
  };
  const handleEliminarItem = (uid) => {
    setCarrito((prev) => prev.filter((i) => i._uid !== uid));
  };

  const handleConfirmarAbrirMesa = async (datos) => {
    if (!mesa?.id) return;
    setAbriendoMesa(true);
    try {
      // HOTFIX 6A.2: el dialog QR captura alergia/celebración. Hay que
      // propagar TODOS los campos a abrirMesaDesdeQR para que se guarden
      // en Mesa + Venta (snapshot). De lo contrario, Mesero/Cocina no las verán.
      const { venta } = await abrirMesaDesdeQR({
        mesa,
        personas: datos?.personas,
        cliente_nombre: datos?.cliente_nombre,
        notas: datos?.notas,
        notas_alergias: datos?.notas_alergias,
        celebracion_especial: datos?.celebracion_especial,
        tipo_celebracion: datos?.tipo_celebracion,
      });

      // HOTFIX 6A.3 — ACTUALIZACIÓN LOCAL INMEDIATA tras abrir mesa.
      // Sin esto, el QR esperaba al siguiente polling (hasta 3s) y mientras
      // tanto pensaba que la mesa seguía "libre", volviendo a pedir abrir.
      //
      // 1) Marcar venta activa local.
      setVentaActivaMesa(venta || null);
      // 2) Marcar primer chequeo como completo (por si aún no había corrido).
      setVentaCheckDone(true);
      // 3) Inyectar el patch de la mesa en el cache de la query 'mesa_por_token'
      //    para que mesa.estado y mesa.venta_activa_id se actualicen al instante.
      const personasNum = Math.max(1, parseInt(datos?.personas, 10) || 1);
      const clienteClean = (datos?.cliente_nombre || '').trim();
      const alergiasClean = (datos?.notas_alergias || '').trim();
      const celeb = !!datos?.celebracion_especial;
      const tipoCele = celeb ? (datos?.tipo_celebracion || '').trim() : '';
      try {
        queryClient.setQueryData(['mesa_por_token', token], (prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          if (arr.length === 0) return prev;
          return arr.map((m) => {
            if (m?.id !== mesa.id) return m;
            return {
              ...m,
              estado: m.estado === 'libre' ? 'esperando_orden' : m.estado,
              venta_activa_id: venta?.id || m.venta_activa_id,
              personas_actuales: personasNum,
              cliente_temporal: clienteClean,
              notas_alergias: alergiasClean,
              celebracion_especial: celeb,
              tipo_celebracion: tipoCele,
            };
          });
        });
        // 4) Disparar refetch para sincronizar con BD en el próximo tick.
        queryClient.invalidateQueries({ queryKey: ['mesa_por_token', token] });
      } catch (e) {
        console.warn('[PortalCliente] sync mesa local:', e);
      }

      setShowAbrirMesaQR(false);
      toast.success(`¡Mesa ${mesa.numero || ''} abierta! Ahora puedes agregar productos.`);
    } catch (err) {
      console.error('[PortalCliente] abrir mesa QR:', err);
      toast.error(err?.message || 'No pudimos abrir la mesa. Intenta de nuevo.');
    } finally {
      setAbriendoMesa(false);
    }
  };

  const handleEnviarPedido = async () => {
    if (enviandoPedido) return;
    if (!Array.isArray(carrito) || carrito.length === 0) {
      toast.error('Tu pedido está vacío.');
      return;
    }
    if (!mesa?.id || !tieneMeseroAsignado) {
      toast.error('Esta mesa no está disponible para pedir.');
      return;
    }
    setEnviandoPedido(true);
    try {
      // Re-validar venta activa antes de enviar
      let ventaParaPedido = ventaActivaMesa;
      if (!ventaParaPedido) {
        ventaParaPedido = await findVentaActivaMesa(mesa.id);
      }
      if (!ventaParaPedido) {
        toast.error('La mesa ya no tiene venta activa. Pide al mesero que te ayude.');
        return;
      }
      if (['cuenta_solicitada', 'pagada', 'cancelada'].includes(ventaParaPedido.estado)) {
        toast.info('La cuenta ya fue solicitada. Llama al mesero si necesitas algo más.');
        return;
      }
      await enviarPedidoQR({
        mesa,
        venta: ventaParaPedido,
        items: carrito,
        notaGeneral: notaGeneralCarrito,
      });
      setCarrito([]);
      setNotaGeneralCarrito('');
      // BLOQUE 0 — Invalidar lo que necesita ver el pedido en vivo:
      // Cocina (pedidos_cocina), Mesero (pedidos_listos_watcher), Mesas, Caja
      // (ventas_pendientes_caja por si la venta sumó productos) y el propio
      // QR (mesa_por_token y los detalles activos).
      try {
        queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
        queryClient.invalidateQueries({ queryKey: ['pedidos_listos_watcher'] });
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
        queryClient.invalidateQueries({ queryKey: ['mesa_por_token', token] });
      } catch (e) {
        console.warn('[PortalCliente] invalidar tras enviar pedido:', e);
      }
      toast.success('¡Pedido enviado a cocina!');
    } catch (err) {
      console.error('[PortalCliente] enviar pedido QR:', err);
      toast.error(err?.message || 'No pudimos enviar tu pedido. Intenta de nuevo.');
    } finally {
      setEnviandoPedido(false);
    }
  };

  // Estados de no-disponibilidad
  if (!token) {
    return <ScreenError titulo="QR inválido" texto="Este enlace no es válido." />;
  }
  // Loader mientras carga config/mesa — evita flash de "Portal no disponible".
  if (cargando) {
    return <ScreenLoading />;
  }
  if (!mesa) {
    return <ScreenError titulo="Mesa no encontrada" texto="Llama a un mesero para que te ayude." />;
  }
  if (!portalActivo) {
    return <ScreenError titulo="Portal no disponible" texto="El menú digital está temporalmente desactivado. Llama a un mesero." />;
  }
  if (mesa && mesa.qr_activo === false) {
    return <ScreenError titulo="QR de esta mesa inactivo" texto="Llama a un mesero para que te ayude." />;
  }

  const enviarSolicitud = async (tipo) => {
    if (!mesa?.id || !tipo || enviandoTipo) return;

    // Tipo "cuenta":
    // - cliente_solicita | ambos: el cliente abre directo PedirCuentaQR.
    // - mesero_dispara (default): el cliente NO debe saltarse al mesero.
    //   Solo creamos un aviso (SolicitudQR tipo:'cuenta') y le informamos
    //   que la pantalla de propina se activará cuando el mesero confirme.
    if (tipo === 'cuenta') {
      if (clientePuedeIniciarCuenta) {
        setShowPedirCuenta(true);
        return;
      }
      // Modo mesero_dispara: caer al flujo de aviso normal (no abrir propina).
      // El polling de venta abrirá PedirCuentaQR cuando el mesero confirme.
      // (continúa abajo con el flujo estándar de SolicitudQR)
    }

    const ahora = Date.now();

    setEnviandoTipo(tipo);
    try {
      // Bloquear SOLO si existe una solicitud ACTIVA (pendiente) del mismo tipo.
      // Si la última quedó atendida/resuelta/cancelada, permitir nueva normalmente.
      // La fuente de verdad es la BD, no el lastSentMap local.
      const pendientes = await base44.entities.SolicitudQR.filter({
        mesa_id: mesa.id,
        tipo,
        estado: 'pendiente',
      }).catch(() => []);
      if (Array.isArray(pendientes) && pendientes.length > 0) {
        toast.info('Tu solicitud ya fue enviada. Un mesero la atenderá pronto.');
        return;
      }
      // Ruteo:
      // Si asignacion_mesas_activa y la mesa tiene mesero_asignado_id, se setea destino.
      // Si no, queda como "general" (cualquier mesero la verá).
      const asign = config?.asignacion_mesas_activa === true;
      const tieneAsignado = !!mesa.mesero_asignado_id;
      const ruteo = asign && tieneAsignado ? 'asignado' : 'general';
      const creada = await base44.entities.SolicitudQR.create({
        mesa_id: mesa.id,
        mesa_nombre: mesa.nombre || '',
        mesa_numero: mesa.numero || 0,
        tipo,
        estado: 'pendiente',
        fecha_creacion: new Date().toISOString(),
        origen: 'portal_qr',
        token_mesa: mesa.qr_token || token,
        mesero_destino_id: ruteo === 'asignado' ? mesa.mesero_asignado_id : '',
        mesero_destino_nombre: ruteo === 'asignado' ? (mesa.mesero_asignado_nombre || '') : '',
        ruteo_modo: ruteo,
      });
      setLastSentMap(prev => ({ ...prev, [tipo]: ahora }));
      setEnviado({ tipo });
      if (creada?.id) {
        setSolicitudActivaId(creada.id);
        setSolicitudAtendida(false);
      }
      // Mensaje específico si el cliente tocó "Pedir cuenta" en modo mesero_dispara.
      if (tipo === 'cuenta' && !clientePuedeIniciarCuenta) {
        toast.info('Avisamos al mesero. La cuenta se activará cuando el mesero la confirme.');
      }
    } catch (err) {
      console.error('[PortalCliente] enviarSolicitud:', err);
      toast.error('No pudimos enviar tu solicitud. Intenta de nuevo.');
    } finally {
      setEnviandoTipo(null);
    }
  };

  const mostrarPrecios = config?.portal_qr_mostrar_precios !== false;
  const mostrarSinImagen = config?.portal_qr_mostrar_sin_imagen !== false;
  const usarProductos = modoMenu === 'productos_pos' || modoMenu === 'mixto';
  const usarSecciones = modoMenu === 'menu_subido' || modoMenu === 'mixto';

  // Logo del negocio para marca de agua + header.
  // Campos REALES de ConfiguracionNegocio (verificados en el schema):
  //   logo_url            → logo principal (sidebar, login, fallback general)
  //   logo_ticket_url     → logo de tickets térmicos
  //   logo_pdf_url        → logo de PDFs / cortes
  //   background_logo_url → logo de marca de agua (configurado en IdentidadNegocio)
  // Prioridad: usamos el logo principal y, si está vacío, el de tickets / PDF /
  // background. Helper inline para mantener el componente autosuficiente.
  const getBrandLogo = (cfg) => (
    cfg?.logo_url ||
    cfg?.logo_ticket_url ||
    cfg?.logo_pdf_url ||
    cfg?.background_logo_url ||
    ''
  );
  const brandLogo = getBrandLogo(config);

  // Ocultar imagen rota si la URL deja de existir / falla CORS.
  const onLogoError = (e) => { try { e.currentTarget.style.display = 'none'; } catch {} };

  return (
    <div className="relative min-h-screen bg-background text-foreground pb-32 overflow-x-hidden">
      {/* MARCA DE AGUA — logo del negocio, visible en claro y oscuro.
          Usa la clase `brand-watermark` para que en modo oscuro el filtro
          definido en index.css realce el logo (brightness + grayscale). */}
      {brandLogo && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
        >
          <img
            src={brandLogo}
            alt=""
            onError={onLogoError}
            className="brand-watermark w-[75vw] max-w-[480px] select-none"
            style={{ opacity: 0.08, objectFit: 'contain' }}
            draggable={false}
          />
        </div>
      )}

      {/* Header con logo del negocio + toggle de tema */}
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {brandLogo && (
            <img
              src={brandLogo}
              alt={config?.nombre_negocio || ''}
              onError={onLogoError}
              className="w-11 h-11 rounded-lg bg-white p-1 border shrink-0"
              style={{ objectFit: 'contain' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-heading font-black text-base leading-tight truncate">
              {config?.nombre_negocio || 'Menú'}
            </p>
            <p className="text-xs text-muted-foreground">
              Mesa {mesa?.numero}{mesa?.nombre ? ` · ${mesa.nombre}` : ''}
            </p>
          </div>
          <ThemeToggle variant="icon" />
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Bienvenida */}
        {config?.portal_qr_mensaje_bienvenida && (
          <div className="rounded-2xl p-4 border bg-card text-card-foreground shadow-sm flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm">{config.portal_qr_mensaje_bienvenida}</p>
          </div>
        )}

        {/* MODO PRODUCTOS POS */}
        {usarProductos && (
          <section>
            {/* Tabs de categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              <Pill active={tabSeccion === 'todas'} onClick={() => setTabSeccion('todas')}>Todo</Pill>
              {(categorias || []).map(c => (
                <Pill key={c.id} active={tabSeccion === `cat-${c.id}`}
                  onClick={() => setTabSeccion(`cat-${c.id}`)}>{c?.nombre || '—'}</Pill>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* HOTFIX 6A.2: si productos aún cargan, mostrar loader.
                  Antes salía "sin productos" durante el primer fetch. */}
              {!productosListos ? (
                <div className="col-span-full flex flex-col items-center gap-2 py-10">
                  <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Cargando menú…</p>
                </div>
              ) : (
                <>
                  {productosFiltrados.filter(p => mostrarSinImagen || p?.imagen_url).map(p => (
                    <ProductoCardCliente
                      key={p.id}
                      producto={p}
                      mostrarPrecios={mostrarPrecios}
                      clickable={pedidosQRActivos && !cuentaYaSolicitada}
                      onClick={() => handleClickProducto(p)}
                    />
                  ))}
                  {productosFiltrados.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6 col-span-full">
                      Sin productos en esta categoría.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* MODO MENÚ SUBIDO */}
        {usarSecciones && seccionesUtiles.length > 0 && (
          <section className="space-y-3">
            {usarProductos && <h2 className="text-sm font-heading font-bold mt-4">Menús</h2>}
            {seccionesUtiles.map(s => (
              <div key={s.id} className="rounded-2xl border bg-card text-card-foreground overflow-hidden shadow-sm">
                {s.imagen_url && (
                  <img src={s.imagen_url} alt={s.nombre} className="w-full h-auto object-cover" />
                )}
                <div className="p-3">
                  <p className="font-heading font-bold text-base">{s.nombre}</p>
                  {s.descripcion && <p className="text-xs text-muted-foreground">{s.descripcion}</p>}
                </div>
              </div>
            ))}
          </section>
        )}

        {!usarProductos && !usarSecciones && (
          <p className="text-sm text-muted-foreground text-center py-12">Sin menú configurado todavía.</p>
        )}
      </main>

      {/* Botón flotante de atención.
          Reglas:
          - Asignación activa + mesa SIN mesero asignado: bloqueado (mensaje aviso).
          - Asignación apagada: el botón se oculta (no audio masivo).
          - Asignación activa + mesa con mesero: funciona normal.
      */}
      {(() => {
        const asign = config?.asignacion_mesas_activa === true;
        if (!asign) return null; // oculto si no hay asignación
        const tieneMesero = !!mesa?.mesero_asignado_id;
        return (
          <AtencionFAB
            tiposHabilitados={tiposHabilitados}
            onPedir={enviarSolicitud}
            disabled={!!enviandoTipo}
            bloqueado={!tieneMesero}
            mensajeBloqueado="Esta mesa aún no tiene un mesero asignado. Por favor, acércate a un mesero del salón."
          />
        );
      })()}

      {/* Tarjeta persistente: cuando el mesero ya disparó la cuenta.
          Permite reabrir PedirCuentaQR si el cliente cerró la pantalla. */}
      {(esperandoEleccionCliente || yaEligioCliente) && !showPedirCuenta && (
        <div className="fixed bottom-24 inset-x-4 z-40 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => setShowPedirCuenta(true)}
            className={`w-full text-left rounded-2xl px-4 py-3 shadow-xl border-2 flex items-start gap-3 active:scale-[0.99] transition-transform ${
              esperandoEleccionCliente
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
            }`}
          >
            <Receipt
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                esperandoEleccionCliente ? 'text-amber-600' : 'text-emerald-600'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-sm">
                Tu cuenta fue solicitada
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                {esperandoEleccionCliente
                  ? 'Toca para elegir propina o ver tu precuenta.'
                  : cuentaDecideEnCaja
                    ? 'Decidiste definir la propina en caja.'
                    : 'Selección enviada a caja.'}
              </p>
            </div>
            <span className="text-xs font-semibold underline shrink-0 self-center">
              {esperandoEleccionCliente ? 'Abrir' : 'Ver'}
            </span>
          </button>
        </div>
      )}

      {/* Confirmación: solicitud atendida por el mesero */}
      <AnimatePresence>
        {solicitudAtendida && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 inset-x-4 z-50 max-w-sm mx-auto"
          >
            <div className="rounded-xl bg-blue-600 text-white px-4 py-3 shadow-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-bold">Tu mesero ya vio la solicitud</p>
                <p className="text-xs opacity-90">Pasará a tu mesa en breve.</p>
              </div>
              <button onClick={() => { setSolicitudAtendida(false); setSolicitudActivaId(null); }}
                className="text-white/80 hover:text-white text-xs underline">OK</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal "Pedir cuenta" con precuenta + propina */}
      <AnimatePresence>
        {showPedirCuenta && mesa && (
          <PedirCuentaQR
            mesa={mesa}
            config={config}
            ventaHint={ventaActivaMesa}
            detallesHint={detallesActivosMesa}
            onClose={() => {
              setShowPedirCuenta(false);
              // Tras cerrar (post-confirmación): si la venta tiene venta_id real
              // y el cliente eligió propina desde QR, abrir valoración.
              if (valoracionVentaId) {
                setTimeout(() => setShowValoracion(true), 250);
              }
            }}
            onConfirmed={() => {
              setEnviado({ tipo: 'cuenta' });
              // Capturar el venta_id real (no objeto stale) para la valoración.
              if (ventaActivaMesa?.id) {
                setValoracionVentaId(ventaActivaMesa.id);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* === Pedido QR: modales + carrito + valoración (Prompt 6C) === */}
      <AnimatePresence>
        {showAbrirMesaQR && mesa && (
          <AbrirMesaQRDialog
            mesa={mesa}
            loading={abriendoMesa}
            onClose={() => { if (!abriendoMesa) setShowAbrirMesaQR(false); }}
            onConfirm={handleConfirmarAbrirMesa}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {productoSeleccionado && (
          <ProductoQRDialog
            producto={productoSeleccionado}
            open={!!productoSeleccionado}
            onClose={() => setProductoSeleccionado(null)}
            onConfirm={handleAddToCart}
            mostrarPrecios={mostrarPrecios}
          />
        )}
      </AnimatePresence>

      {pedidosQRActivos && !cuentaYaSolicitada && (
        <CarritoQR
          items={carrito}
          onChangeCantidad={handleChangeCantidad}
          onEliminar={handleEliminarItem}
          onEnviar={handleEnviarPedido}
          enviando={enviandoPedido}
          notaGeneral={notaGeneralCarrito}
          setNotaGeneral={setNotaGeneralCarrito}
        />
      )}

      <AnimatePresence>
        {showValoracion && valoracionVentaId && (
          <ValoracionEmoji
            ventaId={valoracionVentaId}
            mesa={mesa}
            onClose={() => setShowValoracion(false)}
          />
        )}
      </AnimatePresence>

      {/* Toast/banner de confirmación */}
      <AnimatePresence>
        {enviado && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 inset-x-4 z-50 max-w-sm mx-auto"
          >
            <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 shadow-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-bold">Solicitud enviada</p>
                <p className="text-xs opacity-90">Un mesero te atenderá en breve. ({TIPO_SOLICITUD_VERBO[enviado.tipo] || ''})</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${active ? 'bg-foreground text-background' : 'bg-card border text-muted-foreground'}`}>
      {children}
    </button>
  );
}

function ProductoCardCliente({ producto, mostrarPrecios, clickable, onClick }) {
  // Badge "Personalizable" si tiene modificadores activos.
  const tienePersonalizar = (() => {
    const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
    return arr.some(
      (g) =>
        g?.activo !== false &&
        String(g?.nombre || '').trim() &&
        (Array.isArray(g.opciones) ? g.opciones : []).some(
          (o) => o?.activo !== false && String(o?.nombre || '').trim()
        )
    );
  })();
  const Comp = clickable ? 'button' : 'div';
  return (
    <Comp
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}
      className={`rounded-2xl bg-card text-card-foreground border overflow-hidden shadow-sm flex flex-col text-left w-full ${
        clickable ? 'active:scale-[0.98] transition-transform hover:shadow-md cursor-pointer' : ''
      }`}
    >
      {producto?.imagen_url ? (
        <img src={producto.imagen_url} alt={producto?.nombre || ''} className="w-full h-32 object-cover" />
      ) : (
        <ProductoPlaceholder producto={producto} />
      )}
      <div className="p-3 flex-1 flex flex-col">
        <p className="font-heading font-bold text-sm leading-tight">{producto?.nombre || '—'}</p>
        {producto?.descripcion && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{producto.descripcion}</p>
        )}
        <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
          {mostrarPrecios && Number(producto?.precio_venta) > 0 && (
            <p className="font-heading font-black text-base text-emerald-700 dark:text-emerald-400">
              {formatCurrency(producto.precio_venta)}
            </p>
          )}
          {tienePersonalizar && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              Personalizable
            </span>
          )}
        </div>
      </div>
    </Comp>
  );
}

function ScreenError({ titulo, texto }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="rounded-2xl bg-card text-card-foreground p-6 max-w-sm text-center shadow-lg border">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="font-heading font-bold text-lg">{titulo}</p>
        <p className="text-sm text-muted-foreground mt-1">{texto}</p>
      </div>
    </div>
  );
}

function ScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Cargando menú…</p>
      </div>
    </div>
  );
}
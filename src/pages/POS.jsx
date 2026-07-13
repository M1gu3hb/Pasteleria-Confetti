import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useTerminal } from '@/lib/TerminalContext';
import { useConfig } from '@/lib/ConfigContext';
import { hasPermission } from '@/lib/permissions';
import { formatCurrency, generateFolio, calculateMargin } from '@/utils/financialUtils';
import ProductCard from '@/components/pos/ProductCard';
import CartPanel from '@/components/pos/CartPanel';
import PaymentModal from '@/components/pos/PaymentModal';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import SafeBoundary from '@/components/common/SafeBoundary';
import CantidadVariableDialog from '@/components/mesero/CantidadVariableDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, ShoppingCart, AlertTriangle, DoorOpen, Printer, Loader2 } from 'lucide-react';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { Link } from 'react-router-dom';
import { printDocument } from '@/lib/print';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import {
  TIPO_VENTA,
  esProductoVariable,
  calcularCantidadBaseConsumo,
  calcularCostoVariable,
} from '@/utils/tipoVentaUtils';
import { validarStockParaCobro, mensajeFaltanteStock } from '@/utils/inventarioValidation';
import { generarFolioVenta } from '@/utils/pedidoPastelUtils';

export default function POS() {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showPayment, setShowPayment] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ticketFinal, setTicketFinal] = useState(null); // { venta, detalles }
  const [showTicket, setShowTicket] = useState(false);
  // 6B / 1.K — Modal de cantidad para productos variables.
  const [productoVariable, setProductoVariable] = useState(null);
  // === Propina (Esencial/Operativo: flujo tradicional) ===
  const [showPropina, setShowPropina] = useState(false);
  const [propina, setPropina] = useState({
    propina_monto: 0, propina_porcentaje: 0, propina_tipo: 'sin_propina', propina_origen: 'tradicional',
  });
  
  const { posUser } = usePOSAuth();
  const { sucursalEfectiva } = useTerminal();
  const { config, paquete_modo } = useConfig();
  const queryClient = useQueryClient();
  // HOTFIX POS→Cocina: la fuente canónica del paquete es `paquete_modo` del
  // context (igual que en Cocina), NO config.paquete_modo (que puede no estar
  // resuelto por getCurrentPackage). Antes esPro siempre daba false → Para llevar
  // no llegaba a Cocina.
  const esPro = paquete_modo === 'restaurante_pro';
  const showCost = hasPermission(posUser?.rol, 'ver_costos');
  const { hayCaja, cajaAbierta } = useCajaAbierta();

  const { data: productos = [] } = useQuery({
    queryKey: ['productos_pos'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true, visible_en_pos: true }),
    initialData: [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }),
    initialData: [],
  });

  const { data: recetas = [] } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => base44.entities.RecetaEscandallo.filter({ activo: true }),
    initialData: [],
  });

  const { data: ingredientes = [] } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => base44.entities.Ingrediente.filter({ activo: true }),
    initialData: [],
  });

  // F3: estaciones activas — solo si la feature está activa Y es Restaurante Pro.
  // Se usa SOLO para rutear el pedido "Para llevar" a la estación correcta,
  // reutilizando la MISMA lógica que Mesero (agruparItemsPorEstacion). Si está
  // apagada, el pedido cae al path legacy (area:'cocina'). No afecta cobro.
  const { data: estaciones = [] } = useQuery({
    queryKey: ['estaciones_preparacion_activas'],
    queryFn: () => base44.entities.EstacionPreparacion.filter({ activo: true }),
    initialData: [],
    enabled: esPro && config?.estaciones_preparacion_activas === true,
  });

  // Sucursal activa (fuente única). Si es null → dueño en vista general → sin filtro.
  // Producto visible si: sucursal_ids vacío/null (global) O incluye la sucursal activa.
  const sucEfId = sucursalEfectiva?.sucursal_id || null;

  // Set de ids de categorías activas (para detectar productos "huérfanos":
  // sin categoria_id o con un categoria_id que ya no corresponde a ninguna
  // categoría activa). Esos productos van al bucket "Otros".
  const catIdsActivas = useMemo(
    () => new Set((Array.isArray(categorias) ? categorias : []).map(c => c?.id)),
    [categorias]
  );
  const esHuerfano = (p) => !p?.categoria_id || !catIdsActivas.has(p.categoria_id);
  // ¿Hay al menos un producto huérfano? Solo entonces mostramos la pestaña "Otros".
  const hayHuerfanos = useMemo(
    () => (Array.isArray(productos) ? productos : []).some(esHuerfano),
    [productos, catIdsActivas]
  );

  const filtered = useMemo(() => {
    return productos.filter(p => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase());
      // Defensivo: 'otros' agrupa productos sin categoría válida; 'all' muestra todo;
      // el resto compara por categoria_id exacto.
      const matchCat =
        activeCategory === 'all' ||
        (activeCategory === '__otros__' ? esHuerfano(p) : p.categoria_id === activeCategory);
      const ids = Array.isArray(p?.sucursal_ids) ? p.sucursal_ids : [];
      const matchSuc = !sucEfId || ids.length === 0 || ids.includes(sucEfId);
      return matchSearch && matchCat && matchSuc;
    });
  }, [productos, search, activeCategory, sucEfId, catIdsActivas]);

  // 6B / 1.K — Total considerando líneas variables (subtotal_linea fijo) y precio_fijo.
  const total = useMemo(() => {
    return (Array.isArray(cart) ? cart : []).reduce((s, i) => {
      if (i?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA || i?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR) {
        return s + (Number(i?.subtotal_linea) || 0);
      }
      return s + (Number(i?.precio_venta) || 0) * (Number(i?.cantidad) || 0);
    }, 0);
  }, [cart]);

  const addToCart = (product) => {
    // 6B / 1.K — Si es variable, abrir modal de captura. NO se agrupa con
    // líneas anteriores (cada línea variable es independiente).
    if (esProductoVariable(product)) {
      setProductoVariable(product);
      return;
    }
    // ---- precio_fijo (flujo histórico, intacto) ----
    const idx = cart.findIndex(i => i.producto_id === product.id && !i.tipo_venta);
    if (idx >= 0) {
      const updated = [...cart];
      updated[idx].cantidad += 1;
      setCart(updated);
    } else {
      setCart([...cart, { producto_id: product.id, nombre: product.nombre, precio_venta: product.precio_venta,
        costo: product.costo_calculado_actual || 0, area_preparacion: product.area_preparacion, cantidad: 1, notas: '' }]);
    }
  };

  // 6B / 1.K — Recibe snapshot del CantidadVariableDialog y crea línea variable.
  const handleConfirmVariable = (snap) => {
    if (!productoVariable || !snap) { setProductoVariable(null); return; }
    const producto = productoVariable;
    // Costo unitario base: tomado del ingrediente_base si está en la lista cargada.
    const ing = (Array.isArray(ingredientes) ? ingredientes : [])
      .find(i => i?.id === snap.ingrediente_base_id);
    const costoUnitBase = Number(ing?.costo_por_unidad_base) || 0;
    const cantBase = calcularCantidadBaseConsumo({
      tipo_venta: snap.tipo_venta,
      cantidad_variable: snap.cantidad_variable,
      unidad_variable: snap.unidad_variable,
      cantidad_porciones: snap.cantidad_porciones,
      ml_por_porcion: snap.ml_por_porcion,
    });
    const { costo_linea } = calcularCostoVariable({
      precio_total_linea: snap.precio_total_linea,
      cantidad_base_consumo: cantBase,
      costo_por_unidad_base: costoUnitBase,
    });
    const item = {
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_venta: snap.precio_total_linea, // se usa como precio_unitario_snapshot (cantidad=1)
      costo: costo_linea,                    // costo total de la línea (cantidad=1)
      area_preparacion: producto.area_preparacion,
      cantidad: 1,                            // cantidad lógica = 1 (la "cantidad real" es la variable)
      notas: '',
      // ----- snapshots variables -----
      tipo_venta: snap.tipo_venta,
      cantidad_variable: snap.cantidad_variable || 0,
      unidad_variable: snap.unidad_variable || '',
      cantidad_porciones: snap.cantidad_porciones || 0,
      nombre_porcion: snap.nombre_porcion || '',
      ml_por_porcion: snap.ml_por_porcion || 0,
      ingrediente_base_id: snap.ingrediente_base_id || '',
      ingrediente_base_nombre: snap.ingrediente_base_nombre || ing?.nombre || '',
      precio_por_unidad_snapshot: snap.precio_por_unidad_snapshot || 0,
      cantidad_base_consumo: cantBase,
      subtotal_linea: snap.precio_total_linea,
    };
    setCart(prev => [...(Array.isArray(prev) ? prev : []), item]);
    setProductoVariable(null);
  };

  const updateQty = (idx, qty) => {
    // En líneas variables no permitimos +/- (la cantidad real es la "variable").
    const item = cart?.[idx];
    if (item && (item.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA || item.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR)) {
      return;
    }
    if (qty <= 0) { removeItem(idx); return; }
    const updated = [...cart];
    updated[idx].cantidad = qty;
    setCart(updated);
  };

  const removeItem = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const handleCheckout = async (paymentData) => {
    // FASE 2B — Ninguna venta puede nacer sin sucursal. Fuente única:
    // sucursalEfectiva del TerminalContext. Si es null (dueño en modo global
    // sin sucursal seleccionada), se bloquea el cobro antes de crear nada.
    if (!sucursalEfectiva?.sucursal_id) {
      toast.error('No se puede registrar una venta sin sucursal activa. Selecciona una sucursal.');
      return;
    }
    // Bloqueo: no permitir cobrar si la caja está cerrada.
    if (!hayCaja) {
      toast.error('No hay caja abierta. Abre caja para cobrar.');
      return;
    }
    if (processing) return; // evitar doble cobro
    if (!Array.isArray(cart) || cart.length === 0) {
      toast.error('El carrito está vacío.');
      return;
    }
    setProcessing(true);

    try {
      // 6B / 1.J — Validación unificada de stock (precio_fijo + variables).
      // Construimos "detalles simulados" desde el cart y reutilizamos el helper
      // que ya usa Caja. Esto evita dos sistemas de validación paralelos.
      const detallesParaValidar = (Array.isArray(cart) ? cart : []).map(it => ({
        producto_id: it?.producto_id,
        producto_nombre: it?.nombre,
        cantidad: Number(it?.cantidad) || 0,
        tipo_venta_snapshot: it?.tipo_venta || null,
        cantidad_variable_snapshot: it?.cantidad_variable,
        unidad_variable_snapshot: it?.unidad_variable,
        cantidad_porciones_snapshot: it?.cantidad_porciones,
        ml_por_porcion_snapshot: it?.ml_por_porcion,
        ingrediente_base_id_snapshot: it?.ingrediente_base_id,
        cantidad_base_consumo: it?.cantidad_base_consumo,
      }));
      const val = validarStockParaCobro({
        detalles: detallesParaValidar,
        recetasAll: Array.isArray(recetas) ? recetas : [],
        ingredientesAll: Array.isArray(ingredientes) ? ingredientes : [],
      });
      if (!val.ok) {
        console.warn('[POS 1.J] Stock insuficiente:', val);
        if (!config?.permitir_venta_sin_stock) {
          toast.error(mensajeFaltanteStock(val));
          setProcessing(false);
          return;
        } else {
          toast.warning(mensajeFaltanteStock(val) + ' (Se cobrará igual: venta sin stock permitida).');
        }
      }

      const folio = await generarFolioVenta(
        sucursalEfectiva?.sucursal_id || '',
        sucursalEfectiva?.folio_prefijo || sucursalEfectiva?.sucursal_nombre?.charAt(0) || 'X'
      );
      const costoTotal = cart.reduce((s, i) => s + (Number(i?.costo) || 0) * (Number(i?.cantidad) || 0), 0);
      const utilidad = total - costoTotal;
      const margen = calculateMargin(total, costoTotal);

      // Asociar al corte abierto (cierre_diario) actual
      const corteAbiertoId = cajaAbierta?.id || null;

      // IMPORTANTE: `total` = venta real SIN propina (no infla utilidad/ventas).
      // La propina se guarda en propina_monto y se cobra aparte en paymentData.
      const venta = await base44.entities.Venta.create({
        folio,
        fecha_apertura: new Date().toISOString(),
        fecha_cierre: new Date().toISOString(),
        tipo_venta: 'mostrador',
        estado: 'pagada',
        subtotal: total,
        total,
        propina_monto: Number(propina?.propina_monto) || 0,
        propina_porcentaje: Number(propina?.propina_porcentaje) || 0,
        propina_tipo: propina?.propina_tipo || 'sin_propina',
        propina_origen: propina?.propina_origen || 'tradicional',
        costo_total_snapshot: costoTotal,
        utilidad_bruta_snapshot: utilidad,
        margen_snapshot: margen,
        usuario_cajero_id: posUser?.id,
        usuario_cajero_nombre: posUser?.nombre,
        corte_caja_id: corteAbiertoId,
        // FASE 2B — sucursal estampada desde la fuente única (sucursalEfectiva).
        sucursal_id: sucursalEfectiva.sucursal_id,
        sucursal_nombre: sucursalEfectiva.sucursal_nombre || '',
        ...paymentData,
      });

      // Snapshot de detalles para el ticket (lo construimos en paralelo)
      const detallesParaTicket = [];

      // HOTFIX POS→Cocina (Restaurante Pro / "Para llevar"):
      // Solo en Restaurante Pro recolectamos los items que requieren preparación
      // (area_preparacion cocina/barra/ambos) para mandarlos a Cocina como uno o
      // varios pedidos "Para llevar" (uno por estación, igual que Mesero). En
      // Esencial/Operativo este array queda vacío y NUNCA se crea PedidoPreparacion.
      // `esPro` se calcula arriba con paquete_modo del context (fuente canónica).
      const itemsParaCocina = [];

      // Create sale details
      for (const item of cart) {
        const esVariable =
          item?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
          item?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR;

        // Subtotal real de la línea (variables ya traen subtotal_linea fijo).
        const subtotalLinea = esVariable
          ? (Number(item?.subtotal_linea) || 0)
          : (Number(item?.precio_venta) || 0) * (Number(item?.cantidad) || 0);
        const costoLinea = esVariable
          ? (Number(item?.costo) || 0)
          : (Number(item?.costo) || 0) * (Number(item?.cantidad) || 0);
        const utilidadLinea = subtotalLinea - costoLinea;
        const margenLinea = calculateMargin(subtotalLinea, costoLinea);

        // Payload base de DetalleVenta — precio_fijo y variable comparten estructura.
        const detallePayload = {
          venta_id: venta.id,
          producto_id: item.producto_id,
          producto_nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario_snapshot: item.precio_venta, // en variables = precio_total_linea (cantidad=1)
          costo_unitario_snapshot: item.costo,
          subtotal: subtotalLinea,
          costo_total_linea_snapshot: costoLinea,
          utilidad_linea_snapshot: utilidadLinea,
          margen_linea_snapshot: margenLinea,
          notas_producto: item.notas,
          estado_preparacion: 'pendiente',
          area_preparacion_snapshot: item.area_preparacion,
        };
        // 6B / 1.K — Snapshots adicionales si la línea es variable.
        if (esVariable) {
          detallePayload.tipo_venta_snapshot = item.tipo_venta;
          detallePayload.unidad_variable_snapshot = item.unidad_variable || '';
          detallePayload.cantidad_variable_snapshot = Number(item.cantidad_variable) || 0;
          detallePayload.cantidad_porciones_snapshot = Number(item.cantidad_porciones) || 0;
          detallePayload.nombre_porcion_snapshot = item.nombre_porcion || '';
          detallePayload.ml_por_porcion_snapshot = Number(item.ml_por_porcion) || 0;
          detallePayload.ingrediente_base_id_snapshot = item.ingrediente_base_id || '';
          detallePayload.ingrediente_base_nombre_snapshot = item.ingrediente_base_nombre || '';
          detallePayload.precio_por_unidad_snapshot = Number(item.precio_por_unidad_snapshot) || 0;
          detallePayload.cantidad_base_consumo = Number(item.cantidad_base_consumo) || 0;
        }

        const detalle = await base44.entities.DetalleVenta.create(detallePayload);
        detallesParaTicket.push(detalle || { ...detallePayload });

        // HOTFIX POS→Cocina: si es Pro y el producto requiere preparación,
        // lo sumamos a "Para llevar". Tomamos el área REAL del producto original
        // (no dependemos solo de item.area_preparacion, que podría perderse). Solo
        // cocina/barra/ambos van a Cocina. 'ninguno'/vacío NO genera pedido.
        if (esPro) {
          const prodOriginal = (Array.isArray(productos) ? productos : [])
            .find(p => p?.id === item.producto_id) || null;
          const area = String(
            item?.area_preparacion || prodOriginal?.area_preparacion || ''
          ).toLowerCase();
          if (['cocina', 'barra', 'ambos'].includes(area)) {
            itemsParaCocina.push({
              // Item visible para Cocina
              producto_id: item.producto_id,
              producto_nombre: item.nombre,
              cantidad: Number(item.cantidad) || 1,
              notas: item.notas || '',
              estado: 'nuevo',
              tipo_venta: item.tipo_venta || 'precio_fijo',
              unidad_variable: item.unidad_variable || '',
              cantidad_variable: Number(item.cantidad_variable) || 0,
              nombre_porcion: item.nombre_porcion || '',
              cantidad_porciones: Number(item.cantidad_porciones) || 0,
              // Metadatos SOLO para resolver estación (Producto→Categoría→Estación).
              // No se persisten tal cual: se usan al agrupar y luego se limpian.
              _id: item.producto_id,
              _categoria_id: prodOriginal?.categoria_id || '',
              _categoria_nombre: prodOriginal?.categoria_nombre || '',
              _area: area,
            });
          }
        }

        // ====== Discount inventory ======
        if (esVariable) {
          // 6B / 1.K — Descontar el ingrediente_base por cantidad_base_consumo.
          const ing = (Array.isArray(ingredientes) ? ingredientes : [])
            .find(i => i?.id === item.ingrediente_base_id);
          const cantBase = Number(item?.cantidad_base_consumo) || 0;
          if (ing && cantBase > 0) {
            const stockAnt = Number(ing.stock_actual) || 0;
            const stockNew = Math.max(0, stockAnt - cantBase);
            const costoUnit = Number(ing.costo_por_unidad_base) || 0;
            const costoTotalMov = Math.round(cantBase * costoUnit * 100) / 100;
            await base44.entities.Ingrediente.update(ing.id, { stock_actual: stockNew }).catch(() => {});
            await base44.entities.MovimientoInventario.create({
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              tipo_movimiento: 'salida_venta',
              cantidad: -cantBase,
              unidad_base: ing.unidad_base,
              stock_anterior: stockAnt,
              stock_nuevo: stockNew,
              costo_unitario_en_momento: costoUnit,
              costo_total_movimiento: costoTotalMov,
              referencia_tipo: 'venta',
              referencia_id: venta.id,
              motivo: `Venta ${folio}`,
              usuario_id: posUser?.id,
              usuario_nombre: posUser?.nombre,
              fecha: new Date().toISOString(),
            }).catch(() => {});
            await base44.entities.DescuentoInventarioVenta.create({
              venta_id: venta.id,
              detalle_venta_id: detalle?.id,
              producto_id: item.producto_id,
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              cantidad_producto: item.cantidad,
              cantidad_ingrediente_por_producto: cantBase, // cantidad lógica=1
              cantidad_total_descontada: cantBase,
              unidad_base: ing.unidad_base,
              costo_unitario_snapshot: costoUnit,
              costo_total_descontado: costoTotalMov,
              fecha: new Date().toISOString(),
            }).catch(() => {});
          }
        } else {
          // ---- precio_fijo (LEGACY, intacto) ----
          const productRecipes = (Array.isArray(recetas) ? recetas : []).filter(r => r.producto_id === item.producto_id);
          for (const recipe of productRecipes) {
            const ing = (Array.isArray(ingredientes) ? ingredientes : []).find(i => i.id === recipe.ingrediente_id);
            if (!ing) continue;

            const mermaFactor = 1 + ((recipe.merma_porcentaje || 0) / 100);
            const qtyPerProduct = (recipe.cantidad_convertida_unidad_base || 0) * mermaFactor;
            const totalDiscount = qtyPerProduct * item.cantidad;
            const newStock = Math.max(0, (ing.stock_actual || 0) - totalDiscount);

            await base44.entities.Ingrediente.update(ing.id, { stock_actual: newStock }).catch(() => {});

            await base44.entities.MovimientoInventario.create({
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              tipo_movimiento: 'salida_venta',
              cantidad: totalDiscount,
              unidad_base: ing.unidad_base,
              stock_anterior: ing.stock_actual,
              stock_nuevo: newStock,
              costo_unitario_en_momento: ing.costo_por_unidad_base,
              costo_total_movimiento: totalDiscount * (ing.costo_por_unidad_base || 0),
              referencia_tipo: 'venta',
              referencia_id: venta.id,
              usuario_id: posUser?.id,
              usuario_nombre: posUser?.nombre,
              fecha: new Date().toISOString(),
            }).catch(() => {});

            await base44.entities.DescuentoInventarioVenta.create({
              venta_id: venta.id,
              producto_id: item.producto_id,
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              cantidad_producto: item.cantidad,
              cantidad_ingrediente_por_producto: qtyPerProduct,
              cantidad_total_descontada: totalDiscount,
              unidad_base: ing.unidad_base,
              costo_unitario_snapshot: ing.costo_por_unidad_base,
              costo_total_descontado: totalDiscount * (ing.costo_por_unidad_base || 0),
              fecha: new Date().toISOString(),
            }).catch(() => {});
          }
        }

        // NOTA: la creación de PedidoPreparacion para POS se hace UNA sola vez
        // tras el loop (abajo), agrupando todos los items de cocina/barra en un
        // único pedido "Para llevar". Solo en Restaurante Pro.
      }

      // HOTFIX POS→Cocina: crear pedido(s) "Para llevar" solo si:
      //  - es Restaurante Pro,
      //  - hay items que requieren cocina/barra/ambos.
      // Esencial/Operativo: itemsParaCocina queda vacío → no se crea nada.
      //
      // RUTEO POR ESTACIÓN: reutilizamos la MISMA lógica que Mesero
      // (agruparItemsPorEstacion: Producto→Categoría→Estación). Si las estaciones
      // están activas, se crea UN pedido por estación; si están apagadas, un único
      // pedido legacy con area:'cocina'. Defensivo: nunca rompe la venta cobrada.
      if (esPro && itemsParaCocina.length > 0) {
        try {
          const fechaCreacion = new Date().toISOString();
          // Limpia los metadatos internos (_id/_categoria_*/_area) antes de persistir.
          const limpiarItems = (arr) => (Array.isArray(arr) ? arr : []).map((it) => {
            const { _id, _categoria_id, _categoria_nombre, _area, ...itemLimpio } = it;
            return itemLimpio;
          });

          const estacionesActivasNow =
            config?.estaciones_preparacion_activas === true &&
            Array.isArray(estaciones) && estaciones.length > 0;

          const baseFields = {
            venta_id: venta.id,
            venta_folio: folio,
            origen_pedido: 'pos',
            mesa_numero: 'Para llevar',
            // 'area' legacy se mantiene como fallback para la vista de Cocina vieja.
            area: 'cocina',
            estado: 'nuevo',
            fecha_creacion: fechaCreacion,
          };

          if (!estacionesActivasNow) {
            // === MODO LEGACY: un solo pedido "Para llevar". ===
            await base44.entities.PedidoPreparacion.create({
              ...baseFields,
              items: limpiarItems(itemsParaCocina),
            });
          } else {
            // === MODO ESTACIONES: agrupar igual que Mesero. ===
            const { agruparItemsPorEstacion } = await import('@/utils/preparacionEstacionUtils');
            // Construimos objetos producto-like (id/categoria_id/categoria_nombre)
            // para que resolverEstacionParaProducto pueda mapear a su estación.
            const itemsParaAgrupar = itemsParaCocina.map((it) => ({
              ...it,
              id: it._id,
              categoria_id: it._categoria_id,
              categoria_nombre: it._categoria_nombre,
            }));
            const grupos = agruparItemsPorEstacion(itemsParaAgrupar, null, categorias, estaciones, config);
            await Promise.all(Array.from(grupos.values()).map((grp) => {
              const info = grp?.info || null;
              return base44.entities.PedidoPreparacion.create({
                ...baseFields,
                estacion_preparacion_id: info?.estacion_preparacion_id || '',
                estacion_preparacion_nombre: info?.estacion_preparacion_nombre || '',
                estacion_preparacion_color: info?.estacion_preparacion_color || '',
                items: limpiarItems(grp?.items || []),
              });
            }));
          }
          // Refrescar Cocina en vivo (mismas keys que usa Cocina/Mesero).
          queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
          queryClient.refetchQueries({ queryKey: ['pedidos_cocina'], type: 'active' }).catch(() => {});
        } catch (e) {
          // Defensivo: la venta YA está cobrada y registrada. No rompemos flujo.
          console.error('[POS] No se pudo crear pedido(s) Para llevar para Cocina:', e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });

      // Mostrar ticket final (snapshot defensivo)
      try {
        setTicketFinal({
          venta: { ...venta, ...paymentData, total, subtotal: total, estado: 'pagada' },
          detalles: detallesParaTicket,
        });
        setShowTicket(true);
      } catch (errTicket) {
        console.error('[POS] No se pudo mostrar ticket:', errTicket);
        toast.error('La venta se cobró, pero no se pudo mostrar el ticket. Puedes verlo en Ventas/Registros.');
      }

      setCart([]);
      setShowPayment(false);
      // Reset propina para la próxima venta
      setPropina({ propina_monto: 0, propina_porcentaje: 0, propina_tipo: 'sin_propina', propina_origen: 'tradicional' });
      toast.success(`Venta ${folio} cobrada: ${formatCurrency(total)}`);
    } catch (err) {
      console.error('[POS] Error al cobrar:', err);
      toast.error('No se pudo completar la venta. Intenta de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  // FASE 2: feedback de impresión (spinner + botón deshabilitado mientras imprime).
  const [imprimiendo, setImprimiendo] = useState(false);

  const handlePrintTicket = async () => {
    if (imprimiendo) return; // evita doble impresión por doble clic
    setImprimiendo(true);
    try {
      // `await` cubre todo el tiempo real de impresión (el helper devuelve la
      // promesa nativa). Si falla, el helper ya avisó con un toast y re-lanzó.
      await printDocument({ mode: 'thermal', title: `Ticket-${ticketFinal?.venta?.folio || ''}` });
    } catch (e) {
      console.error('[POS] Error al imprimir:', e);
    } finally {
      setImprimiendo(false);
    }
  };

  // Pantalla bloqueada si no hay caja abierta
  if (!hayCaja) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-700" />
          </div>
          <h2 className="font-heading font-bold text-lg text-amber-900">Caja cerrada</h2>
          <p className="text-sm text-amber-800">
            No se puede iniciar una nueva venta porque la caja está cerrada.
            Abre caja para comenzar operación.
          </p>
          <Link to="/caja">
            <Button className="gap-2"><DoorOpen className="w-4 h-4" /> Ir a Caja para abrirla</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] gap-4 -m-4 md:-m-6 lg:-m-8">
      {/* Products panel */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Search + categories */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-10 h-10" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button variant={activeCategory === 'all' ? 'default' : 'outline'} size="sm"
              onClick={() => setActiveCategory('all')} className="shrink-0">
              Todos
            </Button>
            {categorias.map(c => (
              <Button key={c.id} variant={activeCategory === c.id ? 'default' : 'outline'} size="sm"
                onClick={() => setActiveCategory(c.id)} className="shrink-0">
                {c.nombre}
              </Button>
            ))}
            {/* Bucket defensivo: productos sin categoría válida nunca quedan ocultos. */}
            {hayHuerfanos && (
              <Button variant={activeCategory === '__otros__' ? 'default' : 'outline'} size="sm"
                onClick={() => setActiveCategory('__otros__')} className="shrink-0">
                Otros
              </Button>
            )}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onAdd={addToCart} showCost={showCost} />
            ))}
          </div>
        </div>

        {/* Mobile cart button */}
        <div className="lg:hidden pt-3">
          <Button onClick={() => setShowCartMobile(true)} className="w-full h-12 text-base gap-2" disabled={cart.length === 0}>
            <ShoppingCart className="w-5 h-5" />
            Ver orden ({cart.length}) · {formatCurrency(total)}
          </Button>
        </div>
      </div>

      {/* Desktop cart */}
      <div className="hidden lg:flex w-80 xl:w-96 border-l border-border bg-card flex-col">
        <CartPanel items={cart} onUpdateQty={updateQty} onRemove={removeItem}
          total={total} onCheckout={() => {
            if (tipsEnabled(config)) setShowPropina(true);
            else setShowPayment(true);
          }} onClear={() => setCart([])} />
      </div>

      {/* Mobile cart drawer */}
      {showCartMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCartMobile(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-card shadow-xl flex flex-col">
            <CartPanel items={cart} onUpdateQty={updateQty} onRemove={removeItem}
              total={total} onCheckout={() => {
                setShowCartMobile(false);
                if (tipsEnabled(config)) setShowPropina(true);
                else setShowPayment(true);
              }}
              onClear={() => setCart([])} />
          </div>
        </div>
      )}

      {/* 6B / 1.K — Modal para capturar cantidad de productos variables. */}
      <CantidadVariableDialog
        open={!!productoVariable}
        producto={productoVariable}
        onClose={() => setProductoVariable(null)}
        onConfirm={handleConfirmVariable}
      />

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        total={total}
        propinaMonto={Number(propina?.propina_monto) || 0}
        onConfirm={handleCheckout}
        loading={processing}
      />

      {/* Ticket final tras cobrar — defensivo con SafeBoundary */}
      <Dialog open={showTicket} onOpenChange={(v) => { if (!v) { setShowTicket(false); setTicketFinal(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Venta cobrada</DialogTitle>
          </DialogHeader>
          <SafeBoundary
            label="POSTicketFinal"
            fallbackTitle="No se pudo mostrar el ticket."
            fallbackMessage="La venta se cobró correctamente. Puedes verla en Ventas/Registros."
            onReset={() => { setShowTicket(false); setTicketFinal(null); }}
          >
            <div className="bg-muted/30 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
              {ticketFinal?.venta ? (
                <PreCuentaTicket
                  venta={ticketFinal.venta}
                  detalles={Array.isArray(ticketFinal.detalles) ? ticketFinal.detalles : []}
                  config={config}
                  esFinal
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos del ticket.</p>
              )}
            </div>
          </SafeBoundary>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTicket(false); setTicketFinal(null); }}>
              Cerrar
            </Button>
            <Button
              onClick={handlePrintTicket}
              disabled={imprimiendo}
              aria-busy={imprimiendo}
              className="transition-transform active:scale-95"
            >
              {imprimiendo
                ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Imprimiendo…</>)
                : (<><Printer className="w-4 h-4 mr-1" /> Imprimir</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
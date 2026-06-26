import React from 'react';
import { UtensilsCrossed, Plus, Minus, Send, Receipt, ChefHat, Search, Users, CheckCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MESA_STATUS_CONFIG } from '@/lib/constants';
import MeseroCartFAB from '@/components/mesero/MeseroCartFAB';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';

/**
 * Vista FULLSCREEN INLINE de una mesa activa.
 *
 * IMPORTANTE: NO usa Radix Dialog ni Portal. Se renderiza en línea dentro del
 * árbol normal de React de la página Mesero. Esto evita los conflictos de
 * removeChild entre Radix Portal y AnimatePresence/Framer en producción.
 */
export default function MesaActivaView({
  mesaActiva,
  ventaActiva,
  detallesVenta,
  carrito,
  busquedaProducto,
  setBusquedaProducto,
  categoriaFiltro,
  setCategoriaFiltro,
  productosFiltrados,
  categorias,
  totalCarrito,
  totalActual,
  notaMesa,
  setNotaMesa,
  agregarAlCarrito,
  cambiarCantidad,
  enviarPedido,
  pedirCuenta,
  marcarEntregado,
  loading,
  config,
  onVolver,
}) {
  const safeDetalles = Array.isArray(detallesVenta) ? detallesVenta : [];
  const safeCarrito = Array.isArray(carrito) ? carrito : [];
  const safeProductos = Array.isArray(productosFiltrados) ? productosFiltrados : [];
  const safeCategorias = Array.isArray(categorias) ? categorias : [];
  const formatCurrency = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '$0.00';
    const sym = typeof config?.simbolo_moneda === 'string' ? config.simbolo_moneda : '$';
    return `${sym}${v.toFixed(2)}`;
  };
  const colorearImportes = config?.colorear_importes_monetarios !== false;
  const statusCfg = MESA_STATUS_CONFIG[mesaActiva?.estado] || {};

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* Header con botón Volver — reemplaza el X del Dialog */}
      <div className="px-4 pt-3 pb-3 border-b shrink-0 bg-card flex items-center gap-3">
        <button
          type="button"
          onClick={onVolver}
          className="w-11 h-11 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform shrink-0"
          aria-label="Volver a mesas"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-heading flex items-center gap-2 flex-wrap text-base font-bold">
            <UtensilsCrossed className="w-5 h-5 text-primary shrink-0" />
            <span>Mesa {mesaActiva?.numero ?? '—'}</span>
            <span
              className="text-xs font-normal px-2 py-0.5 rounded-full"
              style={{ background: statusCfg.fill, color: statusCfg.text }}
            >
              {statusCfg.label || ''}
            </span>
            {ventaActiva?.personas > 0 && (
              <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                {ventaActiva.personas}
              </span>
            )}
            {ventaActiva?.cliente_nombre && (
              <span className="text-xs font-normal text-muted-foreground truncate">
                · {ventaActiva.cliente_nombre}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onVolver}
          className="hidden sm:inline-flex px-3 py-2 rounded-lg bg-muted text-sm font-semibold active:scale-95 transition-transform shrink-0"
        >
          Volver a mesas
        </button>
      </div>

      {/* Banner pedido listo */}
      {mesaActiva?.estado === 'en_espera_entrega' && (
        <div
          className="mx-4 mt-3 p-3 rounded-xl flex items-center gap-3 shrink-0"
          style={{
            background: 'linear-gradient(135deg, #16A34A 0%, #166534 100%)',
            color: 'white',
            boxShadow: '0 2px 0 rgba(255,255,255,0.2) inset, 0 6px 14px rgba(0,0,0,0.15)',
          }}
        >
          <CheckCheck className="w-6 h-6 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">¡Pedido listo en cocina!</p>
            <p className="text-xs opacity-90">Recoge y entrega al cliente</p>
          </div>
          <Button size="sm" variant="secondary" onClick={marcarEntregado}>
            Entregado
          </Button>
        </div>
      )}

      {/* Cuerpo principal */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        {/* Columna izquierda: buscador + productos */}
        <div className="flex-1 flex flex-col overflow-hidden md:border-r">
          <div className="px-4 py-3 space-y-2 border-b bg-muted/30 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto?.(e.target.value)}
                placeholder="Buscar producto..."
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoriaFiltro?.('todas')}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  categoriaFiltro === 'todas' ? 'bg-primary text-white' : 'bg-white border text-muted-foreground'
                }`}
              >
                Todas
              </button>
              {safeCategorias.map((c) => (
                <button
                  key={c?.id || c?.nombre}
                  type="button"
                  onClick={() => setCategoriaFiltro?.(c?.id)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                    categoriaFiltro === c?.id ? 'bg-primary text-white' : 'bg-white border text-muted-foreground'
                  }`}
                >
                  {c?.nombre || '—'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 pb-32 md:pb-3 grid grid-cols-2 gap-2 content-start">
            {safeProductos.map((p) => (
              <button
                key={p?.id}
                type="button"
                onClick={() => agregarAlCarrito?.(p)}
                className="p-3 rounded-xl border bg-white text-left hover:bg-muted/30 active:scale-95 transition-all"
                style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 4px rgba(0,0,0,0.06)' }}
              >
                <p className="font-semibold text-sm leading-tight">{p?.nombre || '—'}</p>
                <p className={`font-bold text-sm mt-1 ${colorearImportes ? 'text-primary' : 'text-foreground'}`}>
                  {formatCurrency(p?.precio_venta)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <ChefHat className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {p?.area_preparacion || 'cocina'}
                  </span>
                </div>
              </button>
            ))}
            {safeProductos.length === 0 && (
              <p className="col-span-2 text-center text-sm text-muted-foreground py-8">Sin productos</p>
            )}
          </div>
        </div>

        {/* Panel derecho — solo desktop */}
        <div className="hidden md:flex w-full md:w-72 flex-col shrink-0">
          {safeDetalles.length > 0 && (
            <div className="px-4 py-3 border-b bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground mb-2">PEDIDO ACTUAL</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {safeDetalles.map((d, i) => {
                  // 6B / 1.G — Etiqueta legible para líneas variables.
                  const txtVar = formatearCantidadVariable({
                    tipo_venta: d?.tipo_venta_snapshot,
                    cantidad_variable: d?.cantidad_variable_snapshot,
                    unidad_variable: d?.unidad_variable_snapshot,
                    cantidad_porciones: d?.cantidad_porciones_snapshot,
                    nombre_porcion: d?.nombre_porcion_snapshot,
                  });
                  return (
                    <div key={d?.id || `det-d-${i}`} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {d?.producto_nombre || '—'}
                        {txtVar ? ` · ${txtVar}` : ` ×${d?.cantidad || 0}`}
                      </span>
                      <span className="font-medium">{formatCurrency(d?.subtotal || 0)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs font-bold border-t pt-1 mt-1 text-right">
                Total: {formatCurrency(totalActual || 0)}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {safeDetalles.length > 0 ? 'AGREGAR AL PEDIDO' : 'NUEVO PEDIDO'}
            </p>
            {safeCarrito.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Selecciona productos</p>
            ) : (
              <div className="space-y-2">
                {safeCarrito.map((item, idx) => (
                  <div
                    key={item?.id || `cart-d-${idx}`}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item?.nombre || '—'}</p>
                      <p className={`text-xs font-bold ${colorearImportes ? 'text-primary' : 'text-foreground'}`}>
                        {formatCurrency((item?.precio_venta || 0) * (item?.cantidad || 0))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad?.(item?.id, -1)}
                        className="w-6 h-6 rounded-full bg-white border flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold">{item?.cantidad || 0}</span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad?.(item?.id, 1)}
                        className="w-6 h-6 rounded-full bg-white border flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t space-y-2 shrink-0">
            {safeCarrito.length > 0 && (
              <>
                <Input
                  value={notaMesa || ''}
                  onChange={(e) => setNotaMesa?.(e.target.value)}
                  placeholder="Nota para cocina..."
                  className="text-xs h-8"
                />
                <div className="flex justify-between text-sm font-bold">
                  <span>Nuevo</span>
                  <span className={colorearImportes ? 'text-primary' : 'text-foreground'}>
                    {formatCurrency(totalCarrito)}
                  </span>
                </div>
                <Button
                  onClick={enviarPedido}
                  disabled={loading}
                  className="w-full"
                  style={{ background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)' }}
                >
                  <Send className="w-4 h-4 mr-1" />
                  {loading ? 'Enviando...' : 'Enviar a Cocina'}
                </Button>
              </>
            )}
            {ventaActiva && safeCarrito.length === 0 && mesaActiva?.estado !== 'cuenta_solicitada' && (
              <Button onClick={pedirCuenta} disabled={loading} variant="outline" className="w-full">
                <Receipt className="w-4 h-4 mr-1" />
                Solicitar cuenta
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* FAB / bottom sheet móvil — sin Dialog padre */}
      <MeseroCartFAB
        carrito={safeCarrito}
        totalCarrito={totalCarrito}
        totalActual={totalActual}
        detallesVenta={safeDetalles}
        notaMesa={notaMesa}
        setNotaMesa={setNotaMesa}
        cambiarCantidad={cambiarCantidad}
        enviarPedido={enviarPedido}
        pedirCuenta={pedirCuenta}
        loading={loading}
        estadoMesa={mesaActiva?.estado}
        ventaActiva={ventaActiva}
        formatCurrency={formatCurrency}
        config={config}
      />
    </div>
  );
}
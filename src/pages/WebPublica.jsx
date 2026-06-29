import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Globe, Eye, Pencil, Check, X, Image, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useTerminal } from '@/lib/TerminalContext';
import SelectorSucursalesProducto from '@/components/productos/SelectorSucursalesProducto';
import ImageUploader from '@/components/common/ImageUploader';
import NuevoProductoWebDialog from '@/components/productos/NuevoProductoWebDialog';
import EliminarProductoDialog from '@/components/productos/EliminarProductoDialog';

const WEB_URL = 'https://pasteleria-confetti-wpasteleria-con.vercel.app/confetti';

export default function WebPublica() {
  const queryClient = useQueryClient();
  const { adminRole, sucursalEfectiva } = useTerminal();
  const esDueno = adminRole === 'dueno';
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'visibles' | 'ocultos'
  const [creandoProducto, setCreandoProducto] = useState(false);
  const [productoAEliminar, setProductoAEliminar] = useState(null);

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['productosParaWeb'],
    queryFn: () => base44.entities.ProductoTerminado.list(),
  });

  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales_activas_webpublica'],
    queryFn: () => base44.entities.Sucursal.filter({ activa: true }, 'orden_visual'),
    staleTime: 60000,
  });

  // Mapa { id: nombre } para mostrar nombre de sucursal en cada card.
  const sucursalesMap = useMemo(
    () => Object.fromEntries((Array.isArray(sucursales) ? sucursales : []).map(s => [s.id, s.nombre])),
    [sucursales]
  );

  const lista = Array.isArray(productos) ? productos : [];

  // Fase 7 — Filtro por sucursal según rol. Dueño en vista general (sin
  // sucursal) ve todo. Admin/empleado con sucursal: globales + asignados.
  // El ID real es sucursalEfectiva.sucursal_id (NO .id).
  const sucEfId = sucursalEfectiva?.sucursal_id || null;
  const productosVisibles = useMemo(() => {
    if (!sucEfId) return lista;
    return lista.filter(p => {
      const ids = Array.isArray(p.sucursal_ids) ? p.sucursal_ids : [];
      return ids.length === 0 || ids.includes(sucEfId);
    });
  }, [lista, sucEfId]);

  const productosFiltrados = useMemo(() => {
    if (filtro === 'visibles') return productosVisibles.filter(p => p.visible_en_web);
    if (filtro === 'ocultos') return productosVisibles.filter(p => !p.visible_en_web);
    return productosVisibles;
  }, [productosVisibles, filtro]);

  const visiblesCount = productosVisibles.filter(p => p.visible_en_web).length;

  const toggleVisible = async (producto) => {
    try {
      await base44.entities.ProductoTerminado.update(producto.id, {
        visible_en_web: !producto.visible_en_web,
      });
      queryClient.invalidateQueries({ queryKey: ['productosParaWeb'] });
    } catch (e) {
      console.error('Error al cambiar visibilidad:', e);
    }
  };

  const iniciarEdicion = (producto) => {
    setEditandoId(producto.id);
    setEditForm({
      precio_venta: producto.precio_venta || '',
      imagen_url: producto.imagen_url || '',
      descripcion_web: producto.descripcion_web || '',
      sucursal_ids: Array.isArray(producto.sucursal_ids) ? producto.sucursal_ids : [],
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setEditForm({});
  };

  const guardarEdicion = async (productoId) => {
    setGuardando(true);
    try {
      await base44.entities.ProductoTerminado.update(productoId, {
        precio_venta: parseFloat(editForm.precio_venta) || 0,
        imagen_url: editForm.imagen_url || null,
        descripcion_web: editForm.descripcion_web || null,
        // Solo el dueño puede reasignar sucursales. El admin no toca este campo.
        ...(esDueno ? { sucursal_ids: Array.isArray(editForm.sucursal_ids) ? editForm.sucursal_ids : [] } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['productosParaWeb'] });
      setEditandoId(null);
      setEditForm({});
    } catch (e) {
      console.error('Error al guardar:', e);
    } finally {
      setGuardando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-pink-500" />
            Página Web Pública
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Controla qué productos aparecen en la web de Confetti.
          </p>
        </div>
        <a
          href={WEB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
        >
          <Eye className="w-4 h-4" />
          Ver web pública
        </a>
      </div>

      {/* Botón agregar producto — solo dueño */}
      {esDueno && (
        <Button
          onClick={() => setCreandoProducto(true)}
          className="bg-pink-500 hover:bg-pink-600 text-white"
        >
          + Agregar producto a la web
        </Button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-pink-500">{visiblesCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Visibles en web</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{productosVisibles.length - visiblesCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Ocultos</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{productosVisibles.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'todos', label: 'Todos' },
          { value: 'visibles', label: '👁 Visibles' },
          { value: 'ocultos', label: 'Ocultos' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              filtro === f.value
                ? 'bg-pink-500 text-white border-pink-500'
                : 'bg-background border-border hover:border-pink-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de productos */}
      <div className="space-y-3">
        {productosFiltrados.map(producto => (
          <div
            key={producto.id}
            className={`skeu-card rounded-2xl overflow-hidden transition-all ${
              producto.visible_en_web ? '' : 'opacity-70'
            }`}
          >
            <div className="p-4">
              <div className="flex items-start gap-4">
                {/* Imagen */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {producto.imagen_url ? (
                    <img
                      src={producto.imagen_url}
                      alt={producto.nombre}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{producto.nombre}</span>
                    {producto.categoria_nombre && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {producto.categoria_nombre}
                      </Badge>
                    )}
                    {producto.visible_en_web && (
                      <Badge className="text-xs bg-pink-100 text-pink-700 border-pink-200 shrink-0">
                        🌐 En web
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    ${(producto.precio_venta || 0).toLocaleString('es-MX')}
                  </div>
                  {/* Sucursales asignadas */}
                  <div className="text-xs text-muted-foreground mt-1">
                    {(!Array.isArray(producto.sucursal_ids) || producto.sucursal_ids.length === 0)
                      ? '🌐 Todas las sucursales'
                      : producto.sucursal_ids.length === 1
                        ? `📍 Solo ${sucursalesMap[producto.sucursal_ids[0]] || 'una sucursal'}`
                        : `📍 ${producto.sucursal_ids.length} sucursales`}
                  </div>
                  {producto.descripcion_web && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {producto.descripcion_web}
                    </p>
                  )}
                </div>

                {/* Controles */}
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={!!producto.visible_en_web}
                    onCheckedChange={() => toggleVisible(producto)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      editandoId === producto.id
                        ? cancelarEdicion()
                        : iniciarEdicion(producto)
                    }
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setProductoAEliminar(producto)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Panel de edición inline */}
              {editandoId === producto.id && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Precio de venta ($)
                    </label>
                    <Input
                      type="number"
                      value={editForm.precio_venta}
                      onChange={e =>
                        setEditForm(f => ({ ...f, precio_venta: e.target.value }))
                      }
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Imagen del producto
                    </label>
                    <ImageUploader
                      value={editForm.imagen_url}
                      onChange={(url) => setEditForm(f => ({ ...f, imagen_url: url }))}
                      height={140}
                      label="Subir imagen del producto"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Descripción en web
                    </label>
                    <Textarea
                      value={editForm.descripcion_web}
                      onChange={e =>
                        setEditForm(f => ({ ...f, descripcion_web: e.target.value }))
                      }
                      placeholder="Descripción corta visible en la web pública..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                  {/* Selector de sucursales — solo dueño */}
                  {esDueno && (
                    <SelectorSucursalesProducto
                      value={editForm.sucursal_ids}
                      onChange={(next) => setEditForm(f => ({ ...f, sucursal_ids: next }))}
                    />
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelarEdicion}
                    >
                      <X className="w-4 h-4 mr-1" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={guardando}
                      onClick={() => guardarEdicion(producto.id)}
                      className="bg-pink-500 hover:bg-pink-600 text-white"
                    >
                      {guardando ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <><Check className="w-4 h-4 mr-1" /> Guardar</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {productosFiltrados.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No hay productos en este filtro.</p>
          </div>
        )}
      </div>

      {/* Eliminar producto — borrado real en cascada (POS + web pública) */}
      <EliminarProductoDialog
        open={!!productoAEliminar}
        onClose={() => setProductoAEliminar(null)}
        producto={productoAEliminar}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ['productosParaWeb'] });
          queryClient.invalidateQueries({ queryKey: ['productos_all'] });
          setProductoAEliminar(null);
        }}
      />

      {/* Modal crear producto para la web — solo dueño */}
      <NuevoProductoWebDialog
        open={creandoProducto}
        esDueno={esDueno}
        onClose={() => setCreandoProducto(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['productosParaWeb'] });
          setCreandoProducto(false);
        }}
      />
    </div>
  );
}
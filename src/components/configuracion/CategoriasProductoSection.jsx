import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tag, Plus, Trash2, AlertTriangle, Pencil, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  normalizeCategoryName, categoryKey, ensureCategoriaExists,
} from '@/utils/categoriaUtils';
import { COCINA_GENERAL_COLOR } from '@/utils/estacionUtils';

const SIN_ESTACION = '__sin_estacion__';

/**
 * Configuración → Operación → "Categorías de productos".
 *
 * F1 — cambios:
 *  - Eliminado el flujo "agregar varias por coma" (ensuciaba el sistema).
 *  - Agregado: editar nombre de categoría.
 *  - Agregado: asignar estación de preparación a cada categoría
 *    (solo visible si `estaciones_preparacion_activas` está activo en config).
 *  - Soft-delete intacto: marca activo:false y respeta productos asociados.
 *
 * Nunca toca: ProductoTerminado, RecetaEscandallo, Inventario, ventas, caja,
 * cortes, tickets, PDFs.
 */
export default function CategoriasProductoSection() {
  const queryClient = useQueryClient();
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // { categoria, productosCount }
  const [editing, setEditing] = useState(null); // categoría en edición
  const [editForm, setEditForm] = useState({ nombre: '', estacion_id: '' });

  const { data: configs = [] } = useQuery({
    queryKey: ['config'],
    queryFn: () => base44.entities.ConfiguracionNegocio.list(),
    initialData: [],
  });
  const config = configs?.[0] || null;
  const estacionesActivas = config?.estaciones_preparacion_activas === true;

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }),
    initialData: [],
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['productos_all'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true }),
    initialData: [],
  });

  const { data: estaciones = [] } = useQuery({
    queryKey: ['estaciones_preparacion'],
    queryFn: () => base44.entities.EstacionPreparacion.filter({ activo: true }),
    initialData: [],
    enabled: estacionesActivas,
  });

  // Conteo de productos por categoría (igual que antes).
  const conteoPorCategoria = useMemo(() => {
    const map = {};
    const cats = Array.isArray(categorias) ? categorias : [];
    const keyToId = {};
    cats.forEach((c) => {
      const k = categoryKey(c?.nombre);
      if (k && c?.id) keyToId[k] = c.id;
    });
    (Array.isArray(productos) ? productos : []).forEach((p) => {
      let targetId = p?.categoria_id || null;
      if (!targetId && p?.categoria_nombre) {
        const k = categoryKey(p.categoria_nombre);
        if (k && keyToId[k]) targetId = keyToId[k];
      }
      if (!targetId) return;
      map[targetId] = (map[targetId] || 0) + 1;
    });
    return map;
  }, [productos, categorias]);

  // Estación general (fallback)
  const cocinaGeneral = useMemo(
    () => (Array.isArray(estaciones) ? estaciones : []).find((e) => e?.es_general === true) || null,
    [estaciones]
  );

  const invalidarTodo = () => {
    queryClient.invalidateQueries({ queryKey: ['categorias_producto'] });
    queryClient.invalidateQueries({ queryKey: ['categorias_menu_qr'] });
    queryClient.invalidateQueries({ queryKey: ['categorias'] });
    queryClient.invalidateQueries({ queryKey: ['productos_all'] });
    queryClient.invalidateQueries({ queryKey: ['productos_pos'] });
    queryClient.invalidateQueries({ queryKey: ['productos_menu_qr'] });
    queryClient.invalidateQueries({ queryKey: ['menu_qr_secciones_publico'] });
  };

  const agregarUna = async () => {
    const n = normalizeCategoryName(nuevoNombre);
    if (!n) { toast.error('Escribe un nombre'); return; }
    setSaving(true);
    try {
      const cat = await ensureCategoriaExists(base44, n, { reactivate: true });
      toast.success(`Categoría "${cat.nombre}" lista`);
      setNuevoNombre('');
      invalidarTodo();
    } catch (e) {
      toast.error('No se pudo crear: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  const abrirEditar = (categoria) => {
    setEditing(categoria);
    setEditForm({
      nombre: categoria?.nombre || '',
      estacion_id: categoria?.estacion_preparacion_id || '',
    });
  };

  const guardarEdicion = async () => {
    if (!editing?.id) return;
    const nombre = normalizeCategoryName(editForm.nombre);
    if (!nombre) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      // Anti-duplicado contra otras categorías (excluyendo la actual).
      const otras = (Array.isArray(categorias) ? categorias : []).filter((c) => c?.id !== editing.id);
      const dup = otras.find((c) => categoryKey(c?.nombre) === categoryKey(nombre));
      if (dup) {
        toast.error(`Ya existe una categoría llamada "${dup.nombre}"`);
        setSaving(false);
        return;
      }
      const payload = { nombre };
      if (estacionesActivas) {
        const estacionId = editForm.estacion_id || '';
        if (estacionId) {
          const est = (Array.isArray(estaciones) ? estaciones : []).find((e) => e?.id === estacionId);
          payload.estacion_preparacion_id = estacionId;
          payload.estacion_preparacion_nombre = est?.nombre || '';
          payload.estacion_preparacion_color = est?.color || COCINA_GENERAL_COLOR;
        } else {
          // Limpiar asignación → cae a Cocina general en UI
          payload.estacion_preparacion_id = '';
          payload.estacion_preparacion_nombre = '';
          payload.estacion_preparacion_color = '';
        }
      }
      await base44.entities.CategoriaProducto.update(editing.id, payload);
      toast.success('Categoría actualizada');
      setEditing(null);
      invalidarTodo();
    } catch (e) {
      console.error('[CategoriasProductoSection] guardarEdicion:', e);
      toast.error('No se pudo guardar: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const pedirEliminar = (categoria) => {
    const count = conteoPorCategoria[categoria.id] || 0;
    setConfirmDel({ categoria, productosCount: count });
  };

  const confirmarEliminar = async () => {
    if (!confirmDel) return;
    const { categoria, productosCount } = confirmDel;
    if (productosCount > 0) {
      toast.error(
        `"${categoria.nombre}" tiene ${productosCount} producto(s). Reasigna esos productos antes de eliminarla.`
      );
      setConfirmDel(null);
      return;
    }
    setSaving(true);
    try {
      // SOFT-DELETE: marcamos activo:false. No borramos histórico.
      await base44.entities.CategoriaProducto.update(categoria.id, { activo: false });
      toast.success(`Categoría "${categoria.nombre}" eliminada`);
      setConfirmDel(null);
      invalidarTodo();
    } catch (e) {
      toast.error('No se pudo eliminar: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  // Badge de estación a renderizar al lado de cada categoría.
  const renderEstacionBadge = (categoria) => {
    if (!estacionesActivas) return null;
    const id = categoria?.estacion_preparacion_id || '';
    if (!id) {
      // Sin estación asignada → fallback visual "Cocina general"
      const color = cocinaGeneral?.color || COCINA_GENERAL_COLOR;
      const label = cocinaGeneral?.nombre || 'Cocina general';
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
          style={{ borderColor: color + '66', color, background: color + '15' }}
          title="Sin estación asignada → Cocina general"
        >
          <Layers className="w-2.5 h-2.5" />
          {label}
        </span>
      );
    }
    const est = (Array.isArray(estaciones) ? estaciones : []).find((e) => e?.id === id);
    const color = est?.color || categoria?.estacion_preparacion_color || COCINA_GENERAL_COLOR;
    const label = est?.nombre || categoria?.estacion_preparacion_nombre || '—';
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
        style={{ borderColor: color + '66', color, background: color + '15' }}
      >
        <Layers className="w-2.5 h-2.5" />
        {label}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          Categorías de productos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Estas categorías se usan en <strong>Recetas</strong>, <strong>Productos</strong>,
          <strong> Mesero</strong> y <strong>Portal QR</strong>. Si una categoría tiene productos
          asignados, reasigna esos productos antes de eliminarla.
          {estacionesActivas && (
            <> Asigna cada categoría a una <strong>estación</strong> para preparar la cocina filtrada.</>
          )}
        </p>

        {/* Lista actual */}
        <div className="space-y-2">
          {(Array.isArray(categorias) ? categorias : []).map((c) => {
            const count = conteoPorCategoria[c.id] || 0;
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 border">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{c.nombre}</p>
                    {renderEstacionBadge(c)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {count} producto{count === 1 ? '' : 's'} asignado{count === 1 ? '' : 's'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => abrirEditar(c)}
                  title="Editar categoría"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => pedirEliminar(c)}
                  title="Eliminar categoría"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
          {categorias.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              Aún no hay categorías. Agrega la primera abajo.
            </p>
          )}
        </div>

        {/* Agregar una */}
        <div className="border-t pt-4 space-y-2">
          <Label className="text-xs font-semibold">Agregar categoría</Label>
          <div className="flex gap-2">
            <Input
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarUna(); } }}
              placeholder="Ej. Tacos"
              disabled={saving}
            />
            <Button onClick={agregarUna} disabled={saving || !nuevoNombre.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          </div>
          {estacionesActivas && (
            <p className="text-[10px] text-muted-foreground">
              Tras crear la categoría podrás asignarle una estación con el botón ✏️.
            </p>
          )}
        </div>
      </CardContent>

      {/* Diálogo de edición */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Editar categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                disabled={saving}
              />
            </div>
            {estacionesActivas && (
              <div>
                <Label className="text-xs">Estación de preparación</Label>
                <Select
                  value={editForm.estacion_id || SIN_ESTACION}
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, estacion_id: v === SIN_ESTACION ? '' : v })
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_ESTACION}>
                      <span className="text-muted-foreground">— Sin estación (Cocina general) —</span>
                    </SelectItem>
                    {(Array.isArray(estaciones) ? estaciones : []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="w-2.5 h-2.5 rounded-full border"
                            style={{ background: e?.color || COCINA_GENERAL_COLOR }}
                          />
                          {e?.nombre || '—'}
                          {e?.es_general && <span className="text-[9px] text-muted-foreground">(general)</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Si la dejas vacía, la categoría se considera en Cocina general. F1 solo guarda
                  el dato — la cocina filtrada se activará en próximas actualizaciones.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicion} disabled={saving || !editForm.nombre.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!confirmDel} onOpenChange={(v) => { if (!v) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              ¿Eliminar categoría?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.productosCount > 0 ? (
                <>
                  Esta categoría tiene <strong>{confirmDel.productosCount}</strong> producto(s) asignado(s).
                  Reasigna esos productos a otra categoría antes de eliminarla.
                </>
              ) : (
                <>
                  La categoría <strong>"{confirmDel?.categoria?.nombre}"</strong> se marcará como
                  inactiva y dejará de aparecer en Mesero, Productos, Recetas y Portal QR.
                  Las ventas históricas no se ven afectadas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarEliminar}
              disabled={saving || (confirmDel?.productosCount || 0) > 0}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
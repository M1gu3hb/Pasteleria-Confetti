import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import SelectorSucursalesProducto from './SelectorSucursalesProducto';
import CategoriaSelect from './CategoriaSelect';
import ImageUploader from '@/components/common/ImageUploader';

/**
 * NuevoProductoWebDialog — Fase 7
 * Crea un producto enfocado al catálogo web. Solo el dueño puede usarlo.
 * Campos: nombre, categoría, precio_venta, imagen (upload), descripcion_web,
 * visible_en_web, y selector de sucursales (vacío = global).
 *
 * Tras crear en el POS, sincroniza el producto a la web pública
 * (fire and forget: si falla, el producto igual queda guardado en POS).
 */
const FORM_VACIO = {
  nombre: '',
  precio_venta: '',
  imagen_url: '',
  descripcion_web: '',
  visible_en_web: true,
  sucursal_ids: [],
  categoria_id: '',
  categoria_nombre: '',
};

export default function NuevoProductoWebDialog({ open, esDueno, onClose, onCreated }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  // Categorías activas (misma fuente central que el resto del sistema).
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }),
    initialData: [],
  });

  // Reset al abrir.
  useEffect(() => {
    if (open) { setForm(FORM_VACIO); setGuardando(false); }
  }, [open]);

  const guardar = async () => {
    const nombre = (form.nombre || '').trim();
    if (!nombre) { toast.error('El nombre es obligatorio'); return; }
    setGuardando(true);
    try {
      const precio = parseFloat(form.precio_venta) || 0;
      const visible = form.visible_en_web !== false;
      const sucursalIds = Array.isArray(form.sucursal_ids) ? form.sucursal_ids : [];

      // Opción A (DB compartida): crear en la tabla `productos`. La web lee la
      // misma tabla (vista catalogo_publico) — ya no hay sync ni producto_pos_id.
      await base44.entities.ProductoTerminado.create({
        nombre,
        precio_venta: precio,
        imagen_url: form.imagen_url || null,
        descripcion_web: form.descripcion_web || null,
        visible_en_web: visible,
        activo: true,
        sucursal_ids: sucursalIds,
        categoria_id: form.categoria_id || null,
        categoria_nombre: form.categoria_nombre || null,
      });

      toast.success('Producto creado');
      queryClient.invalidateQueries({ queryKey: ['categorias_producto'] });
      if (typeof onCreated === 'function') onCreated();
    } catch (e) {
      console.error('[NuevoProductoWebDialog] crear:', e);
      toast.error('No se pudo crear el producto: ' + (e?.message || ''));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-[#2E1D0E] dark:border dark:border-[rgba(240,221,213,0.15)]">
        <DialogHeader>
          <DialogTitle className="font-heading">Agregar producto a la web</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre *</label>
            <Input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del producto"
              className="skeu-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoría</label>
            <CategoriaSelect
              value={form.categoria_id}
              onChange={(id, nombreCat) => setForm(f => ({ ...f, categoria_id: id, categoria_nombre: nombreCat || '' }))}
              categorias={categorias}
              placeholder="Sin categoría"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Precio de venta ($)</label>
            <Input
              type="number"
              value={form.precio_venta}
              onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))}
              placeholder="0"
              className="skeu-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Imagen del producto</label>
            <div className="mt-1">
              <ImageUploader
                value={form.imagen_url}
                onChange={(url) => setForm(f => ({ ...f, imagen_url: url }))}
                height={140}
                label="Subir imagen del producto"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción en web</label>
            <Textarea
              value={form.descripcion_web}
              onChange={e => setForm(f => ({ ...f, descripcion_web: e.target.value }))}
              placeholder="Descripción corta visible en la web pública..."
              rows={2}
              className="skeu-input resize-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Visible en la web</label>
            <Switch
              checked={form.visible_en_web !== false}
              onCheckedChange={v => setForm(f => ({ ...f, visible_en_web: v }))}
            />
          </div>
          {esDueno && (
            <div className="pt-2 border-t">
              <SelectorSucursalesProducto
                value={form.sucursal_ids}
                onChange={(next) => setForm(f => ({ ...f, sucursal_ids: next }))}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button
            onClick={guardar}
            disabled={guardando}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {guardando ? 'Guardando…' : 'Crear producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
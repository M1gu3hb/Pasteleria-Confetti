import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { formatCurrency, formatPercent, calculateMargin } from '@/utils/financialUtils';
import IngredienteAutocomplete from './IngredienteAutocomplete';
import CategoriaSelect from '@/components/productos/CategoriaSelect';
import ImageUploader from '@/components/common/ImageUploader';
import TipoVentaSection from '@/components/productos/TipoVentaSection';
import { TIPO_VENTA, validarProductoVariable, esProductoVariable } from '@/utils/tipoVentaUtils';
import { sincronizarProductoCreado } from '@/utils/posApiClient';

const EMPTY_PRODUCTO = {
  nombre: '', categoria_id: '', descripcion: '', precio_venta: '',
  imagen_url: '', visible_en_pos: true, activo: true,
};

// 6B / 1.B — Estado inicial del bloque "tipo de venta".
// Por defecto: precio_fijo (flujo clásico de receta).
const EMPTY_TIPO_VENTA = { tipo_venta: TIPO_VENTA.PRECIO_FIJO };

const EMPTY_LINEA = { ingrediente: null, cantidad_usada: '', unidad_usada: '', merma_porcentaje: 0 };

/**
 * Modal grande para crear/editar receta + producto terminado.
 * - Datos del producto
 * - Ingredientes (con autocomplete vs inventario)
 * - Cálculos en vivo (costo, utilidad, margen)
 * - Al guardar: crea/actualiza ProductoTerminado y RecetaEscandallo lines
 */
export default function RecetaFormDialog({ open, onClose, productoToEdit, recetaLinesToEdit, ingredientes, categorias }) {
  const queryClient = useQueryClient();
  const [producto, setProducto] = useState(EMPTY_PRODUCTO);
  const [lineas, setLineas] = useState([]);
  const [saving, setSaving] = useState(false);
  // 6B / 1.B — Estado del tipo de venta. Independiente del flujo de receta.
  const [tipoVentaState, setTipoVentaState] = useState(EMPTY_TIPO_VENTA);

  // IMPORTANTE: Solo dependemos de `open` y del id del producto a editar
  // (no de la referencia del array recetaLinesToEdit, que cambia en cada render
  // del padre y reseteaba las líneas al pulsar "Agregar ingrediente").
  useEffect(() => {
    if (!open) return;
    if (productoToEdit) {
      setProducto({
        nombre: productoToEdit.nombre || '',
        categoria_id: productoToEdit.categoria_id || '',
        descripcion: productoToEdit.descripcion || '',
        precio_venta: productoToEdit.precio_venta ?? '',
        imagen_url: productoToEdit.imagen_url || '',
        visible_en_pos: productoToEdit.visible_en_pos !== false,
        activo: productoToEdit.activo !== false,
      });
      const safeLines = Array.isArray(recetaLinesToEdit) ? recetaLinesToEdit : [];
      const safeIngs = Array.isArray(ingredientes) ? ingredientes : [];
      const initialLineas = safeLines.map(l => {
        const ing = safeIngs.find(i => i.id === l.ingrediente_id);
        return {
          id: l.id,
          ingrediente: ing || {
            id: l.ingrediente_id,
            nombre: l.ingrediente_nombre,
            unidad_base: l.unidad_usada,
            costo_por_unidad_base: l.costo_unitario_base_snapshot,
            stock_actual: 0,
          },
          cantidad_usada: l.cantidad_usada,
          unidad_usada: l.unidad_usada || ing?.unidad_base || '',
          merma_porcentaje: l.merma_porcentaje || 0,
        };
      });
      setLineas(initialLineas);
      // 6B / 1.B — Hidratar tipo de venta desde el producto a editar.
      setTipoVentaState({
        tipo_venta: productoToEdit.tipo_venta || TIPO_VENTA.PRECIO_FIJO,
        ingrediente_base_id: productoToEdit.ingrediente_base_id || '',
        ingrediente_base_nombre: productoToEdit.ingrediente_base_nombre || '',
        unidad_variable: productoToEdit.unidad_variable || '',
        precio_por_unidad_variable: productoToEdit.precio_por_unidad_variable,
        cantidad_minima_variable: productoToEdit.cantidad_minima_variable,
        cantidad_maxima_variable: productoToEdit.cantidad_maxima_variable,
        incremento_variable: productoToEdit.incremento_variable,
        presets_variable_qr: Array.isArray(productoToEdit.presets_variable_qr) ? productoToEdit.presets_variable_qr : [],
        capacidad_contenedor_ml: productoToEdit.capacidad_contenedor_ml,
        porciones_por_contenedor: productoToEdit.porciones_por_contenedor,
        ml_por_porcion: productoToEdit.ml_por_porcion,
        nombre_porcion: productoToEdit.nombre_porcion || '',
        precio_por_porcion: productoToEdit.precio_por_porcion,
        presets_porcion_qr: Array.isArray(productoToEdit.presets_porcion_qr) ? productoToEdit.presets_porcion_qr : [],
      });
    } else {
      setProducto(EMPTY_PRODUCTO);
      setLineas([]);
      setTipoVentaState(EMPTY_TIPO_VENTA);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productoToEdit?.id]);

  const calc = useMemo(() => {
    let costo = 0;
    const detalle = lineas.map(l => {
      if (!l.ingrediente) return { ...l, costoLinea: 0 };
      const cant = parseFloat(l.cantidad_usada) || 0;
      const merma = 1 + ((parseFloat(l.merma_porcentaje) || 0) / 100);
      const costoUnit = l.ingrediente.costo_por_unidad_base || 0;
      const costoLinea = cant * merma * costoUnit;
      costo += costoLinea;
      return { ...l, costoLinea };
    });
    const precio = parseFloat(producto.precio_venta) || 0;
    const utilidad = precio - costo;
    const margen = calculateMargin(precio, costo);
    return { costo, utilidad, margen, detalle };
  }, [lineas, producto.precio_venta]);

  const addLinea = () => setLineas(prev => [...prev, { ...EMPTY_LINEA }]);
  const removeLinea = (idx) => setLineas(prev => prev.filter((_, i) => i !== idx));
  const updateLinea = (idx, patch) => setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));

  const handleSelectIng = (idx, ing) => {
    updateLinea(idx, { ingrediente: ing, unidad_usada: ing.unidad_base });
  };

  const validate = () => {
    if (!producto.nombre.trim()) { toast.error('Falta el nombre del producto'); return false; }
    if (!producto.precio_venta || parseFloat(producto.precio_venta) <= 0) { toast.error('Precio de venta inválido'); return false; }
    for (const l of lineas) {
      if (!l.ingrediente) { toast.error('Hay ingredientes sin seleccionar'); return false; }
      if (!l.cantidad_usada || parseFloat(l.cantidad_usada) <= 0) {
        toast.error(`Cantidad inválida para ${l.ingrediente.nombre}`); return false;
      }
    }
    // 6B / 1.B — Validación adicional si es variable.
    if (esProductoVariable(tipoVentaState)) {
      const { ok, errores } = validarProductoVariable(tipoVentaState);
      if (!ok) { toast.error(errores[0] || 'Revisa el tipo de venta.'); return false; }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Resolver nombre de categoría: del cache local primero; si la categoría
      // se acaba de crear inline y aún no llegó al cache, buscamos en BD.
      let catNombre = categorias.find(c => c.id === producto.categoria_id)?.nombre || '';
      if (!catNombre && producto.categoria_id) {
        try {
          const fresco = await base44.entities.CategoriaProducto.get(producto.categoria_id);
          catNombre = fresco?.nombre || '';
        } catch {}
      }
      // 6B / 1.B — Campos de tipo_venta. Solo se incluyen si el producto
      // es variable; en caso contrario se persiste 'precio_fijo' explícito
      // para limpiar valores antiguos al cambiar de variable → fijo.
      const tipoVentaPayload = esProductoVariable(tipoVentaState)
        ? {
            tipo_venta: tipoVentaState.tipo_venta,
            ingrediente_base_id: tipoVentaState.ingrediente_base_id || '',
            ingrediente_base_nombre: tipoVentaState.ingrediente_base_nombre || '',
            unidad_variable: tipoVentaState.unidad_variable || '',
            precio_por_unidad_variable: tipoVentaState.precio_por_unidad_variable,
            cantidad_minima_variable: tipoVentaState.cantidad_minima_variable,
            cantidad_maxima_variable: tipoVentaState.cantidad_maxima_variable,
            incremento_variable: tipoVentaState.incremento_variable,
            presets_variable_qr: Array.isArray(tipoVentaState.presets_variable_qr) ? tipoVentaState.presets_variable_qr : [],
            capacidad_contenedor_ml: tipoVentaState.capacidad_contenedor_ml,
            porciones_por_contenedor: tipoVentaState.porciones_por_contenedor,
            ml_por_porcion: tipoVentaState.ml_por_porcion,
            nombre_porcion: tipoVentaState.nombre_porcion || '',
            precio_por_porcion: tipoVentaState.precio_por_porcion,
            presets_porcion_qr: Array.isArray(tipoVentaState.presets_porcion_qr) ? tipoVentaState.presets_porcion_qr : [],
          }
        : { tipo_venta: TIPO_VENTA.PRECIO_FIJO };

      const productoData = {
        nombre: producto.nombre.trim(),
        categoria_id: producto.categoria_id || '',
        categoria_nombre: catNombre,
        descripcion: producto.descripcion || '',
        precio_venta: parseFloat(producto.precio_venta),
        imagen_url: producto.imagen_url || '',
        area_preparacion: 'cocina',
        visible_en_pos: producto.visible_en_pos,
        visible_en_menu_digital: true,
        // TODO producto nuevo del POS es visible en la web por default.
        // El dueño puede ocultarlo luego con el toggle en Web Pública.
        visible_en_web: true,
        activo: producto.activo,
        costo_calculado_actual: Math.round(calc.costo * 100) / 100,
        utilidad_bruta_actual: Math.round(calc.utilidad * 100) / 100,
        margen_bruto_actual: Math.round(calc.margen * 100) / 100,
        ...tipoVentaPayload,
      };

      let productoId;
      if (productoToEdit) {
        await base44.entities.ProductoTerminado.update(productoToEdit.id, productoData);
        productoId = productoToEdit.id;
        // Borrar líneas previas
        for (const old of (recetaLinesToEdit || [])) {
          await base44.entities.RecetaEscandallo.delete(old.id);
        }
      } else {
        const created = await base44.entities.ProductoTerminado.create(productoData);
        productoId = created.id;
        // Sincronizar a la web pública (fire-and-forget). La receta usa
        // 'descripcion'; la web lee 'descripcion_web', así que lo mapeamos.
        sincronizarProductoCreado({ ...created, descripcion_web: created.descripcion_web || created.descripcion || null })
          .then(res => {
            if (!res) toast.warning('Receta creada, pero el producto no se sincronizó con la web. Edítalo y guarda para reintentar.');
          })
          .catch(() => {
            toast.warning('Receta creada, pero el producto no se sincronizó con la web. Edítalo y guarda para reintentar.');
          });
      }

      // Crear líneas nuevas
      for (const l of lineas) {
        const cant = parseFloat(l.cantidad_usada) || 0;
        const merma = parseFloat(l.merma_porcentaje) || 0;
        const costoUnit = l.ingrediente.costo_por_unidad_base || 0;
        const costoLinea = cant * (1 + merma / 100) * costoUnit;
        await base44.entities.RecetaEscandallo.create({
          producto_id: productoId,
          ingrediente_id: l.ingrediente.id,
          ingrediente_nombre: l.ingrediente.nombre,
          cantidad_usada: cant,
          unidad_usada: l.unidad_usada || l.ingrediente.unidad_base,
          cantidad_convertida_unidad_base: cant,
          merma_porcentaje: merma,
          costo_unitario_base_snapshot: costoUnit,
          costo_linea_calculado: costoLinea,
          activo: true,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['productos_all'] });
      queryClient.invalidateQueries({ queryKey: ['productos_pos'] });
      queryClient.invalidateQueries({ queryKey: ['recetas_all'] });
      toast.success(productoToEdit ? 'Receta actualizada' : '¡Receta creada! Producto agregado al catálogo');
      onClose();
    } catch (e) {
      toast.error('Error al guardar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {productoToEdit ? 'Editar receta' : 'Nueva receta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* DATOS DEL PRODUCTO */}
          <section className="space-y-3 p-4 rounded-xl bg-muted/30 border">
            <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Datos del producto
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Nombre del producto *</Label>
                <Input value={producto.nombre} onChange={e => setProducto({ ...producto, nombre: e.target.value })}
                  placeholder="Ej: Capuchino" />
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <CategoriaSelect
                  value={producto.categoria_id}
                  onChange={(id) => setProducto({ ...producto, categoria_id: id })}
                  categorias={categorias}
                  placeholder="Seleccionar…"
                />
              </div>
              <div>
                <Label className="text-xs">Precio de venta *</Label>
                <Input type="number" step="0.01" value={producto.precio_venta}
                  onChange={e => setProducto({ ...producto, precio_venta: e.target.value })} placeholder="0.00" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Descripción</Label>
                <Textarea value={producto.descripcion}
                  onChange={e => setProducto({ ...producto, descripcion: e.target.value })}
                  placeholder="Descripción breve..." rows={2} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Imagen del producto</Label>
                <div className="mt-1">
                  <ImageUploader
                    value={producto.imagen_url}
                    onChange={(url) => setProducto({ ...producto, imagen_url: url })}
                    height={150}
                    label="Subir imagen del producto"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between sm:col-span-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={producto.activo} onCheckedChange={v => setProducto({ ...producto, activo: v })} />
                    <Label className="text-xs">Activo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={producto.visible_en_pos} onCheckedChange={v => setProducto({ ...producto, visible_en_pos: v })} />
                    <Label className="text-xs">Visible en POS</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* 6B / 1.B — Tipo de venta. Default: Precio fijo (flujo clásico).
                NO afecta el cálculo de costo/utilidad/margen basado en RecetaEscandallo. */}
            <TipoVentaSection
              value={tipoVentaState}
              onChange={(patch) => setTipoVentaState(prev => ({ ...prev, ...patch }))}
              ingredientes={ingredientes}
            />
          </section>

          {/* 6B / Hotfix visual — Ingredientes / Costeo de producción: SOLO para
              productos precio_fijo. En productos variables, la unidad de cobro y
              el descuento de inventario los maneja "tipo_venta" (TipoVentaSection).
              Mostrar la receta clásica aquí confunde al usuario. */}
          {!esProductoVariable(tipoVentaState) && (
          <section className="space-y-3 p-4 rounded-xl bg-muted/30 border">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Ingredientes / Costeo de producción
              </h3>
              <Button size="sm" variant="outline" onClick={addLinea}>
                <Plus className="w-4 h-4 mr-1" /> Agregar ingrediente
              </Button>
            </div>

            {lineas.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Agrega al menos un ingrediente para calcular el costo
              </div>
            )}

            <div className="space-y-2">
              {calc.detalle.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-white border">
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Ingrediente</Label>
                    <IngredienteAutocomplete
                      ingredientes={ingredientes}
                      value={l.ingrediente}
                      onSelect={(ing) => handleSelectIng(idx, ing)}
                    />
                    {l.ingrediente && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Stock: {Number(l.ingrediente.stock_actual || 0).toLocaleString()} {l.ingrediente.unidad_base}
                        {' · '}{formatCurrency(l.ingrediente.costo_por_unidad_base)}/{l.ingrediente.unidad_base}
                      </p>
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Cantidad</Label>
                    <Input type="number" step="0.01" value={l.cantidad_usada}
                      onChange={e => updateLinea(idx, { cantidad_usada: e.target.value })} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Unidad</Label>
                    <Input value={l.unidad_usada || l.ingrediente?.unidad_base || ''}
                      onChange={e => updateLinea(idx, { unidad_usada: e.target.value })} disabled={!l.ingrediente} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Costo línea</Label>
                    <p className="h-9 flex items-center font-bold text-sm">{formatCurrency(l.costoLinea)}</p>
                  </div>
                  <div className="col-span-1">
                    <Button variant="ghost" size="icon" onClick={() => removeLinea(idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* 6B / Hotfix visual — Resumen en vivo del escandallo clásico: solo
              precio_fijo. Para variables, el resumen real (precio/costo/utilidad/
              margen por unidad vendible o porción) ya vive en TipoVentaSection. */}
          {!esProductoVariable(tipoVentaState) && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <Stat label="Costo producción" value={formatCurrency(calc.costo)} color="text-orange-700" />
            <Stat label="Precio venta" value={formatCurrency(parseFloat(producto.precio_venta) || 0)} />
            <Stat label="Utilidad bruta" value={formatCurrency(calc.utilidad)} color="text-emerald-700" />
            <Stat label="Margen" value={formatPercent(calc.margen)} color={calc.margen >= 60 ? 'text-emerald-700' : calc.margen >= 40 ? 'text-yellow-700' : 'text-red-700'} />
          </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : (productoToEdit ? 'Guardar cambios' : 'Crear receta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-heading font-black text-lg ${color || ''}`}>{value}</p>
    </div>
  );
}
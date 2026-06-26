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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  normalizeEstacionName, estacionKey, findExistingEstacion,
  COCINA_GENERAL_NOMBRE, COCINA_GENERAL_COLOR,
} from '@/utils/estacionUtils';

const COLOR_PALETTE = [
  '#4A5568', '#2563EB', '#7C3AED', '#DB2777',
  '#DC2626', '#EA580C', '#CA8A04', '#16A34A',
  '#0891B2', '#0D9488', '#6B7280', '#1F2937',
];

/**
 * Configuración → Operación → Estaciones de preparación (F1).
 *
 * Solo se muestra cuando `estaciones_preparacion_activas` está activo en
 * ConfiguracionNegocio (la condición de visibilidad la decide el padre).
 *
 * Funcionalidad:
 *  - Lista estaciones activas (orden ascendente).
 *  - Crear / editar / soft-delete (activo:false).
 *  - Reordenar con flechas ↑↓ (orden numérico).
 *  - Anti-duplicado tolerante a casing/acentos/espacios.
 *  - Crear estación "Cocina general" si no existe (botón visible).
 *  - Al desactivar una estación con categorías: aviso claro y reasigna
 *    esas categorías a Cocina general (o limpia los snapshots).
 *
 * NO toca: pedidos, cocina, productos, recetas, ventas, inventario.
 */
export default function EstacionesPreparacionSection({ embedded = false }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', color: COLOR_PALETTE[0] });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // { estacion, categoriasCount }

  const { data: estaciones = [] } = useQuery({
    queryKey: ['estaciones_preparacion'],
    queryFn: () => base44.entities.EstacionPreparacion.filter({ activo: true }),
    initialData: [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }),
    initialData: [],
  });

  // Conteo de categorías por estación. Las que no tienen estacion_preparacion_id
  // se consideran en "Cocina general" (cualquiera con es_general:true).
  const conteoPorEstacion = useMemo(() => {
    const map = {};
    (Array.isArray(categorias) ? categorias : []).forEach((c) => {
      const id = c?.estacion_preparacion_id || null;
      if (!id) return;
      map[id] = (map[id] || 0) + 1;
    });
    return map;
  }, [categorias]);

  const cocinaGeneral = useMemo(
    () => (Array.isArray(estaciones) ? estaciones : []).find((e) => e?.es_general === true) || null,
    [estaciones]
  );

  const estacionesOrdenadas = useMemo(() => {
    const arr = Array.isArray(estaciones) ? [...estaciones] : [];
    return arr.sort((a, b) => {
      // Cocina general siempre primero
      if (a?.es_general && !b?.es_general) return -1;
      if (!a?.es_general && b?.es_general) return 1;
      return (Number(a?.orden) || 0) - (Number(b?.orden) || 0);
    });
  }, [estaciones]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['estaciones_preparacion'] });
    queryClient.invalidateQueries({ queryKey: ['categorias_producto'] });
  };

  const abrirNuevo = () => {
    setEditing(null);
    setForm({ nombre: '', descripcion: '', color: COLOR_PALETTE[0] });
    setShowForm(true);
  };

  const abrirEditar = (estacion) => {
    setEditing(estacion);
    setForm({
      nombre: estacion?.nombre || '',
      descripcion: estacion?.descripcion || '',
      color: estacion?.color || COLOR_PALETTE[0],
    });
    setShowForm(true);
  };

  const guardar = async () => {
    const nombre = normalizeEstacionName(form.nombre);
    if (!nombre) {
      toast.error('El nombre es obligatorio');
      return;
    }
    // Duplicado contra TODAS las estaciones (incluso inactivas, para reactivar).
    setSaving(true);
    try {
      const todas = await base44.entities.EstacionPreparacion.list().catch(() => []);
      const existente = findExistingEstacion(nombre, todas);
      if (existente && existente.id !== editing?.id) {
        if (existente.activo === false) {
          // Reactivar la inactiva
          await base44.entities.EstacionPreparacion.update(existente.id, {
            activo: true,
            color: form.color,
            descripcion: form.descripcion || '',
          });
          toast.success(`Estación "${existente.nombre}" reactivada`);
        } else {
          toast.error(`Ya existe una estación llamada "${existente.nombre}"`);
          setSaving(false);
          return;
        }
      } else if (editing?.id) {
        // Editar — la estación general también puede cambiar color/descripcion,
        // pero no su flag es_general.
        await base44.entities.EstacionPreparacion.update(editing.id, {
          nombre,
          descripcion: form.descripcion || '',
          color: form.color || COCINA_GENERAL_COLOR,
        });
        // Si esta estación tiene categorías asignadas, refrescar sus snapshots
        // de nombre/color para que badges no queden desfasados.
        const cats = (Array.isArray(categorias) ? categorias : []).filter(
          (c) => c?.estacion_preparacion_id === editing.id
        );
        await Promise.all(
          cats.map((c) =>
            base44.entities.CategoriaProducto.update(c.id, {
              estacion_preparacion_nombre: nombre,
              estacion_preparacion_color: form.color || COCINA_GENERAL_COLOR,
            }).catch(() => {})
          )
        );
        toast.success('Estación actualizada');
      } else {
        // Crear nueva
        const maxOrden = (Array.isArray(todas) ? todas : []).reduce(
          (m, e) => Math.max(m, Number(e?.orden) || 0),
          0
        );
        await base44.entities.EstacionPreparacion.create({
          nombre,
          descripcion: form.descripcion || '',
          color: form.color || COCINA_GENERAL_COLOR,
          orden: maxOrden + 1,
          activo: true,
          es_general: false,
        });
        toast.success(`Estación "${nombre}" creada`);
      }
      invalidar();
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      console.error('[EstacionesPreparacionSection] guardar:', e);
      toast.error('No se pudo guardar: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const crearCocinaGeneral = async () => {
    setSaving(true);
    try {
      const todas = await base44.entities.EstacionPreparacion.list().catch(() => []);
      const yaExiste = (Array.isArray(todas) ? todas : []).find((e) => e?.es_general === true);
      if (yaExiste) {
        if (yaExiste.activo === false) {
          await base44.entities.EstacionPreparacion.update(yaExiste.id, { activo: true });
        }
        invalidar();
        toast.success('Cocina general lista');
        return;
      }
      await base44.entities.EstacionPreparacion.create({
        nombre: COCINA_GENERAL_NOMBRE,
        descripcion: 'Estación por defecto. Las categorías sin estación específica se preparan aquí.',
        color: COCINA_GENERAL_COLOR,
        orden: 0,
        activo: true,
        es_general: true,
      });
      invalidar();
      toast.success('Cocina general creada');
    } catch (e) {
      toast.error('No se pudo crear: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const pedirDesactivar = (estacion) => {
    if (estacion?.es_general) {
      toast.error('No se puede desactivar Cocina general (es el fallback del sistema)');
      return;
    }
    const count = conteoPorEstacion[estacion.id] || 0;
    setConfirmDel({ estacion, categoriasCount: count });
  };

  const confirmarDesactivar = async () => {
    if (!confirmDel) return;
    const { estacion, categoriasCount } = confirmDel;
    setSaving(true);
    try {
      // Si hay categorías asignadas, reasignarlas a Cocina general (si existe)
      // o dejarlas sin estación (caen automáticamente a "general" en UI).
      if (categoriasCount > 0) {
        const cats = (Array.isArray(categorias) ? categorias : []).filter(
          (c) => c?.estacion_preparacion_id === estacion.id
        );
        const reasigna = cocinaGeneral
          ? {
              estacion_preparacion_id: cocinaGeneral.id,
              estacion_preparacion_nombre: cocinaGeneral.nombre,
              estacion_preparacion_color: cocinaGeneral.color || COCINA_GENERAL_COLOR,
            }
          : {
              estacion_preparacion_id: '',
              estacion_preparacion_nombre: '',
              estacion_preparacion_color: '',
            };
        await Promise.all(
          cats.map((c) => base44.entities.CategoriaProducto.update(c.id, reasigna).catch(() => {}))
        );
      }
      await base44.entities.EstacionPreparacion.update(estacion.id, { activo: false });
      toast.success(`Estación "${estacion.nombre}" desactivada`);
      invalidar();
      setConfirmDel(null);
    } catch (e) {
      toast.error('No se pudo desactivar: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  // Mover estación arriba/abajo (intercambiar orden con la vecina no-general).
  const mover = async (estacion, delta) => {
    if (estacion?.es_general) return;
    const noGenerales = estacionesOrdenadas.filter((e) => !e?.es_general);
    const idx = noGenerales.findIndex((e) => e?.id === estacion.id);
    const otroIdx = idx + delta;
    if (idx < 0 || otroIdx < 0 || otroIdx >= noGenerales.length) return;
    const otra = noGenerales[otroIdx];
    if (!otra?.id) return;
    try {
      await Promise.all([
        base44.entities.EstacionPreparacion.update(estacion.id, { orden: Number(otra.orden) || 0 }),
        base44.entities.EstacionPreparacion.update(otra.id, { orden: Number(estacion.orden) || 0 }),
      ]);
      invalidar();
    } catch (e) {
      toast.error('No se pudo reordenar: ' + (e?.message || ''));
    }
  };

  // Header + contenido (reutilizable embebido o no)
  const HeaderRow = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        {!embedded && <Layers className="w-4 h-4 text-primary" />}
        <p className="text-sm font-semibold">
          {embedded ? 'Administrar estaciones' : 'Estaciones de preparación'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!cocinaGeneral && (
          <Button variant="outline" size="sm" onClick={crearCocinaGeneral} disabled={saving}>
            <Plus className="w-4 h-4 mr-1" /> Crear Cocina general
          </Button>
        )}
        <Button size="sm" onClick={abrirNuevo} disabled={saving}>
          <Plus className="w-4 h-4 mr-1" /> Nueva estación
        </Button>
      </div>
    </div>
  );

  const Body = (
    <div className="space-y-3">
      {!embedded && (
        <p className="text-xs text-muted-foreground">
          Define las áreas de preparación de tu restaurante (barra, postres, barbacoa, etc.).
          Cada categoría de producto puede asignarse a una estación. Las categorías sin estación
          van a <strong>Cocina general</strong>.
        </p>
      )}

      {!cocinaGeneral && (
        <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            Aún no existe <strong>Cocina general</strong>. Es la estación por defecto donde caen
            las categorías sin asignar. Crea Cocina general para evitar inconsistencias futuras.
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {estacionesOrdenadas.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin estaciones aún. Crea la primera con el botón de arriba.
          </p>
        )}
        {estacionesOrdenadas.map((e, idx) => {
            const count = conteoPorEstacion[e.id] || 0;
            const noGenerales = estacionesOrdenadas.filter((x) => !x?.es_general);
            const noGenIdx = noGenerales.findIndex((x) => x?.id === e.id);
            const canUp = !e?.es_general && noGenIdx > 0;
            const canDown = !e?.es_general && noGenIdx >= 0 && noGenIdx < noGenerales.length - 1;
            return (
              <div
                key={e.id}
                className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border"
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-full shrink-0 border"
                  style={{ background: e?.color || COCINA_GENERAL_COLOR }}
                  title={e?.color || ''}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {e?.nombre || '—'}
                    {e?.es_general && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                        General
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {count} categoría{count === 1 ? '' : 's'} asignada{count === 1 ? '' : 's'}
                    {e?.descripcion ? ` · ${e.descripcion}` : ''}
                  </p>
                </div>
                {/* Reorden */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    onClick={() => mover(e, -1)}
                    disabled={!canUp || saving}
                    title="Subir"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    onClick={() => mover(e, 1)}
                    disabled={!canDown || saving}
                    title="Bajar"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => abrirEditar(e)}
                  title="Editar estación"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                {!e?.es_general && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => pedirDesactivar(e)}
                    title="Desactivar estación"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );

  const Dialogs = (
    <>
      {/* Diálogo de creación / edición */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setShowForm(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? 'Editar estación' : 'Nueva estación'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Barra, Postres, Barbacoa"
                disabled={saving}
              />
            </div>
            <div>
              <Label className="text-xs">Descripción (opcional)</Label>
              <Input
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Notas internas para esta estación"
                disabled={saving}
              />
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <div className="grid grid-cols-6 gap-1.5 mt-1">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-8 rounded-md border-2 transition-all ${
                      form.color === c ? 'border-foreground scale-105' : 'border-transparent'
                    }`}
                    style={{ background: c }}
                    title={c}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving || !form.nombre.trim()}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de desactivación */}
      <AlertDialog
        open={!!confirmDel}
        onOpenChange={(v) => {
          if (!v && !saving) setConfirmDel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              ¿Desactivar estación?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.categoriasCount > 0 ? (
                <>
                  La estación <strong>"{confirmDel?.estacion?.nombre}"</strong> tiene{' '}
                  <strong>{confirmDel.categoriasCount}</strong> categoría
                  {confirmDel.categoriasCount === 1 ? '' : 's'} asignada
                  {confirmDel.categoriasCount === 1 ? '' : 's'}. Esas categorías se moverán
                  automáticamente a <strong>{cocinaGeneral?.nombre || 'Cocina general'}</strong>
                  {cocinaGeneral ? '.' : ' (si no existe, quedarán sin estación).'}
                </>
              ) : (
                <>
                  La estación <strong>"{confirmDel?.estacion?.nombre}"</strong> se desactivará.
                  No afecta productos, recetas, ventas ni pedidos en curso.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarDesactivar} disabled={saving}>
              Sí, desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        {HeaderRow}
        {Body}
        {Dialogs}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>{HeaderRow}</CardHeader>
      <CardContent>{Body}</CardContent>
      {Dialogs}
    </Card>
  );
}
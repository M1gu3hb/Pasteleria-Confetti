import React, { useState, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { calculateMargin, getMarginLevel } from '@/utils/financialUtils';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { BookOpen, Plus, Eye, Package, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import RecetaAccordionRow from '@/components/recetas/RecetaAccordionRow';
import RecetaFormDialog from '@/components/recetas/RecetaFormDialog';
import LoadingState from '@/components/common/LoadingState';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { hasPermission } from '@/lib/permissions';
import { Navigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';

export default function Recetas() {
  const queryClient = useQueryClient();
  const { posUser } = usePOSAuth();
  const canEdit = hasPermission(posUser?.rol, 'editar_recetas');
  const canView = !posUser || hasPermission(posUser?.rol, 'ver_recetas');
  const [showForm, setShowForm] = useState(false);
  const [editProducto, setEditProducto] = useState(null);
  const [editLines, setEditLines] = useState([]);
  const location = useLocation();
  // ?producto=<id> → abrir automáticamente y hacer scroll
  const targetProductoId = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('producto') || null;
    } catch { return null; }
  }, [location.search]);
  const scrolledRef = useRef(false);

  // Sin initialData:[] — distinguimos "primer fetch" (loading) de "vacío real".
  // Antes mostraba "Sin recetas" / "No hay inventario" antes del primer fetch,
  // confundiendo al usuario y haciendo aparecer un falso onboarding.
  const { data: productosRaw, isPending: productosLoading } = useQuery({
    queryKey: ['productos_all'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const { data: recetasRaw, isPending: recetasLoading } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => base44.entities.RecetaEscandallo.list('-created_date', 1000),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const { data: ingredientesRaw, isPending: ingLoading } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => base44.entities.Ingrediente.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const { data: categoriasRaw } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => base44.entities.CategoriaProducto.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const productos = Array.isArray(productosRaw) ? productosRaw : [];
  const recetas = Array.isArray(recetasRaw) ? recetasRaw : [];
  const ingredientes = Array.isArray(ingredientesRaw) ? ingredientesRaw : [];
  const categorias = Array.isArray(categoriasRaw) ? categoriasRaw : [];

  // "Cargando por primera vez" = ninguna query crítica terminó su primer fetch.
  // Si el caché ya tiene datos (placeholderData), NO se considera loading.
  const cargandoInicial =
    (productosLoading && !productosRaw) ||
    (recetasLoading && !recetasRaw) ||
    (ingLoading && !ingredientesRaw);

  // Index para resolver ingrediente base de productos variables.
  const ingredientesById = useMemo(() => {
    const m = new Map();
    (Array.isArray(ingredientes) ? ingredientes : []).forEach(i => { if (i?.id) m.set(i.id, i); });
    return m;
  }, [ingredientes]);

  const productosConReceta = useMemo(() => {
    return productos.map(p => {
      const lines = recetas.filter(r => r.producto_id === p.id && r.activo !== false);
      const costo = lines.reduce((s, l) => {
        const merma = 1 + ((l.merma_porcentaje || 0) / 100);
        return s + ((l.cantidad_convertida_unidad_base || 0) * merma * (l.costo_unitario_base_snapshot || 0));
      }, 0);
      const margen = calculateMargin(p.precio_venta, costo);
      return { ...p, recetaLines: lines, costoReceta: costo, margenCalc: margen, utilidadCalc: (p.precio_venta || 0) - costo };
    });
  }, [productos, recetas]);

  // Sin inventario → no permitimos abrir el formulario (se mostraría un selector vacío
  // y el usuario quedaría atrapado). En su lugar avisamos y ofrecemos ir a Inventario.
  // IMPORTANTE: solo válido cuando la query de ingredientes ya terminó su primer fetch,
  // si no, mostraría "No hay inventario" falso mientras carga.
  const sinInventario = !cargandoInicial && ingredientes.length === 0;

  const openNew = () => {
    if (sinInventario) {
      toast.info('Primero registra al menos un ingrediente en Inventario.');
      return;
    }
    setEditProducto(null);
    setEditLines([]);
    setShowForm(true);
  };

  const openEdit = (producto) => {
    setEditProducto(producto);
    setEditLines(producto.recetaLines || []);
    setShowForm(true);
  };

  const handlePrint = () => window.print();

  const handleDeleteReceta = async (producto) => {
    try {
      // Eliminar líneas de receta
      const lines = recetas.filter(r => r.producto_id === producto.id);
      await Promise.all(lines.map(l => base44.entities.RecetaEscandallo.delete(l.id).catch(() => {})));
      // Retirar producto del catálogo (no borrar — preservar ventas históricas)
      await base44.entities.ProductoTerminado.update(producto.id, {
        activo: false,
        visible_en_pos: false,
        visible_en_menu_digital: false,
      });
      queryClient.invalidateQueries({ queryKey: ['recetas_all'] });
      queryClient.invalidateQueries({ queryKey: ['productos_all'] });
      queryClient.invalidateQueries({ queryKey: ['productos_pos'] });
      toast.success('Receta eliminada. El producto fue retirado del catálogo.');
    } catch (e) {
      toast.error('Error al eliminar: ' + (e?.message || ''));
    }
  };

  // Bloqueo de acceso por URL directa: solo roles con permiso ver_recetas.
  // Cocina NO debe entrar a Recetas (esconde costos, márgenes, gramajes).
  // Hecho DESPUÉS de todos los hooks para no violar rules-of-hooks.
  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recetas"
        description={canEdit
          ? 'Define y costea los productos que vendes'
          : 'Consulta los ingredientes y gramajes de cada receta'}
        actions={canEdit ? (
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva receta
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground">
            <Eye className="w-3.5 h-3.5" /> Solo lectura
          </span>
        )}
      />

      {/* Loading inicial: NO afirmamos "sin recetas" ni "sin inventario" hasta
          terminar el primer fetch. Esto previene el flash que asustaba al usuario
          haciéndole creer que el sistema borró sus datos. */}
      {cargandoInicial ? (
        <LoadingState label="Cargando recetas…" />
      ) : canEdit && sinInventario && productosConReceta.length === 0 ? (
        <Card className="p-8 text-center space-y-4 border-2 border-dashed">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <Package className="w-7 h-7 text-amber-600 dark:text-amber-300" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg">No hay inventario registrado todavía</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              Primero registra tus ingredientes o insumos en Inventario para poder
              crear recetas y calcular costos automáticamente.
            </p>
          </div>
          <Link to="/inventario">
            <Button className="gap-2">
              Ir a Inventario <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </Card>
      ) : productosConReceta.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Sin recetas"
          description={canEdit
            ? 'Crea tu primera receta para comenzar a definir productos'
            : 'Aún no hay recetas registradas en el sistema.'}
          action={canEdit
            ? <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" />Nueva receta</Button>
            : null}
        />
      ) : (
        <div className="space-y-2">
          {productosConReceta.map(p => (
            <div key={p.id} id={`receta-${p.id}`} ref={(el) => {
              // Scroll una sola vez al producto target
              if (el && targetProductoId === p.id && !scrolledRef.current) {
                scrolledRef.current = true;
                setTimeout(() => {
                  try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
                }, 200);
              }
            }}>
              <RecetaAccordionRow
                producto={p}
                marginLevel={getMarginLevel(p.margenCalc)}
                onEdit={canEdit ? openEdit : null}
                onPrint={handlePrint}
                onDelete={canEdit ? handleDeleteReceta : null}
                readOnly={!canEdit}
                defaultOpen={targetProductoId === p.id}
                ingredienteBase={p.ingrediente_base_id ? ingredientesById.get(p.ingrediente_base_id) : null}
              />
            </div>
          ))}
          {targetProductoId && !productosConReceta.find(p => p.id === targetProductoId) && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-800">
              Este producto no tiene receta asociada.
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <RecetaFormDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          productoToEdit={editProducto}
          recetaLinesToEdit={editLines}
          ingredientes={ingredientes}
          categorias={categorias}
        />
      )}
    </div>
  );
}
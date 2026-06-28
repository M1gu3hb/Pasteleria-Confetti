import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatCurrency, calculateMargin } from '@/utils/financialUtils';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingState from '@/components/common/LoadingState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tag, Search, Coffee, FileText, Printer, BookOpen, Plus, Pencil, ListChecks, Trash2 } from 'lucide-react';
import EliminarProductoDialog from '@/components/productos/EliminarProductoDialog';
import { useConfig } from '@/lib/ConfigContext';
import { useTerminal } from '@/lib/TerminalContext';
import ProductoDesglose from '@/components/productos/ProductoDesglose';
import ProductoSimpleDialog from '@/components/productos/ProductoSimpleDialog';
import FichaResumenVariable from '@/components/productos/FichaResumenVariable';
import { esProductoVariable, TIPO_VENTA } from '@/utils/tipoVentaUtils';
import { useIsDark } from '@/lib/ThemeContext';
import { PRODUCT_PLACEHOLDER_BG } from '@/lib/darkPalettes';
import { printDocument } from '@/lib/print';

export default function Productos() {
  const { config, paquete_modo } = useConfig();
  const { sucursalEfectiva } = useTerminal();
  const isDark = useIsDark();
  const placeholderBg = isDark ? PRODUCT_PLACEHOLDER_BG.dark : PRODUCT_PLACEHOLDER_BG.light;
  const isEsencial = paquete_modo === 'esencial';
  const showCostos = !isEsencial; // costos/utilidad/margen solo en Operativo y Pro
  const [search, setSearch] = useState('');
  const [showFicha, setShowFicha] = useState(false);
  const [fichaProducto, setFichaProducto] = useState(null);
  const [fichaLineas, setFichaLineas] = useState([]);
  const [showSimple, setShowSimple] = useState(false);
  const [editandoProducto, setEditandoProducto] = useState(null);
  const [productoAEliminar, setProductoAEliminar] = useState(null);
  const queryClient = useQueryClient();

  // No usar initialData:[] para que el render inicial muestre "Cargando" y no "vacío".
  const { data: recetas, isPending: recetasLoading } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => base44.entities.RecetaEscandallo.list('-created_date', 1000),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const { data: productos, isPending: productosLoading } = useQuery({
    queryKey: ['productos_all'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  // 6B / Hotfix visual — Cargamos ingredientes para resolver el ingrediente
  // base de los productos variables (necesario para calcular costo/utilidad/
  // margen por unidad vendible / porción). No bloquea el render: si aún no
  // llega, FichaResumenVariable muestra "—" en costo y aviso amable.
  const { data: ingredientes } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => base44.entities.Ingrediente.list('-created_date', 1000),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const safeRecetas = Array.isArray(recetas) ? recetas : [];
  const safeProductos = Array.isArray(productos) ? productos : [];
  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];
  const ingredientesById = useMemo(() => {
    const m = new Map();
    safeIngredientes.forEach(i => { if (i?.id) m.set(i.id, i); });
    return m;
  }, [safeIngredientes]);
  const cargandoInicial = (productosLoading && !productos) || (recetasLoading && !recetas);

  const enriched = useMemo(() => {
    return safeProductos.map(p => {
      const lines = safeRecetas.filter(r => r.producto_id === p.id && r.activo !== false);
      const costo = lines.reduce((s, l) => s + (l.costo_linea_calculado || 0), 0);
      const utilidad = (p.precio_venta || 0) - costo;
      const margen = calculateMargin(p.precio_venta, costo);
      return { ...p, recetaLines: lines, costoCalc: costo, utilidadCalc: utilidad, margenCalc: margen };
    });
  }, [safeProductos, safeRecetas]);

  // Fase 7 — Filtro por sucursal (productos por sucursal).
  // Empleado/Administrador con sucursal: ve globales (sucursal_ids vacío) +
  // los asignados a su sucursal. Dueño en vista general (sin sucursal): ve todo.
  // OJO: el ID real vive en sucursalEfectiva.sucursal_id (NO .id).
  const sucEfId = sucursalEfectiva?.sucursal_id || null;
  const porSucursal = useMemo(() => {
    if (!sucEfId) return enriched;
    return enriched.filter(p => {
      const ids = Array.isArray(p.sucursal_ids) ? p.sucursal_ids : [];
      return ids.length === 0 || ids.includes(sucEfId);
    });
  }, [enriched, sucEfId]);

  const filtered = porSucursal.filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const verFicha = (p) => {
    setFichaProducto(p);
    setFichaLineas(p.recetaLines || []);
    setShowFicha(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description={isEsencial ? "Catálogo del negocio" : "Catálogo generado a partir de las recetas"}
        actions={
          isEsencial ? (
            <Button size="sm" className="gap-2" onClick={() => { setEditandoProducto(null); setShowSimple(true); }}>
              <Plus className="w-4 h-4" /> Agregar producto
            </Button>
          ) : (
            <Link to="/recetas">
              <Button variant="outline" size="sm" className="gap-2">
                <BookOpen className="w-4 h-4" /> Ir a Recetas
              </Button>
            </Link>
          )
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="skeu-input pl-10" />
      </div>

      {cargandoInicial ? (
        <LoadingState label="Cargando productos…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin productos"
          description={isEsencial ? "Agrega tu primer producto" : "Crea productos desde la sección Recetas"}
          action={
            isEsencial
              ? <Button onClick={() => { setEditandoProducto(null); setShowSimple(true); }}><Plus className="w-4 h-4 mr-1" /> Agregar producto</Button>
              : <Link to="/recetas"><Button>Ir a Recetas</Button></Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => {
            // 6B / Hotfix visual — Detectar producto variable. Si lo es, NO mostramos
            // el grid genérico "Costo/Utilidad/Margen" (era engañoso porque calculaba
            // por receta fija). En su lugar mostramos FichaResumenVariable compact.
            const esVar = esProductoVariable(p);
            const ingBase = esVar ? ingredientesById.get(p.ingrediente_base_id) : null;
            // Color para importes monetarios (respeta toggle Identidad).
            const useMoneyColor = config?.colorear_importes_monetarios !== false;
            const priceColor = useMoneyColor ? 'text-primary' : 'text-foreground';
            // Datos del precio principal para variables.
            const varUnidad = esVar
              ? (p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
                  ? (p.unidad_variable || 'g')
                  : (p.nombre_porcion || 'porción'))
              : null;
            const varPrecio = esVar
              ? Number(p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
                  ? p.precio_por_unidad_variable
                  : p.precio_por_porcion) || 0
              : 0;
            return (
              <Card
                key={p.id}
                className={`skeu-card rounded-2xl overflow-hidden transition-all border-0 ${isEsencial ? '' : 'cursor-pointer'}`}
                onClick={() => { if (!isEsencial) verFicha(p); }}
              >
                <div className="h-32 flex items-center justify-center"
                  style={{ background: placeholderBg }}>
                  {p.imagen_url
                    ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
                    : <Coffee className={`w-12 h-12 ${isDark ? 'text-slate-500/50' : 'text-amber-700/30'}`} />}
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-heading font-semibold truncate">{p.nombre}</p>
                      {/* 6B Hotfix visual — Categoría + (si variable) badge + base inline,
                          compactos, para no crecer la card. */}
                      <p className="text-xs text-muted-foreground truncate">
                        {p.categoria_nombre || 'Sin categoría'}
                      </p>
                      {esVar && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 h-4 bg-primary/10 text-primary border-primary/30"
                          >
                            {p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ? 'Variable por medida' : 'Por porción'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {p.ingrediente_base_nombre || ingBase?.nombre || '—'}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Precio principal — variables muestran "$X / unidad", normales muestran precio plano.
                        Mismo lugar, misma jerarquía visual. Respeta colorear_importes_monetarios. */}
                    {esVar ? (
                      <div className="shrink-0 text-right">
                        <p className={`font-heading font-black text-lg leading-tight ${priceColor}`}>
                          {formatCurrency(varPrecio)}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">/ {varUnidad}</p>
                      </div>
                    ) : (
                      <p className={`font-heading font-black text-lg shrink-0 ${priceColor}`}>
                        {formatCurrency(p.precio_venta)}
                      </p>
                    )}
                  </div>

                  {showCostos && esVar && (
                    // Mismo grid 3-cols que productos normales (mismo tamaño visual).
                    <FichaResumenVariable
                      producto={p}
                      ingrediente={ingBase}
                      variant="card"
                      coloresMonetarios={useMoneyColor}
                    />
                  )}

                  {p.descripcion && isEsencial && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    {!p.visible_en_pos
                      ? <Badge variant="secondary" className="text-[10px]">Oculto en POS</Badge>
                      : <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">En POS</Badge>}
                    <div className="flex items-center gap-0.5 ml-auto">
                      {/* Botón "Opciones" / Modificadores eliminado en Confetti (no se usa). */}
                      {!isEsencial && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); verFicha(p); }}>
                          <FileText className="w-3 h-3" /> Ficha
                        </Button>
                      )}
                      {isEsencial && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); setEditandoProducto(p); setShowSimple(true); }}>
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm"
                        className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); setProductoAEliminar(p); }}>
                        <Trash2 className="w-3 h-3" /> Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* SIMPLE PRODUCT DIALOG (solo Esencial) */}
      <ProductoSimpleDialog
        open={showSimple}
        onClose={() => { setShowSimple(false); setEditandoProducto(null); }}
        producto={editandoProducto}
      />

      {/* ELIMINAR PRODUCTO — borrado real en cascada (POS + web pública) */}
      <EliminarProductoDialog
        open={!!productoAEliminar}
        onClose={() => setProductoAEliminar(null)}
        producto={productoAEliminar}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ['productos_all'] });
          setProductoAEliminar(null);
        }}
      />

      {/* FICHA DIALOG */}
      <Dialog open={showFicha} onOpenChange={setShowFicha}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Ficha del producto</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-2">
            <ProductoDesglose
              producto={fichaProducto}
              lineas={fichaLineas}
              config={config}
              ingredienteBase={fichaProducto?.ingrediente_base_id ? ingredientesById.get(fichaProducto.ingrediente_base_id) : null}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFicha(false)}>Cerrar</Button>
            <Button onClick={() => {
              try {
                printDocument({ mode: 'letter', title: `Ficha-${fichaProducto?.nombre || 'producto'}` });
              } catch (err) {
                console.error('[Productos] imprimir ficha:', err);
              }
            }}>
              <Printer className="w-4 h-4 mr-1" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
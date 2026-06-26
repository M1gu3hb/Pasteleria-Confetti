import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/utils/financialUtils';
import { getStockStatus, calculateInventoryValue } from '@/utils/inventoryUtils';
import { StockStatusBadge } from '@/components/common/StatusBadge';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingState from '@/components/common/LoadingState';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { Search, Package, Trash2, PackagePlus, ShoppingBag, Sliders } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import RegistrarInventarioInicialDialog from '@/components/inventario/RegistrarInventarioInicialDialog';
import AjustarStockDialog from '@/components/inventario/AjustarStockDialog';
// NOTA: IngredienteContenedorDialog se movió al flujo "Ajustar stock" y
// "Registrar inventario existente". Ya no se invoca desde la fila.

/**
 * Formatea un valor de stock para mostrar en lista:
 *   - g  → "1500 g (1.5 kg)" cuando el valor es grande
 *   - ml → "2000 ml (2 l)"  cuando el valor es grande
 *   - pieza → "12 piezas"
 * Si el número es chico (< 1000), solo unidad base sin paréntesis para no ensuciar.
 */
function formatStockEnUnidad(valor, unidadBase) {
  const v = Number(valor) || 0;
  const fixed = v.toLocaleString();
  if (unidadBase === 'g' && v >= 1000) {
    const kg = parseFloat((v / 1000).toFixed(3));
    return <>{fixed} <span className="text-xs font-normal text-muted-foreground">g</span> <span className="text-xs font-normal text-muted-foreground">({kg} kg)</span></>;
  }
  if (unidadBase === 'ml' && v >= 1000) {
    const l = parseFloat((v / 1000).toFixed(3));
    return <>{fixed} <span className="text-xs font-normal text-muted-foreground">ml</span> <span className="text-xs font-normal text-muted-foreground">({l} l)</span></>;
  }
  return <>{fixed} <span className="text-xs font-normal text-muted-foreground">{unidadBase}</span></>;
}

/** Misma idea para el subtítulo Min/Crit, en una sola línea compacta. */
function formatUmbral(valor, unidadBase) {
  const v = Number(valor) || 0;
  if (v <= 0) return `0 ${unidadBase}`;
  if (unidadBase === 'g' && v >= 1000) {
    const kg = parseFloat((v / 1000).toFixed(3));
    return `${v.toLocaleString()} g (${kg} kg)`;
  }
  if (unidadBase === 'ml' && v >= 1000) {
    const l = parseFloat((v / 1000).toFixed(3));
    return `${v.toLocaleString()} ml (${l} l)`;
  }
  return `${v.toLocaleString()} ${unidadBase}`;
}

export default function Inventario() {
  const queryClient = useQueryClient();
  const { posUser } = usePOSAuth();
  const isAdmin = posUser?.rol === 'administrador';
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showInvInicial, setShowInvInicial] = useState(false);
  const [ajustarIng, setAjustarIng] = useState(null);
  // 6B / 1.C — La config de "contenedor" ahora vive dentro de "Ajustar stock"
  // y de "Registrar inventario existente" (UI más limpia en la fila/card).

  // Sin initialData:[] para distinguir loading inicial de "vacío real".
  const { data: ingredientes, isPending: ingLoading } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => base44.entities.Ingrediente.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];
  const cargandoInv = ingLoading && !ingredientes;

  const { data: recetasAll = [] } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => base44.entities.RecetaEscandallo.list('-created_date', 2000),
    initialData: [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_ingrediente'],
    queryFn: () => base44.entities.CategoriaIngrediente.filter({ activo: true }),
    initialData: [],
  });

  // Descuentos de hoy → "Consumido hoy" por ingrediente
  const { data: descuentosHoy = [] } = useQuery({
    queryKey: ['descuentos_hoy'],
    queryFn: () => base44.entities.DescuentoInventarioVenta.list('-created_date', 1000),
    initialData: [],
    refetchInterval: 8000,
  });

  const consumoHoyMap = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = {};
    descuentosHoy.forEach(d => {
      const f = (d.fecha || d.created_date || '').slice(0, 10);
      if (f !== today) return;
      map[d.ingrediente_id] = (map[d.ingrediente_id] || 0) + (d.cantidad_total_descontada || 0);
    });
    return map;
  }, [descuentosHoy]);

  const enriched = useMemo(() => {
    return safeIngredientes.map(i => ({
      ...i,
      stockStatus: getStockStatus(i),
      valorInventario: calculateInventoryValue(i),
      // Resolvemos el nombre de categoría SOLO si realmente tiene una.
      // Antes mostrábamos "Sin categoría" en cada tarjeta — ruido visual sin valor.
      categoriaNombre: categorias.find(c => c.id === i.categoria_id)?.nombre || '',
      consumidoHoy: consumoHoyMap[i.id] || 0,
    }));
  }, [safeIngredientes, categorias, consumoHoyMap]);

  const filtered = useMemo(() => {
    return enriched.filter(i => {
      const matchSearch = !search || i.nombre.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || i.stockStatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [enriched, search, filterStatus]);

  const totalValue = enriched.reduce((s, i) => s + i.valorInventario, 0);
  const criticalCount = enriched.filter(i => ['critico', 'agotado'].includes(i.stockStatus)).length;

  const ingredienteEnUso = (ing) => recetasAll.some(r => r.ingrediente_id === ing.id && r.activo !== false);

  const desactivarIngrediente = async (ing) => {
    await base44.entities.Ingrediente.update(ing.id, { activo: false });
    queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
    toast.success(`${ing.nombre} desactivado`);
    setConfirmDelete(null);
  };

  const eliminarIngrediente = async (ing) => {
    // Verificar movimientos
    const movs = await base44.entities.MovimientoInventario.filter({ ingrediente_id: ing.id }).catch(() => []);
    if (movs.length > 0) {
      toast.error(`No se puede eliminar: tiene ${movs.length} movimientos en historial. Mejor desactivar.`);
      return;
    }
    await base44.entities.Ingrediente.delete(ing.id);
    queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
    toast.success(`${ing.nombre} eliminado`);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        description="Ingredientes e insumos"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInvInicial(true)}
              className="gap-1.5"
              title="Cargar inventario que ya tenías antes de usar el POS"
            >
              <PackagePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Registrar inventario existente</span>
              <span className="sm:hidden">Inv. inicial</span>
            </Button>
            <Link to="/compras">
              <Button size="sm" className="gap-1.5">
                <ShoppingBag className="w-4 h-4" />
                Registrar compra
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="premium-sheen p-4">
          <p className="text-xs text-muted-foreground">Total ingredientes</p>
          <p className="text-2xl font-heading font-bold">{safeIngredientes.length}</p>
        </Card>
        <Card className="premium-sheen p-4">
          <p className="text-xs text-muted-foreground">Valor de inventario</p>
          <p className="text-2xl font-heading font-bold">{formatCurrency(totalValue)}</p>
        </Card>
        <Card className="premium-sheen p-4">
          <p className="text-xs text-muted-foreground">Alertas críticas</p>
          <p className="text-2xl font-heading font-bold text-destructive">{criticalCount}</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar ingrediente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="suficiente">Suficiente</SelectItem>
            <SelectItem value="medio">Medio</SelectItem>
            <SelectItem value="bajo">Bajo</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
            <SelectItem value="agotado">Agotado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cargandoInv ? (
        <LoadingState label="Cargando inventario…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aún no tienes inventario"
          description="Si tu restaurante ya tenía insumos antes de usar el sistema, registra el inventario existente. Si vas a comprar nuevo, registra una compra."
          action={
            <div className="flex gap-2 flex-wrap justify-center">
              <Button onClick={() => setShowInvInicial(true)} variant="default" className="gap-1.5">
                <PackagePlus className="w-4 h-4" /> Registrar inventario existente
              </Button>
              <Link to="/compras">
                <Button variant="outline" className="gap-1.5">
                  <ShoppingBag className="w-4 h-4" /> Registrar compra
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(ing => (
            <Card key={ing.id} className="premium-sheen p-3 sm:p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm truncate">{ing.nombre}</p>
                    <StockStatusBadge status={ing.stockStatus} />
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground flex-wrap">
                    {/* Solo mostramos categoría si REALMENTE tiene una asignada.
                        Antes aparecía "Sin categoría" en cada tarjeta — ruido visual. */}
                    {ing.categoriaNombre && <span>{ing.categoriaNombre}</span>}
                    <span>Costo: {formatCurrency(ing.costo_por_unidad_base)}/{ing.unidad_base}</span>
                    <span>Valor: {formatCurrency(ing.valorInventario)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-heading font-bold">
                    {formatStockEnUnidad(ing.stock_actual, ing.unidad_base)}
                  </p>
                  {ing.consumidoHoy > 0 && (
                    <p className="text-base font-heading font-bold text-red-600">
                      −{Number(ing.consumidoHoy).toLocaleString()} <span className="text-xs">{ing.unidad_base}</span>
                      <span className="ml-1 text-[10px] font-normal text-red-500">hoy</span>
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Min: {formatUmbral(ing.stock_minimo, ing.unidad_base)}
                    {' · '}
                    Crit: {formatUmbral(ing.stock_critico, ing.unidad_base)}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs"
                      onClick={() => setAjustarIng(ing)} title="Ajustar stock (merma, conteo físico, corrección). Aquí también configuras 'contenedor'.">
                      <Sliders className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Ajustar</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDelete(ing)} title="Eliminar / desactivar">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: registrar inventario inicial / existente (sin crear compra) */}
      <RegistrarInventarioInicialDialog
        open={showInvInicial}
        onClose={() => setShowInvInicial(false)}
        ingredientes={safeIngredientes}
      />

      {/* Modal: ajustar stock (merma, conteo físico, corrección). No crea compra/gasto/venta. */}
      <AjustarStockDialog
        open={!!ajustarIng}
        onClose={() => setAjustarIng(null)}
        ingrediente={ajustarIng}
      />

      {/* La configuración de contenedor ahora vive dentro de "Ajustar stock"
          y de "Registrar inventario existente". No hay diálogo standalone. */}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar / desactivar ingrediente</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {confirmDelete && ingredienteEnUso(confirmDelete) && (
                <span className="block text-amber-700 font-medium">
                  ⚠ "{confirmDelete?.nombre}" se usa en recetas activas. Si lo eliminas, esas recetas pueden quedar incompletas.
                </span>
              )}
              <span className="block">
                Recomendamos <strong>desactivar</strong> para conservar el historial financiero.
              </span>
              <span className="block text-xs text-muted-foreground">
                Eliminar definitivamente solo es posible si el ingrediente no tiene movimientos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmDelete && desactivarIngrediente(confirmDelete)}>
              Desactivar
            </Button>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmDelete && eliminarIngrediente(confirmDelete); }}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
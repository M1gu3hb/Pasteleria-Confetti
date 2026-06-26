import React, { useState } from 'react';
import { ChevronDown, Pencil, Printer, Trash2, Info } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { MARGIN_CONFIG } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { esProductoVariable, TIPO_VENTA, mlPorPorcionEfectivo } from '@/utils/tipoVentaUtils';
import FichaResumenVariable from '@/components/productos/FichaResumenVariable';
import { useConfig } from '@/lib/ConfigContext';
import { getMarginLevel } from '@/utils/financialUtils';

export default function RecetaAccordionRow({
  producto,
  marginLevel,
  onEdit,
  onPrint,
  onDelete,
  readOnly = false,
  defaultOpen = false,
  ingredienteBase = null,
}) {
  const { config } = useConfig();
  const useMoneyColor = config?.colorear_importes_monetarios !== false;
  const priceColor = useMoneyColor ? 'text-primary' : 'text-foreground';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [open, setOpen] = useState(!!defaultOpen);

  // Si cambia defaultOpen (p. ej. navegamos a Recetas?producto=X) abrir automáticamente.
  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const cfg = MARGIN_CONFIG[marginLevel];
  const lines = producto.recetaLines || [];
  const totalCosto = producto.costoReceta || 0;
  // 6B / Hotfix visual — Para productos variables (variable_medida o porcion_contenedor)
  // el escandallo clásico no aplica: el costo/utilidad/margen reales viven en
  // FichaResumenVariable por unidad vendible o por porción.
  const esVar = esProductoVariable(producto);

  // === Métricas por unidad vendible (para cabecera variable) ===
  // Mismo cálculo que FichaResumenVariable pero inline para mostrar las 4
  // mini-cajas en la cabecera del acordeón (igual que Productos).
  let varMetrics = null;
  if (esVar) {
    const costoBase = Number(ingredienteBase?.costo_por_unidad_base) || 0;
    if (producto.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA) {
      const u = producto.unidad_variable || 'g';
      const factor = (u === 'kg' || u === 'l') ? 1000 : 1;
      const precio = Number(producto.precio_por_unidad_variable) || 0;
      const costoUnit = costoBase > 0 ? costoBase * factor : 0;
      const hay = costoUnit > 0;
      const util = hay ? precio - costoUnit : 0;
      const marg = (hay && precio > 0) ? (util / precio) * 100 : 0;
      varMetrics = { u, precio, costo: costoUnit, util, marg, hay };
    } else {
      const np = producto.nombre_porcion || 'porción';
      const mlPorcion = mlPorPorcionEfectivo({
        ml_por_porcion: producto.ml_por_porcion,
        capacidad_contenedor_ml: producto.capacidad_contenedor_ml,
        porciones_por_contenedor: producto.porciones_por_contenedor,
      });
      const precio = Number(producto.precio_por_porcion) || 0;
      const costoUnit = (costoBase > 0 && mlPorcion > 0) ? costoBase * mlPorcion : 0;
      const hay = costoUnit > 0;
      const util = hay ? precio - costoUnit : 0;
      const marg = (hay && precio > 0) ? (util / precio) * 100 : 0;
      varMetrics = { u: np, precio, costo: costoUnit, util, marg, hay };
    }
  }
  const margenColor = (m) =>
    m >= 60 ? 'text-emerald-700 dark:text-emerald-300'
    : m >= 40 ? 'text-yellow-700 dark:text-yellow-300'
    : 'text-red-700 dark:text-red-300';

  return (
    <Card
      className="overflow-hidden transition-shadow hover:shadow-md"
      style={{
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 2px 6px rgba(0,0,0,0.06)',
      }}
    >
      {/* Cabecera (resumen) */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 flex items-center gap-4 flex-wrap text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-heading font-semibold">{producto.nombre}</p>
            {esVar && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                {producto.tipo_venta === 'variable_medida' ? 'Variable por medida' : 'Por porción'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {producto.categoria_nombre || 'Sin categoría'}
            {esVar
              ? ` · ${producto?.ingrediente_base_nombre || ingredienteBase?.nombre || 'Ingrediente base'}`
              : ` · ${lines.length} ingredientes`}
          </p>
        </div>

        {/* Métricas cabecera: grid con columnas de ANCHO FIJO (no fr) para que TODAS
            las filas queden perfectamente alineadas, independientemente del texto
            del badge ("Margen alto" / "aceptable" / "bajo"). El badge de margen
            tiene su columna reservada de 180px y se centra dentro. */}
        <div
          className="hidden sm:grid gap-2 shrink-0"
          style={{ gridTemplateColumns: '120px 120px 120px 180px' }}
        >
          {!esVar ? (
            <>
              <div className="text-center px-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Precio</p>
                <p className={`font-heading font-bold ${priceColor}`}>{formatCurrency(producto.precio_venta)}</p>
              </div>
              <div className="text-center px-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Costo</p>
                <p className="font-heading font-bold text-orange-600">{formatCurrency(totalCosto)}</p>
              </div>
              <div className="text-center px-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Utilidad</p>
                <p className="font-heading font-bold text-emerald-600">{formatCurrency(producto.utilidadCalc)}</p>
              </div>
              <div className="flex items-center justify-center px-1">
                <Badge
                  variant="outline"
                  className={`${cfg.bg} ${cfg.color} border-0 w-full justify-center whitespace-nowrap`}
                >
                  {formatPercent(producto.margenCalc)} · {cfg.label}
                </Badge>
              </div>
            </>
          ) : varMetrics ? (
            <>
              <div className="text-center px-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">Precio / {varMetrics.u}</p>
                <p className={`font-heading font-bold ${priceColor}`}>{formatCurrency(varMetrics.precio)}</p>
              </div>
              <div className="text-center px-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">Costo / {varMetrics.u}</p>
                <p className="font-heading font-bold text-orange-600">
                  {varMetrics.hay ? formatCurrency(varMetrics.costo) : '—'}
                </p>
              </div>
              <div className="text-center px-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">Utilidad / {varMetrics.u}</p>
                <p className="font-heading font-bold text-emerald-600">
                  {varMetrics.hay ? formatCurrency(varMetrics.util) : '—'}
                </p>
              </div>
              <div className="flex items-center justify-center px-1">
                {varMetrics.hay ? (() => {
                  const lv = getMarginLevel(varMetrics.marg);
                  const c = MARGIN_CONFIG[lv];
                  return (
                    <Badge
                      variant="outline"
                      className={`${c.bg} ${c.color} border-0 w-full justify-center whitespace-nowrap`}
                    >
                      {formatPercent(varMetrics.marg)} · {c.label}
                    </Badge>
                  );
                })() : (
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Margen</p>
                    <p className="font-heading font-bold text-muted-foreground">—</p>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white border shrink-0 transition-transform"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 4px rgba(0,0,0,0.08)',
          }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </div>
      </button>

      {/* Contenido expandido */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1 border-t bg-muted/20 space-y-4">
            {esVar ? (
              <>
                <FichaResumenVariable
                  producto={producto}
                  ingrediente={ingredienteBase}
                  variant="full"
                  coloresMonetarios={useMoneyColor}
                />
                {lines.length > 0 && (
                  <div className="rounded-lg bg-muted/40 border px-3 py-2 flex items-start gap-2">
                    <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground">
                      Este producto usa <strong>venta variable</strong>. El escandallo clásico
                      no se usa mientras este tipo de venta esté activo. (No se borraron las
                      líneas anteriores; solo se ignoran visualmente.)
                    </p>
                  </div>
                )}
              </>
            ) : lines.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Sin ingredientes capturados todavía.
              </div>
            ) : (
              <>
                <div className="rounded-xl overflow-hidden border bg-white">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground bg-muted/50">
                    <div className="col-span-4">Ingrediente</div>
                    <div className="col-span-2 text-right">Cantidad</div>
                    <div className="col-span-2">Unidad</div>
                    <div className="col-span-2 text-right">Costo unit.</div>
                    <div className="col-span-2 text-right">Costo línea</div>
                  </div>
                  {lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-t">
                      <div className="col-span-4 truncate">{l.ingrediente_nombre}</div>
                      <div className="col-span-2 text-right">{l.cantidad_usada}</div>
                      <div className="col-span-2 text-muted-foreground">{l.unidad_usada}</div>
                      <div className="col-span-2 text-right text-muted-foreground">
                        {formatCurrency(l.costo_unitario_base_snapshot)}
                      </div>
                      <div className="col-span-2 text-right font-medium">
                        {formatCurrency(l.costo_linea_calculado)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Costo producción" value={formatCurrency(totalCosto)} color="text-orange-600" />
                  <Stat label="Precio venta" value={formatCurrency(producto.precio_venta)} />
                  <Stat label="Utilidad" value={formatCurrency(producto.utilidadCalc)} color="text-emerald-600" />
                  <Stat label="Margen" value={formatPercent(producto.margenCalc)} />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => onPrint?.(producto)}>
                <Printer className="w-4 h-4 mr-1" /> Imprimir ficha
              </Button>
              {!readOnly && onEdit && (
                <Button size="sm" onClick={() => onEdit?.(producto)}>
                  <Pencil className="w-4 h-4 mr-1" /> Editar receta
                </Button>
              )}
              {!readOnly && onDelete && (
                <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Eliminar receta
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar receta de "{producto.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Esto eliminará la receta y retirará el producto del catálogo (POS / Mesero).</span>
              <span className="block text-xs">No se borran ingredientes del inventario ni ventas históricas.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { onDelete(producto); setConfirmOpen(false); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value, color }) {
  return (
    <div
      className="p-3 rounded-xl bg-white border text-center"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-heading font-bold ${color || ''}`}>{value}</p>
    </div>
  );
}
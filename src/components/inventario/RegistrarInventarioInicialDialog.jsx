import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, PackagePlus, Info } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { formatCurrency } from '@/utils/financialUtils';
import { calculateCostPerBaseUnit } from '@/utils/unitConversions';
import {
  getUnidadesCompra, UNIDADES_BASE,
  esUnidadEstandar, validarCompatibilidad,
  convertirAUnidadBase, canonicalUnidad,
} from '@/utils/unidadesMedida';
import IngredienteAutocomplete from '@/components/recetas/IngredienteAutocomplete';
import { normalizarNombreIngrediente, construirMapaIngredientes } from '@/utils/ingredienteMatcher';
import StockMinCritInput from '@/components/inventario/StockMinCritInput';
import IngredienteContenedorSection, {
  hidratarValorContenedor,
  construirPayloadContenedor,
} from '@/components/inventario/IngredienteContenedorSection';

/**
 * REGISTRAR INVENTARIO EXISTENTE / INICIAL
 * ----------------------------------------
 * Caso de uso: un restaurante que empieza a usar el POS ya tiene insumos
 * en su cocina/bodega. No queremos obligarlo a inventar una "compra" para
 * cargar el stock inicial.
 *
 * Diferencia clave con "Registrar compra":
 *  - NO crea CompraInsumo
 *  - NO crea DetalleCompra
 *  - NO aparece en Compras del día ni en reportes financieros de gasto
 *  - SÍ crea/actualiza Ingrediente
 *  - SÍ crea MovimientoInventario tipo `ajuste_manual` con motivo "Inventario inicial"
 *    y referencia_tipo "inventario_inicial" (trazabilidad sin tocar schema)
 *  - SÍ calcula costo por unidad base de forma idéntica a una compra
 *
 * NO toca: ventas, caja, cortes, propinas, tickets, PDFs.
 */
export default function RegistrarInventarioInicialDialog({ open, onClose, ingredientes = [] }) {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const unidadesCompra = useMemo(() => getUnidadesCompra(config), [config]);

  function emptyLine() {
    return {
      tipo: 'existente', // 'existente' | 'nuevo'
      ingrediente: null,
      nuevo_nombre: '',
      nuevo_unidad_base: 'g',
      cantidad: '',
      unidad_compra: 'kg',
      costo_total: '',
      piezas_por_paquete: '',
      stock_minimo: '',
      stock_critico: '',
      // Configuración opcional de "contenedor" — solo aplica si tipo === 'nuevo'.
      // Por defecto apagado y discreto al final del formulario.
      contenedor: hidratarValorContenedor(null),
    };
  }

  const reset = () => {
    setLines([emptyLine()]);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const updateLine = (idx, patch) => {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx) =>
    setLines(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const handleSelectExistente = (idx, ing) => {
    updateLine(idx, {
      ingrediente: ing,
      tipo: 'existente',
      unidad_compra: ing?.unidad_compra_default || 'kg',
    });
  };
  const handleCreateNew = (idx, query) => {
    updateLine(idx, { tipo: 'nuevo', ingrediente: null, nuevo_nombre: query });
  };

  const totalEstimado = lines.reduce((s, l) => s + (parseFloat(l.costo_total) || 0), 0);

  // Una unidad requiere "equivalencia" cuando NO es estándar (kg/g/litro/ml/pieza/alias),
  // o cuando es un empaque conocido (caja/paquete/bolsa/unidad).
  // Para esos casos pedimos cuánto trae cada unidad en unidad base.
  const requiereEquivalencia = (u) => {
    const canon = canonicalUnidad(u);
    if (canon === 'kg' || canon === 'g' || canon === 'litro' || canon === 'ml') return false;
    // 'pieza' canónica directa no requiere equivalencia.
    if (canon === 'pieza') {
      // Pero los alias de empaque que mapean a pieza (caja/paquete/bolsa) NO existen
      // en ALIAS_MAP. Aquí canon === 'pieza' significa pieza/piezas/pza/unidad — directos.
      return false;
    }
    return true; // personalizada o empaque (caja/paquete/bolsa)
  };

  const handleSave = async () => {
    // Pre-validación por línea: ingrediente / nombre + cantidad + costo + equivalencia si aplica.
    // Además: compatibilidad entre unidad capturada y unidad base del ingrediente.
    const validLines = [];
    for (const l of lines) {
      const tieneIng = l.tipo === 'existente' ? !!l.ingrediente : !!String(l.nuevo_nombre || '').trim();
      if (!tieneIng) continue;
      const cantOk = parseFloat(l.cantidad) > 0;
      const costoOk = parseFloat(l.costo_total) > 0;
      if (!cantOk || !costoOk) continue;

      // Equivalencia obligatoria si la unidad NO es estándar directa.
      if (requiereEquivalencia(l.unidad_compra) && !(parseFloat(l.piezas_por_paquete) > 0)) {
        toast.error(`Falta indicar a cuánto equivale 1 ${l.unidad_compra} en unidad base.`);
        return;
      }

      // Compatibilidad unidad capturada ↔ unidad base del ingrediente.
      const unidadBase = l.tipo === 'existente' ? l.ingrediente?.unidad_base : l.nuevo_unidad_base;
      const { compatible, mensaje } = validarCompatibilidad(l.unidad_compra, unidadBase);
      if (!compatible) {
        toast.error(mensaje || 'La unidad seleccionada no es compatible con la unidad base.');
        return;
      }

      validLines.push(l);
    }

    if (validLines.length === 0) {
      toast.error('Agrega al menos una línea válida con cantidad y costo.');
      return;
    }

    setSaving(true);
    let exitosos = 0;
    let fallidos = 0;
    let primerErrorMsg = '';

    // Para detectar duplicados contra ingredientes inactivos también:
    let baseList = ingredientes;
    try {
      const all = await base44.entities.Ingrediente.list('-created_date', 5000);
      if (Array.isArray(all) && all.length > 0) baseList = all;
    } catch {}

    // MAPA EN-VUELO: detecta duplicados entre líneas de la misma operación
    // (ej. Línea 1 = "Pan", Línea 2 = "PAN", Línea 3 = "Pán" → mismo ingrediente).
    const mapaIng = construirMapaIngredientes(baseList);

    try {
      for (const line of validLines) {
        let ing = line.ingrediente;
        // Snapshot del estado anterior del ingrediente — necesario para rollback si falla
        // MovimientoInventario después de haber actualizado el ingrediente.
        let snapshotPrevio = null;
        // Si creamos el ingrediente nuevo en esta iteración, lo marcamos para limpiar
        // en caso de que el movimiento falle.
        let creadoEnEstaIteracion = false;

        try {
          // Si el usuario seleccionó "existente" desde autocomplete y otra línea
          // anterior ya tocó el mismo ingrediente, usamos la versión actualizada del mapa.
          if (ing) {
            const k = normalizarNombreIngrediente(ing.nombre);
            if (k && mapaIng.has(k)) ing = mapaIng.get(k);
          }

          // 1) Línea "nueva". ANTI-DUPLICADO con mapa en-vuelo:
          //    detecta variantes normalizadas y duplicados entre líneas + inactivos.
          if (line.tipo === 'nuevo') {
            const key = normalizarNombreIngrediente(line.nuevo_nombre);
            const yaExiste = key ? mapaIng.get(key) : null;
            if (yaExiste) {
              try {
                const fresco = await base44.entities.Ingrediente.get(yaExiste.id);
                ing = fresco || yaExiste;
              } catch {
                ing = yaExiste;
              }
              // BLOQUEAR y avisar: no reactivamos silenciosamente.
              if (ing && ing.activo === false) {
                toast.error(
                  `"${ing.nombre}" existe pero está desactivado. Reactívalo desde Inventario o cambia el nombre.`
                );
                throw new Error(`Ingrediente "${ing.nombre}" desactivado — línea cancelada.`);
              }
              toast.info(`"${String(line.nuevo_nombre || '').trim()}" ya existía — sumando al ingrediente existente.`);
            } else {
              // Si el usuario activó "Es contenedor", validamos y agregamos
              // los metadatos de contenedor al create. Si no, queda como 'normal'.
              const createPayload = {
                nombre: String(line.nuevo_nombre || '').trim(),
                unidad_base: line.nuevo_unidad_base,
                unidad_compra_default: line.unidad_compra,
                stock_actual: 0,
                stock_minimo: parseFloat(line.stock_minimo) || 0,
                stock_critico: parseFloat(line.stock_critico) || 0,
                activo: true,
              };
              if (line.contenedor?.esContenedor) {
                const r = construirPayloadContenedor(line.contenedor);
                if (!r.ok) {
                  toast.error(`"${createPayload.nombre}": ${r.error}`);
                  throw new Error(r.error);
                }
                Object.assign(createPayload, r.payload);
              }
              ing = await base44.entities.Ingrediente.create(createPayload);
              creadoEnEstaIteracion = true;
            }
          }
          if (!ing) continue;

          // 2) Capturar snapshot ANTES de mutar el ingrediente — necesario para rollback.
          snapshotPrevio = {
            stock_actual: ing.stock_actual ?? 0,
            costo_por_unidad_base: ing.costo_por_unidad_base ?? 0,
            costo_compra_default: ing.costo_compra_default ?? 0,
            unidad_compra_default: ing.unidad_compra_default ?? '',
            cantidad_por_compra_default: ing.cantidad_por_compra_default ?? 0,
            stock_minimo: ing.stock_minimo ?? 0,
            stock_critico: ing.stock_critico ?? 0,
          };

          const qty = parseFloat(line.cantidad) || 0;
          const cost = parseFloat(line.costo_total) || 0;
          const equivalencia = parseFloat(line.piezas_por_paquete) || 1;

          // Helper central: convierte cualquier alias estándar (kg, kilogramos, l, lt, …)
          // o unidad personalizada (con equivalencia) a la unidad base correcta.
          const qtyBase = convertirAUnidadBase(qty, line.unidad_compra, equivalencia);
          const costPerBase = calculateCostPerBaseUnit(cost, qtyBase);

          const oldStock = snapshotPrevio.stock_actual;
          const oldCost = snapshotPrevio.costo_por_unidad_base;
          const newStock = oldStock + qtyBase;
          // Costo ponderado (igual a compras): conserva la base de costo histórica si ya había stock.
          const newAvgCost = newStock > 0
            ? ((oldStock * oldCost) + (qtyBase * costPerBase)) / newStock
            : costPerBase;

          // Construimos payload de actualización
          const updatePayload = {
            stock_actual: newStock,
            costo_por_unidad_base: Math.round(newAvgCost * 10000) / 10000,
            costo_compra_default: cost / qty,
            unidad_compra_default: line.unidad_compra,
            cantidad_por_compra_default: qty,
          };
          const stockMinLinea = parseFloat(line.stock_minimo);
          const stockCritLinea = parseFloat(line.stock_critico);
          if (Number.isFinite(stockMinLinea) && stockMinLinea > 0 && !(ing.stock_minimo > 0)) {
            updatePayload.stock_minimo = stockMinLinea;
          }
          if (Number.isFinite(stockCritLinea) && stockCritLinea > 0 && !(ing.stock_critico > 0)) {
            updatePayload.stock_critico = stockCritLinea;
          }

          // 3) Actualizar Ingrediente
          await base44.entities.Ingrediente.update(ing.id, updatePayload);

          // Refrescar mapa en-vuelo para que próximas líneas con el mismo
          // nombre normalizado acumulen sobre los valores NUEVOS, no los iniciales.
          const keyAct = normalizarNombreIngrediente(ing.nombre);
          if (keyAct) mapaIng.set(keyAct, { ...ing, ...updatePayload });

          // 4) Movimiento OBLIGATORIO. Si falla, hacemos rollback.
          try {
            await base44.entities.MovimientoInventario.create({
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              tipo_movimiento: 'ajuste_manual',
              cantidad: qtyBase,
              unidad_base: ing.unidad_base,
              stock_anterior: oldStock,
              stock_nuevo: newStock,
              costo_unitario_en_momento: costPerBase,
              costo_total_movimiento: cost,
              referencia_tipo: 'inventario_inicial',
              referencia_id: '',
              motivo: 'Inventario inicial / existente',
              usuario_id: posUser?.id,
              usuario_nombre: posUser?.nombre,
              fecha: new Date().toISOString(),
            });
            exitosos++;
          } catch (movErr) {
            // ROLLBACK: el movimiento es obligatorio para trazabilidad.
            console.error('[RegistrarInventarioInicialDialog] MovimientoInventario falló — rollback:', movErr);
            if (creadoEnEstaIteracion) {
              // Era ingrediente nuevo: intentar eliminarlo. Si no se puede, desactivarlo.
              let limpiado = false;
              try {
                await base44.entities.Ingrediente.delete(ing.id);
                limpiado = true;
              } catch {
                try {
                  await base44.entities.Ingrediente.update(ing.id, { activo: false });
                  limpiado = true;
                } catch {}
              }
              if (!limpiado) {
                console.error('[RegistrarInventarioInicialDialog] no se pudo limpiar ingrediente nuevo huérfano:', ing.id);
              }
            } else {
              // Ya existía: revertir TODOS los campos modificados a su valor previo.
              try {
                await base44.entities.Ingrediente.update(ing.id, snapshotPrevio);
              } catch (rollbackErr) {
                console.error('[RegistrarInventarioInicialDialog] rollback de ingrediente falló:', rollbackErr);
              }
            }
            fallidos++;
            if (!primerErrorMsg) {
              primerErrorMsg = `${ing.nombre || line.nuevo_nombre || 'línea'}: no se pudo registrar el movimiento`;
            }
          }
        } catch (lineErr) {
          // Error fuera del bloque movimiento (creación de ingrediente o update fallaron).
          console.error('[RegistrarInventarioInicialDialog] error en línea:', lineErr);
          fallidos++;
          if (!primerErrorMsg) {
            primerErrorMsg = lineErr?.message || 'error desconocido';
          }
        }
      }

      // Invalidar caches SIEMPRE — para reflejar lo que sí quedó y lo que se revirtió.
      [
        'ingredientes_all', 'ingredientes_dashboard',
        'movimientos_inv', 'movimientos_inventario', 'registros_movimientos',
        'inventario',
      ].forEach(k => {
        try { queryClient.invalidateQueries({ queryKey: [k] }); } catch {}
      });

      // Mensajes finales según resultado real (no asumimos éxito)
      if (exitosos > 0 && fallidos === 0) {
        toast.success(
          `Inventario inicial registrado — ${exitosos} ingrediente(s). Ya están disponibles para recetas.`
        );
        reset();
        onClose();
      } else if (exitosos > 0 && fallidos > 0) {
        toast.error(
          `${exitosos} ingrediente(s) registrados, pero ${fallidos} fallaron y se revirtieron. Revisa: ${primerErrorMsg}`
        );
        // No cerramos el modal: el usuario puede corregir las líneas fallidas.
      } else {
        // Ninguno exitoso
        toast.error(
          'No se pudo registrar el movimiento de inventario inicial. El inventario no quedó confirmado.'
        );
      }
    } catch (e) {
      console.error('[RegistrarInventarioInicialDialog] error global:', e);
      toast.error('Error al registrar inventario: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-primary" />
            Registrar inventario existente
          </DialogTitle>
          <DialogDescription className="text-xs">
            Usa esto para cargar ingredientes que tu restaurante <strong>ya tenía</strong> antes
            de empezar a usar el POS. <strong>NO se registra como compra del día</strong> y
            <strong> no aparece como gasto</strong> en reportes financieros.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <p className="text-blue-900 dark:text-blue-100">
            Si vas a registrar una <strong>compra real</strong> (de hoy o reciente), usa la opción
            "Registrar compra" desde Compras. Esa sí se cuenta como gasto.
          </p>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => {
            const muestraEmpaque = requiereEquivalencia(line.unidad_compra);
            const esEstandar = esUnidadEstandar(line.unidad_compra);
            // Detectar incompatibilidad para mostrar warning inline (no bloqueante hasta guardar)
            const unidadBaseLinea = line.tipo === 'existente' ? line.ingrediente?.unidad_base : line.nuevo_unidad_base;
            const compat = unidadBaseLinea
              ? validarCompatibilidad(line.unidad_compra, unidadBaseLinea)
              : { compatible: true, mensaje: null };
            return (
              <div key={idx} className="rounded-xl border bg-card text-card-foreground p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Ingrediente {idx + 1}</p>
                  {lines.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => removeLine(idx)} disabled={saving}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Toggle existente / nuevo */}
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => updateLine(idx, { tipo: 'existente', ingrediente: null, nuevo_nombre: '' })}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      line.tipo === 'existente' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                    Ya está en mi inventario
                  </button>
                  <button type="button"
                    onClick={() => updateLine(idx, { tipo: 'nuevo', ingrediente: null })}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      line.tipo === 'nuevo' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                    Nuevo ingrediente
                  </button>
                </div>

                {/* Selector */}
                {line.tipo === 'existente' ? (
                  <div>
                    <Label className="text-xs">Buscar ingrediente</Label>
                    <IngredienteAutocomplete
                      ingredientes={ingredientes}
                      value={line.ingrediente}
                      onSelect={(ing) => handleSelectExistente(idx, ing)}
                      onCreateNew={(q) => handleCreateNew(idx, q)}
                    />
                    {line.ingrediente && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Stock actual: {Number(line.ingrediente.stock_actual || 0).toLocaleString()} {line.ingrediente.unidad_base}
                        {' · '}sumaremos a este stock.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nombre del ingrediente *</Label>
                      <Input value={line.nuevo_nombre}
                        onChange={e => updateLine(idx, { nuevo_nombre: e.target.value })}
                        placeholder="Ej: Café molido" />
                    </div>
                    <div>
                      <Label className="text-xs">Unidad base (cómo se usa en recetas) *</Label>
                      <Select value={line.nuevo_unidad_base}
                        onValueChange={v => updateLine(idx, { nuevo_unidad_base: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNIDADES_BASE.map(u => (
                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Cantidad / unidad / costo */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Cantidad existente *</Label>
                    <Input type="number" value={line.cantidad}
                      onChange={e => updateLine(idx, { cantidad: e.target.value })}
                      placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-xs">Unidad *</Label>
                    <Select value={line.unidad_compra}
                      onValueChange={v => updateLine(idx, { unidad_compra: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {unidadesCompra.map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Costo estimado total ($) *</Label>
                    <Input type="number" value={line.costo_total}
                      onChange={e => updateLine(idx, { costo_total: e.target.value })}
                      placeholder="$0" />
                  </div>
                </div>

                {/* Warning inline si la unidad capturada NO es compatible con la unidad base */}
                {!compat.compatible && (
                  <div className="rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200">
                    {compat.mensaje}
                  </div>
                )}

                {muestraEmpaque && (
                  <div className="rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                    <Label className="text-xs">
                      ¿A cuánto equivale 1 {line.unidad_compra} en unidad base ({unidadBaseLinea || 'g/ml/pieza'})? *
                    </Label>
                    <Input type="number" value={line.piezas_por_paquete}
                      onChange={e => updateLine(idx, { piezas_por_paquete: e.target.value })}
                      placeholder={
                        unidadBaseLinea === 'g'
                          ? 'Ej: 1000 (gramos por bolsa)'
                          : unidadBaseLinea === 'ml'
                            ? 'Ej: 20000 (ml por garrafón)'
                            : 'Ej: 24 (piezas por caja)'
                      }
                      className="h-8" />
                    <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1">
                      {esEstandar
                        ? 'Esta unidad es un empaque — indica cuánto trae cada uno.'
                        : 'Esta es una unidad personalizada. Necesitamos su equivalencia para calcular costos.'}
                    </p>
                  </div>
                )}

                {/* Stock mínimo / crítico — captura con unidad clara.
                    El componente convierte internamente a la unidad base del
                    ingrediente para evitar el bug de "4" interpretado como
                    4 g cuando el usuario pensó en 4 kg. */}
                <StockMinCritInput
                  unidadBase={unidadBaseLinea || 'g'}
                  valoresEnBase={{
                    stock_minimo: parseFloat(line.stock_minimo) || 0,
                    stock_critico: parseFloat(line.stock_critico) || 0,
                  }}
                  onChange={({ stock_minimo, stock_critico }) =>
                    updateLine(idx, {
                      stock_minimo: stock_minimo > 0 ? String(stock_minimo) : '',
                      stock_critico: stock_critico > 0 ? String(stock_critico) : '',
                    })
                  }
                  compact
                />

                {/* ===== Configuración de contenedor (opcional, solo para
                    ingredientes nuevos). Discreta y apagada por defecto.
                    Si se activa, persistimos los metadatos en el create. */}
                {line.tipo === 'nuevo' && (
                  <details className="rounded-lg border bg-muted/20">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-muted-foreground">
                      ¿Este ingrediente es contenedor? (opcional)
                    </summary>
                    <div className="p-3 pt-0">
                      <IngredienteContenedorSection
                        value={line.contenedor}
                        onChange={(next) => updateLine(idx, { contenedor: next })}
                        unidadBase={line.nuevo_unidad_base}
                        disabled={saving}
                        compact
                        hideInfoBox={false}
                      />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" onClick={addLine} className="w-full" disabled={saving}>
          <Plus className="w-4 h-4 mr-1" /> Agregar otro ingrediente
        </Button>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
          <span className="text-sm text-muted-foreground">Valor total estimado</span>
          <span className="font-heading font-black text-lg">{formatCurrency(totalEstimado)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar inventario inicial'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
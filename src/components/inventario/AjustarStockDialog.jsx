import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Save, Sliders, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import {
  getUnidadesCompra, esUnidadEstandar, validarCompatibilidad,
  convertirAUnidadBase, canonicalUnidad,
} from '@/utils/unidadesMedida';
import StockMinCritInput from '@/components/inventario/StockMinCritInput';
import IngredienteContenedorSection, {
  hidratarValorContenedor,
  construirPayloadContenedor,
} from '@/components/inventario/IngredienteContenedorSection';

/**
 * AjustarStockDialog
 * ------------------
 * Ajuste MANUAL de stock — NO crea compra, NO crea gasto, NO crea venta.
 * Solo actualiza Ingrediente.stock_actual y registra un MovimientoInventario
 * tipo `ajuste_manual` con motivo y referencia_tipo `ajuste_inventario`.
 *
 * Casos: conteo físico, merma, entrada/salida manual, corrección.
 *
 * Validaciones:
 *  - Cantidad > 0 y numérica.
 *  - Unidad compatible con unidad base del ingrediente.
 *  - Equivalencia obligatoria para unidades personalizadas o empaques.
 *  - Motivo obligatorio.
 *  - Stock resultante no negativo (salvo `permitir_venta_sin_stock`).
 */
export default function AjustarStockDialog({ open, onClose, ingrediente }) {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();

  const unidadesDisponibles = useMemo(() => getUnidadesCompra(config), [config]);
  // Ajustes manuales NUNCA permiten stock negativo. `permitir_venta_sin_stock`
  // aplica solo a ventas (cobro), no a correcciones de inventario.

  const [tipoAjuste, setTipoAjuste] = useState('correccion');
  const [metodo, setMetodo] = useState('final'); // 'final' | 'diferencia'
  const [signo, setSigno] = useState('sumar'); // solo aplica si metodo='diferencia'
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState('');
  const [equivalencia, setEquivalencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // Alertas de inventario — mínimo/crítico en unidad base.
  // El usuario los captura con unidad clara (kg/l/pza) y el componente convierte.
  // null = no se tocan en este guardado. Solo se persisten si el usuario los edita.
  const [alertas, setAlertas] = useState(null); // { stock_minimo, stock_critico } en base, o null

  // Configuración de contenedor (solo metadatos: tipo_ingrediente + capacidad + porciones).
  // Se hidrata desde el ingrediente y se persiste en el mismo update. NO toca stock ni costo.
  const [contenedor, setContenedor] = useState(hidratarValorContenedor(null));
  const [contenedorTocado, setContenedorTocado] = useState(false);

  // Reset cuando se abre / cambia ingrediente
  useEffect(() => {
    if (open && ingrediente) {
      setTipoAjuste('correccion');
      setMetodo('final');
      setSigno('sumar');
      setCantidad('');
      // Unidad inicial = la base del ingrediente (más simple y siempre compatible)
      setUnidad(ingrediente.unidad_base || 'g');
      setEquivalencia('');
      setMotivo('');
      setAlertas(null);
      setContenedor(hidratarValorContenedor(ingrediente));
      setContenedorTocado(false);
    }
  }, [open, ingrediente]);

  // Detecta cambios reales en la sección de contenedor (vs el snapshot original del ingrediente).
  const contenedorOriginal = useMemo(() => hidratarValorContenedor(ingrediente), [ingrediente]);
  const contenedorCambio = useMemo(() => {
    const a = contenedor || {};
    const b = contenedorOriginal || {};
    return (
      !!a.esContenedor !== !!b.esContenedor ||
      String(a.capacidadMl ?? '') !== String(b.capacidadMl ?? '') ||
      String(a.porciones ?? '') !== String(b.porciones ?? '') ||
      String(a.mlPorPorcion ?? '') !== String(b.mlPorPorcion ?? '') ||
      String(a.nombrePorcion ?? '') !== String(b.nombrePorcion ?? '')
    );
  }, [contenedor, contenedorOriginal]);

  if (!ingrediente) return null;

  const stockActual = Number(ingrediente.stock_actual) || 0;
  const unidadBase = ingrediente.unidad_base;
  const costoUnit = Number(ingrediente.costo_por_unidad_base) || 0;

  // ¿Esta unidad requiere equivalencia? (no es estándar directa)
  const necesitaEquivalencia = (() => {
    const canon = canonicalUnidad(unidad);
    return canon === null; // null = personalizada o empaque (caja, paquete, bolsa…)
  })();

  // Validar compatibilidad de unidad ↔ unidad base
  const compat = validarCompatibilidad(unidad, unidadBase);

  // Cálculo de stock nuevo (preview)
  const cantNum = parseFloat(cantidad);
  const cantValida = Number.isFinite(cantNum) && cantNum > 0;
  let cantidadEnBase = 0;
  if (cantValida && compat.compatible) {
    const eq = parseFloat(equivalencia);
    if (necesitaEquivalencia) {
      if (Number.isFinite(eq) && eq > 0) {
        cantidadEnBase = convertirAUnidadBase(cantNum, unidad, eq);
      }
    } else {
      cantidadEnBase = convertirAUnidadBase(cantNum, unidad, 1);
    }
  }

  let stockNuevo = stockActual;
  let cambio = 0;
  if (cantValida && cantidadEnBase > 0) {
    if (metodo === 'final') {
      stockNuevo = cantidadEnBase;
      cambio = stockNuevo - stockActual;
    } else {
      cambio = signo === 'sumar' ? cantidadEnBase : -cantidadEnBase;
      stockNuevo = stockActual + cambio;
    }
  }

  const stockQuedariaNegativo = stockNuevo < 0;
  const stockNoCambia = cantValida && cambio === 0;

  const close = () => {
    if (saving) return;
    onClose();
  };

  // ¿El usuario solo quiere actualizar metadatos (alertas y/o contenedor) y NO
  // ajustar el stock actual? Esto es válido: detecta si tocó alertas o contenedor
  // y dejó la cantidad vacía. Permite editar metadatos sin obligar a registrar
  // un ajuste de stock.
  const soloEditarMetadatos =
    !cantidad &&
    !motivo &&
    (alertas !== null || contenedorCambio);

  const guardar = async () => {
    // Caso especial: solo se están editando metadatos (alertas y/o contenedor)
    // sin ajustar el stock actual.
    if (soloEditarMetadatos) {
      // Construir payload solo con lo que cambió.
      const payload = {};
      if (alertas !== null) {
        payload.stock_minimo = Math.max(0, Number(alertas.stock_minimo) || 0);
        payload.stock_critico = Math.max(0, Number(alertas.stock_critico) || 0);
      }
      if (contenedorCambio) {
        const r = construirPayloadContenedor(contenedor);
        if (!r.ok) { toast.error(r.error); return; }
        Object.assign(payload, r.payload);
      }
      if (Object.keys(payload).length === 0) {
        toast.error('No hay cambios para guardar.');
        return;
      }
      setSaving(true);
      try {
        await base44.entities.Ingrediente.update(ingrediente.id, payload);
        ['ingredientes_all', 'ingredientes_dashboard', 'inventario', 'ingredientes_activos_tipoventa']
          .forEach(k => { try { queryClient.invalidateQueries({ queryKey: [k] }); } catch {} });
        toast.success('Cambios guardados');
        onClose();
      } catch (e) {
        console.error('[AjustarStockDialog] update metadatos:', e);
        toast.error('No se pudieron guardar los cambios');
      }
      setSaving(false);
      return;
    }

    // ===== Validaciones (ajuste de stock) =====
    if (!cantValida) {
      toast.error('Indica una cantidad válida (mayor que cero).');
      return;
    }
    if (!compat.compatible) {
      toast.error(compat.mensaje || 'La unidad seleccionada no es compatible con la unidad base del ingrediente.');
      return;
    }
    if (necesitaEquivalencia) {
      const eq = parseFloat(equivalencia);
      if (!Number.isFinite(eq) || eq <= 0) {
        toast.error(`Indica a cuánto equivale 1 ${unidad} en ${unidadBase}.`);
        return;
      }
    }
    if (!motivo.trim()) {
      toast.error('Indica el motivo del ajuste.');
      return;
    }
    if (stockNoCambia) {
      toast.error('El stock nuevo es igual al stock actual.');
      return;
    }
    // BLINDAJE: Los ajustes manuales NUNCA permiten stock negativo,
    // sin importar la configuración de venta sin stock.
    if (stockQuedariaNegativo) {
      toast.error('El ajuste dejaría el stock en negativo.');
      return;
    }

    setSaving(true);

    // Capturamos referencias antes de cualquier mutación — necesario para rollback.
    const stockAnteriorRef = stockActual;
    const ingredienteIdRef = ingrediente.id;
    let stockActualizado = false;

    try {
      // 1) Actualizar Ingrediente.stock_actual (no tocamos costo: ajuste manual
      //    no recalibra costo ponderado — costo solo cambia con compras).
      //    Si el admin también editó las alertas y/o la config de contenedor,
      //    las persistimos en el mismo update.
      const updatePayload = { stock_actual: stockNuevo };
      if (alertas !== null) {
        updatePayload.stock_minimo = Math.max(0, Number(alertas.stock_minimo) || 0);
        updatePayload.stock_critico = Math.max(0, Number(alertas.stock_critico) || 0);
      }
      if (contenedorCambio) {
        const r = construirPayloadContenedor(contenedor);
        if (!r.ok) { toast.error(r.error); setSaving(false); return; }
        Object.assign(updatePayload, r.payload);
      }
      await base44.entities.Ingrediente.update(ingredienteIdRef, updatePayload);
      stockActualizado = true;

      // 2) Registrar MovimientoInventario — OBLIGATORIO. Si falla,
      //    hacemos rollback del stock para mantener trazabilidad consistente.
      const tipoLegible = {
        correccion: 'Corrección de conteo',
        merma: 'Merma',
        entrada: 'Entrada manual',
        salida: 'Salida manual',
        otro: 'Otro ajuste',
      }[tipoAjuste] || 'Ajuste manual';

      const motivoFinal = `${tipoLegible}: ${motivo.trim()}`;
      const cantidadAbs = Math.abs(cambio);

      try {
        await base44.entities.MovimientoInventario.create({
          ingrediente_id: ingredienteIdRef,
          ingrediente_nombre: ingrediente.nombre,
          tipo_movimiento: 'ajuste_manual',
          cantidad: cambio, // negativo si baja, positivo si sube
          unidad_base: unidadBase,
          stock_anterior: stockAnteriorRef,
          stock_nuevo: stockNuevo,
          costo_unitario_en_momento: costoUnit,
          // Costo informativo de la diferencia ajustada — NO es gasto financiero.
          costo_total_movimiento: cantidadAbs * costoUnit,
          referencia_tipo: 'ajuste_inventario',
          referencia_id: '',
          motivo: motivoFinal,
          usuario_id: posUser?.id,
          usuario_nombre: posUser?.nombre,
          fecha: new Date().toISOString(),
        });
      } catch (movErr) {
        // Rollback: el movimiento es obligatorio. Si falla, devolvemos el stock
        // al valor anterior para no dejar una mutación huérfana sin trazabilidad.
        console.error('[AjustarStockDialog] MovimientoInventario falló — rollback de stock:', movErr);
        try {
          await base44.entities.Ingrediente.update(ingredienteIdRef, {
            stock_actual: stockAnteriorRef,
          });
        } catch (rollbackErr) {
          // Si incluso el rollback falla, el admin debe revisarlo manualmente.
          console.error('[AjustarStockDialog] rollback falló:', rollbackErr);
          toast.error('No se pudo registrar el movimiento de inventario y el rollback de stock falló. Revisa el inventario manualmente.');
          // Invalidamos para que la UI muestre el estado real (lo que sea).
          try { queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] }); } catch {}
          setSaving(false);
          return;
        }
        toast.error('No se pudo registrar el movimiento de inventario. El ajuste no quedó confirmado.');
        try { queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] }); } catch {}
        setSaving(false);
        return;
      }

      // 3) Invalidar caches relevantes — refrescar la cantidad sin recargar.
      [
        'ingredientes_all', 'ingredientes_dashboard',
        'movimientos_inventario', 'movimientos_inv', 'registros_movimientos',
        'inventario',
      ].forEach(k => {
        try { queryClient.invalidateQueries({ queryKey: [k] }); } catch {}
      });

      toast.success(`Stock actualizado — ${ingrediente.nombre}: ${stockNuevo.toLocaleString()} ${unidadBase}`);
      onClose();
    } catch (e) {
      console.error('[AjustarStockDialog] error:', e);
      // Si el error fue en el primer update, no hay nada que revertir.
      // Si fue después de actualizar stock (caso raro: error fuera del bloque
      // del movimiento), intentamos rollback por seguridad.
      if (stockActualizado) {
        try {
          await base44.entities.Ingrediente.update(ingredienteIdRef, {
            stock_actual: stockAnteriorRef,
          });
        } catch {}
      }
      toast.error('Error al ajustar stock: ' + (e?.message || ''));
      try { queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] }); } catch {}
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            Ajustar stock
          </DialogTitle>
          <DialogDescription className="text-xs">
            Solo modifica el inventario. <strong>No se registra como compra, gasto ni venta</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Encabezado del ingrediente */}
        <div className="rounded-lg p-3 bg-muted/50 border">
          <p className="text-sm font-semibold">{ingrediente.nombre}</p>
          <p className="text-xs text-muted-foreground">
            Stock actual: <strong>{stockActual.toLocaleString()} {unidadBase}</strong>
          </p>
        </div>

        {/* Tipo de ajuste */}
        <div>
          <Label className="text-xs">Tipo de ajuste *</Label>
          <Select value={tipoAjuste} onValueChange={setTipoAjuste}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="correccion">Corrección de conteo</SelectItem>
              <SelectItem value="merma">Merma / producto perdido</SelectItem>
              <SelectItem value="entrada">Entrada manual</SelectItem>
              <SelectItem value="salida">Salida manual</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Método de ajuste */}
        <div>
          <Label className="text-xs">Método *</Label>
          <Select value={metodo} onValueChange={setMetodo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="final">Definir stock final (conteo físico)</SelectItem>
              <SelectItem value="diferencia">Sumar / restar diferencia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cantidad + unidad (+ signo si aplica) */}
        <div className="grid grid-cols-3 gap-2">
          {metodo === 'diferencia' && (
            <div className="col-span-3">
              <Label className="text-xs">Sumar o restar *</Label>
              <Select value={signo} onValueChange={setSigno}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sumar">Sumar (+)</SelectItem>
                  <SelectItem value="restar">Restar (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-xs">
              {metodo === 'final' ? 'Nuevo stock real *' : 'Cantidad a ajustar *'}
            </Label>
            <Input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Unidad *</Label>
            <Select value={unidad} onValueChange={setUnidad}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {unidadesDisponibles.map(u => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Warning de compatibilidad */}
        {!compat.compatible && (
          <div className="rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{compat.mensaje}</span>
          </div>
        )}

        {/* Equivalencia obligatoria si es unidad personalizada o empaque */}
        {necesitaEquivalencia && (
          <div className="rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
            <Label className="text-xs">
              ¿A cuánto equivale 1 {unidad} en {unidadBase}? *
            </Label>
            <Input
              type="number"
              value={equivalencia}
              onChange={(e) => setEquivalencia(e.target.value)}
              placeholder={
                unidadBase === 'g'
                  ? 'Ej: 1000 (gramos por bolsa)'
                  : unidadBase === 'ml'
                    ? 'Ej: 20000 (ml por garrafón)'
                    : 'Ej: 24 (piezas por caja)'
              }
              className="h-8"
            />
            <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1">
              {esUnidadEstandar(unidad)
                ? 'Esta unidad es un empaque — indica cuánto trae cada uno.'
                : 'Esta es una unidad personalizada. Necesitamos su equivalencia para calcular el ajuste.'}
            </p>
          </div>
        )}

        {/* Motivo */}
        <div>
          <Label className="text-xs">Motivo / nota *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: conteo físico inicial, merma por producto caducado, corrección de captura, etc."
            className="min-h-[60px] text-sm"
          />
        </div>

        {/* ===== Alertas de inventario (mínimo / crítico) =====
            Sección secundaria, opcional. Permite al admin editar los umbrales
            de alerta con UNIDAD CLARA (kg/l/pza) — el componente convierte
            internamente a unidad base. Si no se toca, no se modifica.
            NO afecta cálculos financieros ni descuento de inventario. */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Alertas de inventario (opcional)
          </p>
          <StockMinCritInput
            unidadBase={unidadBase}
            valoresEnBase={{
              stock_minimo: alertas?.stock_minimo ?? (Number(ingrediente.stock_minimo) || 0),
              stock_critico: alertas?.stock_critico ?? (Number(ingrediente.stock_critico) || 0),
            }}
            onChange={(v) => setAlertas(v)}
            compact
          />
          {alertas && !cantidad && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Puedes guardar solo los cambios de alertas (sin ajustar el stock actual).
            </p>
          )}
        </div>

        {/* ===== Configuración de contenedor (opcional) =====
            Sección secundaria. Solo metadatos: marcar el ingrediente como
            "contenedor" (botella) para vender por porciones (shots/copas).
            NO toca stock, costo ni movimientos — se persiste en el mismo
            update del ingrediente. */}
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Configuración de contenedor (opcional)
          </p>
          <IngredienteContenedorSection
            value={contenedor}
            onChange={(next) => { setContenedor(next); setContenedorTocado(true); }}
            unidadBase={unidadBase}
            stockActual={stockActual}
            disabled={saving}
            compact
            hideInfoBox={false}
          />
          {contenedorTocado && contenedorCambio && !cantidad && !motivo && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-2">
              Puedes guardar solo los cambios de contenedor (sin ajustar el stock actual).
            </p>
          )}
        </div>

        {/* Vista previa del ajuste */}
        {cantValida && compat.compatible && (!necesitaEquivalencia || parseFloat(equivalencia) > 0) && (
          <div className="rounded-lg p-3 bg-primary/5 border border-primary/20 text-sm space-y-1">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Vista previa</p>
            <div className="flex justify-between">
              <span>Stock anterior</span>
              <strong>{stockActual.toLocaleString()} {unidadBase}</strong>
            </div>
            <div className="flex justify-between">
              <span>Ajuste aplicado</span>
              <strong className={cambio < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                {cambio >= 0 ? '+' : ''}{cambio.toLocaleString()} {unidadBase}
              </strong>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1">
              <span>Stock nuevo</span>
              <strong className={stockQuedariaNegativo ? 'text-rose-600' : ''}>
                {stockNuevo.toLocaleString()} {unidadBase}
              </strong>
            </div>
            {stockQuedariaNegativo && (
              <p className="text-[11px] text-rose-600 pt-1">
                ⚠ El ajuste dejaría el stock en negativo. No se permite.
              </p>
            )}
            {stockNoCambia && (
              <p className="text-[11px] text-amber-700 pt-1">
                El stock nuevo es igual al stock actual.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
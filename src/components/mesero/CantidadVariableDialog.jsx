// =====================================================
// components/mesero/CantidadVariableDialog.jsx
// =====================================================
// 6B / Bloque 1.D — Modal para capturar cantidad/porción al agregar
// al carrito un producto VARIABLE (variable_medida | porcion_contenedor).
//
// QUÉ HACE:
//  - Recibe `producto` con tipo_venta != 'precio_fijo'.
//  - Pide la cantidad/porciones, valida min/max/incremento.
//  - Calcula el precio total de la línea con utils puras.
//  - Devuelve el snapshot completo al padre vía onConfirm.
//
// QUÉ NO HACE:
//  - No toca BD ni inventario. El descuento de inventario es del cobro (1.G).
//  - No toca productos precio_fijo (el padre filtra antes de abrirlo).
//  - No agrupa con líneas anteriores: cada línea variable es independiente.
// =====================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Scale, Beaker } from 'lucide-react';
import {
  TIPO_VENTA,
  UNIDADES_VARIABLE,
  calcularPrecioVariableMedida,
  calcularPrecioPorcion,
  mlPorPorcionEfectivo,
} from '@/utils/tipoVentaUtils';
import { formatCurrency } from '@/utils/financialUtils';

export default function CantidadVariableDialog({ open, producto, onClose, onConfirm }) {
  const tipo = producto?.tipo_venta;
  const esMedida = tipo === TIPO_VENTA.VARIABLE_MEDIDA;
  const esPorcion = tipo === TIPO_VENTA.PORCION_CONTENEDOR;

  // Estado local
  const [cantidad, setCantidad] = useState('');
  const [unidadElegida, setUnidadElegida] = useState('g');

  // Hidratar cuando abre con producto
  useEffect(() => {
    if (!open || !producto) return;
    if (esMedida) {
      // Default a la unidad configurada del producto, o "g"
      setUnidadElegida(UNIDADES_VARIABLE.includes(producto.unidad_variable) ? producto.unidad_variable : 'g');
      // Default a la cantidad mínima si existe, si no, vacío
      const min = Number(producto.cantidad_minima_variable);
      setCantidad(Number.isFinite(min) && min > 0 ? String(min) : '');
    } else if (esPorcion) {
      setCantidad('1');
    }
  }, [open, producto, esMedida, esPorcion]);

  // Presets sugeridos (mostramos los del producto si existen)
  const presets = useMemo(() => {
    if (esMedida) return Array.isArray(producto?.presets_variable_qr) ? producto.presets_variable_qr : [];
    if (esPorcion) return Array.isArray(producto?.presets_porcion_qr) ? producto.presets_porcion_qr : [];
    return [];
  }, [esMedida, esPorcion, producto]);

  // Cálculos
  const cantNum = Number(cantidad);
  const cantValida = Number.isFinite(cantNum) && cantNum > 0;

  const precioCalculado = useMemo(() => {
    if (!cantValida) return 0;
    if (esMedida) {
      return calcularPrecioVariableMedida({
        precio_por_unidad_variable: Number(producto?.precio_por_unidad_variable) || 0,
        cantidad_variable: cantNum,
      });
    }
    if (esPorcion) {
      return calcularPrecioPorcion({
        precio_por_porcion: Number(producto?.precio_por_porcion) || 0,
        cantidad_porciones: cantNum,
      });
    }
    return 0;
  }, [cantValida, cantNum, esMedida, esPorcion, producto]);

  // Validaciones de rango / paso (solo para variable_medida)
  const validacion = useMemo(() => {
    if (!esMedida || !cantValida) return { ok: cantValida, msg: '' };
    const min = Number(producto?.cantidad_minima_variable);
    const max = Number(producto?.cantidad_maxima_variable);
    const step = Number(producto?.incremento_variable);
    if (Number.isFinite(min) && min > 0 && cantNum < min) {
      return { ok: false, msg: `Cantidad mínima: ${min} ${unidadElegida}` };
    }
    if (Number.isFinite(max) && max > 0 && cantNum > max) {
      return { ok: false, msg: `Cantidad máxima: ${max} ${unidadElegida}` };
    }
    if (Number.isFinite(step) && step > 0) {
      // Tolerancia de 1e-4 para evitar falsos rechazos por float
      const ratio = cantNum / step;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-4) {
        return { ok: false, msg: `Debe ser múltiplo de ${step} ${unidadElegida}` };
      }
    }
    return { ok: true, msg: '' };
  }, [esMedida, cantValida, cantNum, unidadElegida, producto]);

  const puedeConfirmar = cantValida && validacion.ok && precioCalculado > 0;

  // Cerrar
  const handleClose = () => {
    setCantidad('');
    onClose?.();
  };

  // Confirmar → arma snapshot y delega al padre
  const handleConfirm = () => {
    if (!puedeConfirmar || !producto) return;

    if (esMedida) {
      onConfirm?.({
        tipo_venta: TIPO_VENTA.VARIABLE_MEDIDA,
        cantidad_variable: cantNum,
        unidad_variable: unidadElegida,
        precio_total_linea: precioCalculado,
        // Snapshots para DetalleVenta y PedidoPreparacion en enviarPedido:
        ingrediente_base_id: producto?.ingrediente_base_id || '',
        ingrediente_base_nombre: producto?.ingrediente_base_nombre || '',
        precio_por_unidad_snapshot: Number(producto?.precio_por_unidad_variable) || 0,
      });
    } else if (esPorcion) {
      const mlPorP = mlPorPorcionEfectivo({
        ml_por_porcion: producto?.ml_por_porcion,
        capacidad_contenedor_ml: producto?.capacidad_contenedor_ml,
        porciones_por_contenedor: producto?.porciones_por_contenedor,
      });
      onConfirm?.({
        tipo_venta: TIPO_VENTA.PORCION_CONTENEDOR,
        cantidad_porciones: cantNum,
        nombre_porcion: producto?.nombre_porcion || 'porción',
        ml_por_porcion: mlPorP,
        precio_total_linea: precioCalculado,
        ingrediente_base_id: producto?.ingrediente_base_id || '',
        ingrediente_base_nombre: producto?.ingrediente_base_nombre || '',
        precio_por_unidad_snapshot: Number(producto?.precio_por_porcion) || 0,
      });
    }
    handleClose();
  };

  if (!producto) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {esMedida ? <Scale className="w-5 h-5 text-primary" /> : <Beaker className="w-5 h-5 text-primary" />}
            {producto?.nombre || 'Producto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bloque informativo */}
          <div className="rounded-lg p-3 bg-muted/40 border text-xs space-y-0.5">
            {esMedida && (
              <>
                <p>
                  <strong>Precio:</strong> {formatCurrency(Number(producto?.precio_por_unidad_variable) || 0)} por {producto?.unidad_variable || 'g'}
                </p>
                {(producto?.cantidad_minima_variable > 0 || producto?.cantidad_maxima_variable > 0) && (
                  <p className="text-muted-foreground">
                    Rango: {producto?.cantidad_minima_variable || 0}
                    {' '}–{' '}
                    {producto?.cantidad_maxima_variable || '∞'} {producto?.unidad_variable || ''}
                  </p>
                )}
              </>
            )}
            {esPorcion && (
              <>
                <p>
                  <strong>Precio:</strong> {formatCurrency(Number(producto?.precio_por_porcion) || 0)} por {producto?.nombre_porcion || 'porción'}
                </p>
                <p className="text-muted-foreground">
                  Contenedor: {Number(producto?.capacidad_contenedor_ml) || 0} ml ·
                  {' '}{Number(producto?.porciones_por_contenedor) || 0} {producto?.nombre_porcion || 'porciones'}
                </p>
              </>
            )}
          </div>

          {/* Presets */}
          {presets.length > 0 && (
            <div>
              <Label className="text-xs">Cantidad rápida</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {presets.map((p, i) => {
                  const valor = Number(p);
                  if (!Number.isFinite(valor) || valor <= 0) return null;
                  const seleccionado = cantValida && cantNum === valor;
                  return (
                    <button
                      key={`preset-${i}`}
                      type="button"
                      onClick={() => setCantidad(String(valor))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        seleccionado
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card hover:bg-muted/50 border-border'
                      }`}
                    >
                      {valor} {esMedida ? (producto?.unidad_variable || '') : (producto?.nombre_porcion || '')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cantidad */}
          <div>
            <Label className="text-xs">
              {esMedida ? 'Cantidad *' : `Número de ${producto?.nombre_porcion || 'porciones'} *`}
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
                step={esMedida ? (producto?.incremento_variable || 'any') : 1}
                min={esMedida ? (producto?.cantidad_minima_variable || 0) : 1}
                className="flex-1"
              />
              {esMedida && (
                <div className="px-3 py-2 rounded-md bg-muted text-sm font-semibold min-w-[60px] text-center">
                  {unidadElegida}
                </div>
              )}
              {esPorcion && (
                <div className="px-3 py-2 rounded-md bg-muted text-sm font-semibold min-w-[80px] text-center">
                  {producto?.nombre_porcion || 'porc.'}
                </div>
              )}
            </div>
            {!validacion.ok && validacion.msg && (
              <p className="text-[11px] text-rose-600 mt-1">{validacion.msg}</p>
            )}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
            <span className="text-sm text-muted-foreground">Total línea</span>
            <span className="font-heading font-black text-xl text-primary">
              {formatCurrency(precioCalculado)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!puedeConfirmar}>
            Agregar al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus, Scale, Beaker } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import ProductoPlaceholder from '@/components/portalqr/ProductoPlaceholder';
import {
  TIPO_VENTA,
  calcularPrecioVariableMedida,
  calcularPrecioPorcion,
  mlPorPorcionEfectivo,
} from '@/utils/tipoVentaUtils';

/**
 * Modal de producto para el comensal en Portal QR.
 * - Reutiliza la MISMA estructura de modificadores que ya usa el Mesero
 *   (producto.modificadores: [{nombre, obligatorio, tipo, opciones:[{id,nombre,activo}]}]).
 * - No afecta precio/costo/inventario (igual que en Mesero).
 * - Emite onConfirm({producto, cantidad, notas, modificadores})
 *
 * Diseño mobile-first. No introduce nuevas dependencias.
 */
export default function ProductoQRDialog({ producto, open, onClose, onConfirm, mostrarPrecios = true }) {
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState('');
  // selecciones[grupoNombre] = Set(opcionId) (Set para multi y para única).
  const [selecciones, setSelecciones] = useState({});
  const [errores, setErrores] = useState({});

  // 6B / 1.E — Estado para productos VARIABLES (medida o porción).
  const tipoVenta = producto?.tipo_venta;
  const esVariableMedida = tipoVenta === TIPO_VENTA.VARIABLE_MEDIDA;
  const esPorcionContenedor = tipoVenta === TIPO_VENTA.PORCION_CONTENEDOR;
  const esVariable = esVariableMedida || esPorcionContenedor;
  // Para variables: cantVariable es la cantidad en la unidad mostrada (ej. 500 g / 4 shots).
  const [cantVariable, setCantVariable] = useState('');

  // Resetear estado al abrir un producto distinto
  useEffect(() => {
    if (!open) return;
    setCantidad(1);
    setNotas('');
    setSelecciones({});
    setErrores({});
    // 6B / 1.E — Hidratar cantidad variable con preset/mínimo
    if (esVariableMedida) {
      const min = Number(producto?.cantidad_minima_variable);
      setCantVariable(Number.isFinite(min) && min > 0 ? String(min) : '');
    } else if (esPorcionContenedor) {
      setCantVariable('1');
    } else {
      setCantVariable('');
    }
  }, [open, producto?.id, esVariableMedida, esPorcionContenedor]);

  const gruposActivos = useMemo(() => {
    const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
    return arr
      .filter(
        (g) =>
          g &&
          g.activo !== false &&
          String(g.nombre || '').trim() &&
          Array.isArray(g.opciones) &&
          g.opciones.some((o) => o && o.activo !== false && String(o.nombre || '').trim())
      )
      .map((g) => ({
        ...g,
        opciones: g.opciones.filter(
          (o) => o && o.activo !== false && String(o.nombre || '').trim()
        ),
      }));
  }, [producto]);

  const toggleOpcion = (grupo, opcionId) => {
    setErrores((prev) => ({ ...prev, [grupo.nombre]: false }));
    setSelecciones((prev) => {
      const actual = prev[grupo.nombre] || new Set();
      const next = new Set(actual);
      if (grupo.tipo === 'multiple') {
        if (next.has(opcionId)) next.delete(opcionId);
        else next.add(opcionId);
      } else {
        // 'unica' (default)
        next.clear();
        next.add(opcionId);
      }
      return { ...prev, [grupo.nombre]: next };
    });
  };

  const cambiarCantidad = (delta) => {
    setCantidad((c) => Math.max(1, Math.min(99, c + delta)));
  };

  const validar = () => {
    const errs = {};
    for (const g of gruposActivos) {
      if (g.obligatorio) {
        const set = selecciones[g.nombre] || new Set();
        if (set.size === 0) errs[g.nombre] = true;
      }
    }
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  // 6B / 1.E — Validaciones y cálculo de precio para productos variables.
  const cantVariableNum = Number(cantVariable);
  const cantVariableValida = Number.isFinite(cantVariableNum) && cantVariableNum > 0;

  const precioVariable = useMemo(() => {
    if (!esVariable || !cantVariableValida) return 0;
    if (esVariableMedida) {
      return calcularPrecioVariableMedida({
        precio_por_unidad_variable: Number(producto?.precio_por_unidad_variable) || 0,
        cantidad_variable: cantVariableNum,
      });
    }
    return calcularPrecioPorcion({
      precio_por_porcion: Number(producto?.precio_por_porcion) || 0,
      cantidad_porciones: cantVariableNum,
    });
  }, [esVariable, esVariableMedida, cantVariableValida, cantVariableNum, producto]);

  // Validación de rango/incremento (solo variable_medida)
  const validacionVariable = useMemo(() => {
    if (!esVariableMedida || !cantVariableValida) return { ok: cantVariableValida, msg: '' };
    const min = Number(producto?.cantidad_minima_variable);
    const max = Number(producto?.cantidad_maxima_variable);
    const step = Number(producto?.incremento_variable);
    const u = producto?.unidad_variable || '';
    if (Number.isFinite(min) && min > 0 && cantVariableNum < min) {
      return { ok: false, msg: `Mínimo: ${min} ${u}` };
    }
    if (Number.isFinite(max) && max > 0 && cantVariableNum > max) {
      return { ok: false, msg: `Máximo: ${max} ${u}` };
    }
    if (Number.isFinite(step) && step > 0) {
      const ratio = cantVariableNum / step;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-4) {
        return { ok: false, msg: `Múltiplos de ${step} ${u}` };
      }
    }
    return { ok: true, msg: '' };
  }, [esVariableMedida, cantVariableValida, cantVariableNum, producto]);

  // Presets sugeridos del producto
  const presetsVariable = useMemo(() => {
    if (esVariableMedida) return Array.isArray(producto?.presets_variable_qr) ? producto.presets_variable_qr : [];
    if (esPorcionContenedor) return Array.isArray(producto?.presets_porcion_qr) ? producto.presets_porcion_qr : [];
    return [];
  }, [esVariableMedida, esPorcionContenedor, producto]);

  const submit = () => {
    if (!validar()) return;

    // 6B / 1.E — Si es variable, validar y construir snapshot.
    if (esVariable) {
      if (!cantVariableValida || !validacionVariable.ok || precioVariable <= 0) return;
      const baseSnap = {
        ingrediente_base_id: producto?.ingrediente_base_id || '',
        ingrediente_base_nombre: producto?.ingrediente_base_nombre || '',
        precio_total_linea: precioVariable,
      };
      let variableSnap;
      if (esVariableMedida) {
        variableSnap = {
          ...baseSnap,
          tipo_venta: TIPO_VENTA.VARIABLE_MEDIDA,
          cantidad_variable: cantVariableNum,
          unidad_variable: producto?.unidad_variable || 'g',
          precio_por_unidad_snapshot: Number(producto?.precio_por_unidad_variable) || 0,
        };
      } else {
        variableSnap = {
          ...baseSnap,
          tipo_venta: TIPO_VENTA.PORCION_CONTENEDOR,
          cantidad_porciones: cantVariableNum,
          nombre_porcion: producto?.nombre_porcion || 'porción',
          ml_por_porcion: mlPorPorcionEfectivo({
            ml_por_porcion: producto?.ml_por_porcion,
            capacidad_contenedor_ml: producto?.capacidad_contenedor_ml,
            porciones_por_contenedor: producto?.porciones_por_contenedor,
          }),
          precio_por_unidad_snapshot: Number(producto?.precio_por_porcion) || 0,
        };
      }
      onConfirm?.({
        producto,
        cantidad: 1, // cantidad lógica = 1 para variables (la cantidad real va en _variable)
        notas: notas.trim(),
        modificadores: [], // los modificadores no se combinan con variable (mantiene simple)
        _variable: variableSnap,
      });
      return;
    }

    // Construir array de modificadores compatible con flujo Mesero (precio_fijo).
    const modificadoresArr = gruposActivos
      .map((g) => {
        const set = selecciones[g.nombre] || new Set();
        if (set.size === 0) return null;
        const opcionesElegidas = g.opciones
          .filter((o) => set.has(o.id))
          .map((o) => ({ id: o.id, nombre: o.nombre }));
        if (opcionesElegidas.length === 0) return null;
        return {
          // CRITICAL: usar `grupo_nombre` (NO `grupo`) para compatibilidad
          // con CocinaPedidoCardPremium (lee m.grupo_nombre) y con el flujo
          // Mesero (que también usa grupo_nombre).
          grupo_nombre: g.nombre,
          tipo: g.tipo || 'unica',
          opciones: opcionesElegidas,
        };
      })
      .filter(Boolean);

    onConfirm?.({
      producto,
      cantidad,
      notas: notas.trim(),
      modificadores: modificadoresArr,
    });
  };

  if (!open || !producto) return null;

  const precio = Number(producto.precio_venta) || 0;
  const totalLinea = esVariable ? precioVariable : precio * cantidad;
  const puedeConfirmarVariable = !esVariable || (cantVariableValida && validacionVariable.ok && precioVariable > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
    >
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        className="bg-card text-card-foreground w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        {/* Header con imagen */}
        <div className="relative">
          {producto.imagen_url ? (
            <img
              src={producto.imagen_url}
              alt={producto.nombre || ''}
              className="w-full h-44 sm:h-52 object-cover"
            />
          ) : (
            <div className="w-full h-44 sm:h-52">
              <ProductoPlaceholder producto={producto} />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <h2 className="text-lg font-heading font-bold leading-tight">{producto.nombre || '—'}</h2>
            {producto.descripcion && (
              <p className="text-sm text-muted-foreground mt-1">{producto.descripcion}</p>
            )}
            {mostrarPrecios && !esVariable && precio > 0 && (
              <p className="mt-2 font-heading font-black text-xl text-emerald-700 dark:text-emerald-400">
                {formatCurrency(precio)}
              </p>
            )}
            {/* 6B / 1.E — Header de precio para producto variable */}
            {mostrarPrecios && esVariableMedida && (
              <p className="mt-2 font-heading font-bold text-base text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                <Scale className="w-4 h-4" />
                {formatCurrency(Number(producto?.precio_por_unidad_variable) || 0)} / {producto?.unidad_variable || 'g'}
              </p>
            )}
            {mostrarPrecios && esPorcionContenedor && (
              <p className="mt-2 font-heading font-bold text-base text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                <Beaker className="w-4 h-4" />
                {formatCurrency(Number(producto?.precio_por_porcion) || 0)} / {producto?.nombre_porcion || 'porción'}
              </p>
            )}
          </div>

          {/* 6B / 1.E — Selector de cantidad variable / porciones */}
          {esVariable && (
            <div className="rounded-2xl border p-3 space-y-3">
              <p className="text-sm font-heading font-bold">
                {esVariableMedida
                  ? `¿Cuánto quieres? (en ${producto?.unidad_variable || 'g'})`
                  : `¿Cuántos ${producto?.nombre_porcion || 'porciones'}?`}
              </p>

              {/* Presets */}
              {presetsVariable.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {presetsVariable.map((p, i) => {
                    const valor = Number(p);
                    if (!Number.isFinite(valor) || valor <= 0) return null;
                    const seleccionado = cantVariableValida && cantVariableNum === valor;
                    return (
                      <button
                        key={`preset-${i}`}
                        type="button"
                        onClick={() => setCantVariable(String(valor))}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                          seleccionado
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border hover:bg-muted/40'
                        }`}
                      >
                        {valor} {esVariableMedida ? (producto?.unidad_variable || '') : (producto?.nombre_porcion || '')}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Input numérico */}
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  inputMode="decimal"
                  value={cantVariable}
                  onChange={(e) => setCantVariable(e.target.value)}
                  placeholder="0"
                  step={esVariableMedida ? (producto?.incremento_variable || 'any') : 1}
                  min={esVariableMedida ? (producto?.cantidad_minima_variable || 0) : 1}
                  className="flex-1 px-3 py-2 border rounded-xl bg-card text-sm"
                />
                <div className="px-3 py-2 rounded-xl bg-muted text-sm font-bold min-w-[70px] text-center">
                  {esVariableMedida ? (producto?.unidad_variable || 'g') : (producto?.nombre_porcion || 'porción')}
                </div>
              </div>

              {!validacionVariable.ok && validacionVariable.msg && (
                <p className="text-[11px] text-rose-600 font-semibold">{validacionVariable.msg}</p>
              )}
            </div>
          )}

          {/* Grupos de modificadores — NO se muestran para productos variables
              en v1 (mantiene la lógica simple). */}
          {!esVariable && gruposActivos.map((g) => (
            <div
              key={g.nombre}
              className={`rounded-2xl border p-3 ${
                errores[g.nombre] ? 'border-rose-400 bg-rose-50/60 dark:bg-rose-950/30' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-heading font-bold">{g.nombre}</p>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {g.obligatorio ? 'Obligatorio' : 'Opcional'}
                  {g.tipo === 'multiple' ? ' · varios' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {g.opciones.map((o) => {
                  const set = selecciones[g.nombre] || new Set();
                  const checked = set.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOpcion(g, o.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 text-sm text-left transition-colors ${
                        checked
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border bg-card text-foreground'
                      }`}
                    >
                      <span>{o.nombre}</span>
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] ${
                          checked ? 'border-primary bg-primary text-white' : 'border-muted-foreground/30'
                        }`}
                      >
                        {checked ? '✓' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              {errores[g.nombre] && (
                <p className="text-[11px] text-rose-600 mt-1.5 font-semibold">
                  Selecciona una opción en: {g.nombre}
                </p>
              )}
            </div>
          ))}

          {/* Notas */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notas para cocina <span className="opacity-60 normal-case">(opcional)</span>
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value.slice(0, 200))}
              placeholder="Ej. sin cebolla, término medio…"
              rows={2}
              className="w-full px-3 py-2 border rounded-xl bg-card mt-1 text-sm resize-none"
            />
          </div>

          {/* Cantidad — solo para productos precio_fijo. Para variables la cantidad
              va en el bloque "¿Cuánto quieres?" de arriba. */}
          {!esVariable && (
            <div className="flex items-center justify-between border rounded-xl p-2">
              <span className="text-sm font-semibold pl-2">Cantidad</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cambiarCantidad(-1)}
                  disabled={cantidad <= 1}
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center disabled:opacity-40"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-black text-lg w-8 text-center tabular-nums">{cantidad}</span>
                <button
                  type="button"
                  onClick={() => cambiarCantidad(1)}
                  disabled={cantidad >= 99}
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!puedeConfirmarVariable}
            className="flex-[1.5] h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <span>Agregar</span>
            {mostrarPrecios && totalLinea > 0 && (
              <span className="opacity-90">· {formatCurrency(totalLinea)}</span>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import {
  TIPO_VENTA,
  mlPorPorcionEfectivo,
  unidadBaseDesdeMostrada,
} from '@/utils/tipoVentaUtils';

/**
 * 6B / Hotfix visual — Resumen económico para productos VARIABLES.
 *
 * Para PRECIO_FIJO devuelve null (no aplica; usa ficha clásica).
 * Para VARIABLE_MEDIDA:    muestra precio/costo/utilidad/margen POR UNIDAD VENDIBLE (g/kg/ml/l).
 * Para PORCION_CONTENEDOR: muestra precio/costo/utilidad/margen POR PORCIÓN (shot/copa/vaso).
 *
 * NUNCA produce NaN/undefined. Si falta el costo del ingrediente, muestra "—" en
 * costo/utilidad/margen y un aviso amable. No toca caché ni inventario.
 *
 * Props:
 *  - producto: ProductoTerminado con campos tipo_venta y configuración variable.
 *  - ingrediente: Ingrediente base ya resuelto (para leer costo_por_unidad_base).
 *  - variant: 'card' (ultra compacto para grid de productos, SIN badge ni meta),
 *             'compact' (compacto para acordeones, con badge),
 *             'full' (ampliado para fichas/recetas con meta).
 *  - coloresMonetarios: si false, no usa color primario en importes; usa text-foreground.
 *
 * Compatibilidad: si llega `compact={true}` (API anterior), equivale a variant='compact'.
 */
export default function FichaResumenVariable({
  producto,
  ingrediente = null,
  compact = false,
  variant,
  coloresMonetarios = true,
}) {
  // Resolver variante (backwards compatible).
  const v = variant || (compact ? 'compact' : 'full');
  // Hooks SIEMPRE arriba antes de cualquier return para preservar el orden.
  const tipo = producto?.tipo_venta || TIPO_VENTA.PRECIO_FIJO;

  const resumen = useMemo(() => {
    if (!producto) return null;
    if (tipo === TIPO_VENTA.PRECIO_FIJO) return null;

    if (tipo === TIPO_VENTA.VARIABLE_MEDIDA) {
      const unidadMostrada = producto.unidad_variable || 'g';
      const baseEsperada = unidadBaseDesdeMostrada(unidadMostrada); // 'g' o 'ml'
      const precio = Number(producto.precio_por_unidad_variable) || 0;

      // costo del ingrediente está en costo_por_unidad_base (g o ml).
      // Si la unidad mostrada es kg/l, costo por unidad mostrada = costo_base * 1000.
      const costoBase = Number(ingrediente?.costo_por_unidad_base) || 0;
      const factor = (unidadMostrada === 'kg' || unidadMostrada === 'l') ? 1000 : 1;
      const costoPorUnidad = costoBase > 0 ? costoBase * factor : 0;

      const hayCosto = costoPorUnidad > 0;
      const utilidad = hayCosto ? precio - costoPorUnidad : 0;
      const margen = (hayCosto && precio > 0) ? (utilidad / precio) * 100 : 0;

      return {
        tipo: 'medida',
        unidadMostrada,
        baseEsperada,
        precio,
        costoPorUnidad,
        utilidad,
        margen,
        hayCosto,
        ingredienteNombre: producto.ingrediente_base_nombre || ingrediente?.nombre || '—',
        min: Number(producto.cantidad_minima_variable) || 0,
        max: Number(producto.cantidad_maxima_variable) || 0,
        incremento: Number(producto.incremento_variable) || 0,
        presets: Array.isArray(producto.presets_variable_qr) ? producto.presets_variable_qr : [],
      };
    }

    if (tipo === TIPO_VENTA.PORCION_CONTENEDOR) {
      const nombrePorcion = producto.nombre_porcion || 'porción';
      const capacidad = Number(producto.capacidad_contenedor_ml) || 0;
      const porciones = Number(producto.porciones_por_contenedor) || 0;
      const mlPorcion = mlPorPorcionEfectivo({
        ml_por_porcion: producto.ml_por_porcion,
        capacidad_contenedor_ml: producto.capacidad_contenedor_ml,
        porciones_por_contenedor: producto.porciones_por_contenedor,
      });
      const precio = Number(producto.precio_por_porcion) || 0;
      const costoBase = Number(ingrediente?.costo_por_unidad_base) || 0; // por ml
      const costoPorPorcion = costoBase > 0 && mlPorcion > 0 ? costoBase * mlPorcion : 0;

      const hayCosto = costoPorPorcion > 0;
      const utilidad = hayCosto ? precio - costoPorPorcion : 0;
      const margen = (hayCosto && precio > 0) ? (utilidad / precio) * 100 : 0;

      return {
        tipo: 'porcion',
        nombrePorcion,
        capacidad,
        porciones,
        mlPorcion,
        precio,
        costoPorPorcion,
        utilidad,
        margen,
        hayCosto,
        ingredienteNombre: producto.ingrediente_base_nombre || ingrediente?.nombre || '—',
        presets: Array.isArray(producto.presets_porcion_qr) ? producto.presets_porcion_qr : [],
      };
    }
    return null;
  }, [producto, ingrediente, tipo]);

  if (!producto) return null;
  if (tipo === TIPO_VENTA.PRECIO_FIJO) return null;
  if (!resumen) return null;

  const margenColor = (m) =>
    m >= 60 ? 'text-emerald-700 dark:text-emerald-300'
    : m >= 40 ? 'text-yellow-700 dark:text-yellow-300'
    : 'text-red-700 dark:text-red-300';

  // Unidad mostrada (g, kg, ml, l, shot, copa, vaso...).
  const u = resumen.tipo === 'medida' ? resumen.unidadMostrada : resumen.nombrePorcion;
  const precioVal = resumen.tipo === 'medida' ? resumen.precio : resumen.precio;
  const costoVal = resumen.tipo === 'medida' ? resumen.costoPorUnidad : resumen.costoPorPorcion;
  // Color de importes monetarios respetando configuración de identidad.
  const precioColor = coloresMonetarios ? 'text-primary' : 'text-foreground';
  const tipoLabel = resumen.tipo === 'medida' ? 'Variable por medida' : 'Por porción';

  // =========================================================
  // VARIANT 'card' — ULTRA COMPACTO para grid de Productos.
  // Solo el grid Costo/Utilidad/Margen (estilo idéntico al de
  // productos normales). El precio y el badge van FUERA, en el
  // header de la card en pages/Productos.jsx (para no crecerla).
  // =========================================================
  if (v === 'card') {
    return (
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded-md bg-muted/50 py-1.5">
          <p className="text-[9px] text-muted-foreground uppercase">Costo / {u}</p>
          <p className="text-xs font-bold text-orange-700 dark:text-orange-300">
            {resumen.hayCosto ? formatCurrency(costoVal) : '—'}
          </p>
        </div>
        <div className="rounded-md bg-muted/50 py-1.5">
          <p className="text-[9px] text-muted-foreground uppercase">Utilidad / {u}</p>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {resumen.hayCosto ? formatCurrency(resumen.utilidad) : '—'}
          </p>
        </div>
        <div className="rounded-md bg-muted/50 py-1.5">
          <p className="text-[9px] text-muted-foreground uppercase">Margen</p>
          <p className={`text-xs font-bold ${resumen.hayCosto ? margenColor(resumen.margen) : 'text-muted-foreground'}`}>
            {resumen.hayCosto ? formatPercent(resumen.margen) : '—'}
          </p>
        </div>
      </div>
    );
  }

  // =========================================================
  // VARIANT 'compact' — para acordeones (Recetas cabecera mini).
  // Incluye badge + base + las 4 mini-cajas (estilo card normal).
  // =========================================================
  if (v === 'compact') {
    return (
      <div className="rounded-xl border bg-card p-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]" variant="outline">
            {tipoLabel}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            Base: <strong>{resumen.ingredienteNombre}</strong>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label={`Precio / ${u}`} value={formatCurrency(precioVal)} color={precioColor} />
          <Metric
            label={`Costo / ${u}`}
            value={resumen.hayCosto ? formatCurrency(costoVal) : '—'}
            color="text-orange-700 dark:text-orange-300"
          />
          <Metric
            label={`Utilidad / ${u}`}
            value={resumen.hayCosto ? formatCurrency(resumen.utilidad) : '—'}
            color="text-emerald-700 dark:text-emerald-300"
          />
          <Metric
            label="Margen"
            value={resumen.hayCosto ? formatPercent(resumen.margen) : '—'}
            color={resumen.hayCosto ? margenColor(resumen.margen) : 'text-muted-foreground'}
          />
        </div>
        {!resumen.hayCosto && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Costo por {u} no disponible hasta registrar inventario del ingrediente base.
          </p>
        )}
      </div>
    );
  }

  // =========================================================
  // VARIANT 'full' — ampliado (fichas / recetas expandidas).
  // =========================================================
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]" variant="outline">
          {tipoLabel}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          Base: <strong>{resumen.ingredienteNombre}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label={`Precio / ${u}`} value={formatCurrency(precioVal)} color={precioColor} />
        <Metric
          label={`Costo / ${u}`}
          value={resumen.hayCosto ? formatCurrency(costoVal) : '—'}
          color="text-orange-700 dark:text-orange-300"
        />
        <Metric
          label={`Utilidad / ${u}`}
          value={resumen.hayCosto ? formatCurrency(resumen.utilidad) : '—'}
          color="text-emerald-700 dark:text-emerald-300"
        />
        <Metric
          label="Margen"
          value={resumen.hayCosto ? formatPercent(resumen.margen) : '—'}
          color={resumen.hayCosto ? margenColor(resumen.margen) : 'text-muted-foreground'}
        />
      </div>

      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {resumen.tipo === 'medida' && resumen.min > 0 && <div>Mínimo: {resumen.min} {u}</div>}
        {resumen.tipo === 'medida' && resumen.max > 0 && <div>Máximo: {resumen.max} {u}</div>}
        {resumen.tipo === 'medida' && resumen.incremento > 0 && <div>Incremento: {resumen.incremento} {u}</div>}
        {resumen.tipo === 'porcion' && resumen.mlPorcion > 0 && <div>{resumen.mlPorcion} ml / {u}</div>}
        {resumen.tipo === 'porcion' && resumen.capacidad > 0 && <div>Capacidad contenedor: {resumen.capacidad} ml</div>}
        {resumen.tipo === 'porcion' && resumen.porciones > 0 && <div>{resumen.porciones} porciones / contenedor</div>}
        {resumen.presets.length > 0 && (
          <div>Presets QR: {resumen.presets.join(', ')} {u}</div>
        )}
      </div>

      {!resumen.hayCosto && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Costo por {u} no disponible hasta registrar inventario del ingrediente base.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div className="rounded-md bg-muted/40 p-2 text-center">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${color || ''}`}>{value}</p>
    </div>
  );
}
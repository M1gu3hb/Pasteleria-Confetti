import React from 'react';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TIPO_VENTA,
  esProductoVariable,
  mlPorPorcionEfectivo,
  unidadBaseDesdeMostrada,
} from '@/utils/tipoVentaUtils';

/**
 * Printable product breakdown / cost sheet.
 *
 * 6B / Hotfix visual:
 *  - precio_fijo        → ficha clásica con escandallo y costo por pieza.
 *  - variable_medida    → ficha con métricas POR UNIDAD VENDIBLE (g/kg/ml/l).
 *  - porcion_contenedor → ficha con métricas POR PORCIÓN (shot/copa/vaso).
 *
 * En modos variables NO mostramos el escandallo clásico (no aplica). En su lugar
 * mostramos la configuración real del producto variable.
 */
export default function ProductoDesglose({ producto, lineas, config, ingredienteBase = null }) {
  if (!producto) return null;
  const fecha = format(new Date(), "d MMM yyyy", { locale: es });

  // ============ FICHA VARIABLE ============
  if (esProductoVariable(producto)) {
    return (
      <FichaVariable
        producto={producto}
        ingrediente={ingredienteBase}
        config={config}
        fecha={fecha}
      />
    );
  }

  // ============ FICHA CLÁSICA (precio_fijo) ============
  const costoTotal = (lineas || []).reduce((s, l) => s + (l.costo_linea_calculado || 0), 0);
  const utilidad = (producto.precio_venta || 0) - costoTotal;
  const margen = producto.precio_venta > 0 ? (utilidad / producto.precio_venta * 100) : 0;

  return (
    <div className="ticket-printable letter-doc printable-doc bg-white text-black p-6 mx-auto"
      style={{ width: '500px', fontFamily: 'system-ui, sans-serif', background: '#ffffff', color: '#000000' }}>
      <div className="text-center border-b-2 border-black pb-3 mb-4">
        <h1 className="text-xl font-bold">{config?.nombre_negocio || 'AZECAFE'}</h1>
        <p className="text-xs text-gray-600">FICHA DE PRODUCTO · {fecha}</p>
      </div>

      <div className="mb-4">
        <h2 className="text-2xl font-bold">{producto.nombre}</h2>
        {producto.categoria_nombre && <p className="text-sm text-gray-600">{producto.categoria_nombre}</p>}
        {producto.descripcion && <p className="text-sm mt-1">{producto.descripcion}</p>}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4 text-sm">
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Precio venta</p>
          <p className="font-bold">{formatCurrency(producto.precio_venta)}</p>
        </div>
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Costo</p>
          <p className="font-bold">{formatCurrency(costoTotal)}</p>
        </div>
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Utilidad</p>
          <p className="font-bold">{formatCurrency(utilidad)}</p>
        </div>
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Margen</p>
          <p className="font-bold">{formatPercent(margen)}</p>
        </div>
      </div>

      <h3 className="font-bold border-b border-black mb-2">INGREDIENTES</h3>
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Ingrediente</th>
            <th className="py-1 text-right">Cantidad</th>
            <th className="py-1 text-right">Unidad</th>
            <th className="py-1 text-right">Costo unit.</th>
            <th className="py-1 text-right">Costo línea</th>
          </tr>
        </thead>
        <tbody>
          {(lineas || []).map((l, i) => (
            <tr key={i} className="border-b border-dashed">
              <td className="py-1">{l.ingrediente_nombre}</td>
              <td className="py-1 text-right">{l.cantidad_usada}</td>
              <td className="py-1 text-right">{l.unidad_usada}</td>
              <td className="py-1 text-right">{formatCurrency(l.costo_unitario_base_snapshot || 0)}</td>
              <td className="py-1 text-right font-medium">{formatCurrency(l.costo_linea_calculado || 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan={4} className="py-1">TOTAL COSTO PRODUCCIÓN</td>
            <td className="py-1 text-right">{formatCurrency(costoTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="text-xs text-center text-gray-500 border-t pt-2">
        Documento interno · Costos estimados según receta actual
      </p>
    </div>
  );
}

// =====================================================
// FICHA VARIABLE — variable_medida / porcion_contenedor
// =====================================================
function FichaVariable({ producto, ingrediente, config, fecha }) {
  const tipo = producto.tipo_venta;
  const esMedida = tipo === TIPO_VENTA.VARIABLE_MEDIDA;

  // === Variables compartidas ===
  let unidadLabel = '';
  let precio = 0;
  let costoUnit = 0;
  let utilidad = 0;
  let margen = 0;
  let hayCosto = false;
  let configRows = [];

  if (esMedida) {
    const u = producto.unidad_variable || 'g';
    unidadLabel = u;
    const baseEsperada = unidadBaseDesdeMostrada(u);
    precio = Number(producto.precio_por_unidad_variable) || 0;
    const costoBase = Number(ingrediente?.costo_por_unidad_base) || 0;
    const factor = (u === 'kg' || u === 'l') ? 1000 : 1;
    costoUnit = costoBase > 0 ? costoBase * factor : 0;
    hayCosto = costoUnit > 0;
    utilidad = hayCosto ? precio - costoUnit : 0;
    margen = (hayCosto && precio > 0) ? (utilidad / precio) * 100 : 0;

    configRows = [
      ['Tipo de venta', 'Variable por medida'],
      ['Ingrediente base', producto.ingrediente_base_nombre || ingrediente?.nombre || '—'],
      ['Unidad de venta', u],
      ['Unidad base inventario', baseEsperada || '—'],
      Number(producto.cantidad_minima_variable) > 0 && ['Cantidad mínima', `${producto.cantidad_minima_variable} ${u}`],
      Number(producto.cantidad_maxima_variable) > 0 && ['Cantidad máxima', `${producto.cantidad_maxima_variable} ${u}`],
      Number(producto.incremento_variable) > 0 && ['Incremento', `${producto.incremento_variable} ${u}`],
      Array.isArray(producto.presets_variable_qr) && producto.presets_variable_qr.length > 0
        && ['Presets QR', producto.presets_variable_qr.join(', ') + ' ' + u],
    ].filter(Boolean);
  } else {
    const np = producto.nombre_porcion || 'porción';
    unidadLabel = np;
    precio = Number(producto.precio_por_porcion) || 0;
    const mlPorcion = mlPorPorcionEfectivo({
      ml_por_porcion: producto.ml_por_porcion,
      capacidad_contenedor_ml: producto.capacidad_contenedor_ml,
      porciones_por_contenedor: producto.porciones_por_contenedor,
    });
    const costoBase = Number(ingrediente?.costo_por_unidad_base) || 0;
    costoUnit = costoBase > 0 && mlPorcion > 0 ? costoBase * mlPorcion : 0;
    hayCosto = costoUnit > 0;
    utilidad = hayCosto ? precio - costoUnit : 0;
    margen = (hayCosto && precio > 0) ? (utilidad / precio) * 100 : 0;

    configRows = [
      ['Tipo de venta', 'Por porción de contenedor'],
      ['Ingrediente base', producto.ingrediente_base_nombre || ingrediente?.nombre || '—'],
      ['Nombre de porción', np],
      Number(producto.capacidad_contenedor_ml) > 0
        && ['Capacidad del contenedor', `${producto.capacidad_contenedor_ml} ml`],
      Number(producto.porciones_por_contenedor) > 0
        && ['Porciones por contenedor', String(producto.porciones_por_contenedor)],
      mlPorcion > 0 && ['ml por porción', `${mlPorcion} ml`],
      Array.isArray(producto.presets_porcion_qr) && producto.presets_porcion_qr.length > 0
        && ['Presets QR', producto.presets_porcion_qr.join(', ') + ' ' + np],
    ].filter(Boolean);
  }

  return (
    <div className="ticket-printable letter-doc printable-doc bg-white text-black p-6 mx-auto"
      style={{ width: '500px', fontFamily: 'system-ui, sans-serif', background: '#ffffff', color: '#000000' }}>
      <div className="text-center border-b-2 border-black pb-3 mb-4">
        <h1 className="text-xl font-bold">{config?.nombre_negocio || 'AZECAFE'}</h1>
        <p className="text-xs text-gray-600">FICHA DE PRODUCTO · {fecha}</p>
      </div>

      <div className="mb-4">
        <h2 className="text-2xl font-bold">{producto.nombre}</h2>
        <p className="text-xs text-gray-600 uppercase tracking-wide mt-0.5">
          {esMedida ? 'Venta variable por medida' : 'Venta por porción de contenedor'}
        </p>
        {producto.categoria_nombre && <p className="text-sm text-gray-600 mt-1">{producto.categoria_nombre}</p>}
        {producto.descripcion && <p className="text-sm mt-1">{producto.descripcion}</p>}
      </div>

      <h3 className="font-bold border-b border-black mb-2">MÉTRICAS POR {unidadLabel.toUpperCase()}</h3>
      <div className="grid grid-cols-4 gap-2 mb-4 text-sm">
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Precio / {unidadLabel}</p>
          <p className="font-bold">{formatCurrency(precio)}</p>
        </div>
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Costo / {unidadLabel}</p>
          <p className="font-bold">{hayCosto ? formatCurrency(costoUnit) : '—'}</p>
        </div>
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Utilidad / {unidadLabel}</p>
          <p className="font-bold">{hayCosto ? formatCurrency(utilidad) : '—'}</p>
        </div>
        <div className="border p-2 rounded text-center">
          <p className="text-xs text-gray-600">Margen</p>
          <p className="font-bold">{hayCosto ? formatPercent(margen) : '—'}</p>
        </div>
      </div>

      <h3 className="font-bold border-b border-black mb-2">CONFIGURACIÓN</h3>
      <table className="w-full text-xs mb-4">
        <tbody>
          {configRows.map(([k, v]) => (
            <tr key={k} className="border-b border-dashed">
              <td className="py-1 text-gray-600">{k}</td>
              <td className="py-1 text-right font-medium">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!hayCosto && (
        <p className="text-xs text-gray-600 border border-dashed p-2 rounded mb-3">
          Aviso: costo por {unidadLabel} no disponible hasta registrar inventario del ingrediente base.
        </p>
      )}

      <p className="text-xs text-center text-gray-500 border-t pt-2">
        Documento interno · El escandallo clásico no aplica para venta variable
      </p>
    </div>
  );
}
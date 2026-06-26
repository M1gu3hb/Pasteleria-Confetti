// =====================================================
// utils/inventarioValidation.js
// =====================================================
// 6B / 1.J — Validación de stock ANTES de cobrar.
//
// Único objetivo: dado un set de DetalleVenta (con sus snapshots),
// las recetas activas y el mapa de ingredientes, devolver la lista
// de ingredientes que NO alcanzarían y bloquear el cobro.
//
// Reglas:
//   - Producto precio_fijo: usa RecetaEscandallo. Si la receta no existe o
//     no tiene líneas, NO bloquea (comportamiento histórico: simplemente
//     no descuenta inventario para ese producto).
//   - Producto variable_medida / porcion_contenedor: usa snapshots de
//     DetalleVenta (ingrediente_base_id_snapshot + cantidad_base_consumo
//     o reconstruido con calcularCantidadBaseConsumo).
//     Si falta ingrediente_base_id_snapshot, bloquea con error de config.
//   - Suma consumo por ingrediente para detectar faltantes acumulados
//     (ej. 2 productos que comparten el mismo ingrediente).
//   - 100% pura: no toca BD, no toca caché.
//   - Nunca lanza. Siempre devuelve { ok, faltantes:[], errores:[] }.
// =====================================================

import { TIPO_VENTA, calcularCantidadBaseConsumo } from '@/utils/tipoVentaUtils';
import { parseIngredientesExcluidos, recetaLineaEstaExcluida } from '@/utils/exclusionesUtils';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Valida si hay stock suficiente para cobrar los detalles dados.
 *
 * @param {object} args
 *  - detalles:      array de DetalleVenta (los del cobro)
 *  - recetasAll:    array de RecetaEscandallo (solo activos)
 *  - ingredientesAll: array de Ingrediente
 * @returns {{
 *   ok: boolean,
 *   faltantes: Array<{
 *     producto_nombre: string,
 *     ingrediente_nombre: string,
 *     requerido: number,
 *     disponible: number,
 *     unidad: string,
 *   }>,
 *   errores: Array<{
 *     producto_nombre: string,
 *     motivo: string,
 *   }>,
 * }}
 */
export function validarStockParaCobro({ detalles, recetasAll, ingredientesAll } = {}) {
  const safeDetalles = Array.isArray(detalles) ? detalles : [];
  const safeRecetas = Array.isArray(recetasAll) ? recetasAll : [];
  const safeIng = Array.isArray(ingredientesAll) ? ingredientesAll : [];

  // Acumulador: ingId -> { ing, requerido, productos:[nombre, ...] }
  const consumo = {};
  // Errores de configuración (ej. producto variable sin ingrediente_base).
  const errores = [];

  const ingMap = Object.fromEntries(safeIng.map(i => [i.id, i]));

  for (const det of safeDetalles) {
    if (!det) continue;
    const tipoSnap = det?.tipo_venta_snapshot;
    const productoNombre = det?.producto_nombre || 'Producto';

    const esVariable =
      tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA ||
      tipoSnap === TIPO_VENTA.PORCION_CONTENEDOR;

    if (esVariable) {
      const ingId = det?.ingrediente_base_id_snapshot;
      if (!ingId) {
        errores.push({
          producto_nombre: productoNombre,
          motivo: 'Falta ingrediente base configurado para este producto variable.',
        });
        continue;
      }
      const ing = ingMap[ingId];
      if (!ing) {
        errores.push({
          producto_nombre: productoNombre,
          motivo: 'El ingrediente base ya no existe en inventario.',
        });
        continue;
      }
      // Cantidad en unidad base. Si el snapshot la trae, usarla.
      let cantBase = toNum(det?.cantidad_base_consumo);
      if (cantBase <= 0) {
        cantBase = calcularCantidadBaseConsumo({
          tipo_venta: tipoSnap,
          cantidad_variable: det?.cantidad_variable_snapshot,
          unidad_variable: det?.unidad_variable_snapshot,
          cantidad_porciones: det?.cantidad_porciones_snapshot,
          ml_por_porcion: det?.ml_por_porcion_snapshot,
        });
      }
      if (cantBase <= 0) {
        errores.push({
          producto_nombre: productoNombre,
          motivo: 'No se pudo calcular la cantidad a descontar. Revisa la configuración.',
        });
        continue;
      }
      if (!consumo[ingId]) {
        consumo[ingId] = { ing, requerido: 0, productos: new Set() };
      }
      consumo[ingId].requerido += cantBase;
      consumo[ingId].productos.add(productoNombre);
      continue;
    }

    // ----- precio_fijo (LEGACY) -----
    // Buscar líneas de receta activas para este producto.
    const lineas = safeRecetas.filter(r => r?.producto_id === det?.producto_id && r?.activo !== false);
    // Sin receta → no bloquea (igual que el flujo histórico).
    if (lineas.length === 0) continue;

    const cantidad = toNum(det?.cantidad);
    if (cantidad <= 0) continue;

    // PASO B — Exclusiones "SIN ingrediente" capturadas por mesero.
    // Si la línea de receta corresponde a un ingrediente excluido, saltarla:
    // ni cuenta para validar stock ni se descontará al cobrar.
    const excluidos = parseIngredientesExcluidos(det?.ingredientes_excluidos_snapshot);

    for (const l of lineas) {
      if (recetaLineaEstaExcluida(l, excluidos)) continue;
      const merma = 1 + (toNum(l?.merma_porcentaje) / 100);
      const cantPorProd = toNum(l?.cantidad_convertida_unidad_base) * merma;
      const total = cantPorProd * cantidad;
      if (total <= 0) continue;
      const ing = ingMap[l?.ingrediente_id];
      if (!ing) continue; // ingrediente borrado → flujo histórico no bloquea.
      if (!consumo[l.ingrediente_id]) {
        consumo[l.ingrediente_id] = { ing, requerido: 0, productos: new Set() };
      }
      consumo[l.ingrediente_id].requerido += total;
      consumo[l.ingrediente_id].productos.add(productoNombre);
    }
  }

  // Comparar contra stock_actual.
  const faltantes = [];
  for (const k of Object.keys(consumo)) {
    const { ing, requerido, productos } = consumo[k];
    const disponible = toNum(ing?.stock_actual);
    // Tolerancia mínima (0.001) para evitar falsos negativos por redondeo.
    if (requerido - disponible > 0.001) {
      faltantes.push({
        producto_nombre: Array.from(productos).join(', '),
        ingrediente_nombre: ing?.nombre || 'Ingrediente',
        requerido: Math.round(requerido * 1000) / 1000,
        disponible: Math.round(disponible * 1000) / 1000,
        unidad: ing?.unidad_base || '',
      });
    }
  }

  return {
    ok: faltantes.length === 0 && errores.length === 0,
    faltantes,
    errores,
  };
}

/**
 * Mensaje corto, listo para toast, a partir del resultado de validarStockParaCobro.
 */
export function mensajeFaltanteStock(resultado) {
  const errores = Array.isArray(resultado?.errores) ? resultado.errores : [];
  if (errores.length > 0) {
    const e = errores[0];
    return `No se pudo validar inventario para ${e.producto_nombre}. ${e.motivo}`;
  }
  const faltantes = Array.isArray(resultado?.faltantes) ? resultado.faltantes : [];
  if (faltantes.length > 0) {
    const f = faltantes[0];
    return `No hay inventario suficiente para ${f.producto_nombre}. Requiere ${f.requerido} ${f.unidad} de ${f.ingrediente_nombre} y solo hay ${f.disponible} ${f.unidad}.`;
  }
  return 'No hay inventario suficiente.';
}
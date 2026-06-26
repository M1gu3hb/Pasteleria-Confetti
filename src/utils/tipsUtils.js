/**
 * Utilidades para manejar propinas en todo el sistema.
 * Reglas:
 * - Las propinas NO son ingresos del restaurante.
 * - Nunca afectan: ventas, utilidad, costos, inventario, recetas, margen.
 * - Se separan por estado: pendiente (no liquidada) / liquidada.
 */

/** True si las propinas están activadas en config. Default activo. */
export function tipsEnabled(config) {
  if (!config) return true;
  return config.propinas_activas !== false;
}

/** Parsea CSV de porcentajes sugeridos. Default [5,10,15,20]. */
export function getPorcentajesSugeridos(config) {
  const raw = config?.propina_porcentajes_sugeridos;
  if (!raw || typeof raw !== 'string') return [5, 10, 15, 20];
  const list = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0 && n <= 100);
  return list.length > 0 ? list : [5, 10, 15, 20];
}

/** Devuelve solo ventas pagadas con propina > 0. */
export function filtrarVentasConPropina(ventas) {
  const safe = Array.isArray(ventas) ? ventas : [];
  return safe.filter(v => v?.estado === 'pagada' && (Number(v?.propina_monto) || 0) > 0);
}

/** Suma de propinas de un array de ventas. */
export function sumarPropinas(ventas) {
  const safe = Array.isArray(ventas) ? ventas : [];
  return safe.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0);
}

/** Filtra ventas dentro de un rango de fechas usando fecha_cierre. */
export function filtrarVentasEnRango(ventas, from, to) {
  const safe = Array.isArray(ventas) ? ventas : [];
  const ti = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const tf = to instanceof Date ? to.getTime() : new Date(to).getTime();
  return safe.filter(v => {
    const ref = v?.fecha_cierre || v?.fecha_apertura || v?.created_date;
    if (!ref) return false;
    const t = new Date(ref).getTime();
    return Number.isFinite(t) && t >= ti && t <= tf;
  });
}

/** Agrupa propinas por mesero. Devuelve array ordenado desc. */
export function agruparPropinasPorMesero(ventas) {
  const safe = Array.isArray(ventas) ? ventas : [];
  const map = {};
  safe.forEach(v => {
    const monto = Number(v?.propina_monto) || 0;
    if (monto <= 0) return;
    const key = v?.usuario_mesero_id || '__sin_mesero__';
    if (!map[key]) {
      map[key] = {
        mesero_id: v?.usuario_mesero_id || null,
        mesero_nombre: v?.usuario_mesero_nombre || 'Sin mesero / venta directa',
        total: 0,
        num_ventas: 0,
        venta_ids: [],
      };
    }
    map[key].total += monto;
    map[key].num_ventas += 1;
    if (v?.id) map[key].venta_ids.push(v.id);
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

/**
 * Desglose EXACTO por método de pago — sin reparto proporcional.
 *
 * Reglas:
 * - Ventas por método: vienen directamente de monto_efectivo / monto_tarjeta /
 *   monto_transferencia, MENOS la propina_<metodo> exacta cuando existe (porque
 *   monto_<metodo> incluye la propina cobrada en ese método).
 * - Propinas por método: usan propina_efectivo / propina_tarjeta /
 *   propina_transferencia que se capturan exactos en el momento del cobro.
 * - Total por método = ventas + propinas (lo que físicamente se recibió).
 *
 * Compatibilidad con ventas antiguas (sin propina_<metodo>):
 *   a) Si solo hay UN método de pago, toda la propina se atribuye a ese método.
 *      Esto es contablemente correcto: en una venta de un solo método no hay
 *      ambigüedad — el cliente pagó propina por el mismo medio.
 *   b) Si la venta es mixta antigua sin desglose exacto, NO se reparte
 *      proporcionalmente. La propina se atribuye al `metodo_pago` declarado
 *      (o efectivo si está vacío) y se marca con `tiene_propina_sin_metodo: true`
 *      para que la UI pueda señalarlo si lo desea.
 */
export function desgloseMetodosPagoExacto(ventas) {
  const safe = Array.isArray(ventas) ? ventas : [];
  const resultado = {
    efectivo: { ventas: 0, propinas: 0, total: 0 },
    tarjeta: { ventas: 0, propinas: 0, total: 0 },
    transferencia: { ventas: 0, propinas: 0, total: 0 },
    propinas_sin_metodo: 0, // diagnóstico: cuánto vino de ventas antiguas mixtas sin desglose exacto
  };

  safe.forEach(v => {
    const ventaReal = Number(v?.total) || 0;
    const propina = Number(v?.propina_monto) || 0;
    if (ventaReal <= 0 && propina <= 0) return;

    const ef = Number(v?.monto_efectivo) || 0;
    const ta = Number(v?.monto_tarjeta) || 0;
    const tr = Number(v?.monto_transferencia) || 0;

    // ¿La venta YA trae el desglose exacto de propinas por método?
    const tieneDesglose =
      v?.propina_efectivo !== undefined ||
      v?.propina_tarjeta !== undefined ||
      v?.propina_transferencia !== undefined;

    let pEf = Number(v?.propina_efectivo) || 0;
    let pTa = Number(v?.propina_tarjeta) || 0;
    let pTr = Number(v?.propina_transferencia) || 0;

    if (!tieneDesglose && propina > 0) {
      // Compatibilidad: ventas antiguas. NO repartimos proporcionalmente.
      const metodosUsados = [ef > 0 ? 'efectivo' : null, ta > 0 ? 'tarjeta' : null, tr > 0 ? 'transferencia' : null].filter(Boolean);
      if (metodosUsados.length === 1) {
        // Pago de un solo método: toda la propina a ese método (exacto).
        if (metodosUsados[0] === 'efectivo') pEf = propina;
        else if (metodosUsados[0] === 'tarjeta') pTa = propina;
        else pTr = propina;
      } else {
        // Mixto antiguo sin desglose: atribuir al metodo_pago declarado o efectivo.
        const m = v?.metodo_pago;
        if (m === 'tarjeta') pTa = propina;
        else if (m === 'transferencia') pTr = propina;
        else pEf = propina;
        resultado.propinas_sin_metodo += propina;
      }
    }

    // Ventas reales por método = lo cobrado en ese método MENOS su propina exacta.
    // (monto_<metodo> en POS guarda lo que físicamente entró en ese método,
    // que incluye la propina cobrada en ese método.)
    resultado.efectivo.ventas += Math.max(0, ef - pEf);
    resultado.tarjeta.ventas += Math.max(0, ta - pTa);
    resultado.transferencia.ventas += Math.max(0, tr - pTr);

    resultado.efectivo.propinas += pEf;
    resultado.tarjeta.propinas += pTa;
    resultado.transferencia.propinas += pTr;
  });

  resultado.efectivo.total = resultado.efectivo.ventas + resultado.efectivo.propinas;
  resultado.tarjeta.total = resultado.tarjeta.ventas + resultado.tarjeta.propinas;
  resultado.transferencia.total = resultado.transferencia.ventas + resultado.transferencia.propinas;

  return resultado;
}

/**
 * @deprecated — se conserva como alias para compatibilidad de imports.
 * Internamente usa `desgloseMetodosPagoExacto` (sin reparto proporcional).
 */
export function desgloseMetodosPagoConPropinas(ventas) {
  return desgloseMetodosPagoExacto(ventas);
}
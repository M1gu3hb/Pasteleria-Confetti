import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { desgloseMetodosPagoConPropinas } from '@/utils/tipsUtils';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { desgloseIvaDesdeConfig } from '@/utils/ivaUtils';
import { etiquetaMetodoPago } from '@/utils/metodoPago';

/**
 * Internal printable corte de caja PDF/document.
 * Wraps content in `.ticket-printable` so the existing print CSS only prints this.
 */
const CorteTicket = React.forwardRef(function CorteTicket({ corte, ventas = [], detalles = [], ingredientes = [], gastos = [], cancelaciones = [], detallesCancel = [], alertas = [], entregas = [], config = {}, isEsencial = false, isRP = false }, ref) {
  // Parse desglose por mesero (guardado como JSON string). Tolerante a errores.
  let propinasPorMesero = [];
  try {
    const raw = corte?.propinas_por_mesero;
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) propinasPorMesero = parsed;
    } else if (Array.isArray(raw)) {
      propinasPorMesero = raw;
    }
  } catch (_) { propinasPorMesero = []; }
  const totalPropinas = Number(corte?.total_propinas) || 0;
  // Desglose ventas/propinas/total por método de pago
  const metodos = desgloseMetodosPagoConPropinas(ventas);
  const totalRealMetodos = metodos.efectivo.total + metodos.tarjeta.total + metodos.transferencia.total;
  const fInicio = corte?.fecha_inicio ? format(new Date(corte.fecha_inicio), "d MMM yyyy, HH:mm", { locale: es }) : '—';
  const fCierre = corte?.fecha_cierre ? format(new Date(corte.fecha_cierre), "d MMM yyyy, HH:mm", { locale: es }) : '—';
  const margen = corte?.total_general > 0 ? (corte.utilidad_bruta_total / corte.total_general * 100) : 0;
  const utilidadNeta = (corte?.utilidad_bruta_total || 0) - (corte?.total_gastos || 0);

  // Detalle agrupado por venta
  const detallesPorVenta = detalles.reduce((acc, d) => {
    (acc[d.venta_id] = acc[d.venta_id] || []).push(d);
    return acc;
  }, {});

  // 5b — Productos de las ventas canceladas, agrupados por venta_id.
  // Informativo: solo para listarlos bajo cada cancelación. No afecta totales.
  const detallesCancelPorVenta = (Array.isArray(detallesCancel) ? detallesCancel : []).reduce((acc, d) => {
    (acc[d.venta_id] = acc[d.venta_id] || []).push(d);
    return acc;
  }, {});

  // Productos vendidos
  // 6B / 1.I — Agrupamos por producto. Para productos variables sumamos
  // también la cantidad real (g/ml/shots) para mostrarla en columna aparte.
  const productosMap = {};
  detalles.forEach(d => {
    const key = d.producto_id || d.producto_nombre;
    const tipo = d?.tipo_venta_snapshot || 'precio_fijo';
    if (!productosMap[key]) {
      productosMap[key] = {
        nombre: d.producto_nombre,
        cantidad: 0,
        total: 0,
        costo: 0,
        tipo_venta: tipo,
        // Sumas reales para variables
        cantidad_variable_total: 0,
        unidad_variable: d?.unidad_variable_snapshot || '',
        cantidad_porciones_total: 0,
        nombre_porcion: d?.nombre_porcion_snapshot || '',
      };
    }
    productosMap[key].cantidad += d.cantidad || 0;
    productosMap[key].total += d.subtotal || 0;
    productosMap[key].costo += d.costo_total_linea_snapshot || 0;
    if (tipo === 'variable_medida') {
      productosMap[key].cantidad_variable_total += Number(d?.cantidad_variable_snapshot) || 0;
    } else if (tipo === 'porcion_contenedor') {
      productosMap[key].cantidad_porciones_total += Number(d?.cantidad_porciones_snapshot) || 0;
    }
  });
  // 6B / 1.I — Texto de cantidad real para mostrar en tabla.
  const productos = Object.values(productosMap)
    .map(p => {
      let cantidadReal = '';
      if (p.tipo_venta === 'variable_medida' && p.cantidad_variable_total > 0) {
        const n = p.cantidad_variable_total;
        const txt = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
        cantidadReal = `${txt} ${p.unidad_variable || ''}`.trim();
      } else if (p.tipo_venta === 'porcion_contenedor' && p.cantidad_porciones_total > 0) {
        const n = p.cantidad_porciones_total;
        const nombre = p.nombre_porcion || 'porción';
        cantidadReal = n === 1 ? `1 ${nombre}` : `${n} ${/[sx]$/i.test(nombre) ? nombre : nombre + 's'}`;
      }
      return { ...p, cantidadReal };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div ref={ref} id="cash-cut-pdf-document" className="ticket-printable letter-doc cash-cut-pdf pdf-corte-caja bg-white text-black mx-auto text-sm"
      style={{ fontFamily: 'Inter, sans-serif', width: '215.9mm', maxWidth: '215.9mm', padding: '10mm', boxSizing: 'border-box' }}>
      {/* Encabezado con logo grande */}
      <div className="flex items-center gap-4 border-b-2 border-black pb-4 mb-4 avoid-break">
        {(config?.logo_pdf_url || config?.logo_url) && (
          <img src={config.logo_pdf_url || config.logo_url} alt={config?.nombre_negocio || ''}
            crossOrigin="anonymous"
            style={{ height: '80px', width: '80px', objectFit: 'contain' }} />
        )}
        <div className="flex-1">
          <h1 className="text-3xl font-heading font-black tracking-wider">{config?.nombre_negocio || 'MH Astral Systems'}</h1>
          {config?.direccion && <p className="text-xs">{config.direccion}</p>}
          {config?.telefono && <p className="text-xs">Tel: {config.telefono}</p>}
          {config?.correo && <p className="text-xs">{config.correo}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-black">CORTE DE CAJA</p>
          <p className="text-xs">Folio: <span className="font-mono font-bold">{corte?.folio || '—'}</span></p>
          <p className="text-[10px] text-gray-600 mt-1">{config?.platform_brand || 'MH Astral Systems'}</p>
        </div>
      </div>

      {/* Datos del corte */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-4 border p-3 rounded">
        <div><strong>Apertura:</strong> {fInicio}</div>
        <div><strong>Cierre:</strong> {fCierre}</div>
        <div><strong>Cajero apertura:</strong> {corte?.usuario_apertura_nombre || corte?.usuario_cajero_nombre || '—'}</div>
        <div><strong>Cajero cierre:</strong> {corte?.usuario_cajero_nombre || '—'}</div>
        <div><strong>Estado:</strong> {corte?.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}</div>
        <div><strong>Tipo:</strong> {corte?.tipo_corte === 'turno' ? 'Corte de turno' : 'Cierre diario'}</div>
        {corte?.notas_apertura && <div className="col-span-2"><strong>Notas apertura:</strong> {corte.notas_apertura}</div>}
        {corte?.notas && <div className="col-span-2"><strong>Notas cierre:</strong> {corte.notas}</div>}
      </div>

      {/* Apertura / fondo */}
      <Section title="Apertura y fondo">
        <Grid>
          <Cell label="Fondo esperado apertura" value={formatCurrency(corte?.fondo_esperado_apertura)} />
          <Cell label="Efectivo inicial contado" value={formatCurrency(corte?.efectivo_inicial_contado)} />
          <Cell label="Diferencia apertura" value={formatCurrency(corte?.diferencia_apertura)} />
          <Cell label="Efectivo contado al cierre" value={formatCurrency(corte?.efectivo_contado)} />
          <Cell label="Diferencia efectivo" value={formatCurrency(corte?.diferencia_efectivo)} />
          <Cell label="Dinero dejado en caja" value={formatCurrency(corte?.dinero_dejado_en_caja)} bold />
        </Grid>
      </Section>

      {/* Resumen financiero — en Esencial sólo se muestran ventas y métodos de pago.
          PASO 2 IVA: desglose visual del IVA incluido en el total de ventas.
          NO cambia total_general, costo, utilidad ni margen. */}
      {(() => {
        const ivaCorte = desgloseIvaDesdeConfig(corte?.total_general || 0, config);
        return (
      <Section title={isEsencial ? "Resumen de ventas" : "Resumen financiero"}>
        <Grid>
          <Cell label="Total ventas" value={formatCurrency(corte?.total_general)} bold />
          {ivaCorte.aplica && (
            <>
              <Cell label="Ventas sin IVA" value={formatCurrency(ivaCorte.subtotalSinIva)} />
              <Cell label={`IVA ${ivaCorte.porcentaje}% (incl.)`} value={formatCurrency(ivaCorte.ivaMonto)} />
            </>
          )}
          <Cell label="N° tickets" value={corte?.numero_ventas || 0} />
          <Cell label="Ticket promedio" value={formatCurrency(corte?.ticket_promedio)} />
          <Cell label="Efectivo" value={formatCurrency(corte?.total_efectivo)} />
          <Cell label="Tarjeta" value={formatCurrency(corte?.total_tarjeta)} />
          <Cell label="Transferencia" value={formatCurrency(corte?.total_transferencia)} />
          {!isEsencial && <Cell label="Costo de ventas" value={formatCurrency(corte?.costo_total_estimado)} />}
          {!isEsencial && <Cell label="Utilidad bruta" value={formatCurrency(corte?.utilidad_bruta_total)} />}
          {!isEsencial && <Cell label="Margen promedio" value={formatPercent(margen)} />}
          {!isEsencial && <Cell label="Gastos operativos" value={formatCurrency(corte?.total_gastos)} />}
          {!isEsencial && <Cell label="Utilidad neta est." value={formatCurrency(corte?.utilidad_neta_estimada || utilidadNeta)} bold />}
          <Cell label="Total general" value={formatCurrency((corte?.total_efectivo || 0) + (corte?.total_tarjeta || 0) + (corte?.total_transferencia || 0))} />
        </Grid>
        {ivaCorte.aplica && (
          <p className="text-[10px] text-gray-600 mt-2">
            * IVA {ivaCorte.porcentaje}% incluido en el total de ventas. La utilidad y el margen se calculan sobre el total bruto sin cambios.
          </p>
        )}
      </Section>
        );
      })()}

      {/* Métodos de pago simples (Esencial): solo Método / Monto. */}
      {isEsencial && (
        <Section title="Métodos de pago">
          <table className="w-full text-xs border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Método</th>
                <th className="border px-2 py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border px-2 py-1">Efectivo</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(corte?.total_efectivo)}</td>
              </tr>
              <tr>
                <td className="border px-2 py-1">Tarjeta</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(corte?.total_tarjeta)}</td>
              </tr>
              <tr>
                <td className="border px-2 py-1">Transferencia</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(corte?.total_transferencia)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border px-2 py-1 font-bold">Total</td>
                <td className="border px-2 py-1 text-right font-bold">
                  {formatCurrency((corte?.total_efectivo || 0) + (corte?.total_tarjeta || 0) + (corte?.total_transferencia || 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Métodos de pago — ventas / propinas / total (NO Esencial) */}
      {!isEsencial && totalPropinas > 0 && (
        <Section title="Métodos de pago — ventas, propinas y total">
          <table className="w-full text-xs border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Método</th>
                <th className="border px-2 py-1 text-right">Ventas</th>
                <th className="border px-2 py-1 text-right">Propinas</th>
                <th className="border px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border px-2 py-1">Efectivo</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(metodos.efectivo.ventas)}</td>
                <td className="border px-2 py-1 text-right text-rose-700">{formatCurrency(metodos.efectivo.propinas)}</td>
                <td className="border px-2 py-1 text-right font-bold">{formatCurrency(metodos.efectivo.total)}</td>
              </tr>
              <tr>
                <td className="border px-2 py-1">Tarjeta</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(metodos.tarjeta.ventas)}</td>
                <td className="border px-2 py-1 text-right text-rose-700">{formatCurrency(metodos.tarjeta.propinas)}</td>
                <td className="border px-2 py-1 text-right font-bold">{formatCurrency(metodos.tarjeta.total)}</td>
              </tr>
              <tr>
                <td className="border px-2 py-1">Transferencia</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(metodos.transferencia.ventas)}</td>
                <td className="border px-2 py-1 text-right text-rose-700">{formatCurrency(metodos.transferencia.propinas)}</td>
                <td className="border px-2 py-1 text-right font-bold">{formatCurrency(metodos.transferencia.total)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border px-2 py-1 font-bold">TOTAL</td>
                <td className="border px-2 py-1 text-right font-bold">{formatCurrency(metodos.efectivo.ventas + metodos.tarjeta.ventas + metodos.transferencia.ventas)}</td>
                <td className="border px-2 py-1 text-right font-bold text-rose-700">{formatCurrency(totalPropinas)}</td>
                <td className="border px-2 py-1 text-right font-bold">{formatCurrency(totalRealMetodos)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Propinas — oculto en Esencial (Confetti no usa propinas) */}
      {!isEsencial && (
      <Section title="Propinas">
        <Grid>
          <Cell label="Total propinas" value={formatCurrency(totalPropinas)} bold />
          <Cell label="Ventas reales (sin propina)" value={formatCurrency(corte?.total_general)} />
          <Cell label="Total cobrado (con propina)" value={formatCurrency((Number(corte?.total_general) || 0) + totalPropinas)} bold />
        </Grid>
        {isRP && propinasPorMesero.length > 0 && (
          <table className="w-full text-xs border mt-2">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Mesero</th>
                <th className="border px-2 py-1 text-right">Propinas</th>
              </tr>
            </thead>
            <tbody>
              {propinasPorMesero.map((m, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{m?.mesero_nombre || 'Sin mesero asignado'}</td>
                  <td className="border px-2 py-1 text-right font-bold">{formatCurrency(m?.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      )}

      {/* Detalle de ventas */}
      <Section title={`Detalle de ventas (${ventas.length})`}>
        <table className="w-full text-xs border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Folio</th>
              <th className="border px-2 py-1 text-left">Hora</th>
              {!isEsencial && <th className="border px-2 py-1 text-left">Mesa</th>}
              <th className="border px-2 py-1 text-left">Productos</th>
              <th className="border px-2 py-1 text-right">Total</th>
              <th className="border px-2 py-1 text-left">Pago</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map(v => {
              const dets = detallesPorVenta[v.id] || [];
              return (
                <tr key={v.id}>
                  <td className="border px-2 py-1 font-mono">{v.folio}</td>
                  <td className="border px-2 py-1">{v.fecha_cierre ? format(new Date(v.fecha_cierre), "HH:mm", { locale: es }) : '—'}</td>
                  {!isEsencial && <td className="border px-2 py-1">{v.mesa_numero || '—'}{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}</td>}
                  <td className="border px-2 py-1">
                    {dets.map((d, i) => {
                      // 6B / 1.I — Mostrar "500 g × Producto" / "4 shots × Producto"
                      // en lugar de "Producto ×1" cuando es venta variable.
                      const txtVar = formatearCantidadVariable(d || {});
                      return (
                        <div key={i}>
                          {d.producto_nombre} {txtVar ? `— ${txtVar}` : `×${d.cantidad}`}
                        </div>
                      );
                    })}
                    {dets.length === 0 && <span className="text-gray-400">—</span>}
                  </td>
                  <td className="border px-2 py-1 text-right font-bold">{formatCurrency(v.total)}</td>
                  <td className="border px-2 py-1">{etiquetaMetodoPago(v)}</td>
                </tr>
              );
            })}
            {ventas.length === 0 && (
              <tr><td colSpan={isEsencial ? 5 : 6} className="text-center text-gray-400 py-2">Sin ventas</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Entregas de pastel del día — FASE 3 #6. Informativo: pagar y entregar
          son momentos distintos; estas líneas muestran lo ENTREGADO en el rango
          del corte y NO suman a totales ni a efectivo_esperado. */}
      {Array.isArray(entregas) && entregas.length > 0 && (
        <Section title="Entregas de pastel del día">
          <table className="w-full text-xs border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Pastel</th>
                <th className="border px-2 py-1 text-left">Hora</th>
                <th className="border px-2 py-1 text-left">Folio</th>
                <th className="border px-2 py-1 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((e, i) => (
                <tr key={(e?.folio || '') + i}>
                  <td className="border px-2 py-1">Entregado {e?.nombre || 'Pastel'}</td>
                  <td className="border px-2 py-1">{e?.hora || '—'}</td>
                  <td className="border px-2 py-1 font-mono">{e?.folio || '—'}</td>
                  <td className="border px-2 py-1">entregado</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-600 mt-2">
            * Informativo. Las entregas no suman a los totales del corte ni al efectivo esperado.
          </p>
        </Section>
      )}

      {/* Productos vendidos — en Esencial sin columnas de costo/utilidad.
          6B / 1.I — Nueva columna "Cantidad real" muestra g/ml/shots para variables. */}
      <Section title="Productos vendidos">
        <table className="w-full text-xs border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Producto</th>
              <th className="border px-2 py-1 text-right">Líneas</th>
              <th className="border px-2 py-1 text-right">Total</th>
              {!isEsencial && <th className="border px-2 py-1 text-right">Costo</th>}
              {!isEsencial && <th className="border px-2 py-1 text-right">Utilidad</th>}
            </tr>
          </thead>
          <tbody>
            {productos.map((p, i) => (
              <tr key={i}>
                <td className="border px-2 py-1">{p.nombre}</td>
                <td className="border px-2 py-1 text-right">{p.cantidad}</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(p.total)}</td>
                {!isEsencial && <td className="border px-2 py-1 text-right">{formatCurrency(p.costo)}</td>}
                {!isEsencial && <td className="border px-2 py-1 text-right font-bold">{formatCurrency(p.total - p.costo)}</td>}
              </tr>
            ))}
            {productos.length === 0 && (
              <tr><td colSpan={isEsencial ? 3 : 5} className="text-center text-gray-400 py-2">Sin productos</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Ingredientes consumidos — solo Operativo / Pro */}
      {!isEsencial && (
      <Section title="Ingredientes / insumos consumidos">
        <table className="w-full text-xs border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Ingrediente</th>
              <th className="border px-2 py-1 text-right">Cantidad</th>
              <th className="border px-2 py-1 text-left">Unidad</th>
              <th className="border px-2 py-1 text-right">Costo unit.</th>
              <th className="border px-2 py-1 text-right">Costo total</th>
            </tr>
          </thead>
          <tbody>
            {ingredientes.map((i, idx) => (
              <tr key={idx}>
                <td className="border px-2 py-1">{i.nombre}</td>
                <td className="border px-2 py-1 text-right">{Number.isFinite(Number(i?.cantidad)) ? Number(i.cantidad).toFixed(2) : '0.00'}</td>
                <td className="border px-2 py-1">{i.unidad}</td>
                <td className="border px-2 py-1 text-right">{formatCurrency(i.costoUnit)}</td>
                <td className="border px-2 py-1 text-right font-bold">{formatCurrency(i.costoTotal)}</td>
              </tr>
            ))}
            {ingredientes.length === 0 && (
              <tr><td colSpan="5" className="text-center text-gray-400 py-2">Sin consumo registrado</td></tr>
            )}
          </tbody>
        </table>
      </Section>
      )}

      {/* Gastos — solo Operativo / Pro */}
      {!isEsencial && gastos.length > 0 && (
        <Section title="Gastos operativos">
          <table className="w-full text-xs border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Categoría</th>
                <th className="border px-2 py-1 text-left">Descripción</th>
                <th className="border px-2 py-1 text-left">Pago</th>
                <th className="border px-2 py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1 capitalize">{g.categoria}</td>
                  <td className="border px-2 py-1">{g.descripcion}</td>
                  <td className="border px-2 py-1 capitalize">{g.metodo_pago || '—'}</td>
                  <td className="border px-2 py-1 text-right font-bold">{formatCurrency(g.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Inventario bajo / crítico — solo Operativo / Pro */}
      {!isEsencial && alertas.length > 0 && (
        <Section title="Inventario bajo / crítico">
          <table className="w-full text-xs border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Ingrediente</th>
                <th className="border px-2 py-1 text-right">Stock actual</th>
                <th className="border px-2 py-1 text-right">Stock mínimo</th>
                <th className="border px-2 py-1 text-left">Estado</th>
                <th className="border px-2 py-1 text-left">Recomendación</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{a.nombre}</td>
                  <td className="border px-2 py-1 text-right">{a.stock_actual} {a.unidad_base}</td>
                  <td className="border px-2 py-1 text-right">{a.stock_minimo || 0} {a.unidad_base}</td>
                  <td className="border px-2 py-1 capitalize">{a.status}</td>
                  <td className="border px-2 py-1">
                    {a.status === 'agotado' ? 'Comprar urgente' :
                     a.status === 'critico' ? 'Comprar pronto' : 'Reabastecer'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Cancelaciones — 5b: distingue devolución (reembolso) de cancelación
          y lista los productos de cada venta. INFORMATIVO: ya están fuera del
          total del corte (el total lee solo ventas 'pagada'). */}
      {cancelaciones.length > 0 && (
        <Section title="Cancelaciones y devoluciones">
          <table className="w-full text-xs border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Folio</th>
                <th className="border px-2 py-1 text-left">Tipo</th>
                <th className="border px-2 py-1 text-left">Productos</th>
                <th className="border px-2 py-1 text-left">Motivo</th>
                <th className="border px-2 py-1 text-left">Usuario</th>
                <th className="border px-2 py-1 text-right">Reembolso</th>
              </tr>
            </thead>
            <tbody>
              {cancelaciones.map((c, i) => {
                const esDevolucion = c?.tipo_cancelacion === 'devolucion';
                const dets = detallesCancelPorVenta[c.id] || [];
                return (
                  <tr key={c.id || i}>
                    <td className="border px-2 py-1 font-mono">{c.folio}</td>
                    <td className="border px-2 py-1">
                      {esDevolucion
                        ? <span className="font-bold text-red-700">Devolución (reembolso)</span>
                        : <span>Cancelación</span>}
                    </td>
                    <td className="border px-2 py-1">
                      {dets.map((d, j) => {
                        const txtVar = formatearCantidadVariable(d || {});
                        return (
                          <div key={j}>
                            {d.producto_nombre} {txtVar ? `— ${txtVar}` : `×${d.cantidad}`}
                          </div>
                        );
                      })}
                      {dets.length === 0 && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="border px-2 py-1">{c.motivo_cancelacion || '—'}</td>
                    <td className="border px-2 py-1">{c.cancelado_por_nombre || c.usuario_cajero_nombre || c.usuario_mesero_nombre || '—'}</td>
                    <td className="border px-2 py-1 text-right font-bold">
                      {esDevolucion ? formatCurrency(Number(c.monto_devuelto) || 0) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-600 mt-2">
            * Las ventas canceladas y devueltas no se suman al total del corte ni a los totales por método. Listado informativo.
          </p>
        </Section>
      )}

      {/* Firmas */}
      <div className="grid grid-cols-2 gap-8 mt-10 text-xs">
        <div className="text-center">
          <div className="border-t border-black pt-1">Responsable de caja</div>
          <p>{corte?.usuario_cajero_nombre || ''}</p>
        </div>
        <div className="text-center">
          <div className="border-t border-black pt-1">Administrador</div>
        </div>
      </div>

      {config?.pdf_footer && (
        <p className="text-center text-[10px] text-gray-700 mt-4">{config.pdf_footer}</p>
      )}
      <p className="text-center text-[10px] text-gray-500 mt-6">
        Documento interno · {config?.nombre_sistema || config?.platform_brand || 'MH Astral Systems'} · Generado {format(new Date(), "d MMM yyyy HH:mm", { locale: es })}
      </p>
    </div>
  );
});

export default CorteTicket;

function Section({ title, children }) {
  // pdf-block: marcador para que el paginador inteligente de pdfDownload.js
  // NO corte el título de la sección dejándolo solo al final de página.
  //
  // HOTFIX visual: la línea horizontal se RENDERIZA APARTE como un <div>
  // hermano para que el border-bottom NUNCA quede pegado al texto del h2.
  // Antes html2canvas dibujaba el border-b muy cercano a la línea base
  // de las letras y se veía como si la línea atravesara el subtítulo.
  return (
    <div className="mb-4 pdf-block" style={{ pageBreakInside: 'auto', breakInside: 'auto' }}>
      <h2
        className="font-bold text-sm uppercase avoid-break"
        style={{
          margin: 0,
          padding: 0,
          lineHeight: 1.3,
          pageBreakAfter: 'avoid',
          breakAfter: 'avoid',
        }}
      >
        {title}
      </h2>
      <div
        aria-hidden
        style={{
          height: 0,
          borderBottom: '1px solid #000',
          marginTop: '4px',
          marginBottom: '8px',
        }}
      />
      {children}
    </div>
  );
}
function Grid({ children }) {
  return <div className="grid grid-cols-3 gap-2 text-xs">{children}</div>;
}
function Cell({ label, value, bold }) {
  return (
    <div className="border p-2 rounded">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={bold ? 'font-bold' : ''}>{value}</div>
    </div>
  );
}
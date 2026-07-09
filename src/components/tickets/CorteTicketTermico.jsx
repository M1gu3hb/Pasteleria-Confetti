import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { desgloseMetodosPagoConPropinas } from '@/utils/tipsUtils';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { desgloseIvaDesdeConfig } from '@/utils/ivaUtils';
import { etiquetaMetodoPago } from '@/utils/metodoPago';

/**
 * Corte de caja en layout TÉRMICO (una sola columna) para imprimir por ESC/POS.
 *
 * 🔴 DINERO: NO recalcula NADA. Lee los MISMOS `corte.*` (valores ya calculados
 * y guardados) y usa los MISMOS helpers/derivaciones que CorteTicket (copiados
 * verbatim). Muestra EXACTAMENTE los mismos datos que el PDF; solo cambia el
 * layout (una columna, angosto) para el papel térmico. Es un "ticketzote".
 *
 * Se rasteriza con renderTicketA576(node, 576|384) y se manda por el plugin.
 */
const C_TXT = '#000';
const C_MUTED = '#000';

const CorteTicketTermico = React.forwardRef(function CorteTicketTermico({
  corte, ventas = [], detalles = [], ingredientes = [], gastos = [], cancelaciones = [],
  detallesCancel = [], alertas = [], entregas = [], config = {}, isEsencial = false, isRP = false,
}, ref) {
  // ===== Derivaciones — VERBATIM de CorteTicket (mismos números) =====
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
  const metodos = desgloseMetodosPagoConPropinas(ventas);
  const totalRealMetodos = metodos.efectivo.total + metodos.tarjeta.total + metodos.transferencia.total;
  const fInicio = corte?.fecha_inicio ? format(new Date(corte.fecha_inicio), "d MMM yyyy, HH:mm", { locale: es }) : '—';
  const fCierre = corte?.fecha_cierre ? format(new Date(corte.fecha_cierre), "d MMM yyyy, HH:mm", { locale: es }) : '—';
  const margen = corte?.total_general > 0 ? (corte.utilidad_bruta_total / corte.total_general * 100) : 0;
  const utilidadNeta = (corte?.utilidad_bruta_total || 0) - (corte?.total_gastos || 0);
  const gastosArr = Array.isArray(gastos) ? gastos : [];
  const totalGastosPdf = gastosArr.reduce((s, g) => s + (Number(g?.monto) || 0), 0);
  const gastosEfectivoPdf = gastosArr.reduce((s, g) => s + (g?.metodo_pago === 'efectivo' ? (Number(g.monto) || 0) : 0), 0);

  const detallesPorVenta = detalles.reduce((acc, d) => {
    (acc[d.venta_id] = acc[d.venta_id] || []).push(d);
    return acc;
  }, {});
  const detallesCancelPorVenta = (Array.isArray(detallesCancel) ? detallesCancel : []).reduce((acc, d) => {
    (acc[d.venta_id] = acc[d.venta_id] || []).push(d);
    return acc;
  }, {});

  const productosMap = {};
  detalles.forEach(d => {
    const key = d.producto_id || d.producto_nombre;
    const tipo = d?.tipo_venta_snapshot || 'precio_fijo';
    if (!productosMap[key]) {
      productosMap[key] = {
        nombre: d.producto_nombre, cantidad: 0, total: 0, costo: 0, tipo_venta: tipo,
        cantidad_variable_total: 0, unidad_variable: d?.unidad_variable_snapshot || '',
        cantidad_porciones_total: 0, nombre_porcion: d?.nombre_porcion_snapshot || '',
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
  const productos = Object.values(productosMap).map(p => {
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
  }).sort((a, b) => b.total - a.total);

  const ivaCorte = desgloseIvaDesdeConfig(corte?.total_general || 0, config);
  const totalGeneralSuma = (corte?.total_efectivo || 0) + (corte?.total_tarjeta || 0) + (corte?.total_transferencia || 0);
  const logo = config?.logo_ticket_url || config?.logo_url || config?.logo_pdf_url || '';

  return (
    <div
      ref={ref}
      className="corte-termico"
      style={{
        width: '384px', maxWidth: '384px', background: '#fff', color: C_TXT,
        fontFamily: "'Courier New', Courier, monospace", fontSize: '12px', lineHeight: 1.35,
        padding: '10px 12px', boxSizing: 'border-box',
      }}
    >
      {/* Encabezado */}
      <div style={{ textAlign: 'center' }}>
        {logo ? (
          <img src={logo} alt="" crossOrigin="anonymous"
            style={{ maxWidth: '120px', maxHeight: '64px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
        ) : null}
        <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{config?.nombre_negocio || 'MH Astral Systems'}</div>
        {config?.direccion && <div style={{ fontSize: '10px' }}>{config.direccion}</div>}
        {config?.telefono && <div style={{ fontSize: '10px' }}>Tel: {config.telefono}</div>}
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '4px' }}>CORTE DE CAJA</div>
        <div style={{ fontSize: '11px' }}>Folio: <b>{corte?.folio || '—'}</b></div>
      </div>

      <Linea />

      {/* Datos del corte */}
      <Fila label="Apertura" value={fInicio} />
      <Fila label="Cierre" value={fCierre} />
      <Fila label="Cajero apertura" value={corte?.usuario_apertura_nombre || corte?.usuario_cajero_nombre || '—'} />
      <Fila label="Cajero cierre" value={corte?.usuario_cajero_nombre || '—'} />
      <Fila label="Estado" value={corte?.estado === 'cerrado' ? 'Cerrado' : 'Abierto'} />
      <Fila label="Tipo" value={corte?.tipo_corte === 'turno' ? 'Corte de turno' : 'Cierre diario'} />
      {corte?.notas_apertura && <Fila label="Notas apertura" value={corte.notas_apertura} />}
      {corte?.notas && <Fila label="Notas cierre" value={corte.notas} />}

      {/* Apertura y fondo */}
      <Titulo>Apertura y fondo</Titulo>
      <Fila label="Fondo esperado apertura" value={formatCurrency(corte?.fondo_esperado_apertura)} />
      <Fila label="Efectivo inicial contado" value={formatCurrency(corte?.efectivo_inicial_contado)} />
      <Fila label="Diferencia apertura" value={formatCurrency(corte?.diferencia_apertura)} />
      <Fila label="Efectivo contado al cierre" value={formatCurrency(corte?.efectivo_contado)} />
      <Fila label="Diferencia efectivo" value={formatCurrency(corte?.diferencia_efectivo)} />
      <Fila label="Dinero dejado en caja" value={formatCurrency(corte?.dinero_dejado_en_caja)} bold />

      {/* Resumen financiero / de ventas */}
      <Titulo>{isEsencial ? 'Resumen de ventas' : 'Resumen financiero'}</Titulo>
      <Fila label="Total ventas" value={formatCurrency(corte?.total_general)} bold />
      {ivaCorte.aplica && (
        <>
          <Fila label="Ventas sin IVA" value={formatCurrency(ivaCorte.subtotalSinIva)} />
          <Fila label={`IVA ${ivaCorte.porcentaje}% (incl.)`} value={formatCurrency(ivaCorte.ivaMonto)} />
        </>
      )}
      <Fila label="N° tickets" value={corte?.numero_ventas || 0} />
      <Fila label="Ticket promedio" value={formatCurrency(corte?.ticket_promedio)} />
      <Fila label="Efectivo" value={formatCurrency(corte?.total_efectivo)} />
      <Fila label="Tarjeta" value={formatCurrency(corte?.total_tarjeta)} />
      <Fila label="Transferencia" value={formatCurrency(corte?.total_transferencia)} />
      {!isEsencial && <Fila label="Costo de ventas" value={formatCurrency(corte?.costo_total_estimado)} />}
      {!isEsencial && <Fila label="Utilidad bruta" value={formatCurrency(corte?.utilidad_bruta_total)} />}
      {!isEsencial && <Fila label="Margen promedio" value={formatPercent(margen)} />}
      {!isEsencial && <Fila label="Gastos operativos" value={formatCurrency(corte?.total_gastos)} />}
      {!isEsencial && <Fila label="Utilidad neta est." value={formatCurrency(corte?.utilidad_neta_estimada || utilidadNeta)} bold />}
      <Fila label="Total general" value={formatCurrency(totalGeneralSuma)} />
      {ivaCorte.aplica && (
        <div style={{ fontSize: '9px', marginTop: '3px' }}>* IVA {ivaCorte.porcentaje}% incluido en el total de ventas.</div>
      )}

      {/* Métodos de pago — simple (Esencial) */}
      {isEsencial && (
        <>
          <Titulo>Métodos de pago</Titulo>
          <Fila label="Efectivo" value={formatCurrency(corte?.total_efectivo)} />
          <Fila label="Tarjeta" value={formatCurrency(corte?.total_tarjeta)} />
          <Fila label="Transferencia" value={formatCurrency(corte?.total_transferencia)} />
          <Fila label="Total" value={formatCurrency(totalGeneralSuma)} bold />
        </>
      )}

      {/* Métodos de pago — ventas / propinas / total (NO Esencial) */}
      {!isEsencial && totalPropinas > 0 && (
        <>
          <Titulo>Métodos — ventas / propinas / total</Titulo>
          {['efectivo', 'tarjeta', 'transferencia'].map((m) => (
            <div key={m} style={{ marginBottom: '3px' }}>
              <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{m}</div>
              <Fila label="Ventas" value={formatCurrency(metodos[m].ventas)} indent />
              <Fila label="Propinas" value={formatCurrency(metodos[m].propinas)} indent />
              <Fila label="Total" value={formatCurrency(metodos[m].total)} indent bold />
            </div>
          ))}
          <Fila label="TOTAL ventas" value={formatCurrency(metodos.efectivo.ventas + metodos.tarjeta.ventas + metodos.transferencia.ventas)} bold />
          <Fila label="TOTAL propinas" value={formatCurrency(totalPropinas)} bold />
          <Fila label="TOTAL con propina" value={formatCurrency(totalRealMetodos)} bold />
        </>
      )}

      {/* Propinas (NO Esencial) */}
      {!isEsencial && (
        <>
          <Titulo>Propinas</Titulo>
          <Fila label="Total propinas" value={formatCurrency(totalPropinas)} bold />
          <Fila label="Ventas reales (sin propina)" value={formatCurrency(corte?.total_general)} />
          <Fila label="Total cobrado (con propina)" value={formatCurrency((Number(corte?.total_general) || 0) + totalPropinas)} bold />
          {isRP && propinasPorMesero.length > 0 && propinasPorMesero.map((m, i) => (
            <Fila key={i} label={m?.mesero_nombre || 'Sin mesero'} value={formatCurrency(m?.total)} indent />
          ))}
        </>
      )}

      {/* Detalle de ventas */}
      <Titulo>{`Detalle de ventas (${ventas.length})`}</Titulo>
      {ventas.length === 0 && <div style={{ fontSize: '11px' }}>Sin ventas</div>}
      {ventas.map((v) => {
        const dets = detallesPorVenta[v.id] || [];
        const hora = v.fecha_cierre ? format(new Date(v.fecha_cierre), 'HH:mm', { locale: es }) : '—';
        return (
          <div key={v.id} style={{ marginBottom: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>{v.folio} · {hora}</span>
              <span>{formatCurrency(v.total)}</span>
            </div>
            <div style={{ fontSize: '10px' }}>{etiquetaMetodoPago(v)}{!isEsencial && (v.mesa_numero || v.cliente_nombre) ? ` · ${v.mesa_numero || ''}${v.cliente_nombre ? ' ' + v.cliente_nombre : ''}` : ''}</div>
            {dets.map((d, i) => {
              const txtVar = formatearCantidadVariable(d || {});
              return (
                <div key={i} style={{ fontSize: '10px', paddingLeft: '6px' }}>
                  · {d.producto_nombre} {txtVar ? `— ${txtVar}` : `×${d.cantidad}`}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Entregas de pastel del día */}
      {Array.isArray(entregas) && entregas.length > 0 && (
        <>
          <Titulo>Entregas de pastel del día</Titulo>
          {entregas.map((e, i) => (
            <div key={(e?.folio || '') + i} style={{ fontSize: '11px' }}>
              {e?.hora || '—'} · {e?.folio || '—'} · Entregado {e?.nombre || 'Pastel'}
            </div>
          ))}
          <div style={{ fontSize: '9px', marginTop: '3px' }}>* Informativo. No suman a totales ni al efectivo esperado.</div>
        </>
      )}

      {/* Productos vendidos */}
      <Titulo>Productos vendidos</Titulo>
      {productos.length === 0 && <div style={{ fontSize: '11px' }}>Sin productos</div>}
      {productos.map((p, i) => (
        <div key={i} style={{ marginBottom: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ overflowWrap: 'break-word', minWidth: 0, flex: '1 1 auto' }}>{p.nombre} <span style={{ fontSize: '10px' }}>×{p.cantidad}</span></span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' }}>{formatCurrency(p.total)}</span>
          </div>
          {!isEsencial && (
            <div style={{ fontSize: '9px', paddingLeft: '6px' }}>Costo {formatCurrency(p.costo)} · Utilidad {formatCurrency(p.total - p.costo)}</div>
          )}
        </div>
      ))}

      {/* Ingredientes / insumos (NO Esencial) */}
      {!isEsencial && (
        <>
          <Titulo>Ingredientes / insumos consumidos</Titulo>
          {ingredientes.length === 0 && <div style={{ fontSize: '11px' }}>Sin consumo registrado</div>}
          {ingredientes.map((i, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span>{i.nombre} {Number.isFinite(Number(i?.cantidad)) ? Number(i.cantidad).toFixed(2) : '0.00'} {i.unidad}</span>
              <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatCurrency(i.costoTotal)}</span>
            </div>
          ))}
        </>
      )}

      {/* Gastos */}
      {gastosArr.length > 0 && (
        <>
          <Titulo>Gastos</Titulo>
          {gastosArr.map((g, i) => {
            const fechaG = g?.created_date || g?.fecha;
            const hora = fechaG ? format(new Date(fechaG), 'HH:mm', { locale: es }) : '—';
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ overflowWrap: 'break-word', minWidth: 0, flex: '1 1 auto' }}>{hora} · {g.descripcion || g.categoria || '—'} <span style={{ fontSize: '9px' }}>({g.metodo_pago || '—'})</span></span>
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' }}>{formatCurrency(g.monto)}</span>
              </div>
            );
          })}
          <Fila label="Total gastos" value={formatCurrency(totalGastosPdf)} bold />
          {gastosEfectivoPdf > 0 && (
            <Fila label="De ellos en efectivo (restan del efectivo esperado)" value={formatCurrency(gastosEfectivoPdf)} />
          )}
        </>
      )}

      {/* Inventario bajo / crítico (NO Esencial) */}
      {!isEsencial && alertas.length > 0 && (
        <>
          <Titulo>Inventario bajo / crítico</Titulo>
          {alertas.map((a, i) => (
            <div key={i} style={{ fontSize: '11px' }}>
              {a.nombre}: {a.stock_actual} {a.unidad_base} (mín {a.stock_minimo || 0}) · {a.status}
            </div>
          ))}
        </>
      )}

      {/* Cancelaciones y devoluciones */}
      {cancelaciones.length > 0 && (
        <>
          <Titulo>Cancelaciones y devoluciones</Titulo>
          {cancelaciones.map((c, i) => {
            const esDevolucion = c?.tipo_cancelacion === 'devolucion';
            const dets = detallesCancelPorVenta[c.id] || [];
            return (
              <div key={c.id || i} style={{ marginBottom: '4px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>{c.folio} · {esDevolucion ? 'Devolución' : 'Cancelación'}</span>
                  <span>{esDevolucion ? formatCurrency(Number(c.monto_devuelto) || 0) : '—'}</span>
                </div>
                {dets.map((d, j) => {
                  const txtVar = formatearCantidadVariable(d || {});
                  return (
                    <div key={j} style={{ fontSize: '10px', paddingLeft: '6px' }}>
                      · {d.producto_nombre} {txtVar ? `— ${txtVar}` : `×${d.cantidad}`}
                    </div>
                  );
                })}
                <div style={{ fontSize: '9px', paddingLeft: '6px' }}>Motivo: {c.motivo_cancelacion || '—'} · {c.cancelado_por_nombre || c.usuario_cajero_nombre || c.usuario_mesero_nombre || '—'}</div>
              </div>
            );
          })}
          <div style={{ fontSize: '9px', marginTop: '2px' }}>* Informativo. No suman al total del corte ni a los métodos.</div>
        </>
      )}

      {/* Firmas / footer */}
      <Linea />
      <div style={{ marginTop: '18px' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '2px', fontSize: '10px' }}>Responsable de caja: {corte?.usuario_cajero_nombre || ''}</div>
      </div>
      <div style={{ marginTop: '16px' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '2px', fontSize: '10px' }}>Administrador</div>
      </div>
      {config?.pdf_footer && <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>{config.pdf_footer}</div>}
      <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>
        Documento interno · {config?.nombre_sistema || config?.platform_brand || 'MH Astral Systems'}
      </div>
      <div style={{ textAlign: 'center', fontSize: '9px' }}>
        Generado {format(new Date(), "d MMM yyyy HH:mm", { locale: es })}
      </div>
    </div>
  );
});

export default CorteTicketTermico;

function Linea() {
  return <div style={{ borderTop: '1px dashed #000', margin: '7px 0' }} />;
}

function Titulo({ children }) {
  return (
    <>
      <Linea />
      <div style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', marginBottom: '3px' }}>{children}</div>
    </>
  );
}

function Fila({ label, value, bold, indent }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', paddingLeft: indent ? '8px' : 0 }}>
      <span style={{ color: C_MUTED, overflowWrap: 'break-word', minWidth: 0, flex: '1 1 auto' }}>{label}</span>
      <span style={{ fontWeight: bold ? 'bold' : 'normal', textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

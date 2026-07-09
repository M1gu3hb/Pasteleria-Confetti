import React from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { getVentaTotal } from '@/utils/ventaTotales';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { desgloseIvaDesdeConfig } from '@/utils/ivaUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Ticket / pre-cuenta en formato TÉRMICO 58MM.
 *
 * Se imprime vía iframe aislado (lib/print.js → printDocument), que aplica
 * CSS @page 58mm auto. El ancho real de impresión es 48mm centrado dentro
 * del papel de 58mm. Tipografía monospace 10px compacta.
 *
 * En PANTALLA se muestra un poco más amplio (max-width 320px) para que el
 * usuario lea bien el preview en el dialog. Al imprimir, el CSS del iframe
 * lo restringe a 48mm térmico.
 *
 * NOTA: el data-thermal-ticket sigue siendo "letter" SOLO como marcador
 * para que printDocument lo encuentre (cambiado a "58" para mayor claridad).
 */
// Parse defensivo de líneas de producto desde venta.notas (pedido web de
// catálogo, que no genera DetalleVenta). Robusto en DOS PASADAS para soportar
// nombres con paréntesis: "- 1x Pastel Mini (1 kg aprox) ($140)".
//   Pasada 1: el ÚLTIMO "$NUM" de la línea es el precio.
//   Pasada 2: lo que queda antes (sin ese precio ni paréntesis envolventes)
//             es el nombre.
// Devuelve [] si no reconoce líneas de producto.
export function parseProductosDesdeNotas(notas) {
  if (!notas || typeof notas !== 'string') return [];
  const items = [];
  for (const lineaRaw of notas.split('\n')) {
    const linea = (lineaRaw || '').trim();
    if (!linea) continue;
    // Ignorar encabezados y totales.
    if (/^pedido web/i.test(linea)) continue;
    if (/^productos\s+solicitados/i.test(linea)) continue;
    if (/^(sub)?total/i.test(linea)) continue;

    // Solo líneas que empiezan con "- " o con "<dígitos>x/×".
    const cab = linea.match(/^[-•*]?\s*(\d+)\s*[x×]\s+(.+)$/i);
    if (!cab) continue;
    const cantidad = parseInt(cab[1], 10) || 1;
    let resto = (cab[2] || '').trim();

    // Pasada 1 — último "$NUM" (con o sin paréntesis) = precio.
    let precio = 0;
    const precios = resto.match(/\$\s*[\d.,]+/g);
    if (precios && precios.length > 0) {
      const ultimo = precios[precios.length - 1];
      precio = parseFloat(ultimo.replace(/[$\s,]/g, '')) || 0;
      // Pasada 2 — quitar SOLO la última aparición del precio del nombre.
      const idx = resto.lastIndexOf(ultimo);
      resto = (resto.slice(0, idx) + resto.slice(idx + ultimo.length));
    }

    // Limpiar separadores/paréntesis envolventes residuales del precio.
    let nombre = resto
      .replace(/[\s\-–—:]*\(\s*\)\s*$/g, '') // "( )" vacío al final
      .replace(/[\s\-–—:]+$/g, '')           // separadores colgantes al final
      .trim();

    if (nombre) items.push({ producto_nombre: nombre, cantidad, subtotal: precio });
  }
  return items;
}

export default function PreCuentaTicket({ venta, detalles, mesa, config, codigo, esFinal = false }) {
  if (!venta) return null;
  const fecha = venta.fecha_cierre || venta.fecha_apertura
    ? format(new Date(venta.fecha_cierre || venta.fecha_apertura), "d MMM yyyy · HH:mm", { locale: es })
    : format(new Date(), "d MMM yyyy · HH:mm", { locale: es });

  // Pedidos web de catálogo no tienen DetalleVenta: sus productos viven en
  // venta.notas como texto. Si no hay detalles, parseamos las notas.
  const detallesArr = Array.isArray(detalles) ? detalles : [];
  const detallesEfectivos = detallesArr.length > 0
    ? detallesArr
    : parseProductosDesdeNotas(venta.notas);

  return (
    <div
      className="ticket-printable thermal-58 bg-white text-black mx-auto"
      data-thermal-ticket="58"
      style={{
        width: '100%',
        maxWidth: '320px',
        padding: '8px 10px',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '11px',
        lineHeight: '1.3',
        color: '#000',
      }}>
      {/* Encabezado con logo — compacto para 58mm */}
      <div style={{ textAlign: 'center' }}>
        {(config?.logo_ticket_url || config?.logo_url) && config?.mostrar_logo_ticket !== false && (
          <img
            src={config.logo_ticket_url || config.logo_url}
            alt=""
            crossOrigin="anonymous"
            style={{
              maxWidth: '110px',
              maxHeight: '60px',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              margin: '0 auto 4px',
              display: 'block',
            }}
          />
        )}
        <h1 style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.5px', margin: 0 }}>
          {config?.nombre_negocio || 'MH Astral Systems'}
        </h1>
        {config?.direccion && <p style={{ fontSize: '10px', margin: '2px 0 0' }}>{config.direccion}</p>}
        {config?.telefono && <p style={{ fontSize: '10px', margin: 0 }}>Tel: {config.telefono}</p>}
        <p style={{ fontWeight: 'bold', marginTop: '4px', fontSize: '11px' }}>
          {esFinal ? 'TICKET DE PAGO' : 'PRE-CUENTA'}
        </p>
      </div>

      <Linea />

      {/* Datos */}
      <div style={{ fontSize: '10px' }}>
        <Row label="Folio" value={venta.folio} bold />
        {mesa && <Row label="Mesa" value={`#${mesa.numero} ${mesa.nombre || ''}`} />}
        {venta.personas > 0 && <Row label="Personas" value={venta.personas} />}
        {venta.cliente_nombre && <Row label="Cliente" value={venta.cliente_nombre} />}
        {venta.usuario_mesero_nombre && <Row label="Mesero" value={venta.usuario_mesero_nombre} />}
        {venta.usuario_cajero_nombre && <Row label="Cajero" value={venta.usuario_cajero_nombre} />}
        <Row label="Fecha" value={fecha} />
      </div>

      <Linea />

      {/* Productos — 6B: si la línea es variable, "500 g × Producto" o
          "4 shots × Producto". precio_fijo intacto. */}
      <div style={{ marginBottom: '4px' }}>
        {(detallesEfectivos || []).map((d, i) => {
          const cantVarTxt = formatearCantidadVariable(d || {});
          const prefijo = cantVarTxt ? `${cantVarTxt} ×` : `${d?.cantidad || 0}×`;
          return (
            <div key={i} style={{ marginBottom: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                <span style={{ fontWeight: 'bold', flex: 1, wordBreak: 'break-word' }}>
                  {prefijo} {d?.producto_nombre || ''}
                </span>
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatCurrency(d?.subtotal)}</span>
              </div>
              {d?.notas_producto && (
                <p style={{ fontSize: '10px', fontStyle: 'italic', paddingLeft: '8px', margin: '1px 0 0' }}>
                  ↳ {d.notas_producto}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Linea />

      {/* Totales — HOTFIX 6A: getVentaTotal calcula desde detalles si la venta
          tiene total/subtotal en 0. PASO 2 IVA: desglose visual si aplica. */}
      {(() => {
        const subtotalEfectivo = getVentaTotal(venta, detallesEfectivos);
        const iva = desgloseIvaDesdeConfig(subtotalEfectivo, config);
        return (
      <div style={{ marginBottom: '4px' }}>
        {iva.aplica ? (
          <>
            <Row label="Subtotal s/IVA" value={formatCurrency(iva.subtotalSinIva)} />
            <Row label={`IVA ${iva.porcentaje}%`} value={formatCurrency(iva.ivaMonto)} />
          </>
        ) : (
          <Row label="Subtotal" value={formatCurrency(subtotalEfectivo)} />
        )}
        {venta.descuentos > 0 && <Row label="Descuento" value={`-${formatCurrency(venta.descuentos)}`} />}
        {!iva.aplica && venta.impuestos > 0 && <Row label="IVA" value={formatCurrency(venta.impuestos)} />}
        {Number(venta.propina_monto) > 0 && (
          <Row
            label={`Propina${venta.propina_porcentaje > 0 ? ` (${venta.propina_porcentaje}%)` : ''}`}
            value={formatCurrency(venta.propina_monto)}
          />
        )}
        {venta.propina_tipo === 'pendiente' && !esFinal && (
          <Row label="Propina" value="A definir en caja" />
        )}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontWeight: 'bold', fontSize: '13px',
          borderTop: '1px solid #000', marginTop: '4px', paddingTop: '4px',
        }}>
          <span>TOTAL</span>
          <span>{formatCurrency(subtotalEfectivo + (Number(venta.propina_monto) || 0))}</span>
        </div>
        {iva.aplica && (
          <p style={{ fontSize: '9px', textAlign: 'center', marginTop: '2px', color: '#000' }}>
            IVA {iva.porcentaje}% incluido en el total
          </p>
        )}
        {esFinal && venta.metodo_pago && (
          <div style={{ marginTop: '4px', fontSize: '10px' }}>
            <Row label="Pago" value={venta.metodo_pago} capitalize />
            {venta.monto_efectivo > 0 && <Row label="Efectivo" value={formatCurrency(venta.monto_efectivo)} />}
            {venta.monto_tarjeta > 0 && <Row label="Tarjeta" value={formatCurrency(venta.monto_tarjeta)} />}
            {venta.monto_transferencia > 0 && <Row label="Transf." value={formatCurrency(venta.monto_transferencia)} />}
            {venta.cambio > 0 && <Row label="Cambio" value={formatCurrency(venta.cambio)} bold />}
          </div>
        )}
      </div>
        );
      })()}

      {/* Código caja para precuentas */}
      {!esFinal && codigo && (
        <div style={{
          border: '1.5px solid #000', textAlign: 'center', padding: '6px 4px',
          margin: '6px 0', borderRadius: '4px',
        }}>
          <p style={{ fontSize: '9px', margin: 0 }}>CÓDIGO PARA CAJA</p>
          <p style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '3px', margin: '2px 0' }}>{codigo}</p>
          <p style={{ fontSize: '9px', margin: 0 }}>Presenta este código en caja</p>
        </div>
      )}

      <Linea />

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: '10px' }}>
        <p style={{ margin: 0 }}>{config?.mensaje_ticket || '¡Gracias por tu visita!'}</p>
        {config?.ticket_footer && <p style={{ fontSize: '9px', margin: '2px 0 0' }}>{config.ticket_footer}</p>}
        {esFinal && <p style={{ fontSize: '9px', margin: '2px 0 0' }}>Conserva este ticket</p>}
        <p style={{ fontSize: '8px', margin: '4px 0 0', color: '#000' }}>
          {config?.platform_brand || 'MH Astral Systems'}
        </p>
      </div>
    </div>
  );
}

// Separador de línea punteada DEDICADO (mismo patrón que TicketPastelConfetti).
// Antes las secciones usaban border-top: dashed directo, que html2canvas dibujaba
// encima de la fila de texto contigua (tachado) al rasterizar para el modo IMAGEN
// nativo. Un div dedicado se rasteriza limpio. Mismo estilo visual, misma posición.
function Linea() {
  return <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />;
}

function Row({ label, value, bold, capitalize }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', textTransform: capitalize ? 'capitalize' : 'none' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
      <span style={{ fontWeight: bold ? 'bold' : 'normal', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
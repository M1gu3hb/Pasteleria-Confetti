import React from 'react';
import { safeFormatDate } from '@/lib/safeFormat';
import { resolverExtrasPedido } from '@/utils/extrasPedido';

// Ticket con el formato de la NOTA FÍSICA de Confetti Pastelería.
// Solo se usa para pedidos pastel_personalizado. Muestra únicamente
// los campos que tienen valor. No realiza cálculos: lee los del pedido.
//
// IMPORTANTE: TODO el layout va con ESTILOS EN LÍNEA (no Tailwind). El iframe
// térmico de print.js NO carga Tailwind, así que las clases (flex, border, etc.)
// no aplicarían al imprimir y las 2 columnas se verían pegadas. Con inline se ve
// IGUAL en pantalla y en la impresión térmica 58mm.
const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const C_TEXT = '#3a2418';
const C_MUTED = '#7c6f63';
const C_DASH = '#c9bcae';

function Linea() {
  return <div style={{ borderTop: `1px dashed ${C_DASH}`, margin: '8px 0' }} />;
}

function Fila({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', lineHeight: 1.35 }}>
      <span style={{ color: C_MUTED, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function SeccionLabel({ children }) {
  return (
    <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', color: C_MUTED, margin: '0 0 4px' }}>
      {children}
    </p>
  );
}

// Prompt 6 — pedidos de catálogo web: sus productos viven como TEXTO en
// notas_generales (ej. "PRODUCTOS SOLICITADOS: 1x Flan ($260)"). Separamos en
// líneas para listarlos en el ticket, sin campos de pastel (kilos/decorado/etc.).
function lineasDesdeNotas(notas) {
  if (!notas || typeof notas !== 'string') return [];
  return notas
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export default function TicketPastelConfetti({ pedido, config }) {
  if (!pedido) return null;

  // Catálogo web: tipo_pedido='productos_catalogo'. No tiene campos de pastel.
  const esCatalogo = pedido.tipo_pedido === 'productos_catalogo';
  const lineasProductos = esCatalogo ? lineasDesdeNotas(pedido.notas_generales) : [];

  const fechaPedido = pedido.created_date
    ? safeFormatDate(pedido.created_date, "d 'de' MMMM yyyy")
    : '';
  const horaPedido = pedido.created_date
    ? safeFormatDate(pedido.created_date, "HH:mm")
    : '';
  const logo = config?.logo_ticket_url || config?.logo_url || '';

  const colStack = { display: 'flex', flexDirection: 'column', gap: '2px' };

  return (
    <div
      className="ticket-printable letter-doc mx-auto w-full max-w-sm p-5 rounded-lg"
      style={{ background: '#FFF8F4', color: C_TEXT, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Encabezado */}
      <div style={{ textAlign: 'center' }}>
        {logo ? (
          <img src={logo} alt="Confetti" style={{ margin: '0 auto 4px', maxHeight: '64px', objectFit: 'contain', display: 'block' }} />
        ) : null}
        <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0, fontFamily: "'Playfair Display', serif" }}>
          {config?.nombre_negocio || 'Confetti'}
        </h2>
      </div>

      <Linea />

      <div style={colStack}>
        <Fila label="NOTA" value={pedido.folio} />
        {fechaPedido && <Fila label="CDMX a" value={fechaPedido} />}
        {horaPedido && <Fila label="Hora" value={horaPedido} />}
      </div>

      <Linea />

      {/* Cliente */}
      <div style={colStack}>
        <Fila label="Cliente" value={pedido.cliente_nombre} />
        <Fila label="Tel" value={pedido.cliente_telefono} />
        <Fila label="Dirección" value={pedido.cliente_direccion} />
        <Fila label="Fecha de entrega" value={pedido.fecha_entrega} />
        <Fila label="Hora" value={pedido.hora_entrega} />
      </div>

      <Linea />

      {esCatalogo ? (
        /* Catálogo web: productos en texto desde notas_generales */
        <>
          <SeccionLabel>PRODUCTOS</SeccionLabel>
          <div style={colStack}>
            {lineasProductos.length > 0 ? (
              lineasProductos.map((linea, i) => (
                <p key={i} style={{ fontSize: '12px', margin: 0 }}>{linea}</p>
              ))
            ) : (
              <p style={{ fontSize: '12px', color: C_MUTED, margin: 0 }}>Sin productos registrados.</p>
            )}
          </div>
        </>
      ) : (
        /* Pastel personalizado: concepto + desglose de venta */
        <>
          <SeccionLabel>CONCEPTO</SeccionLabel>
          <div style={colStack}>
            <Fila label="Kilos" value={pedido.kilos ? `${pedido.kilos} kg` : null} />
            <Fila label="Personas" value={pedido.personas_estimadas || null} />
            <Fila label="Concepto" value={pedido.concepto} />
            <Fila label="Relleno" value={pedido.rellenos} />
            <Fila label="Decorado" value={pedido.decorado} />
            <Fila label="Leyenda" value={pedido.leyenda_pastel} />
          </div>

          <Linea />

          <SeccionLabel>VENTA</SeccionLabel>
          <div style={colStack}>
            <Fila label="Pastel" value={Number(pedido.subtotal_pastel) > 0 ? fmt(pedido.subtotal_pastel) : null} />
            {pedido.incluye_base && Number(pedido.precio_base) > 0 && (
              <Fila label="Importe de base" value={fmt(pedido.precio_base)} />
            )}
            {resolverExtrasPedido(pedido).map((e, i) => (
              <Fila key={e.id || i} label={e.nombre} value={fmt(e.precio)} />
            ))}
          </div>
        </>
      )}

      <Linea />

      {/* Totales */}
      <div style={colStack}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '17px', fontWeight: 900 }}>
          <span>Total</span>
          <span>{fmt(pedido.total_final)}</span>
        </div>
        {Number(pedido.a_cuenta) > 0 && (
          <Fila label="A cuenta" value={fmt(pedido.a_cuenta)} />
        )}
        {Number(pedido.saldo_pendiente) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#b45309' }}>
            <span>Resta</span>
            <span>{fmt(pedido.saldo_pendiente)}</span>
          </div>
        )}
      </div>

      {/* Entrega a domicilio — bloque resaltado y grande, SOLO si el pedido la
          pidió. Estilos inline: el iframe térmico no carga Tailwind. Borde +
          negritas (no fondo oscuro) para que imprima bien en térmico. */}
      {pedido.requiere_entrega && (
        <>
          <Linea />
          <div style={{ border: '1.5px solid #3a2418', borderRadius: 6, padding: '2mm', textAlign: 'center', marginTop: '2mm' }}>
            <p style={{ fontSize: '13px', fontWeight: 900, lineHeight: 1.2, margin: 0 }}>
              🚚 PIDIERON ENTREGA A DOMICILIO
            </p>
            {pedido.cliente_direccion && (
              <p style={{ fontSize: '11px', fontWeight: 700, paddingTop: '1mm', margin: 0 }}>
                {pedido.cliente_direccion}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

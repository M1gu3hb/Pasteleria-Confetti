import React from 'react';

// Ticket imprimible del pedido de pastel — replica el layout del ticket
// físico de Pastelería Confetti. Usa la clase global `ticket-printable`
// (CSS de impresión ya blindado en index.css: fondo blanco, texto negro).
const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function TicketPedidoPastel({ pedido, config }) {
  if (!pedido) return null;
  const hoy = pedido.created_date ? new Date(pedido.created_date) : new Date();
  const fechaStr = hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const extras = [
    pedido.incluye_base && { nombre: 'Pastel de base', precio: pedido.precio_base },
    pedido.incluye_oblea && { nombre: 'Oblea', precio: pedido.precio_oblea },
    pedido.incluye_muneca && { nombre: 'Muñeca', precio: pedido.precio_muneca },
    pedido.incluye_velas && { nombre: 'Velas', precio: pedido.precio_velas },
  ].filter(Boolean);

  return (
    <div className="ticket-printable letter-doc bg-white text-black p-6 max-w-md mx-auto" style={{ fontFamily: 'Georgia, serif' }}>
      {/* Encabezado */}
      <div className="text-center border-b-2 border-black pb-3 mb-3">
        {config?.logo_ticket_url || config?.logo_url ? (
          <img src={config.logo_ticket_url || config.logo_url} alt="logo" className="h-14 mx-auto mb-1 object-contain" />
        ) : null}
        <h1 className="text-xl font-bold tracking-wide">Pastelería Confetti</h1>
        {pedido.sucursal_nombre && <p className="text-xs">Sucursal: {pedido.sucursal_nombre}</p>}
        <p className="text-xs mt-1">CDMX a {fechaStr}</p>
        <p className="text-sm font-mono font-bold mt-1">Folio: {pedido.folio}</p>
      </div>

      {/* Cliente */}
      <div className="text-sm space-y-0.5 mb-3">
        <p><strong>Cliente:</strong> {pedido.cliente_nombre}</p>
        <p><strong>Teléfono:</strong> {pedido.cliente_telefono}</p>
        {pedido.cliente_direccion && <p><strong>Dirección:</strong> {pedido.cliente_direccion}</p>}
        <p><strong>Entrega:</strong> {pedido.fecha_entrega} {pedido.hora_entrega || ''}</p>
      </div>

      {/* Pastel */}
      <div className="border-t border-dashed border-black pt-2 text-sm space-y-0.5 mb-3">
        <p><strong>Kilos:</strong> {pedido.kilos} kg
          {pedido.personas_estimadas ? ` (≈${pedido.personas_estimadas} personas)` : ''}</p>
        {pedido.concepto && <p><strong>Concepto:</strong> {pedido.concepto}</p>}
        {pedido.decorado && <p><strong>Decorado:</strong> {pedido.decorado}</p>}
        {pedido.rellenos && <p><strong>Rellenos:</strong> {pedido.rellenos}</p>}
        {pedido.leyenda_pastel && <p><strong>Leyenda:</strong> "{pedido.leyenda_pastel}"</p>}
      </div>

      {/* Extras */}
      {extras.length > 0 && (
        <table className="w-full text-sm mb-3 border-t border-dashed border-black pt-2">
          <tbody>
            {extras.map((e, i) => (
              <tr key={i}>
                <td className="py-0.5">☑ {e.nombre}</td>
                <td className="py-0.5 text-right">{fmt(e.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Totales */}
      <div className="border-t-2 border-black pt-2 text-sm space-y-0.5">
        <div className="flex justify-between"><span>Pastel ({pedido.kilos} kg × {fmt(pedido.precio_kilo_usado)})</span><span>{fmt(pedido.subtotal_pastel)}</span></div>
        {Number(pedido.subtotal_extras) > 0 && (
          <div className="flex justify-between"><span>Extras</span><span>{fmt(pedido.subtotal_extras)}</span></div>
        )}
        <div className="flex justify-between font-bold text-base border-t border-black pt-1">
          <span>TOTAL</span><span>{fmt(pedido.total_final)}</span>
        </div>
        <div className="flex justify-between"><span>A cuenta</span><span>{fmt(pedido.a_cuenta)}</span></div>
        <div className="flex justify-between font-bold"><span>RESTA</span><span>{fmt(pedido.resta)}</span></div>
      </div>

      {pedido.devolver_base !== false && (
        <p className="text-center text-xs font-bold mt-4 border border-black px-2 py-1.5">
          FAVOR DE DEVOLVER LA BASE LIMPIA
        </p>
      )}
      <p className="text-center text-[10px] mt-3">¡Gracias por su preferencia! 🎉</p>
    </div>
  );
}
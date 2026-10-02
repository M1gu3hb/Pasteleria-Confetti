import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { printDocument } from '@/lib/print';
import { cargarEvidenciaPago, fechaEvidencia, importeEvidencia, cambiosEvidencia } from '@/utils/evidenciaFinanciera';

export function ComprobanteEvidenciaPago({ pago, eventos }) {
  return <div className="ticket-printable" data-thermal-ticket style={{ background: 'white', color: 'black', padding: '8px', fontSize: '11px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
    <h2>Evidencia del pago registrado</h2>
    <p>Reconstruida desde registros del POS. No registra un cobro ni una devolución nueva.</p>
    <hr />
    <p>Pedido: {pago.pedido} · {pago.estado_pedido}</p>
    <p>Venta: {pago.venta}</p>
    <p>Sucursal: {pago.sucursal || 'Sin nombre registrado'}</p>
    <p>Corte: {pago.corte || 'Sin corte registrado'} · {pago.corte_estado}</p>
    <p>Abono registrado: {importeEvidencia(pago.monto)} · {pago.metodo}</p>
    <p>Fecha de abono: {fechaEvidencia(pago.cobrado_en)}</p>
    <p>Cancelación de venta: {pago.tipo_cancelacion || 'Sin tipo registrado'}</p>
    <p>Importe de devolución en venta: {importeEvidencia(pago.devuelto_registrado)}</p>
    <p>Fecha: {fechaEvidencia(pago.cancelado_en)}</p>
    <p>Nombre registrado: {pago.cancelado_por || 'Sin nombre registrado'}</p>
    <p>Motivo registrado: {pago.motivo || 'Sin motivo registrado'}</p>
    <p>Devoluciones en libro del pedido: {importeEvidencia(pago.devoluciones_libro)}</p>
    <p>Abonado en pedido: {importeEvidencia(pago.abonado_pedido)}</p>
    <p>Saldo registrado en pedido: {importeEvidencia(pago.saldo_pedido)}</p>
    {!!pago.pedidos_relacionados.length && <div><h3>Otros pedidos del mismo cliente y sucursal (±2 días)</h3>{pago.pedidos_relacionados.map(x => <p key={x.folio}>{x.folio} · {x.estado} · Total {importeEvidencia(x.total)} · Abonado {importeEvidencia(x.abonado)}</p>)}<p>La coincidencia ayuda a reconstruir lo sucedido; no demuestra por sí sola que uno sustituya al otro.</p></div>}
    <hr />
    <p>La venta cancelada quedó fuera del ingreso del corte. El libro del pedido conserva el abono. No volver a registrar esa salida en el corte histórico: la diferencia requiere conciliación interna.</p>
    <p>Estos registros prueban lo anotado en el POS; por sí solos no prueban una entrega física de dinero ni identifican al humano que usó una sesión compartida.</p>
    <hr />
    <h3>Bitácora del servidor</h3>
    <p>OBSERVADO conserva el estado encontrado al habilitar la bitácora; su fecha no es la del cobro original.</p>
    {eventos.map(e => <div key={e.id} style={{ marginTop: '8px' }}>
      <p>#{e.id} · {fechaEvidencia(e.registrado_en)}</p>
      <p>{e.accion} · {e.entidad} · {e.origen}</p>
      <p>Identidad autenticada: {e.actor_pos_nombre || (e.origen === 'observacion_inicial' ? 'No aplica: observación inicial' : 'SQL o entrada pública')}</p>
      {e.accion !== 'OBSERVADO' && <p>{cambiosEvidencia(e)}</p>}
    </div>)}
  </div>;
}

export default function EvidenciaPagoDialog({ pago, onClose }) {
  const ref = useRef(null), ocupada = useRef(false);
  const [imprimiendo, setImprimiendo] = useState(false), [falloImpresion, setFalloImpresion] = useState('');
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['evidencia_financiera', pago.pedido_id, pago.venta_id],
    queryFn: () => cargarEvidenciaPago(pago.pedido_id, pago.venta_id), retry: 1, staleTime: 0,
  });
  const imprimir = async () => {
    if (ocupada.current || error || !data || !ref.current) return;
    ocupada.current = true; setImprimiendo(true); setFalloImpresion('');
    try {
      const node = ref.current.querySelector('[data-thermal-ticket]');
      if (!node) throw new Error('EVIDENCIA_NO_RENDERIZADA');
      await printDocument({ mode: 'ticket', title: `Evidencia-${data.pago.pedido}-${data.pago.venta}`, node });
    }
    catch { setFalloImpresion('No se pudo imprimir la evidencia. Puedes reintentar.'); }
    finally { ocupada.current = false; setImprimiendo(false); }
  };
  return <Dialog open onOpenChange={v => { if (!v && !imprimiendo) onClose(); }}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Historial de {pago.pedido}</DialogTitle></DialogHeader>
      {isPending && <p role="status">Leyendo evidencia del sistema…</p>}
      {error && <div role="alert">No se pudo leer la bitácora completa. <button className="underline" onClick={() => refetch()}>Reintentar</button></div>}
      {!error && data && <div ref={ref}><ComprobanteEvidenciaPago pago={data.pago} eventos={data.eventos} /></div>}
      {!!falloImpresion && <p role="alert">{falloImpresion}</p>}
      <Button onClick={imprimir} disabled={isPending || !!error || !data || imprimiendo}> {imprimiendo ? 'Imprimiendo…' : 'Imprimir evidencia del sistema'}</Button>
    </DialogContent>
  </Dialog>;
}

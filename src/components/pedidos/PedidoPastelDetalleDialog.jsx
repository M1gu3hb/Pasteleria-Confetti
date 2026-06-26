import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { useCorteAtrasado } from '@/lib/useCorteAtrasado';
import { useTerminal } from '@/lib/TerminalContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import RegistrarPagoDialog from './RegistrarPagoDialog';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, PackageCheck, XCircle, Pencil, Printer, MessageCircle, Banknote, Mail, ImageIcon, StickyNote, Mic } from 'lucide-react';
import { ESTADOS_PEDIDO, buildWhatsAppLink, buildMailtoLink } from '@/utils/pedidoPastelUtils';
import TicketPastelConfetti from './TicketPastelConfetti';
import { useConfig } from '@/lib/ConfigContext';

// Fase 4 — historial de pagos registrados del pedido.
function AbonosHistorial({ pedidoId }) {
  const { data } = useQuery({
    queryKey: ['abonos_pedido', pedidoId],
    queryFn: () => pedidoId
      ? base44.entities.Abono.filter({ pedido_id: pedidoId }, '-fecha_abono', 20)
      : [],
    enabled: !!pedidoId,
    staleTime: 5000,
  });
  const abonos = Array.isArray(data) ? data : [];
  if (abonos.length === 0) return null;
  return (
    <div className="border-t pt-3 no-print">
      <p className="text-xs font-semibold mb-2 text-muted-foreground">Pagos registrados</p>
      <div className="space-y-1">
        {abonos.map(a => (
          <div key={a.id} className="flex justify-between text-xs">
            <span>{new Date(a.fecha_abono || a.created_date).toLocaleDateString('es-MX')} · {a.metodo_pago}</span>
            <span className="font-bold">${(Number(a.monto) || 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Vista expandida del pedido: ticket completo + acciones de estado.
export default function PedidoPastelDetalleDialog({ pedido, open, onClose }) {
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [accion, setAccion] = useState(false);
  const { cajaAbierta } = useCajaAbierta();
  const { hayCorteAtrasado } = useCorteAtrasado();
  const { sucursalEfectiva } = useTerminal();
  const { posUser } = usePOSAuth();
  const [showPago, setShowPago] = useState(false);

  if (!pedido) return null;
  const est = ESTADOS_PEDIDO[pedido.estado] || ESTADOS_PEDIDO.pendiente;
  const finalizado = pedido.estado === 'entregado' || pedido.estado === 'cancelado';
  // Prompt 6 — pedidos de catálogo web: mismo flujo (anticipo/entregar) SIN editar.
  const esCatalogo = pedido.tipo_pedido === 'productos_catalogo';
  // PARTE E — no permitir "Entregado" si hay saldo pendiente. Usamos
  // saldo_pendiente; si es null/undefined (pedidos viejos) caemos en `resta`.
  // El estado 'pagado' implica saldo 0, así que nunca bloquea un pedido pagado.
  const saldoPend = pedido.saldo_pendiente != null
    ? Number(pedido.saldo_pendiente)
    : Number(pedido.resta) || 0;
  const tieneSaldo = pedido.estado !== 'pagado' && Number.isFinite(saldoPend) && saldoPend > 0;

  const cambiarEstado = async (nuevoEstado, extra = {}) => {
    if (accion) return;
    setAccion(true);
    try {
      await base44.entities.PedidoPastel.update(pedido.id, { estado: nuevoEstado, ...extra });
      queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
      toast.success(`Pedido ${ESTADOS_PEDIDO[nuevoEstado]?.label?.toLowerCase() || nuevoEstado}`);
      onClose?.();
    } catch (err) {
      console.error('[PedidoPastel] cambiarEstado:', err);
      toast.error('No se pudo actualizar el pedido');
    } finally {
      setAccion(false);
    }
  };

  const imprimir = () => {
    try {
      document.documentElement.setAttribute('data-print-mode', 'letter');
      window.print();
      setTimeout(() => document.documentElement.removeAttribute('data-print-mode'), 1000);
    } catch (err) {
      console.error('[PedidoPastel] imprimir:', err);
      toast.error('No se pudo iniciar la impresión');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {esCatalogo ? '🌐' : '🎂'} {pedido.folio}
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${est.badge}`}>{est.label}</span>
          </DialogTitle>
        </DialogHeader>

        {pedido.origen === 'web' && pedido.estado === 'pendiente' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-50 border border-pink-200 no-print">
            <span className="text-pink-600 text-xs font-bold">
              🌐 Pedido recibido desde la página web — pendiente de confirmación
            </span>
          </div>
        )}

        {/* ════════ BLOQUE 1 — TICKET (toda la info del pedido) ════════ */}
        <div className="bg-gray-100 rounded-lg p-2 flex justify-center">
          <TicketPastelConfetti pedido={pedido} config={config} />
        </div>

        {/* En catálogo los productos ya salen en el ticket; no duplicar notas. */}
        {pedido.notas_generales && !esCatalogo && (
          <p className="text-xs text-muted-foreground px-1">Notas: {pedido.notas_generales}</p>
        )}
        {pedido.creado_por_nombre && (
          <p className="text-[10px] text-muted-foreground px-1">Creado por {pedido.creado_por_nombre}</p>
        )}

        {/* ════════ BLOQUE 2 — IMAGEN de referencia (card propia) ════════
            Solo pastel personalizado y solo si hay imagen — sin huecos. */}
        {!esCatalogo && pedido.imagen_referencia_url && (
          <div className="rounded-xl border bg-card p-3 no-print">
            <p className="text-xs font-semibold mb-2 text-muted-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" /> Imagen de referencia
            </p>
            <img
              src={pedido.imagen_referencia_url}
              alt="Referencia del pastel"
              className="w-full max-h-72 object-contain rounded-lg bg-muted"
            />
          </div>
        )}

        {/* ════════ BLOQUE 3 — NOTA INTERNA (card propia) ════════
            Solo pastel personalizado y solo si hay nota — sin huecos.
            Debajo: espacio reservado para el reproductor de nota de voz. */}
        {!esCatalogo && pedido.nota_interna && (
          <div className="rounded-xl border bg-card p-3 no-print space-y-3">
            <div>
              <p className="text-xs font-semibold mb-1.5 text-muted-foreground flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" /> Nota interna
              </p>
              <p className="text-sm whitespace-pre-wrap break-words">{pedido.nota_interna}</p>
            </div>

            {/* ───── Espacio reservado para reproductor de nota de voz ─────
                Placeholder visual. NO implementa grabación ni reproducción
                todavía; cuando exista el audio se montará el <audio> aquí.
                No rompe si aún no hay audio. */}
            <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 flex items-center gap-2 text-muted-foreground">
              <Mic className="w-4 h-4 shrink-0 opacity-60" />
              <span className="text-[11px] leading-tight">
                Nota de voz — próximamente. (Espacio reservado para el reproductor de audio.)
              </span>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-2 no-print">
          {pedido.estado === 'pendiente' && (
            <Button disabled={accion} onClick={() => cambiarEstado('confirmado', { fecha_confirmacion: new Date().toISOString() })} className="h-11">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />Confirmar
            </Button>
          )}
          {!finalizado && pedido.estado !== 'pagado' && (
            <Button
              variant="outline"
              disabled={!cajaAbierta}
              onClick={() => setShowPago(true)}
              className="h-11"
              title={!cajaAbierta ? "Abre la caja para registrar pagos" : "Registrar pago o anticipo"}
            >
              <Banknote className="w-4 h-4 mr-1.5" />
              {!cajaAbierta ? "Pago (caja cerrada)" : "Registrar pago"}
            </Button>
          )}
          {!finalizado && (
            <div className="flex flex-col">
              <Button disabled={accion || tieneSaldo}
                onClick={() => cambiarEstado('entregado', { fecha_entrega_real: new Date().toISOString() })}
                title={tieneSaldo ? `Hay saldo pendiente de $${saldoPend.toFixed(2)}. Registra el pago completo primero.` : 'Marcar como entregado'}
                className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                <PackageCheck className="w-4 h-4 mr-1.5" />Entregado
              </Button>
              {tieneSaldo && (
                <p className="text-[10px] text-red-600 mt-1 leading-tight">
                  Saldo pendiente ${saldoPend.toFixed(2)} — registra el pago completo primero.
                </p>
              )}
            </div>
          )}
          {!finalizado && !esCatalogo && (
            <Button variant="outline" disabled={accion} className="h-11"
              onClick={() => { onClose?.(); navigate(`/pedidos-pastel/nuevo?id=${pedido.id}`); }}>
              <Pencil className="w-4 h-4 mr-1.5" />Editar
            </Button>
          )}
          {!finalizado && (
            <Button variant="outline" disabled={accion} className="h-11 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => {
                if (confirm(`¿Cancelar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`)) {
                  cambiarEstado('cancelado');
                }
              }}>
              <XCircle className="w-4 h-4 mr-1.5" />Cancelar pedido
            </Button>
          )}
          <Button variant="outline" className="h-11" asChild>
            <a href={buildWhatsAppLink(pedido)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
            </a>
          </Button>
          {pedido.cliente_email && (
            <Button variant="outline" className="h-11" asChild>
              <a href={buildMailtoLink(pedido)}>
                <Mail className="w-4 h-4 mr-1.5" />Mandar por correo
              </a>
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={imprimir}>
            <Printer className="w-4 h-4 mr-1.5" />Imprimir
          </Button>
        </div>
        {/* Historial de abonos — Fase 4 */}
        <AbonosHistorial pedidoId={pedido?.id} />

        <RegistrarPagoDialog
          pedido={pedido}
          cajaAbierta={cajaAbierta}
          posUser={posUser}
          sucursalEfectiva={sucursalEfectiva}
          hayCorteAtrasado={hayCorteAtrasado}
          open={showPago}
          onClose={() => setShowPago(false)}
          onPagoRegistrado={() => {
            queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
            queryClient.invalidateQueries({ queryKey: ['abonos_pedido', pedido?.id] });
            // PARTE A — la venta paralela debe reflejarse en Caja y Dashboard.
            queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
            queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
            queryClient.invalidateQueries({ queryKey: ['ventas_all'] });
            queryClient.invalidateQueries({ queryKey: ['abonos_corte'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
            onClose?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
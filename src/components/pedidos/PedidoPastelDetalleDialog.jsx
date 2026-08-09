import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { useCorteAtrasado } from '@/lib/useCorteAtrasado';
import { useTerminal } from '@/lib/TerminalContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import RegistrarPagoDialog from './RegistrarPagoDialog';
import CancelarPedidoDialog from './CancelarPedidoDialog';
import { registrarDevolucionAnticipo } from '@/utils/devolucionAnticipo';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, PackageCheck, XCircle, Pencil, Printer, MessageCircle, Banknote, Mail, ImageIcon, StickyNote, Mic, User, Loader2 } from 'lucide-react';
import { ESTADOS_PEDIDO, buildWhatsAppLink, buildMailtoLink } from '@/utils/pedidoPastelUtils';
import TicketPastelConfetti from './TicketPastelConfetti';
import { useConfig } from '@/lib/ConfigContext';
import { printDocument } from '@/lib/print';

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

// FASE 4 — Nota de voz en el detalle: reproductor del audio + transcripción
// editable (se guarda como nota interna del pedido). Sustituye el placeholder.
function NotaVozEnDetalle({ pedido, puedeEditar = true }) {
  const queryClient = useQueryClient();
  const original = pedido?.nota_voz_transcripcion || '';
  const [texto, setTexto] = useState(original);
  const [guardando, setGuardando] = useState(false);

  // `useState(original)` sólo corre en el primer render. Al abrir OTRO pedido
  // sin desmontar el diálogo, el textarea seguía mostrando la nota del pedido
  // anterior. Se resincroniza al cambiar de pedido — y sólo entonces, para no
  // pisar lo que el usuario está escribiendo cuando la lista se refresca sola
  // cada 15 s.
  // Tras guardar NO hace falta tocar nada: la lectura fresca del diálogo hace
  // que `original` pase a ser el texto guardado, `dirty` se vuelve false y el
  // botón se apaga solo.
  const pedidoId = pedido?.id;
  useEffect(() => {
    setTexto(pedido?.nota_voz_transcripcion || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  if (!pedido?.nota_voz_url && !original) return null;
  const dirty = texto !== original;

  const guardar = async () => {
    if (!dirty || guardando || !pedido?.id) return;
    setGuardando(true);
    try {
      await base44.entities.PedidoPastel.update(pedido.id, { nota_voz_transcripcion: texto });
      queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
      toast.success('Transcripción actualizada');
    } catch (e) {
      console.error('[NotaVozEnDetalle] guardar:', e);
      toast.error('No se pudo guardar la transcripción');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Mic className="w-3.5 h-3.5" /> Nota de voz
      </p>
      {pedido?.nota_voz_url && (
        <audio controls src={pedido.nota_voz_url} className="w-full h-9" />
      )}
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        readOnly={!puedeEditar}
        placeholder={puedeEditar ? 'Transcripción de la nota de voz (editable)' : 'Transcripción de la nota de voz'}
        className="text-sm"
      />
      {puedeEditar && dirty && (
        <Button size="sm" onClick={guardar} disabled={guardando} className="h-8">
          {guardando ? 'Guardando…' : 'Guardar transcripción'}
        </Button>
      )}
    </div>
  );
}

// Vista expandida del pedido: ticket completo + acciones de estado.
export default function PedidoPastelDetalleDialog({ pedido: pedidoProp, open, onClose }) {
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [accion, setAccion] = useState(false);
  const { cajaAbierta } = useCajaAbierta();
  const { hayCorteAtrasado } = useCorteAtrasado();
  const { sucursalEfectiva, adminRole } = useTerminal();
  const { posUser } = usePOSAuth();
  const [showPago, setShowPago] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  // El pastelero ya NO es solo lectura (migración 0060, autorizada por Miguel):
  // puede editar la nota y avanzar el estado (confirmar / entregar). Lo que su RLS
  // sigue rechazando —cobrar, editar el pedido completo (precios) y cancelar— se
  // mantiene oculto para no ofrecerle botones que van a fallar. Su alcance real lo
  // impone el trigger trg_guard_pastelero_alcance en la base, no esta bandera.
  // Otros roles: idéntico a antes.
  const esPastelero = adminRole === 'pastelero';
  // FASE 4 — aviso antes de marcar "Entregado" (sale de la lista de pendientes).
  const [confirmarEntrega, setConfirmarEntrega] = useState(false);
  // FASE 2: estado de impresión para dar feedback (spinner) mientras imprime.
  const [imprimiendo, setImprimiendo] = useState(false);

  // ── BUG "los cambios nunca se guardan" ────────────────────────────────
  // Los TRES sitios que abren este diálogo (PedidosPastel, NuevoPedidoPastel y
  // Caja) le pasan una INSTANTÁNEA congelada guardada en su propio useState
  // (p. ej. `const [pedidoVer, setPedidoVer] = useState(null)`). Al editar, la
  // escritura SÍ llegaba a la base (verificado: el PATCH devuelve la fila), pero
  // el prop seguía siendo el objeto viejo: la pantalla nunca mostraba el cambio
  // y el botón "Guardar" no se apagaba, así que parecía que no se guardaba nada.
  //
  // Se resuelve aquí, en un solo punto, para que los tres sitios queden bien:
  // el diálogo lee SIEMPRE la fila fresca y usa el prop sólo como dato inicial
  // mientras llega.
  //
  // La queryKey cuelga de 'pedidos_pastel' A PROPÓSITO: todos los
  // `invalidateQueries({ queryKey: ['pedidos_pastel'] })` que ya existen en el
  // código hacen prefix-match y refrescan también este detalle, sin tener que
  // tocar ni un solo handler de guardado.
  const { data: pedidoFresco } = useQuery({
    queryKey: ['pedidos_pastel', 'detalle', pedidoProp?.id ?? null],
    queryFn: () => base44.entities.PedidoPastel.get(pedidoProp.id),
    enabled: !!pedidoProp?.id && !!open,
    placeholderData: pedidoProp,
    staleTime: 0,
  });
  // Si la lectura fresca falla, seguimos mostrando el snapshot: nunca se queda
  // el diálogo en blanco por un fallo de red.
  const pedido = pedidoFresco || pedidoProp;

  if (!pedido) return null;
  const est = ESTADOS_PEDIDO[pedido.estado] || ESTADOS_PEDIDO.pendiente;
  const finalizado = pedido.estado === 'entregado' || pedido.estado === 'cancelado';
  // Prompt 6 — pedidos de catálogo web: mismo flujo (anticipo/entregar) SIN editar.
  const esCatalogo = pedido.tipo_pedido === 'productos_catalogo';
  // "Atendió": solo un nombre real. Se oculta vacío, null o el basura exacto
  // "Empleado" que dejaba el viejo prellenado en modo empleado.
  const atendioReal = (() => {
    const v = (pedido.atendido_por || '').trim();
    return v && v !== 'Empleado' ? v : '';
  })();
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

  // FASE 3 #4 — gancho de devolución de anticipo (DINERO). Exige caja abierta y
  // corte al día; registra la salida en el corte ABIERTO (abono compensatorio
  // negativo) sin tocar cortes viejos, y sella el pedido como devolución.
  const handleDevolverAnticipo = async ({ pedido: p, motivo }) => {
    if (!cajaAbierta?.id) { toast.error('Abre caja antes de registrar una devolución.'); throw new Error('SIN_CAJA'); }
    if (hayCorteAtrasado) { toast.error('Cierra el corte del día anterior antes de registrar devoluciones.'); throw new Error('CORTE_ATRASADO'); }
    try {
      const res = await registrarDevolucionAnticipo({ pedido: p, motivo, cajaAbierta, posUser, sucursalEfectiva });
      queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
      queryClient.invalidateQueries({ queryKey: ['abonos_pedido', p?.id] });
      queryClient.invalidateQueries({ queryKey: ['abonos_corte', cajaAbierta.id] });
      queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
      toast.success(res.montoDevuelto > 0
        ? `Devolución registrada: $${res.montoDevuelto.toFixed(2)}`
        : 'Pedido cancelado (sin anticipo que devolver).');
    } catch (e) {
      console.error('[PedidoPastel] devolverAnticipo:', e);
      toast.error('No se pudo registrar la devolución.');
      throw e;
    }
  };

  const imprimir = async () => {
    if (imprimiendo) return; // evita doble impresión por doble clic
    setImprimiendo(true);
    try {
      // Térmico 58/80mm vía helper (iframe + @page). Imprime SOLO el
      // TicketPastelConfetti (.ticket-printable) renderizado abajo. Sirve igual
      // para pastel personalizado y para pedido de catálogo web (mismo diálogo).
      // En iPad esto abre el diálogo AirPrint de iOS; en Android su framework/RawBT.
      // FASE 2: `await` cubre TODO el tiempo real de impresión (en el APK, hasta
      // que el plugin ESC/POS termina imagen + corte); el spinner no "miente".
      await printDocument({ mode: 'thermal', title: `Pedido ${pedido.folio || ''}`.trim() });
    } catch (err) {
      // El helper de impresión (nativo) ya muestra el toast del error y re-lanza.
      // Aquí solo dejamos rastro y restauramos el botón en el `finally`.
      console.error('[PedidoPastel] imprimir:', err);
    } finally {
      setImprimiendo(false);
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
              style={{ imageOrientation: 'from-image' }}
            />
          </div>
        )}

        {/* ════════ ATENDIÓ (card propia) ════════
            Quién atendió el pedido. Solo si hay un nombre real (oculta vacío/
            null/"Empleado"). Mismo estilo que la nota interna; también no-print. */}
        {!esCatalogo && atendioReal && (
          <div className="rounded-xl border bg-card p-3 no-print">
            <p className="text-xs font-semibold mb-1.5 text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Atendió
            </p>
            <p className="text-sm break-words">{atendioReal}</p>
          </div>
        )}

        {/* ════════ BLOQUE 3 — NOTA INTERNA (card propia) ════════
            Solo pastel personalizado y solo si hay nota — sin huecos.
            Debajo: espacio reservado para el reproductor de nota de voz. */}
        {!esCatalogo && (pedido.nota_interna || pedido.nota_voz_url || pedido.nota_voz_transcripcion) && (
          <div className="rounded-xl border bg-card p-3 no-print space-y-3">
            {pedido.nota_interna && (
              <div>
                <p className="text-xs font-semibold mb-1.5 text-muted-foreground flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> Nota interna
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">{pedido.nota_interna}</p>
              </div>
            )}

            {/* FASE 4 — reproductor del audio + transcripción editable (sustituye
                el placeholder "próximamente"). */}
            {/* 0060 — el pastelero YA puede editar la nota (política
                pos_pastelero_update_pedidos + trigger de alcance). */}
            <NotaVozEnDetalle pedido={pedido} />
          </div>
        )}

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-2 no-print">
          {/* 0060 — el pastelero ya puede AVANZAR el estado (confirmar / entregar):
              su RLS lo permite y el trigger trg_guard_pastelero_alcance acota qué
              columnas y qué transiciones. Sigue OCULTO lo que su RLS rechaza:
              cobrar, editar el pedido completo (precios) y cancelar. */}
          {pedido.estado === 'pendiente' && (
            <Button disabled={accion} onClick={() => cambiarEstado('confirmado', { fecha_confirmacion: new Date().toISOString() })} className="h-11">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />Confirmar
            </Button>
          )}
          {!esPastelero && !finalizado && pedido.estado !== 'pagado' && (
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
                onClick={() => setConfirmarEntrega(true)}
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
          {!esPastelero && !finalizado && !esCatalogo && (
            <Button variant="outline" disabled={accion} className="h-11"
              onClick={() => { onClose?.(); navigate(`/pedidos-pastel/nuevo?id=${pedido.id}`); }}>
              <Pencil className="w-4 h-4 mr-1.5" />Editar
            </Button>
          )}
          {!esPastelero && !finalizado && (
            <Button variant="outline" disabled={accion} className="h-11 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setShowCancelar(true)}>
              <XCircle className="w-4 h-4 mr-1.5" />Cancelar pedido
            </Button>
          )}
          {/* Lectura/externas (sin escritura a BD): visibles para todos, incl. pastelero. */}
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
          <Button
            variant="outline"
            className="h-11 transition-transform active:scale-95"
            onClick={imprimir}
            disabled={imprimiendo}
            aria-busy={imprimiendo}
          >
            {imprimiendo
              ? (<><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Imprimiendo…</>)
              : (<><Printer className="w-4 h-4 mr-1.5" />Imprimir</>)}
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

        {/* FASE 4 — aviso antes de marcar Entregado. Solo avisa; el efecto (sacar
            de la lista de pendientes) es el mismo del botón. */}
        <Dialog open={confirmarEntrega} onOpenChange={(o) => { if (!o) setConfirmarEntrega(false); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="font-heading">Marcar como entregado</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Al marcar entregado, este pedido saldrá de la lista de <strong>Pedidos de Pastel</strong>.
            </p>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1 h-11" disabled={accion}
                onClick={() => setConfirmarEntrega(false)}>Cancelar</Button>
              <Button className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={accion}
                onClick={() => { setConfirmarEntrega(false); cambiarEstado('entregado', { fecha_entrega_real: new Date().toISOString() }); }}>
                Sí, entregado
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <CancelarPedidoDialog
          pedido={pedido}
          posUser={posUser}
          open={showCancelar}
          onClose={() => setShowCancelar(false)}
          onDevolverAnticipo={handleDevolverAnticipo}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
            onClose?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
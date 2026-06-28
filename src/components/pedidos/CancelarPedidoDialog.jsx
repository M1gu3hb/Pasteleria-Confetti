import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, RotateCcw, Ban } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { toast } from 'sonner';

/**
 * CancelarPedidoDialog — Fase 3 #5 (tipo/motivo de cancelación de pedido)
 *
 * Espejo de CancelarVentaDialog, pero con el TIPO seleccionable dentro del
 * diálogo (un pedido se cancela desde su detalle/cola, no desde la sección
 * Ventas). Da a la cancelación de pedido el mismo trato que a las ventas:
 *  - tipo (cancelacion | devolucion)
 *  - motivo OBLIGATORIO (textarea)
 *  - sello: cancelado_por_{id,nombre} + fecha_cancelacion
 *
 * Candado 5: cancelar = cambio de estado ('cancelado'), NUNCA borrado físico.
 *
 * #5 (SIN dinero): 'cancelacion' (cualquier pedido) y 'devolucion' sin anticipo
 * (monto 0) se resuelven aquí con el cambio de estado + sello.
 *
 * #4 (DINERO): 'devolucion' CON anticipo delega el movimiento de dinero al
 * gancho `onDevolverAnticipo({ pedido, monto, motivo })` (lo inyecta caja). Si
 * no se inyecta, el diálogo bloquea esa ruta (no mueve dinero a medias).
 *
 * Props:
 *  - open, onClose
 *  - pedido: el pedido a cancelar/devolver
 *  - posUser: usuario POS actual (sello)
 *  - onDone(): callback tras cancelar (refrescar listas)
 *  - onDevolverAnticipo({pedido,monto,motivo}): gancho #4 (opcional). Si está
 *    presente, habilita la devolución de anticipo; debe sellar el pedido y
 *    registrar el dinero saliente en el corte abierto.
 */
export default function CancelarPedidoDialog({ open, onClose, pedido, posUser, onDone, onDevolverAnticipo }) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState('cancelacion');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) { setTipo('cancelacion'); setNota(''); setGuardando(false); }
  }, [open]);

  const esDevolucion = tipo === 'devolucion';
  const montoADevolver = Number(pedido?.total_abonado) || 0;
  const tieneAnticipo = montoADevolver > 0;
  // Devolución CON anticipo necesita el gancho de caja (#4) para mover el dinero.
  const requiereGancho = esDevolucion && tieneAnticipo;
  const ganchoListo = typeof onDevolverAnticipo === 'function';
  const bloqueadoPorGancho = requiereGancho && !ganchoListo;

  const confirmar = async () => {
    if (!pedido?.id) { onClose?.(); return; }
    const motivo = (nota || '').trim();
    if (!motivo) { toast.error('Escribe el motivo (obligatorio).'); return; }
    if (guardando) return;

    // Ruta DINERO (#4): devolución de un anticipo ya cobrado.
    if (requiereGancho) {
      if (!ganchoListo) {
        toast.error('El reembolso del anticipo se procesa en caja (paso de devolución).');
        return;
      }
      setGuardando(true);
      try {
        await onDevolverAnticipo({ pedido, monto: montoADevolver, motivo });
        onDone?.();
        onClose?.();
      } catch (e) {
        // El handler (caja) es dueño del mensaje al usuario (SIN_CAJA, etc.).
        // Es un bloqueo esperado (no un error): se registra como warn y NO se
        // cierra el diálogo para que el usuario corrija (p. ej. abrir caja).
        console.warn('[CancelarPedidoDialog] devolución no aplicada:', e?.message || e);
      } finally {
        setGuardando(false);
      }
      return;
    }

    // Ruta SIN dinero (#5): cancelación, o devolución sin anticipo (monto 0).
    setGuardando(true);
    try {
      await base44.entities.PedidoPastel.update(pedido.id, {
        estado: 'cancelado',
        tipo_cancelacion: esDevolucion ? 'devolucion' : 'cancelacion',
        motivo_cancelacion: motivo,
        monto_devuelto: 0,
        fecha_cancelacion: new Date().toISOString(),
        cancelado_por_id: posUser?.id || '',
        cancelado_por_nombre: posUser?.nombre || '',
      });
      queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
      toast.success(esDevolucion ? 'Pedido cancelado (devolución sin anticipo).' : 'Pedido cancelado.');
      onDone?.();
      onClose?.();
    } catch (e) {
      console.error('[CancelarPedidoDialog] cancelación:', e);
      toast.error('No se pudo cancelar el pedido. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !guardando) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {esDevolucion ? (
              <><RotateCcw className="w-5 h-5 text-destructive" /> Devolver pedido</>
            ) : (
              <><Ban className="w-5 h-5 text-amber-600" /> Cancelar pedido</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('cancelacion')}
              disabled={guardando}
              className={`rounded-xl border p-3 text-sm font-semibold transition ${
                tipo === 'cancelacion'
                  ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-muted text-muted-foreground hover:border-amber-300'
              }`}
            >
              <Ban className="w-4 h-4 mx-auto mb-1" />
              Cancelación
              <span className="block text-[10px] font-normal opacity-80">Sin devolver dinero</span>
            </button>
            <button
              type="button"
              onClick={() => setTipo('devolucion')}
              disabled={guardando}
              className={`rounded-xl border p-3 text-sm font-semibold transition ${
                tipo === 'devolucion'
                  ? 'border-destructive bg-destructive/10 text-destructive'
                  : 'border-muted text-muted-foreground hover:border-destructive/40'
              }`}
            >
              <RotateCcw className="w-4 h-4 mx-auto mb-1" />
              Devolución
              <span className="block text-[10px] font-normal opacity-80">Reembolsa el anticipo</span>
            </button>
          </div>

          {/* Datos del pedido */}
          <div className="rounded-xl border bg-muted/20 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Folio</span>
              <span className="font-mono font-bold">{pedido?.folio || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Anticipo cobrado</span>
              <span className="font-bold">{formatCurrency(montoADevolver)}</span>
            </div>
          </div>

          {/* Aviso según tipo */}
          {esDevolucion ? (
            <div className="rounded-xl border-2 border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {tieneAnticipo ? (
                  <p>
                    Monto a devolver: <strong>{formatCurrency(montoADevolver)}</strong>.
                    {bloqueadoPorGancho
                      ? ' El reembolso del anticipo se procesa en caja (paso de devolución).'
                      : ' Se registrará la salida de dinero en el corte abierto y el pedido quedará cancelado.'}
                  </p>
                ) : (
                  <p>Este pedido no tiene anticipo cobrado: no hay dinero que devolver. Solo se cancelará el pedido.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
              <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>El pedido se marcará como cancelado. {tieneAnticipo ? 'El anticipo ya cobrado NO se devuelve (usa “Devolución” para reembolsar).' : ''}</p>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Motivo (obligatorio)</Label>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={esDevolucion ? 'Motivo de la devolución…' : 'Motivo de la cancelación…'}
              rows={3}
              className="mt-1"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cerrar
          </Button>
          <Button
            variant={esDevolucion ? 'destructive' : 'default'}
            onClick={confirmar}
            disabled={guardando || !nota.trim() || bloqueadoPorGancho}
            className={esDevolucion ? '' : 'bg-amber-600 hover:bg-amber-700 text-white'}
          >
            {guardando ? 'Procesando…' : (esDevolucion ? 'Confirmar devolución' : 'Confirmar cancelación')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

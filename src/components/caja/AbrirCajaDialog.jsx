import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DoorOpen, User, Wallet, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';

/**
 * Modal de Apertura de caja.
 *
 * Diseño rápido y claro: muestra fondo esperado del cierre anterior, input de
 * efectivo contado, diferencia calculada en vivo y notas.
 *
 * Validaciones:
 * - Usuario POS presente.
 * - Efectivo contado debe ser número válido (0 permitido si así es).
 * - El padre garantiza que NO haya otra caja abierta antes de mostrar este modal.
 */
export default function AbrirCajaDialog({
  open,
  onOpenChange,
  posUser,
  fondoEsperado = 0,
  loading = false,
  onConfirm,
}) {
  const [efectivoInicial, setEfectivoInicial] = useState('');
  const [notas, setNotas] = useState('');
  const inputRef = useRef(null);

  // Reset al abrir + foco diferido para evitar bloqueo de escritura
  // por el focus-trap del Dialog mientras corre la animación.
  useEffect(() => {
    if (open) {
      setEfectivoInicial('');
      setNotas('');
      const t = setTimeout(() => {
        try { inputRef.current?.focus(); } catch (_) {}
      }, 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  const efectivoNum = Number.parseFloat(efectivoInicial);
  const efectivoValido = efectivoInicial !== '' && Number.isFinite(efectivoNum);
  const efectivoSeguro = efectivoValido ? efectivoNum : 0;
  const fondo = Number.isFinite(Number(fondoEsperado)) ? Number(fondoEsperado) : 0;
  const diferencia = efectivoSeguro - fondo;

  const handleConfirm = () => {
    if (loading) return;
    if (!posUser?.id) return;
    if (!efectivoValido) return;
    onConfirm?.({
      efectivo_inicial_contado: efectivoSeguro,
      fondo_esperado_apertura: fondo,
      diferencia_apertura: diferencia,
      notas_apertura: notas || '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onOpenChange?.(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-primary" />
            Abrir caja
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Usuario y fecha */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-xl bg-muted/40">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> Cajero
              </p>
              <p className="font-bold truncate">{posUser?.nombre || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/40">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Fecha y hora</p>
              <p className="font-bold text-xs">{new Date().toLocaleString('es-MX')}</p>
            </div>
          </div>

          {/* Fondo esperado */}
          <div className="p-3 rounded-xl border-2 border-blue-200 bg-blue-50">
            <p className="text-[10px] uppercase font-semibold text-blue-800 flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Fondo esperado del cierre anterior
            </p>
            <p className="font-heading font-black text-xl text-blue-900 mt-0.5">
              {formatCurrency(fondo)}
            </p>
          </div>

          {/* Efectivo inicial */}
          <div>
            <Label className="text-xs font-semibold">Efectivo inicial contado *</Label>
            <Input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={efectivoInicial}
              onChange={(e) => {
                // Permitir solo dígitos y un punto decimal. No bloqueamos el typing
                // si llega algo raro: filtramos en sitio para no congelar el input.
                const v = (e.target.value || '').replace(',', '.');
                if (v === '' || /^\d*\.?\d*$/.test(v)) setEfectivoInicial(v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && efectivoValido && !loading && posUser?.id) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="0.00"
              className="text-2xl font-bold h-14 mt-1 text-center"
            />
            {efectivoValido && (
              <div className={`mt-2 p-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                diferencia === 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : diferencia > 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {diferencia !== 0 && <AlertTriangle className="w-3 h-3 shrink-0" />}
                <span>
                  Diferencia con fondo esperado: {diferencia >= 0 ? '+' : ''}
                  {formatCurrency(diferencia)}
                  {diferencia < 0 && ' (faltante)'}
                  {diferencia > 0 && ' (sobrante)'}
                </span>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <Label className="text-xs">Notas de apertura (opcional)</Label>
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Faltan $30 del fondo, cambio en monedas..."
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !efectivoValido || !posUser?.id}>
            {loading ? 'Abriendo…' : 'Abrir caja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NumericInput from '@/components/common/NumericInput';
import { Label } from '@/components/ui/label';
import { Scissors, User, Receipt } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';

/**
 * Modal de Corte de turno (parcial).
 *
 * NO cierra la caja. NO reinicia dashboard. NO genera PDF.
 * Solo deja un registro histórico para revisión / cambio de turno.
 *
 * Recibe `resumen` con totales calculados de la caja abierta actual.
 */
export default function CorteTurnoDialog({
  open,
  onOpenChange,
  posUser,
  resumen,
  loading = false,
  onConfirm,
}) {
  const [efectivoContado, setEfectivoContado] = useState('');
  const [dineroDejado, setDineroDejado] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (open) {
      setEfectivoContado('');
      setDineroDejado('');
      setNotas('');
    }
  }, [open]);

  const safeResumen = resumen || {};
  const efectivoEsperado = Number.isFinite(Number(safeResumen.totalEfectivo)) ? Number(safeResumen.totalEfectivo) : 0;
  const efNum = Number.parseFloat(efectivoContado);
  const efValido = efectivoContado !== '' && Number.isFinite(efNum);
  const dejadoNum = Number.parseFloat(dineroDejado);
  const dejadoValido = dineroDejado === '' || Number.isFinite(dejadoNum);
  const diferencia = (efValido ? efNum : 0) - efectivoEsperado;

  const handleConfirm = () => {
    if (loading) return;
    if (!efValido || !dejadoValido) return;
    onConfirm?.({
      efectivo_contado: efValido ? efNum : 0,
      diferencia_efectivo: diferencia,
      dinero_dejado_en_caja: dineroDejado === '' ? 0 : (Number.isFinite(dejadoNum) ? dejadoNum : 0),
      notas: notas || '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onOpenChange?.(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Scissors className="w-5 h-5 text-amber-600" />
            Corte de turno
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            Es un corte parcial. NO cierra la caja, NO genera PDF, NO reinicia el dashboard.
          </div>

          {/* Resumen parcial */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Total ventas" value={formatCurrency(safeResumen.totalGeneral || 0)} />
            <Stat label="Tickets" value={String(safeResumen.numVentas || 0)} icon={Receipt} />
            <Stat label="Efectivo" value={formatCurrency(safeResumen.totalEfectivo || 0)} />
            <Stat label="Tarjeta" value={formatCurrency(safeResumen.totalTarjeta || 0)} />
            <Stat label="Transferencia" value={formatCurrency(safeResumen.totalTransferencia || 0)} />
            <Stat label="Ticket prom." value={formatCurrency(safeResumen.ticketPromedio || 0)} />
            <Stat label="Gastos" value={formatCurrency(safeResumen.totalGastos || 0)} />
            <Stat label="Cajero" value={posUser?.nombre || '—'} icon={User} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Efectivo contado *</Label>
              <NumericInput
                value={efectivoContado}
                onChange={(e) => setEfectivoContado(e.target.value)}
                placeholder="0.00"
                className="text-lg font-bold mt-1"
              />
              {efValido && (
                <p className={`text-xs mt-1 font-medium ${diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Diferencia: {diferencia >= 0 ? '+' : ''}{formatCurrency(diferencia)}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Dinero dejado en caja</Label>
              <NumericInput
                value={dineroDejado}
                onChange={(e) => setDineroDejado(e.target.value)}
                placeholder="0.00"
                className="text-lg font-bold mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notas del corte</Label>
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Cambio de turno, observaciones..."
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !efValido}>
            {loading ? 'Guardando…' : 'Registrar corte de turno'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/40">
      <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </p>
      <p className="font-bold text-sm truncate">{value}</p>
    </div>
  );
}
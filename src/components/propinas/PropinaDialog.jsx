import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, X, Clock } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';

/**
 * Modal universal de propina (rediseño responsive — v2).
 *
 * Reglas:
 * - El porcentaje se calcula SIEMPRE sobre `subtotal` (venta real).
 * - Nada de la propina afecta ventas reales / utilidad / costos / inventario.
 * - Layout: 4 columnas en sm+, 2 columnas en móvil.
 * - Botones de acción siempre visibles, sin desbordamiento.
 * - Si `porcentajesSugeridos` viene, se usa en lugar del default [5,10,15,20].
 */
const DEFAULT_PORCENTAJES = [5, 10, 15, 20];

export default function PropinaDialog({
  open,
  onOpenChange,
  subtotal = 0,
  loading = false,
  allowPendiente = false,
  origen = 'caja',
  onConfirm,
  porcentajesSugeridos,
}) {
  const porcentajes = (() => {
    if (Array.isArray(porcentajesSugeridos) && porcentajesSugeridos.length > 0) {
      return porcentajesSugeridos.filter(n => Number.isFinite(Number(n))).map(Number).slice(0, 6);
    }
    return DEFAULT_PORCENTAJES;
  })();

  const [pctActivo, setPctActivo] = useState(null);
  const [montoManual, setMontoManual] = useState('');

  useEffect(() => {
    if (open) {
      setPctActivo(null);
      setMontoManual('');
    }
  }, [open]);

  const safeSubtotal = Number.isFinite(Number(subtotal)) ? Number(subtotal) : 0;
  const montoNum = Number.parseFloat(montoManual);
  const montoValido = montoManual !== '' && Number.isFinite(montoNum) && montoNum >= 0;
  const propinaCalculada =
    pctActivo !== null
      ? Math.round((safeSubtotal * (pctActivo / 100)) * 100) / 100
      : (montoValido ? montoNum : 0);

  const totalConPropina = safeSubtotal + propinaCalculada;

  const elegirPorcentaje = (pct) => {
    setPctActivo(pct);
    setMontoManual('');
  };

  const onChangeManual = (raw) => {
    const v = (raw || '').replace(',', '.');
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      setMontoManual(v);
      setPctActivo(null);
    }
  };

  const confirmar = (tipo) => {
    if (loading) return;
    if (tipo === 'sin_propina') {
      onConfirm?.({ propina_monto: 0, propina_porcentaje: 0, propina_tipo: 'sin_propina', propina_origen: origen });
      return;
    }
    if (tipo === 'pendiente') {
      onConfirm?.({ propina_monto: 0, propina_porcentaje: 0, propina_tipo: 'pendiente', propina_origen: origen });
      return;
    }
    if (pctActivo !== null) {
      onConfirm?.({ propina_monto: propinaCalculada, propina_porcentaje: pctActivo, propina_tipo: 'porcentaje', propina_origen: origen });
      return;
    }
    if (montoValido && montoNum > 0) {
      onConfirm?.({ propina_monto: propinaCalculada, propina_porcentaje: 0, propina_tipo: 'monto_manual', propina_origen: origen });
      return;
    }
    onConfirm?.({ propina_monto: 0, propina_porcentaje: 0, propina_tipo: 'sin_propina', propina_origen: origen });
  };

  const puedeAplicar = pctActivo !== null || (montoManual !== '' && montoValido && montoNum > 0);

  // Grid responsive: 2 cols en móvil, hasta 4 en sm+
  const gridCols = porcentajes.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : `grid-cols-${porcentajes.length}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onOpenChange?.(false); }}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6 gap-3">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-heading flex items-center gap-2 text-base sm:text-lg">
            <Heart className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="truncate">¿Desean agregar propina?</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Subtotal */}
          <div className="p-3 rounded-xl bg-muted/40 text-center">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Subtotal de la venta</p>
            <p className="font-heading font-black text-2xl">{formatCurrency(safeSubtotal)}</p>
          </div>

          {/* Porcentajes rápidos */}
          <div>
            <Label className="text-xs font-semibold mb-2 block">Porcentajes rápidos</Label>
            <div className={`grid ${gridCols} gap-2`}>
              {porcentajes.map((p) => {
                const monto = Math.round((safeSubtotal * (p / 100)) * 100) / 100;
                const activo = pctActivo === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => elegirPorcentaje(p)}
                    className={`px-2 py-2 rounded-xl border-2 text-center transition-all min-w-0 ${
                      activo
                        ? 'border-rose-400 bg-rose-50 text-rose-700 shadow-md'
                        : 'border-border bg-white text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <p className="font-heading font-black text-base sm:text-lg leading-none">{p}%</p>
                    <p className="text-[10px] mt-1 truncate">{formatCurrency(monto)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monto manual */}
          <div>
            <Label className="text-xs font-semibold">O monto manual</Label>
            <Input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={montoManual}
              onChange={(e) => onChangeManual(e.target.value)}
              placeholder="0.00"
              className="text-lg font-bold h-11 mt-1 text-center"
            />
          </div>

          {/* Resumen */}
          {(pctActivo !== null || (montoValido && montoNum > 0)) && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Propina</span>
                <span className="font-bold text-emerald-700">{formatCurrency(propinaCalculada)}</span>
              </div>
              <div className="flex justify-between gap-2 border-t border-emerald-200 mt-1 pt-1">
                <span className="font-semibold">Total a cobrar</span>
                <span className="font-heading font-black text-emerald-700">{formatCurrency(totalConPropina)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Acciones — Grid responsive (2 cols móvil / fila sm+) */}
        <div className={`grid gap-2 pt-1 ${allowPendiente ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
          <Button
            variant="outline"
            onClick={() => confirmar('sin_propina')}
            disabled={loading}
            className="gap-1.5 text-xs sm:text-sm h-10 min-w-0 px-2"
          >
            <X className="w-4 h-4 shrink-0" />
            <span className="truncate">Sin propina</span>
          </Button>
          {allowPendiente && (
            <Button
              variant="outline"
              onClick={() => confirmar('pendiente')}
              disabled={loading}
              className="gap-1.5 text-xs sm:text-sm h-10 min-w-0 px-2 col-span-2 sm:col-span-1"
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span className="truncate">Decidir en caja</span>
            </Button>
          )}
          <Button
            onClick={() => confirmar('aplicar')}
            disabled={loading || !puedeAplicar}
            className="gap-1.5 text-xs sm:text-sm h-10 min-w-0 px-2 text-white"
            style={{ background: puedeAplicar ? 'linear-gradient(135deg, hsl(340,82%,52%) 0%, hsl(340,82%,42%) 100%)' : undefined }}
          >
            <Heart className="w-4 h-4 shrink-0" />
            <span className="truncate">{loading ? 'Aplicando…' : 'Aplicar'}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
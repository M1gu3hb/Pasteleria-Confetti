import React from 'react';
import { Banknote, CreditCard, Smartphone, Split } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { construirPago } from '@/utils/metodoPago';

// FASE 3 #3 — Selector de método de pago REUTILIZABLE (mostrador, anticipos de
// pastel y de pedido web). CONTROLADO: el padre es dueño de `metodo` y `montos`
// (objeto { efectivo, tarjeta, transferencia } con strings) y computa él mismo
// `construirPago(total, metodo, montos)` de forma SÍNCRONA. Así el pago nunca se
// rezaga respecto al monto (un patrón onChange-vía-useEffect podía dejar montos
// por método viejos si el total cambiaba y se confirmaba rápido → dinero mal).
// Aquí solo se pinta la UI y se reportan los cambios por callback.

const METODOS = [
  { key: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { key: 'tarjeta', label: 'Tarjeta', Icon: CreditCard },
  { key: 'transferencia', label: 'Transferencia', Icon: Smartphone },
  { key: 'mixto', label: 'Mixto', Icon: Split },
];

const MIXTO_CAMPOS = [
  { key: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { key: 'tarjeta', label: 'Tarjeta', Icon: CreditCard },
  { key: 'transferencia', label: 'Transferencia', Icon: Smartphone },
];

export default function MetodoPagoSelector({ total, metodo, montos, onMetodoChange, onMontosChange, disabled = false }) {
  const estado = construirPago(total, metodo, montos || {});
  const esMixto = metodo === 'mixto';
  const cuadra = Math.abs(estado.faltante) < 0.01;
  const numMetodos = [estado.pago.monto_efectivo, estado.pago.monto_tarjeta, estado.pago.monto_transferencia].filter(x => x > 0).length;

  const setMonto = (k, v) => {
    const clean = (v || '').replace(',', '.');
    if (clean === '' || /^\d*\.?\d*$/.test(clean)) {
      onMontosChange?.({ ...(montos || {}), [k]: clean });
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {METODOS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onMetodoChange?.(key)}
            className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition-all disabled:opacity-50 ${
              metodo === key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted/40'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>

      {esMixto && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2.5">
          <p className="text-[11px] text-muted-foreground">
            Reparte {formatCurrency(Number(total) || 0)} entre los métodos. La suma debe cuadrar exacto.
          </p>
          {MIXTO_CAMPOS.map(({ key, label, Icon }) => (
            <div key={key} className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs w-24 shrink-0">{label}</span>
              <input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={(montos && montos[key]) || ''}
                onChange={e => setMonto(key, e.target.value)}
                placeholder="0.00"
                className="skeu-input flex-1 h-10 px-3 text-right font-bold rounded-lg disabled:opacity-50"
              />
            </div>
          ))}
          <div className="flex justify-between items-center pt-1 border-t text-sm">
            <span className="text-muted-foreground text-xs">Suma {formatCurrency(estado.suma)} de {formatCurrency(Number(total) || 0)}</span>
            {cuadra ? (
              <span className="font-bold text-emerald-600">✓ Cuadra</span>
            ) : estado.faltante > 0 ? (
              <span className="font-bold text-red-600">Falta {formatCurrency(estado.faltante)}</span>
            ) : (
              <span className="font-bold text-red-600">Sobra {formatCurrency(Math.abs(estado.faltante))}</span>
            )}
          </div>
          {cuadra && numMetodos < 2 && (
            <p className="text-[11px] text-amber-600">Un pago mixto usa al menos 2 métodos.</p>
          )}
        </div>
      )}
    </div>
  );
}

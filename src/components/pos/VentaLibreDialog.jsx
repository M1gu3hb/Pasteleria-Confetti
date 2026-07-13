import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import InputDinero from '@/components/ui/InputDinero';
import { toast } from 'sonner';
import { NOMBRE_VENTA_LIBRE } from '@/utils/nombreLineaVenta';

// Normaliza el monto a CENTAVOS (2 decimales): round(x, 2).
function aCentavos(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Dialog de "Venta libre" (FASE 3) — captura un MONTO (obligatorio, > 0) y un
 * NOMBRE opcional. Al confirmar, construye un ítem de carrito precio_fijo con
 * `producto_id: null` (mismo patrón que el anticipo) y lo entrega vía
 * `onConfirm(item)`. NO persiste nada ni cobra: solo arma el ítem para que el
 * flujo COMPLETO de POS (carrito → PaymentModal → handleCheckout) lo cobre.
 *
 * Se reusa en DOS lugares (una sola fuente de verdad, sin duplicar validación):
 *  - Entry A: dentro de "Nueva venta" (POS) → push al carrito.
 *  - Entry B: botón en modo empleado (Caja) → navega a /pos precargando el ítem.
 *
 * Validaciones (hallazgos de Codex): monto > 0, normalizado a centavos, y
 * nombre NUNCA vacío (default "Venta libre").
 */
export default function VentaLibreDialog({ open, onClose, onConfirm, confirmLabel = 'Agregar' }) {
  const [montoRaw, setMontoRaw] = useState('');
  const [nombre, setNombre] = useState('');

  const monto = aCentavos(montoRaw);
  const montoValido = monto > 0;

  const reset = () => { setMontoRaw(''); setNombre(''); };
  const cerrar = () => { reset(); onClose?.(); };

  const confirmar = () => {
    if (!montoValido) {
      toast.error('Ingresa un monto mayor a $0.');
      return;
    }
    const item = {
      producto_id: null,                              // línea sin producto (nullable en prod)
      nombre: nombre.trim() || NOMBRE_VENTA_LIBRE,    // NUNCA vacío
      precio_venta: monto,                            // > 0, a centavos
      costo: 0,
      area_preparacion: 'ninguno',                    // nunca dispara pedido de cocina
      cantidad: 1,
      notas: '',
      // FASE A (v1.1.1): marca de UI transitoria. Bloquea los +/- del carrito para
      // que un monto fijo ($100) no se vuelva $200 por accidente. NO es columna real
      // → la whitelist de columnas del checkout (pickColumns) la descarta; no persiste.
      es_venta_libre: true,
    };
    onConfirm?.(item);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Venta libre</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="vl-monto">Monto <span className="text-destructive">*</span></Label>
            <InputDinero
              id="vl-monto"
              value={montoRaw}
              onChange={setMontoRaw}
              placeholder="0.00"
              autoFocus
              className="h-12 text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Un monto sin producto de catálogo (Mercado Pago, extras, algo suelto…).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vl-nombre">Nombre (opcional)</Label>
            <Input
              id="vl-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Venta libre"
              maxLength={80}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Si lo dejas vacío, en el ticket aparece como “Extra”.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!montoValido} className="transition-transform active:scale-95">
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

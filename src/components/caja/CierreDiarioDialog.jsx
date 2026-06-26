import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NumericInput from '@/components/common/NumericInput';
import { Label } from '@/components/ui/label';
import { Lock, TrendingUp, DollarSign, Receipt, CreditCard, Banknote, Smartphone, Wallet, Scissors, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';

/**
 * Modal de Cierre de caja diario (premium).
 *
 * Cierra la caja, genera PDF y reinicia dashboard operativo.
 * Diseño más completo con secciones separadas para resumen, métodos de pago,
 * conteo y notas.
 */
export default function CierreDiarioDialog({
  open,
  onOpenChange,
  posUser,
  cajaAbierta,
  resumen,
  loading = false,
  onConfirm,
  colorearImportes = true,
  // Confetti (Esencial): ocultar costos/utilidad/propinas en el modal.
  // Los valores se SIGUEN guardando en BD; solo se ocultan en la UI.
  esEsencial = false,
}) {
  const tone = colorearImportes;
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
  const totalGeneral = Number(safeResumen.totalGeneral) || 0;       // ventas reales SIN propina
  const totalEfectivo = Number(safeResumen.totalEfectivo) || 0;     // ventas reales en efectivo SIN propina
  const totalTarjeta = Number(safeResumen.totalTarjeta) || 0;
  const totalTransferencia = Number(safeResumen.totalTransferencia) || 0;
  const totalGastos = Number(safeResumen.totalGastos) || 0;
  const utilidadBruta = Number(safeResumen.utilidadBruta) || 0;
  const costoTotal = Number(safeResumen.costoTotal) || 0;
  const numVentas = Number(safeResumen.numVentas) || 0;
  const ticketPromedio = Number(safeResumen.ticketPromedio) || 0;
  const margen = totalGeneral > 0 ? (utilidadBruta / totalGeneral * 100) : 0;
  const utilidadNeta = utilidadBruta - totalGastos;

  // === Propinas (NO suman a ventas/utilidad/margen) ===
  const totalPropinas = Number(safeResumen.totalPropinas) || 0;
  const totalCobrado = totalGeneral + totalPropinas; // dinero real recibido del cliente
  // Desglose de propinas por método (si la app lo está calculando en resumen).
  const metodos = safeResumen.metodosPagoConPropinas || null;
  const efPropinas = Number(metodos?.efectivo?.propinas) || 0;
  const taPropinas = Number(metodos?.tarjeta?.propinas) || 0;
  const trPropinas = Number(metodos?.transferencia?.propinas) || 0;
  const efTotal = totalEfectivo + efPropinas;
  const taTotal = totalTarjeta + taPropinas;
  const trTotal = totalTransferencia + trPropinas;
  // El conteo de efectivo debe cuadrar contra el total cobrado en efectivo
  // (ventas reales + propinas en efectivo), porque eso es lo que físicamente
  // hay en el cajón.
  const efectivoEsperado = efTotal;

  const efNum = Number.parseFloat(efectivoContado);
  const efValido = efectivoContado !== '' && Number.isFinite(efNum);
  const dejadoNum = Number.parseFloat(dineroDejado);
  const dejadoValido = dineroDejado === '' || Number.isFinite(dejadoNum);
  // Diferencia contra el efectivo esperado (ventas + propinas en efectivo).
  const diferencia = (efValido ? efNum : 0) - efectivoEsperado;

  const tonoDiferencia = useMemo(() => {
    if (!efValido) return null;
    if (Math.abs(diferencia) < 0.01) return 'cuadra';
    if (diferencia > 0) return 'sobra';
    return 'falta';
  }, [efValido, diferencia]);

  const handleConfirm = () => {
    if (loading) return;
    if (!efValido || !dejadoValido) return;
    onConfirm?.({
      efectivo_contado: efValido ? efNum : 0,
      diferencia_efectivo: diferencia,
      dinero_dejado_en_caja: dineroDejado === '' ? 0 : (Number.isFinite(dejadoNum) ? dejadoNum : 0),
      utilidad_neta_estimada: utilidadNeta,
      notas: notas || '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onOpenChange?.(false); }}>
      <DialogContent className="sm:max-w-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5 text-red-600" />
            Cierre de caja diario
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="p-3 rounded-xl bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-950/40 dark:to-amber-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Cerrar la caja finaliza la operación del día. Se generará un <strong>PDF blanco e imprimible</strong>,
              el dashboard operativo se reiniciará y el dinero dejado en caja será el fondo esperado para mañana.
            </p>
          </div>

          {/* === RESUMEN === (en Esencial: solo ventas, tickets y promedio) === */}
          <Section title={esEsencial ? 'Resumen del día' : 'Resumen financiero (sin propinas)'}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KPI label="Ventas reales" value={formatCurrency(totalGeneral)} icon={DollarSign} color={tone ? 'text-primary' : 'text-foreground'} />
              <KPI label="Tickets" value={String(numVentas)} icon={Receipt} />
              <KPI label="Ticket promedio" value={formatCurrency(ticketPromedio)} />
              {!esEsencial && <KPI label="Costo de ventas" value={formatCurrency(costoTotal)} />}
              {!esEsencial && <KPI label="Utilidad bruta" value={formatCurrency(utilidadBruta)} icon={TrendingUp} color={tone ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'} />}
              {!esEsencial && <KPI label="Margen prom." value={formatPercent(margen)} />}
              {!esEsencial && <KPI label="Gastos op." value={formatCurrency(totalGastos)} icon={Scissors} color={tone ? 'text-rose-600 dark:text-rose-300' : 'text-foreground'} />}
              {!esEsencial && (
                <KPI
                  label="Utilidad neta est."
                  value={formatCurrency(utilidadNeta)}
                  icon={Wallet}
                  color={tone ? (utilidadNeta >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300') : 'text-foreground'}
                />
              )}
            </div>
            {!esEsencial && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Utilidad y margen se calculan SOLO sobre ventas reales. Las propinas no son ingreso del negocio.
              </p>
            )}
          </Section>

          {/* === PROPINAS DEL DÍA === (oculto en Esencial) */}
          {!esEsencial && (
          <Section title="Propinas del día (pendientes de liquidar)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KPI label="Propinas totales" value={formatCurrency(totalPropinas)} icon={Wallet} color={tone ? 'text-rose-600 dark:text-rose-300' : 'text-foreground'} />
              <KPI label="Propina efectivo" value={formatCurrency(efPropinas)} />
              <KPI label="Propina tarjeta" value={formatCurrency(taPropinas)} />
              <KPI label="Propina transfer." value={formatCurrency(trPropinas)} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Las propinas se cobran junto con la venta pero NO se liquidan en el cierre.
              Quedan registradas para entregarse a los meseros aparte.
            </p>
          </Section>
          )}

          {/* === MÉTODOS DE PAGO === */}
          {esEsencial ? (
            /* Confetti: tabla simple Método / Monto (sin propinas). */
            <Section title="Métodos de pago">
              <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
                <div className="grid grid-cols-2 text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted/40 px-3 py-1.5">
                  <span>Método</span>
                  <span className="text-right">Monto</span>
                </div>
                <FilaMetodoSimple Icon={Banknote} label="Efectivo" color={tone ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'} v={totalEfectivo} />
                <FilaMetodoSimple Icon={CreditCard} label="Tarjeta" color={tone ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'} v={totalTarjeta} />
                <FilaMetodoSimple Icon={Smartphone} label="Transferencia" color={tone ? 'text-purple-700 dark:text-purple-300' : 'text-foreground'} v={totalTransferencia} />
                <div className="grid grid-cols-2 px-3 py-2 border-t bg-muted/30 text-sm font-bold">
                  <span>Total</span>
                  <span className="text-right">{formatCurrency(totalGeneral)}</span>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="Métodos de pago (ventas + propinas)">
              <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
                <div className="grid grid-cols-4 text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted/40 px-3 py-1.5">
                  <span>Método</span>
                  <span className="text-right">Ventas</span>
                  <span className="text-right">Propinas</span>
                  <span className="text-right">Total</span>
                </div>
                <FilaMetodo Icon={Banknote} label="Efectivo" color={tone ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'} v={totalEfectivo} p={efPropinas} t={efTotal} tone={tone} />
                <FilaMetodo Icon={CreditCard} label="Tarjeta" color={tone ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'} v={totalTarjeta} p={taPropinas} t={taTotal} tone={tone} />
                <FilaMetodo Icon={Smartphone} label="Transferencia" color={tone ? 'text-purple-700 dark:text-purple-300' : 'text-foreground'} v={totalTransferencia} p={trPropinas} t={trTotal} tone={tone} />
                <div className="grid grid-cols-4 px-3 py-2 border-t bg-muted/30 text-sm font-bold">
                  <span>Total</span>
                  <span className="text-right">{formatCurrency(totalGeneral)}</span>
                  <span className={`text-right ${tone ? 'text-rose-600 dark:text-rose-300' : ''}`}>{formatCurrency(totalPropinas)}</span>
                  <span className="text-right">{formatCurrency(totalCobrado)}</span>
                </div>
              </div>
            </Section>
          )}

          {/* === CONTEO DE EFECTIVO === */}
          <Section title="Conteo de efectivo y fondo">
            {/* Banner destacado: efectivo esperado en el cajón */}
            <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 mb-3">
              <div className="flex items-start gap-3 flex-wrap">
                <Banknote className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wide font-bold text-emerald-700 dark:text-emerald-300">
                    Efectivo esperado en cajón
                  </p>
                  <p className="font-heading font-black text-2xl text-emerald-800 dark:text-emerald-200 leading-tight">
                    {formatCurrency(efectivoEsperado)}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                    Ventas en efectivo {formatCurrency(totalEfectivo)} + propinas en efectivo {formatCurrency(efPropinas)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" /> Efectivo contado físicamente *
                </Label>
                <NumericInput
                  value={efectivoContado}
                  onChange={(e) => setEfectivoContado(e.target.value)}
                  placeholder="0.00"
                  className="text-2xl font-black h-14 mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Captura ÚNICAMENTE el efectivo físico contado en caja. No el total cobrado.
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold">Dinero dejado en caja (fondo mañana)</Label>
                <NumericInput
                  value={dineroDejado}
                  onChange={(e) => setDineroDejado(e.target.value)}
                  placeholder="0.00"
                  className="text-2xl font-black h-14 mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Este monto será el fondo esperado al abrir mañana.
                </p>
              </div>
            </div>

            {efValido && (
              <div className={`mt-3 p-3 rounded-xl border-2 flex items-center gap-2 text-sm font-semibold ${
                tonoDiferencia === 'cuadra' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300' :
                tonoDiferencia === 'sobra' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300' :
                'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300'
              }`}>
                {tonoDiferencia === 'cuadra' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span>
                  {tonoDiferencia === 'cuadra' && 'La caja cuadra perfectamente.'}
                  {tonoDiferencia === 'sobra' && `Sobra ${formatCurrency(diferencia)} en caja.`}
                  {tonoDiferencia === 'falta' && `Falta ${formatCurrency(Math.abs(diferencia))} en caja.`}
                </span>
              </div>
            )}
          </Section>

          {/* === NOTAS === */}
          <Section title="Notas y observaciones">
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones, faltantes, sobrantes, incidencias..."
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Cajero: {posUser?.nombre || '—'} ·
              {cajaAbierta?.fecha_apertura && ` Apertura: ${new Date(cajaAbierta.fecha_apertura).toLocaleString('es-MX')}`}
            </p>
          </Section>
        </div>

        <DialogFooter className="border-t pt-3 mt-2">
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !efValido}
            className="min-w-[180px]"
            style={{ background: 'linear-gradient(135deg, hsl(0,72%,46%) 0%, hsl(0,72%,36%) 100%)' }}
          >
            {loading ? 'Cerrando…' : 'Cerrar caja del día'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/40 border">
      <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </p>
      <p className={`font-heading font-black text-base mt-0.5 truncate ${color || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function FilaMetodo({ Icon, label, color, v, p, t, tone = true }) {
  return (
    <div className="grid grid-cols-4 px-3 py-2 border-t text-xs items-center">
      <span className={`inline-flex items-center gap-1.5 font-medium ${color || ''}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
      </span>
      <span className="text-right font-semibold">{formatCurrency(v)}</span>
      <span className={`text-right font-semibold ${tone ? 'text-rose-600 dark:text-rose-300' : ''}`}>{formatCurrency(p)}</span>
      <span className={`text-right font-heading font-black ${color || ''}`}>{formatCurrency(t)}</span>
    </div>
  );
}

// Confetti (Esencial): fila simple Método / Monto, sin columnas de propina.
function FilaMetodoSimple({ Icon, label, color, v }) {
  return (
    <div className="grid grid-cols-2 px-3 py-2 border-t text-xs items-center">
      <span className={`inline-flex items-center gap-1.5 font-medium ${color || ''}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
      </span>
      <span className="text-right font-heading font-black">{formatCurrency(v)}</span>
    </div>
  );
}
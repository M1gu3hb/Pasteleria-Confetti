import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import InputDinero from '@/components/ui/InputDinero';
import { toast } from 'sonner';
import { Receipt, Banknote, CreditCard, Smartphone, Trash2, Plus } from 'lucide-react';
import { safeFormatDate } from '@/lib/safeFormat';

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const METODOS = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'transferencia', label: 'Transferencia', icon: Smartphone },
];

// CAMBIOS_V2 Fase 07 — pestaña "Gastos" de Caja.
// Registra gastos (fresas, velas, muñecas…) del corte ABIERTO. Solo el efectivo
// resta del efectivo esperado (lo calcula Caja.jsx). Lista los gastos del corte
// con opción de quitar uno recién capturado (del corte abierto) si hubo error.
export default function GastosCajaTab({ cajaAbierta, posUser, sucursalEfectiva, gastos = [] }) {
  const queryClient = useQueryClient();
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [guardando, setGuardando] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);

  const sucId = sucursalEfectiva?.sucursal_id || cajaAbierta?.sucursal_id || null;
  const sucNombre = sucursalEfectiva?.sucursal_nombre || cajaAbierta?.sucursal_nombre || '';

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['gastos_hoy'] });
  };

  const guardar = async () => {
    if (guardando) return;
    if (!cajaAbierta?.id) { toast.error('Abre la caja antes de registrar gastos.'); return; }
    const m = parseFloat(monto) || 0;
    if (m <= 0) { toast.error('Captura un monto mayor a 0.'); return; }
    if (!descripcion.trim()) { toast.error('Describe el gasto (¿de qué / para quién?).'); return; }
    setGuardando(true);
    try {
      await base44.entities.GastoOperativo.create({
        monto: m,
        metodo_pago: metodo,
        descripcion: descripcion.trim(),
        categoria: 'operativo',
        fecha: new Date().toISOString(),
        sucursal_id: sucId,
        sucursal_nombre: sucNombre,
        usuario_id: posUser?.id || '',
        usuario_nombre: posUser?.nombre || '',
        corte_caja_id: cajaAbierta.id,
      });
      toast.success('Gasto registrado');
      setMonto(''); setDescripcion(''); setMetodo('efectivo');
      refrescar();
    } catch (err) {
      console.error('[GastosCajaTab] guardar:', err);
      toast.error('No se pudo registrar el gasto. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // Quitar un gasto: SOLO si es del corte abierto (corrección de captura).
  const quitar = async (g) => {
    if (borrandoId) return;
    if (g?.corte_caja_id && g.corte_caja_id !== cajaAbierta?.id) {
      toast.error('Solo puedes quitar gastos del corte abierto.');
      return;
    }
    if (!window.confirm('¿Quitar este gasto? Esta acción no se puede deshacer.')) return;
    setBorrandoId(g.id);
    try {
      await base44.entities.GastoOperativo.delete(g.id);
      toast.success('Gasto eliminado');
      refrescar();
    } catch (err) {
      console.error('[GastosCajaTab] quitar:', err);
      toast.error('No se pudo eliminar el gasto.');
    } finally {
      setBorrandoId(null);
    }
  };

  const totalGastos = gastos.reduce((s, g) => s + (Number(g?.monto) || 0), 0);
  const totalEfectivo = gastos.reduce((s, g) => s + (g?.metodo_pago === 'efectivo' ? (Number(g.monto) || 0) : 0), 0);

  if (!cajaAbierta) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Receipt className="w-12 h-12 mx-auto opacity-20 mb-3" />
        <p>Abre la caja para registrar gastos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" /> Registrar un gasto
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Las fresas, velas, muñecas, etc. que se pagan durante el día. Solo los gastos en
            efectivo se descuentan del efectivo esperado del corte.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Monto *</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-sm text-muted-foreground">$</span>
                <InputDinero
                  min="0" value={monto} onChange={setMonto}
                  className="skeu-input h-11 font-bold text-lg" placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Método de pago *</Label>
              <div className="flex gap-1.5 mt-1">
                {METODOS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMetodo(value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-lg border-2 text-xs font-medium transition-colors ${
                      metodo === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs">Concepto / ¿para quién? *</Label>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: fresas para pastel de Lupita"
              className="skeu-input h-11 mt-1"
            />
          </div>
          <Button onClick={guardar} disabled={guardando} className="w-full h-11">
            <Plus className="w-4 h-4 mr-1.5" />
            {guardando ? 'Guardando…' : 'Registrar gasto'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista de gastos del corte */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center justify-between">
            <span>Gastos de este corte</span>
            <span className="text-xs font-normal text-muted-foreground">
              Total {fmt(totalGastos)} · Efectivo {fmt(totalEfectivo)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gastos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aún no hay gastos en este corte.</p>
          ) : (
            <div className="space-y-1.5">
              {gastos.map((g) => {
                const Icon = METODOS.find(m => m.value === g.metodo_pago)?.icon || Banknote;
                return (
                  <div key={g.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{g.descripcion || 'Gasto'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {safeFormatDate(g.created_date || g.fecha, 'HH:mm')} · {g.metodo_pago}
                      </p>
                    </div>
                    <span className="font-bold text-sm shrink-0">{fmt(g.monto)}</span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => quitar(g)}
                      disabled={borrandoId === g.id}
                      title="Quitar gasto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

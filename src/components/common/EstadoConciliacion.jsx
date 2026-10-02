import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, ensureSession } from '@/api/supabaseClient';
import { usePOSAuth } from '@/lib/POSAuthContext';
import EvidenciaPagoDialog from '@/components/common/EvidenciaPagoDialog';

export default function EstadoConciliacion({ sucursalId }) {
  const { posUser } = usePOSAuth();
  const [evidencia, setEvidencia] = useState(null);
  const dueno = ['dueño', 'dueno'].includes(posUser?.rol);
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ['conciliacion_operativa', sucursalId || null, posUser?.id], enabled: dueno,
    queryFn: async () => {
      await ensureSession();
      const { data: resultado, error: fallo } = await supabase.rpc('conciliacion_operativa_pos', { p_sucursal: sucursalId || null });
      if (fallo) throw new Error('No se pudo verificar la conciliación.');
      const claves = ['saldos_inconsistentes', 'enlaces_inconsistentes', 'ventas_corte_cruzadas', 'abonos_sin_venta', 'abonos_historicos_sin_venta'];
      if (!resultado || !claves.every(k => typeof resultado[k] === 'number' && Number.isFinite(resultado[k])) || !Array.isArray(resultado.pagos_con_venta_cancelada)) throw new Error('La conciliación está incompleta.');
      if (!resultado.pagos_con_venta_cancelada.every(x => x.pedido_id && x.venta_id && ['monto', 'saldo_pedido', 'abonado_pedido', 'devuelto_registrado', 'devoluciones_libro'].every(k => typeof x[k] === 'number' && Number.isFinite(x[k])) && Array.isArray(x.pedidos_relacionados))) throw new Error('La evidencia de los pagos está incompleta.');
      return resultado;
    },
    staleTime: 15000, refetchInterval: 30000, retry: 1,
  });
  if (!dueno) return null;
  if (error) return <div role="alert" className="border rounded-xl p-3 text-sm text-destructive">No se pudo verificar la conciliación. <button disabled={isFetching} onClick={() => refetch()} className="underline">Reintentar</button></div>;
  if (isPending) return <p className="text-xs text-muted-foreground">Verificando saldos y registros…</p>;
  const inconsistencias = data.saldos_inconsistentes + data.enlaces_inconsistentes + data.ventas_corte_cruzadas + data.abonos_sin_venta;
  const historicos = data.pagos_con_venta_cancelada;
  return <div className="border rounded-xl p-3 text-sm space-y-2">
    <p role={inconsistencias ? 'alert' : 'status'} className={inconsistencias ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
      {inconsistencias ? `${inconsistencias} diferencia(s) en saldos o registros. Revisa los movimientos antes de ajustar dinero.` : historicos.length ? 'Cifras y vínculos revisados; hay pagos cancelados pendientes de conciliación interna.' : 'Saldos y vínculos de pagos verificados.'}
    </p>
    {!!data.abonos_historicos_sin_venta && <p className="text-xs text-muted-foreground">{data.abonos_historicos_sin_venta} anticipo(s) histórico(s) documentado(s) sin movimiento de caja.</p>}
    {!!historicos.length && <details>
      <summary className="cursor-pointer text-amber-800">{historicos.length} pago(s) con cancelación registrada: ver evidencia del sistema</summary>
      <p className="my-2 text-xs">El POS conserva el abono, el motivo, el importe de devolución y el corte. Revisa la diferencia entre la venta cancelada y el libro del pedido sin volver a registrar dinero.</p>
      <ul className="space-y-1 text-xs">{historicos.map(x => <li key={`${x.pedido}:${x.venta}`}>{x.pedido} · {x.venta} · ${Number(x.monto).toFixed(2)} · {x.metodo} <button className="underline" onClick={() => setEvidencia(x)}>Ver e imprimir evidencia</button></li>)}</ul>
    </details>}
    {evidencia && <EvidenciaPagoDialog key={`${evidencia.pedido}:${evidencia.venta}`} pago={evidencia} onClose={() => setEvidencia(null)} />}
  </div>;
}

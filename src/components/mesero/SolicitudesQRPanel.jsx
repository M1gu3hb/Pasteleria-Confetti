import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Bell, Receipt, HelpCircle, CheckCircle2, Volume2, UserCheck, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import AlertasMeseroDialog from './AlertasMeseroDialog';
import { TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';
import { filtrarSolicitudesParaUsuario, asignacionActiva, colorParaUsuario } from '@/lib/asignacionMesas';
import { ROLES } from '@/lib/constants';

const TIPO_ICON = { ordenar: Bell, cuenta: Receipt, ayuda: HelpCircle };
const TIPO_COLOR = {
  ordenar: 'bg-amber-100 text-amber-800 border-amber-300',
  cuenta: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  ayuda: 'bg-rose-100 text-rose-800 border-rose-300',
};

/**
 * Panel de Solicitudes QR para el mesero.
 *
 * - Con asignación activa: solo ve sus solicitudes (mesero_destino_id == él
 *   o solicitudes "sin asignar"). El admin ve todas.
 * - Sin asignación: cola general — todos los meseros la ven.
 * - "Atender" guarda atendido_por en la solicitud y, si la asignación está
 *   apagada y la mesa aún no tiene "atendido_por", también lo asigna a la mesa.
 */
export default function SolicitudesQRPanel() {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const [showAlertas, setShowAlertas] = useState(false);

  const { data: solicitudesRaw = [] } = useQuery({
    queryKey: ['solicitudes_qr_mesero'],
    queryFn: () => base44.entities.SolicitudQR.list('-created_date', 100),
    initialData: [],
    refetchInterval: 5000,
  });

  // Filtramos según rol/asignación, luego dejamos solo las activas.
  const activas = useMemo(() => {
    const arr = filtrarSolicitudesParaUsuario(solicitudesRaw, posUser, config);
    return (Array.isArray(arr) ? arr : [])
      .filter(s => s?.estado === 'pendiente' || s?.estado === 'atendida');
  }, [solicitudesRaw, posUser, config]);

  const asign = asignacionActiva(config);

  const accion = async (s, accionTipo) => {
    if (!s?.id) return;
    try {
      const ahora = new Date().toISOString();
      if (accionTipo === 'atender') {
        await base44.entities.SolicitudQR.update(s.id, {
          estado: 'atendida',
          fecha_atendida: ahora,
          atendido_por_id: posUser?.id,
          atendido_por_nombre: posUser?.nombre,
        });
        // Sin asignación: si la mesa no tiene atendido_por, asignárselo al que atiende.
        if (!asign && s.mesa_id && posUser?.id && posUser?.rol === ROLES.WAITER) {
          try {
            const mesa = await base44.entities.Mesa.get(s.mesa_id).catch(() => null);
            if (mesa && !mesa.atendido_por_id) {
              await base44.entities.Mesa.update(mesa.id, {
                atendido_por_id: posUser.id,
                atendido_por_nombre: posUser.nombre || '',
                atendido_por_color: colorParaUsuario(posUser),
              }).catch(() => {});
              queryClient.invalidateQueries({ queryKey: ['mesas'] });
            }
          } catch {}
        }
      } else if (accionTipo === 'resolver') {
        await base44.entities.SolicitudQR.update(s.id, {
          estado: 'resuelta',
          fecha_resuelta: ahora,
          atendido_por_id: s.atendido_por_id || posUser?.id,
          atendido_por_nombre: s.atendido_por_nombre || posUser?.nombre,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_admin'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero_count'] });
      toast.success('Solicitud actualizada');
    } catch (err) {
      console.error('[SolicitudesQRPanel] accion:', err);
      toast.error('No se pudo actualizar');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {activas.length === 0 ? 'Sin solicitudes activas' : `${activas.length} solicitud(es) activas`}
          {asign && <span className="ml-1 text-[10px] uppercase tracking-wide text-primary font-bold">· Modo asignación</span>}
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowAlertas(true)} className="gap-2 h-8">
          <Volume2 className="w-4 h-4" /> Alertas
        </Button>
      </div>

      {activas.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground rounded-xl border-2 border-dashed">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Sin solicitudes pendientes.</p>
          <p className="text-xs">Las solicitudes desde el QR aparecerán aquí.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activas.map(s => {
            const Icon = TIPO_ICON[s.tipo] || Bell;
            const color = TIPO_COLOR[s.tipo] || 'bg-slate-100 text-slate-700 border-slate-300';
            const time = (() => {
              try { return s?.fecha_creacion ? formatDistanceToNow(new Date(s.fecha_creacion), { addSuffix: true, locale: es }) : '—'; }
              catch { return '—'; }
            })();
            const yaAtendida = s.estado === 'atendida';
            const propia = asign && s?.mesero_destino_id === posUser?.id;
            const sinAsignar = asign && !s?.mesero_destino_id;
            return (
              <div
                key={s.id}
                className={`rounded-xl border-2 p-3 bg-white ${yaAtendida ? 'border-emerald-200' : propia ? 'border-primary' : 'border-amber-300'}`}
                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-sm">
                      Mesa {s.mesa_numero || '—'} {TIPO_SOLICITUD_VERBO[s.tipo] || ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{time}</p>
                    {asign && s.mesero_destino_nombre && (
                      <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Para: {s.mesero_destino_nombre}
                      </p>
                    )}
                    {sinAsignar && (
                      <p className="text-[10px] text-amber-700 mt-0.5">⚠ Mesa sin mesero asignado</p>
                    )}
                    {yaAtendida && s.atendido_por_nombre && (
                      <p className="text-[10px] text-emerald-700 mt-0.5">
                        Atiende: {s.atendido_por_nombre}
                      </p>
                    )}
                    {/* Datos del comensal cuando es solicitud de CUENTA con propina QR */}
                    {s.tipo === 'cuenta' && (Number(s.subtotal_consumo) || 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          Subtotal: {formatCurrency(Number(s.subtotal_consumo) || 0)}
                        </span>
                        {(Number(s.propina_monto_sugerida) || 0) > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-0.5">
                            <Heart className="w-2.5 h-2.5" />
                            Propina QR: {formatCurrency(Number(s.propina_monto_sugerida) || 0)}
                            {Number(s.propina_porcentaje_sugerido) > 0 && ` (${s.propina_porcentaje_sugerido}%)`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {!yaAtendida && (
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                      onClick={() => accion(s, 'atender')}>
                      Atender
                    </Button>
                  )}
                  <Button size="sm" className="h-7 text-xs flex-1"
                    onClick={() => accion(s, 'resolver')}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Resuelto
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertasMeseroDialog open={showAlertas} onClose={() => setShowAlertas(false)} />
    </div>
  );
}
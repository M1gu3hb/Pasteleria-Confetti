import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Bell, Receipt, HelpCircle, CheckCircle2, UserCheck, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
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
 * Cards persistentes de solicitudes QR para mostrar debajo del mapa de mesas
 * en la vista Mesero. Versión compacta del panel de Solicitudes.
 *
 * - Filtra según rol/asignación (igual que el panel principal).
 * - Solo muestra pendiente/atendida (no resueltas/canceladas).
 * - "Atender" → estado atendida (y asigna atendido_por en la mesa si no hay).
 * - "Resolver" → estado resuelta (desaparece de la lista activa).
 */
export default function SolicitudesQRCardList() {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();

  const { data: solicitudesRaw = [] } = useQuery({
    queryKey: ['solicitudes_qr_mesero'],
    queryFn: () => base44.entities.SolicitudQR.list('-created_date', 100),
    initialData: [],
    refetchInterval: 5000,
    enabled: config?.portal_qr_activo === true,
  });

  const activas = useMemo(() => {
    const arr = filtrarSolicitudesParaUsuario(solicitudesRaw, posUser, config);
    return (Array.isArray(arr) ? arr : [])
      .filter(s => s?.estado === 'pendiente' || s?.estado === 'atendida');
  }, [solicitudesRaw, posUser, config]);

  const asign = asignacionActiva(config);

  if (config?.portal_qr_activo !== true) return null;
  if (activas.length === 0) return null;

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
      console.error('[SolicitudesQRCardList] accion:', err);
      toast.error('No se pudo actualizar');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
        <Bell className="w-4 h-4 text-amber-600" />
        SOLICITUDES ACTIVAS ({activas.length})
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {activas.map(s => {
          const Icon = TIPO_ICON[s.tipo] || Bell;
          const colorClass = TIPO_COLOR[s.tipo] || 'bg-slate-100 text-slate-700 border-slate-300';
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
              className={`rounded-xl border-2 p-2.5 bg-white ${yaAtendida ? 'border-emerald-300 bg-emerald-50/40' : propia ? 'border-primary' : 'border-amber-300'}`}
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-start gap-2">
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-sm leading-tight">
                    Mesa {s.mesa_numero || '—'} {TIPO_SOLICITUD_VERBO[s.tipo] || ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {time}
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full font-bold uppercase ${yaAtendida ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {yaAtendida ? 'Atendida' : 'Pendiente'}
                    </span>
                  </p>
                  {asign && s.mesero_destino_nombre && (
                    <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> Para: {s.mesero_destino_nombre}
                    </p>
                  )}
                  {sinAsignar && (
                    <p className="text-[10px] text-amber-700 mt-0.5">⚠ Mesa sin mesero asignado</p>
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
    </div>
  );
}
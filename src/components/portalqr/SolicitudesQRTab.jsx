import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Bell, Receipt, HelpCircle, CheckCircle2, Clock, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';
import { cleanupOldSolicitudes } from '@/lib/asignacionMesas';
import { useConfig } from '@/lib/ConfigContext';

const ESTADOS_LABEL = {
  pendiente: 'Pendiente',
  atendida: 'Atendida',
  resuelta: 'Resuelta',
  cancelada: 'Cancelada',
};

const TIPO_ICON = {
  ordenar: Bell,
  cuenta: Receipt,
  ayuda: HelpCircle,
};

const TIPO_COLOR = {
  ordenar: 'bg-amber-100 text-amber-800 border-amber-200',
  cuenta: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ayuda: 'bg-rose-100 text-rose-800 border-rose-200',
};

/**
 * Pestaña "Solicitudes" del Portal QR (vista admin) — historial completo.
 */
export default function SolicitudesQRTab({ posUser }) {
  const queryClient = useQueryClient();
  const { config } = useConfig();
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [limpiando, setLimpiando] = useState(false);

  const limpiarAntiguas = async () => {
    if (limpiando) return;
    if (!confirm('Esto borrará las solicitudes QR de días anteriores. ¿Continuar?\n\n(No se tocan ventas, mesas, pedidos ni cortes.)')) return;
    setLimpiando(true);
    try {
      const r = await cleanupOldSolicitudes(base44, config);
      toast.success(`Solicitudes antiguas borradas: ${r?.borradas || 0}`);
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_admin'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero'] });
    } catch (err) {
      toast.error('No se pudo limpiar: ' + (err?.message || ''));
    } finally {
      setLimpiando(false);
    }
  };

  const vaciarDia = async () => {
    if (limpiando) return;
    if (!confirm('⚠ Esto BORRARÁ TODAS las solicitudes QR (incluso las de hoy). ¿Continuar?\n\n(No se tocan ventas, mesas, pedidos ni cortes.)')) return;
    setLimpiando(true);
    try {
      const todas = await base44.entities.SolicitudQR.list('-created_date', 500).catch(() => []);
      let borradas = 0;
      for (const s of (todas || [])) {
        try { await base44.entities.SolicitudQR.delete(s.id); borradas++; } catch {}
      }
      toast.success(`Solicitudes borradas: ${borradas}`);
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_admin'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero'] });
    } catch (err) {
      toast.error('No se pudo vaciar: ' + (err?.message || ''));
    } finally {
      setLimpiando(false);
    }
  };

  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes_qr_admin'],
    queryFn: () => base44.entities.SolicitudQR.list('-created_date', 300),
    initialData: [],
    refetchInterval: 5000,
  });

  const filtradas = useMemo(() => {
    const arr = Array.isArray(solicitudes) ? solicitudes : [];
    if (filtroEstado === 'todas') return arr;
    if (filtroEstado === 'activas') return arr.filter(s => s?.estado === 'pendiente' || s?.estado === 'atendida');
    return arr.filter(s => s?.estado === filtroEstado);
  }, [solicitudes, filtroEstado]);

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
      } else if (accionTipo === 'resolver') {
        await base44.entities.SolicitudQR.update(s.id, {
          estado: 'resuelta',
          fecha_resuelta: ahora,
          atendido_por_id: s.atendido_por_id || posUser?.id,
          atendido_por_nombre: s.atendido_por_nombre || posUser?.nombre,
        });
      } else if (accionTipo === 'cancelar') {
        if (!confirm('¿Cancelar esta solicitud?')) return;
        await base44.entities.SolicitudQR.update(s.id, { estado: 'cancelada' });
      }
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_admin'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero'] });
      toast.success('Solicitud actualizada');
    } catch (err) {
      console.error('[SolicitudesQRTab] accion:', err);
      toast.error('No se pudo actualizar');
    }
  };

  const contar = (e) => (solicitudes || []).filter(s => s?.estado === e).length;

  const filtros = [
    { key: 'activas', label: `Activas (${contar('pendiente') + contar('atendida')})` },
    { key: 'pendiente', label: `Pendientes (${contar('pendiente')})` },
    { key: 'atendida', label: `Atendidas (${contar('atendida')})` },
    { key: 'resuelta', label: `Resueltas (${contar('resuelta')})` },
    { key: 'todas', label: 'Todas' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {filtros.map(f => (
            <button key={f.key} onClick={() => setFiltroEstado(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroEstado === f.key ? 'bg-primary text-white shadow-md' : 'bg-white border text-muted-foreground'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={limpiando} onClick={limpiarAntiguas} className="h-8 gap-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5" /> Limpiar antiguas
          </Button>
          <Button size="sm" variant="ghost" disabled={limpiando} onClick={vaciarDia} className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700">
            <Trash2 className="w-3.5 h-3.5" /> Vaciar todas
          </Button>
        </div>
      </div>

      {filtradas.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Sin solicitudes en este filtro.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtradas.map(s => {
          const Icon = TIPO_ICON[s.tipo] || Bell;
          const colorBadge = TIPO_COLOR[s.tipo] || 'bg-slate-100 text-slate-700 border-slate-200';
          const time = (() => {
            try { return s?.fecha_creacion ? formatDistanceToNow(new Date(s.fecha_creacion), { addSuffix: true, locale: es }) : '—'; }
            catch { return '—'; }
          })();
          const esActiva = s?.estado === 'pendiente' || s?.estado === 'atendida';
          return (
            <div key={s.id} className={`rounded-xl border-2 p-3 bg-white ${esActiva ? 'border-amber-300' : 'border-slate-200'}`}
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-start gap-2">
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${colorBadge}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-sm">
                    Mesa {s.mesa_numero || '—'} {TIPO_SOLICITUD_VERBO[s.tipo] || 'requiere atención'}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {time}
                  </p>
                  <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${esActiva ? 'bg-amber-100 text-amber-800' : s.estado === 'resuelta' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {ESTADOS_LABEL[s.estado] || s.estado}
                  </span>
                  {s.mesero_destino_nombre && (
                    <p className="text-[10px] text-primary mt-0.5">Para: {s.mesero_destino_nombre}</p>
                  )}
                  {!s.mesero_destino_id && s.ruteo_modo === 'general' && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Cola general</p>
                  )}
                  {s.atendido_por_nombre && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">Atendido por: {s.atendido_por_nombre}</p>
                  )}
                </div>
              </div>
              {esActiva && (
                <div className="flex gap-1.5 mt-2">
                  {s.estado === 'pendiente' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                      onClick={() => accion(s, 'atender')}>
                      Atender
                    </Button>
                  )}
                  <Button size="sm" className="h-7 text-xs flex-1"
                    onClick={() => accion(s, 'resolver')}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Resolver
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500"
                    onClick={() => accion(s, 'cancelar')}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
import React, { useState, useMemo, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTerminal } from '@/lib/TerminalContext';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { FileText, Eye, Calendar, DoorOpen, Scissors, Lock } from 'lucide-react';
import CorteViewerDialog from './CorteViewerDialog';

// Etiquetas + estilos por tipo de corte
const TIPO_CONFIG = {
  cierre_diario: { label: 'Cierre diario', cls: 'bg-red-100 text-red-700 border-red-200', Icon: Lock },
  turno: { label: 'Corte de turno', cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Scissors },
  apertura: { label: 'Apertura', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: DoorOpen },
};
function getTipoCorte(c) {
  // Compatibilidad: registros viejos sin tipo_corte se tratan como cierre_diario
  return c?.tipo_corte === 'turno' ? 'turno' : 'cierre_diario';
}

/**
 * Reusable list of cortes (used in Caja > Historial AND Dashboard).
 * Filtros opcionales por fecha. Botones Ver PDF / Ver resumen.
 */
export default function CorteHistorialList({ limit = 50, maxVisible = null, showFilter = true, compact = false, sucId: sucursalProp = undefined }) {
  const { sucursalEfectiva } = useTerminal();
  const sucId = sucursalProp === undefined ? sucursalEfectiva?.sucursal_id || null : sucursalProp;
  const [selected, setSelected] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { setSelected(null); }, [sucId]);
  const rangoInvalido = !!from && !!to && from > to;
  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['cortes_historial', sucId, from, to],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const filtro = { estado: { $in: ['cerrado', 'registrado'] } };
      if (sucId) filtro['sucursal_id'] = sucId;
      if (from || to) filtro['fecha_cierre'] = {
        ...(from ? { $gte: `${from}T00:00:00-06:00` } : {}),
        ...(to ? { $lte: `${to}T23:59:59.999-06:00` } : {}),
      };
      return base44.entities.CorteCaja.filter(filtro, '-fecha_cierre', Math.max(1, Math.min(limit, 100)), pageParam);
    },
    getNextPageParam: (ultima, paginas) => ultima.length ? paginas.reduce((n,p) => n+p.length, 0) : undefined,
    enabled: !rangoInvalido, staleTime: 5000,
  });
  const filtered = useMemo(() => {
    const seen = new Set();
    return (data?.pages || []).flat().filter(c => {
      if (!c?.id || seen.has(c.id) || (sucId && c.sucursal_id !== sucId)) return false;
      seen.add(c.id);
      return (getTipoCorte(c) === 'cierre_diario' && c.estado === 'cerrado') || (getTipoCorte(c) === 'turno' && c.estado === 'registrado');
    });
  }, [data, sucId]);
  const selectedVisible = selected && (!sucId || selected.sucursal_id === sucId) ? selected : null;

  return (
    <div className="space-y-3">
      {showFilter && (
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />Desde
            </label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }}>Limpiar</Button>
          )}
        </div>
      )}

      {rangoInvalido ? <p role="alert">La fecha inicial debe ser anterior a la final.</p> : isPending ? <p role="status">Cargando cortes…</p> : isError ? (
        <div role="alert"><p>No se pudieron cargar todos los cortes.</p><Button onClick={() => refetch()}>Reintentar cortes</Button></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-sm">Sin cortes en este rango</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const tipo = getTipoCorte(c);
            const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.cierre_diario;
            const Icon = cfg.Icon;
            const esCierreDiario = tipo === 'cierre_diario';
            return (
            <Card key={c.id} className="p-3 flex items-center gap-3 flex-wrap"
              style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 2px 4px rgba(0,0,0,0.05)' }}>
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-heading font-bold text-sm">{c.folio}</p>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.cls}`}>
                    <Icon className="w-3 h-3" /> {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.fecha_cierre ? format(new Date(c.fecha_cierre), "d MMM yyyy, HH:mm", { locale: es }) : ''}
                  {c.usuario_cajero_nombre ? ` · ${c.usuario_cajero_nombre}` : ''}
                  {!sucId && c.sucursal_nombre ? ` · ${c.sucursal_nombre}` : ''}
                </p>
              </div>
              {!compact && (
                <>
                  <Stat label="Efectivo" v={c.total_efectivo} />
                  <Stat label="Tarjeta" v={c.total_tarjeta} />
                  <Stat label="Transfer." v={c.total_transferencia} />
                </>
              )}
              <div className="text-right min-w-[100px]">
                <p className="font-heading font-black">{formatCurrency(c.total_general)}</p>
                <p className="text-xs text-muted-foreground">{c.numero_ventas || 0} tickets</p>
              </div>
              {esCierreDiario ? (
                <Button size="sm" variant="outline" onClick={() => setSelected(c)}>
                  <FileText className="w-4 h-4 mr-1" />Ver PDF
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>
                  <Eye className="w-4 h-4 mr-1" />Ver
                </Button>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {hasNextPage && !rangoInvalido && <div className="flex justify-center pt-2">
        <Button variant="outline" className="h-12 px-6 font-bold" disabled={isFetchingNextPage}
          onClick={() => { if (!isFetchingNextPage) void fetchNextPage(); }}>
          {isFetchingNextPage ? 'Cargando más cortes…' : 'Cargar más cortes de caja'}
        </Button>
      </div>}
      <CorteViewerDialog corte={selectedVisible} open={!!selectedVisible} onClose={() => setSelected(null)} />
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div className="text-center px-2">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-bold">{formatCurrency(v)}</p>
    </div>
  );
}
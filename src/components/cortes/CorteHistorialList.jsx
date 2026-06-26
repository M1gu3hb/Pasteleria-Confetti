import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
export default function CorteHistorialList({ limit = 50, maxVisible = null, showFilter = true, compact = false }) {
  // limit: cuánto trae de BD (para tener variedad si hay turnos vs cierres).
  // maxVisible: tope visual aplicado DESPUÉS del filtro (para Dashboard usar 7).
  const { data: cortes = [] } = useQuery({
    queryKey: ['cortes_historial'],
    queryFn: () => base44.entities.CorteCaja.list('-created_date', Math.max(limit, maxVisible || 0) || 50),
    initialData: [],
  });

  const [selected, setSelected] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Mostrar cierres diarios cerrados Y cortes de turno registrados
  const filtered = useMemo(() => {
    const safe = Array.isArray(cortes) ? cortes : [];
    return safe.filter(c => {
      if (!c) return false;
      const tipo = getTipoCorte(c);
      const esCierreFinal = tipo === 'cierre_diario' && c.estado === 'cerrado';
      const esTurno = tipo === 'turno' && c.estado === 'registrado';
      if (!esCierreFinal && !esTurno) return false;
      const t = c.fecha_cierre ? new Date(c.fecha_cierre).getTime() : 0;
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime() + 24 * 60 * 60 * 1000) return false;
      return true;
    });
  }, [cortes, from, to]);

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

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-sm">Sin cortes en este rango</p>
      ) : (
        <div className="space-y-2">
          {(maxVisible ? filtered.slice(0, maxVisible) : filtered).map(c => {
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

      <CorteViewerDialog corte={selected} open={!!selected} onClose={() => setSelected(null)} />
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
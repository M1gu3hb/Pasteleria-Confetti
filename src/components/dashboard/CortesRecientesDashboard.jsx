import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';
import { Card } from '@/components/ui/card';
import { Lock, Scissors, Store } from 'lucide-react';

/**
 * Lista de cortes de caja recientes para el Dashboard.
 * Filtra por sucursal efectiva (sucId). Si sucId es null → todas las sucursales
 * y muestra el badge de sucursal de cada corte.
 *
 * Solo lectura. No toca cálculos de CorteCaja. queryKey incluye sucId para
 * refrescar al cambiar de sucursal sin caché contaminada.
 */
const TIPO_CFG = {
  cierre_diario: { label: 'Cierre diario', cls: 'bg-red-100 text-red-700 border-red-200', Icon: Lock },
  turno: { label: 'Corte de turno', cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Scissors },
};

export default function CortesRecientesDashboard({ sucId = null, mostrarSucursal = false }) {
  const { data: cortesRaw } = useQuery({
    queryKey: ['dashboard_cortes', sucId],
    queryFn: () => {
      const filtro = sucId ? { sucursal_id: sucId } : {};
      return base44.entities.CorteCaja.filter(filtro, '-created_date', 30);
    },
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const cortes = useMemo(() => {
    const safe = Array.isArray(cortesRaw) ? cortesRaw : [];
    // Solo cierres diarios cerrados y cortes de turno registrados.
    return safe
      .filter((c) => {
        if (!c) return false;
        const esTurno = c.tipo_corte === 'turno';
        if (esTurno) return c.estado === 'registrado';
        return c.estado === 'cerrado';
      })
      .slice(0, 6);
  }, [cortesRaw]);

  if (cortes.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">Sin cortes recientes</p>;
  }

  return (
    <div className="space-y-2">
      {cortes.map((c) => {
        const tipo = c.tipo_corte === 'turno' ? 'turno' : 'cierre_diario';
        const cfg = TIPO_CFG[tipo];
        const Icon = cfg.Icon;
        return (
          <Card key={c.id} className="p-3 flex items-center gap-3 flex-wrap"
            style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 2px 4px rgba(0,0,0,0.05)' }}>
            <div className="flex-1 min-w-[180px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-heading font-bold text-sm">{c.folio}</p>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.cls}`}>
                  <Icon className="w-3 h-3" /> {cfg.label}
                </span>
                {mostrarSucursal && c.sucursal_nombre && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold bg-muted/60 text-muted-foreground border-border">
                    <Store className="w-3 h-3" /> {c.sucursal_nombre}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {c.fecha_cierre ? format(new Date(c.fecha_cierre), "d MMM yyyy, HH:mm", { locale: es }) : ''}
                {c.usuario_cajero_nombre ? ` · ${c.usuario_cajero_nombre}` : ''}
              </p>
            </div>
            <div className="text-right min-w-[100px]">
              <p className="font-heading font-black">{formatCurrency(c.total_general)}</p>
              <p className="text-xs text-muted-foreground">{c.numero_ventas || 0} tickets</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Users, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * Mobile-friendly editable list of tables for Configuración.
 * Allows reordering and editing without a giant canvas.
 */
export default function MesaListMobile({ mesas, onEdit, onReorder }) {
  const sorted = [...mesas].sort((a, b) =>
    (a.orden || 0) - (b.orden || 0) || (a.numero || 0) - (b.numero || 0)
  );

  const move = (idx, dir) => {
    const arr = [...sorted];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    arr.forEach((m, i) => onReorder(m.id, i));
  };

  if (mesas.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No hay mesas configuradas</p>
        <p className="text-xs mt-1">Toca "Nueva mesa" para empezar</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((m, idx) => (
        <Card key={m.id} className="p-3 flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6"
              onClick={() => move(idx, -1)} disabled={idx === 0}>
              <ChevronUp className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6"
              onClick={() => move(idx, 1)} disabled={idx === sorted.length - 1}>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-heading font-black text-lg shrink-0"
            style={{ background: 'linear-gradient(135deg, #f4ead5, #e8dcc0)', border: '2px solid #c9b68a' }}>
            {m.numero}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{m.nombre || `Mesa ${m.numero}`}</p>
            <p className="text-[11px] text-muted-foreground">
              {m.zona || 'Interior'} · <span className="capitalize">{m.forma}</span> · <span className="capitalize">{m.tamano}</span>
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Users className="w-3 h-3" />{m.capacidad}
            </p>
            {m.mesero_asignado_nombre && (
              <span
                className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                style={{ background: m.mesero_asignado_color || '#0f172a' }}
                title={`Mesero: ${m.mesero_asignado_nombre}`}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-white/80" />
                {m.mesero_asignado_nombre}
              </span>
            )}
          </div>
          <Button size="icon" variant="ghost" onClick={() => onEdit(m)}>
            <Pencil className="w-4 h-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
}
import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Estado de carga visible.
 * Se muestra mientras una query está en su PRIMER fetch (isLoading/isPending)
 * para evitar pintar empty states falsos.
 *
 * Uso:
 *   if (isLoading) return <LoadingState label="Cargando productos..." />;
 *   if (filtered.length === 0) return <EmptyState ... />;
 */
export default function LoadingState({ label = 'Cargando…', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Inline pequeño "Actualizando…" para mostrar durante un refetch sin perder los datos previos. */
export function RefreshingBadge({ label = 'Actualizando…' }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Loader2 className="w-3 h-3 animate-spin" /> {label}
    </span>
  );
}
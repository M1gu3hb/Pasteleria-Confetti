import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTerminal } from '@/lib/TerminalContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Store, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * CambiarSucursalDialog — Fase 2A.fix
 * Maneja DOS acciones distintas según la prop `modo`:
 *
 *  - modo="terminal" (ACCIÓN A): reconfigura el dispositivo físico a otra
 *    sucursal → escribe localStorage y recarga la página.
 *    Requiere PIN de dueño (el guard vive en el componente que lo invoca).
 *
 *  - modo="ver" (ACCIÓN B): el dueño elige qué sucursal está VIENDO.
 *    Solo actualiza estado en memoria. NO toca localStorage, NO recarga,
 *    NO saca del modo dueño.
 *
 * Ambos modos cargan sucursales activas con estado de carga antes de
 * renderizar la lista.
 */
export default function CambiarSucursalDialog({ open, onOpenChange, modo = 'terminal' }) {
  const { terminal, sucursalActivaAdmin, cambiarTerminalFisica, verSucursalAdmin } = useTerminal();
  const [sucursales, setSucursales] = useState([]);
  const [cargando, setCargando] = useState(true);

  const esVer = modo === 'ver';

  const cargar = async () => {
    setCargando(true);
    try {
      const list = await base44.entities.Sucursal.filter({ activa: true });
      const arr = Array.isArray(list) ? list : [];
      arr.sort((a, b) => (Number(a?.orden_visual) || 0) - (Number(b?.orden_visual) || 0));
      setSucursales(arr);
    } catch (err) {
      console.error('[CambiarSucursalDialog] cargar:', err);
      toast.error('No se pudieron cargar las sucursales');
      setSucursales([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCargando(true);
      setSucursales([]);
      cargar();
    }
  }, [open]);

  // Sucursal marcada como "actual" según el modo.
  const sucursalActualId = esVer
    ? (sucursalActivaAdmin?.sucursal_id || terminal?.sucursal_id)
    : terminal?.sucursal_id;

  const seleccionar = (suc) => {
    if (!suc?.id) return;
    try {
      if (esVer) {
        // ACCIÓN B — solo memoria, sin reload.
        verSucursalAdmin(suc);
        toast.success(`Viendo sucursal: ${suc.nombre}`);
        onOpenChange(false);
        return;
      }
      // ACCIÓN A — terminal física, escribe localStorage + reload.
      const ok = cambiarTerminalFisica(suc);
      if (ok) {
        toast.success(`Terminal cambiada: ${suc.nombre}`);
        onOpenChange(false);
        setTimeout(() => window.location.reload(), 300);
      } else {
        toast.error('No se pudo cambiar la sucursal');
      }
    } catch (err) {
      console.error('[CambiarSucursalDialog] seleccionar:', err);
      toast.error('No se pudo cambiar la sucursal');
    }
  };

  const titulo = esVer ? 'Ver datos de otra sucursal' : 'Cambiar sucursal de esta terminal';
  const subtitulo = esVer
    ? 'Consulta otra sucursal sin cambiar la configuración del dispositivo.'
    : 'Reconfigura este dispositivo a otra sucursal. La sesión se reiniciará.';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">{titulo}</DialogTitle>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Cargando…</span>
          </div>
        ) : sucursales.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay sucursales activas.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Fase 6 — Vista general (solo modo 'ver' del dueño): pone
                sucursalActivaAdmin en null → modo global. */}
            {esVer && (
              <button
                type="button"
                onClick={() => {
                  verSucursalAdmin(null);
                  toast.success('Vista general activada');
                  onOpenChange(false);
                }}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all active:scale-[0.99] ${
                  !sucursalActivaAdmin ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-lg">🌐</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">Vista general</p>
                  <p className="text-[11px] text-muted-foreground">Suma de todas las sucursales</p>
                </div>
                {!sucursalActivaAdmin && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
              </button>
            )}
            {sucursales.map((suc) => {
              const activa = sucursalActualId === suc.id;
              return (
                <button
                  key={suc.id}
                  type="button"
                  onClick={() => seleccionar(suc)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all active:scale-[0.99] ${
                    activa ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'
                  }`}
                  style={{ touchAction: 'manipulation' }}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{suc.nombre}</p>
                    {activa && (
                      <p className="text-[11px] text-primary font-medium">
                        {esVer ? 'Viendo ahora' : 'Sucursal actual'}
                      </p>
                    )}
                  </div>
                  {activa && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
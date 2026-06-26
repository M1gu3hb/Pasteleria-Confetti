import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Delete, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ModalPinAdmin — Fase 2A.fix
 * Pide PIN y lo valida contra UsuarioPOS con rol "dueño" o "administrador".
 * NO persiste sesión: si valida, llama onSuccess(user) con el rol detectado
 * normalizado en user.adminRole ('dueno' | 'administrador') y se cierra.
 *
 * Props:
 *  - soloDueno: si true, solo acepta PIN de dueño; un administrador recibe
 *    un error explicativo (usado en el flujo "Soy dueño").
 *  - title / subtitle: textos opcionales del encabezado.
 */
const ROLES_ADMIN = ['dueño', 'administrador'];

export default function ModalPinAdmin({
  open,
  onOpenChange,
  onSuccess,
  soloDueno = false,
  title = 'Modo administrador',
  subtitle = 'Ingresa el PIN de administrador',
}) {
  const [pin, setPin] = useState('');
  const [validando, setValidando] = useState(false);

  // Limpiar PIN cada vez que se abre
  useEffect(() => {
    if (open) setPin('');
  }, [open]);

  const validar = async (pinToCheck) => {
    if (validando) return;
    setValidando(true);
    try {
      // Traer usuarios activos con rol admin (dueño o administrador) y
      // buscar por PIN en memoria (filtro por rol exacto no admite OR).
      // Reintento corto: un usuario recién creado puede no aparecer en la
      // primera lectura por consistencia eventual. Si no se encuentra, se
      // reintenta una vez tras una breve espera (cubre el "PIN no disponible
      // hasta re-guardar" sin tocar la lógica de creación).
      const buscarUsuario = async () => {
        const users = await base44.entities.UsuarioPOS.filter({ activo: true });
        const arr = Array.isArray(users) ? users : [];
        return arr.find(
          (u) => u?.pin === pinToCheck && ROLES_ADMIN.includes(u?.rol)
        );
      };

      let found = await buscarUsuario();
      if (!found) {
        await new Promise((r) => setTimeout(r, 600));
        found = await buscarUsuario();
      }

      if (!found) {
        toast.error('PIN incorrecto');
        setPin('');
        return;
      }

      const esDueno = found.rol === 'dueño';

      // Flujo "Soy dueño": rechazar administradores con mensaje claro.
      if (soloDueno && !esDueno) {
        toast.error('Esta opción es solo para el dueño.');
        setPin('');
        return;
      }

      const adminRole = esDueno ? 'dueno' : 'administrador';
      toast.success(`Acceso ${esDueno ? 'dueño' : 'administrador'}: ${found.nombre}`);
      if (typeof onSuccess === 'function') onSuccess({ ...found, adminRole });
      onOpenChange(false);
    } catch (err) {
      console.error('[ModalPinAdmin] validar:', err);
      toast.error('No se pudo validar el PIN. Intenta de nuevo.');
      setPin('');
    } finally {
      setValidando(false);
    }
  };

  // Auto-validar al completar 4 dígitos
  useEffect(() => {
    if (open && pin.length === 4) validar(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, open]);

  const handleKey = (key) => {
    if (validando) return;
    setPin((p) => (p.length < 4 ? p + key : p));
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-4 text-center">
            {subtitle}
          </p>

          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  i < pin.length ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
            {keys.map((key, idx) =>
              key === '' ? (
                <div key={idx} />
              ) : key === '⌫' ? (
                <button
                  key={idx}
                  onClick={() => setPin((p) => p.slice(0, -1))}
                  disabled={validando}
                  className="h-14 rounded-xl bg-muted hover:bg-muted/70 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
                  style={{ touchAction: 'manipulation' }}
                >
                  <Delete className="w-5 h-5" />
                </button>
              ) : (
                <button
                  key={idx}
                  onClick={() => handleKey(key)}
                  disabled={validando}
                  className="h-14 rounded-xl bg-card border-2 border-border hover:border-primary text-xl font-heading font-bold active:scale-95 transition-transform disabled:opacity-50"
                  style={{ touchAction: 'manipulation' }}
                >
                  {key}
                </button>
              )
            )}
          </div>

          {validando && (
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              <span>Validando…</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
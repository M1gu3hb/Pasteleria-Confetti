import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Users, Loader2, AlertTriangle, PartyPopper } from 'lucide-react';

/**
 * Modal para que el comensal abra una mesa libre desde el Portal QR.
 * Captura número de personas, nombre opcional y notas opcionales.
 * No toca lógica de venta — eso lo hace abrirMesaDesdeQR() en utils.
 */
export default function AbrirMesaQRDialog({ mesa, loading, onClose, onConfirm }) {
  const [personas, setPersonas] = useState('2');
  const [clienteNombre, setClienteNombre] = useState('');
  const [notas, setNotas] = useState('');
  // 6A: alergias / indicaciones críticas + celebración (todo opcional)
  const [notasAlergias, setNotasAlergias] = useState('');
  const [celebracion, setCelebracion] = useState(false);
  const [tipoCelebracion, setTipoCelebracion] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [personas]);

  const capacidad = Number(mesa?.capacidad) || 0;

  const validar = () => {
    const n = parseInt(personas, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError('Indica al menos 1 persona.');
      return false;
    }
    if (n > 30) {
      setError('Máximo 30 personas.');
      return false;
    }
    if (capacidad > 0 && n > capacidad) {
      setError(`La capacidad de esta mesa es ${capacidad} personas.`);
      return false;
    }
    return true;
  };

  const submit = () => {
    if (loading) return;
    if (!validar()) return;
    onConfirm?.({
      personas: parseInt(personas, 10),
      cliente_nombre: clienteNombre.trim(),
      notas: notas.trim(),
      notas_alergias: notasAlergias.trim(),
      celebracion_especial: !!celebracion,
      tipo_celebracion: celebracion ? tipoCelebracion.trim() : '',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
    >
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        className="bg-card text-card-foreground w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary shrink-0" />
          <p className="flex-1 font-heading font-bold">
            Abrir Mesa {mesa?.numero ?? '—'}
            {mesa?.nombre ? ` · ${mesa.nombre}` : ''}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Para comenzar tu pedido, dinos cuántas personas son.
            {mesa?.mesero_asignado_nombre && (
              <span className="block mt-1">
                Tu mesero será <strong>{mesa.mesero_asignado_nombre}</strong>.
              </span>
            )}
          </p>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Personas *
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="30"
              value={personas}
              onChange={(e) => setPersonas(e.target.value)}
              className="w-full h-14 text-center text-2xl font-black border rounded-xl bg-card mt-1"
              autoFocus
            />
            {capacidad > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Capacidad de esta mesa: {capacidad} personas.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tu nombre <span className="opacity-60 normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value.slice(0, 60))}
              placeholder="Solo referencia, no se guarda como cliente"
              className="w-full h-11 px-3 border rounded-xl bg-card mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Alergias / indicaciones <span className="opacity-60 normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              value={notasAlergias}
              onChange={(e) => setNotasAlergias(e.target.value.slice(0, 200))}
              placeholder="Ej. alergia a nueces, sin gluten…"
              className="w-full h-11 px-3 border rounded-xl bg-card mt-1 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Visible para mesero y cocina. No reemplaza atención médica.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={celebracion}
                onChange={(e) => setCelebracion(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium flex items-center gap-1.5">
                <PartyPopper className="w-4 h-4 text-pink-500" />
                ¿Es una celebración especial?
              </span>
            </label>
            {celebracion && (
              <input
                type="text"
                value={tipoCelebracion}
                onChange={(e) => setTipoCelebracion(e.target.value.slice(0, 60))}
                placeholder="Cumpleaños, aniversario…"
                className="w-full h-10 px-3 border rounded-lg bg-card text-sm"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notas <span className="opacity-60 normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value.slice(0, 120))}
              placeholder="Otras indicaciones…"
              className="w-full h-11 px-3 border rounded-xl bg-card mt-1 text-sm"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-12 rounded-xl border font-semibold disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 active:scale-95 transition-transform inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Abriendo…' : 'Abrir mesa'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
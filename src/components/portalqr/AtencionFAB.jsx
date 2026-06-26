import React, { useState } from 'react';
import { Bell, Receipt, HelpCircle, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TIPO_SOLICITUD_LABEL } from '@/utils/qrUtils';

const ICONS = {
  ordenar: Bell,
  cuenta: Receipt,
  ayuda: HelpCircle,
};

const COLORS = {
  ordenar: 'bg-amber-500',
  cuenta: 'bg-emerald-600',
  ayuda: 'bg-rose-600',
};

/**
 * Botón flotante "Atención" para la vista del cliente (portal QR).
 *
 * Props:
 * - tiposHabilitados: array de tipos disponibles.
 * - onPedir: callback con el tipo.
 * - disabled: bloquea taps.
 * - bloqueado: si true, muestra el FAB pero al tocar abre un aviso (no permite enviar).
 * - mensajeBloqueado: texto a mostrar cuando bloqueado.
 */
export default function AtencionFAB({
  tiposHabilitados = [],
  onPedir,
  disabled = false,
  bloqueado = false,
  mensajeBloqueado = 'No es posible solicitar atención en este momento.',
}) {
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  if (tiposHabilitados.length === 0) return null;

  const pedir = (tipo) => {
    setOpen(false);
    if (typeof onPedir === 'function') onPedir(tipo);
  };

  const onFabClick = () => {
    if (bloqueado) {
      setOpen(false);
      setShowInfo(true);
      return;
    }
    setOpen(o => !o);
  };

  return (
    <>
      {/* Aviso cuando está bloqueado */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-heading font-bold text-base">Solicitud no disponible</p>
                  <p className="text-sm text-slate-600 mt-1">{mensajeBloqueado}</p>
                </div>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="mt-4 w-full bg-slate-900 text-white rounded-xl py-3 font-semibold"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && !bloqueado && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {open && !bloqueado && tiposHabilitados.map((tipo, i) => {
            const Icon = ICONS[tipo] || Bell;
            return (
              <motion.button
                key={tipo}
                initial={{ opacity: 0, x: 30, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: 1, transition: { delay: i * 0.04 } }}
                exit={{ opacity: 0, x: 30, scale: 0.85 }}
                onClick={() => pedir(tipo)}
                disabled={disabled}
                className={`flex items-center gap-3 pl-4 pr-5 h-14 rounded-full text-white shadow-2xl font-bold text-base ${COLORS[tipo]} active:scale-95 transition-transform disabled:opacity-50`}
                style={{ touchAction: 'manipulation' }}
              >
                <Icon className="w-6 h-6 shrink-0" />
                <span>{TIPO_SOLICITUD_LABEL[tipo] || tipo}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onFabClick}
          disabled={disabled}
          className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center disabled:opacity-50 ${
            bloqueado ? 'bg-slate-400 text-white' : 'bg-slate-900 text-white'
          }`}
          style={{ touchAction: 'manipulation', boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}
          aria-label={bloqueado ? 'Atención no disponible' : (open ? 'Cerrar' : 'Atención')}
        >
          {bloqueado ? <AlertCircle className="w-7 h-7" /> : (open ? <X className="w-7 h-7" /> : <Bell className="w-7 h-7" />)}
        </motion.button>
        {!open && (
          <span className={`text-[11px] font-semibold backdrop-blur px-2 py-0.5 rounded-full shadow ${
            bloqueado ? 'bg-amber-100/95 text-amber-800' : 'bg-white/90 text-slate-700'
          }`}>
            {bloqueado ? 'No disponible' : 'Atención'}
          </span>
        )}
      </div>
    </>
  );
}
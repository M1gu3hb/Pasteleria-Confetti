import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Sparkles, ArrowRight, X } from 'lucide-react';

/**
 * Card de "Primeros pasos" — guía visual para clientes nuevos.
 *
 * Recibe:
 *  - progreso: objeto con flags booleanos
 *      { negocio, usuarios, mesas, categorias, unidades, inventario, recetas, caja }
 *  - ready: boolean (opcional) — true cuando los queries del Dashboard ya
 *           terminaron su primer fetch. Si es false, NO renderiza nada para
 *           evitar el flash de "pendiente → completado" del primer paint.
 *
 * Reglas:
 *  - Informativa, no bloquea ningún flujo.
 *  - Persistencia:
 *      · DISMISSED_KEY: 1  → el admin cerró con X. No reaparece nunca más.
 *      · COMPLETED_KEY: 1  → los 8 pasos estuvieron en true alguna vez.
 *        No reaparece aunque luego una verificación devuelva incompletos
 *        por estados intermedios.
 *  - Lectura síncrona de localStorage en el initializer de useState para
 *    que el primer render ya sepa la decisión correcta (sin flash).
 *  - NO crea datos, NO toca lógica financiera ni operativa.
 */
const DISMISSED_KEY = 'mh_primeros_pasos_dismissed';
const COMPLETED_KEY = 'mh_primeros_pasos_completed';

const PASOS = [
  { key: 'negocio',    label: 'Configura los datos del negocio',           to: '/configuracion' },
  { key: 'usuarios',   label: 'Crea usuarios y NIPs',                       to: '/configuracion' },
  { key: 'mesas',      label: 'Configura las mesas (si usas mesas)',        to: '/configuracion' },
  { key: 'categorias', label: 'Crea categorías de productos',               to: '/configuracion' },
  { key: 'unidades',   label: 'Revisa las unidades de medida',              to: '/configuracion' },
  { key: 'inventario', label: 'Registra tu inventario existente',           to: '/inventario'    },
  { key: 'recetas',    label: 'Crea recetas o productos',                   to: '/recetas'       },
  { key: 'caja',       label: 'Abre caja y empieza a operar',               to: '/caja'          },
];

const readFlag = (key) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};

/**
 * HOTFIX persistencia — verifica el flag en VARIOS storages para reforzar:
 *  1. localStorage (principal)
 *  2. sessionStorage (fallback si localStorage está bloqueado en navegación privada)
 * Si CUALQUIERA dice "cerrado", consideramos cerrado.
 */
const readDismissedRobust = () => {
  try {
    if (localStorage.getItem(DISMISSED_KEY) === '1') return true;
  } catch {}
  try {
    if (sessionStorage.getItem(DISMISSED_KEY) === '1') return true;
  } catch {}
  return false;
};

const writeDismissedRobust = () => {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
  try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch {}
};

export default function PrimerosPasosCard({ progreso, ready = true }) {
  // Lectura síncrona en el primer render: evita flash.
  // Usamos lectura ROBUSTA (local + session) para que el cierre persista
  // incluso si una de las storages se limpió por algún motivo.
  const [dismissed, setDismissed] = useState(() => readDismissedRobust());
  const [completedPersisted, setCompletedPersisted] = useState(() => readFlag(COMPLETED_KEY));

  // Re-verificar en cada montaje (cambio de ruta puede remontar el componente):
  // si el usuario cerró en una sesión, sigue cerrado al volver.
  useEffect(() => {
    if (readDismissedRobust() && !dismissed) {
      setDismissed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si las flags ya están en true desde localStorage, ni siquiera evaluamos
  // el progreso real. Esto bloquea cualquier reactivación automática.
  const safeProgreso = useMemo(() => (
    progreso && typeof progreso === 'object' ? progreso : {}
  ), [progreso]);

  const completados = useMemo(() => (
    PASOS.filter(p => !!safeProgreso[p.key]).length
  ), [safeProgreso]);
  const total = PASOS.length;
  const todoListo = completados >= total;

  // Si los 8 pasos están completos (basados en datos reales y ready=true),
  // grabamos COMPLETED_KEY para que no reaparezca jamás aunque un refetch
  // intermedio diga lo contrario.
  useEffect(() => {
    if (!ready) return;
    if (todoListo && !completedPersisted) {
      try { localStorage.setItem(COMPLETED_KEY, '1'); } catch {}
      setCompletedPersisted(true);
    }
  }, [ready, todoListo, completedPersisted]);

  // Reglas para NO mostrar:
  // 1. El admin cerró con X.
  // 2. Los 8 pasos ya se marcaron como completados (persistido).
  // 3. El Dashboard aún no terminó el primer fetch (ready=false) — evita flash.
  // 4. El cálculo actual indica que todo está listo.
  if (dismissed) return null;
  if (completedPersisted) return null;
  if (!ready) return null;
  if (todoListo) return null;

  const cerrar = () => {
    // Escritura ROBUSTA: localStorage + sessionStorage.
    // Si una falla por modo privado/cuota, la otra cubre.
    writeDismissedRobust();
    setDismissed(true);
  };

  const pct = Math.round((completados / total) * 100);

  return (
    <Card className="premium-sheen p-5 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-heading font-bold text-base">
                Primeros pasos para configurar tu restaurante
              </h3>
              <p className="text-xs text-muted-foreground">
                {completados} de {total} pasos completados · {pct}%
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
              onClick={cerrar} title="Ocultar esta guía">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Barra de progreso */}
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>

          {/* Lista de pasos */}
          <ol className="mt-3 space-y-1.5">
            {PASOS.map((p, idx) => {
              const ok = !!safeProgreso[p.key];
              return (
                <li key={p.key}>
                  <Link
                    to={p.to}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      ok
                        ? 'text-muted-foreground line-through'
                        : 'hover:bg-primary/5 text-foreground'
                    }`}
                  >
                    {ok
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className="flex-1">
                      <span className="font-medium mr-1">{idx + 1}.</span>
                      {p.label}
                    </span>
                    {!ok && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Card>
  );
}
import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLES } from '@/lib/constants';
import { playNewOrder } from '@/lib/sounds';
import { speak, frasePorSolicitud, getAlertConfig } from '@/lib/voiceAlert';
import { TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';
import { toast } from 'sonner';
import { vibrate } from '@/lib/vibrate';
import {
  debeEscucharAudio,
  debeUsarNombreEnVoz,
  filtrarSolicitudesParaUsuario,
  cleanupOldSolicitudes,
} from '@/lib/asignacionMesas';

/**
 * Watcher global de solicitudes QR.
 *
 * Reglas de notificación:
 * - Solo activo en Restaurante Pro + portal activo + rol mesero/admin.
 * - El ADMIN puede ver el toast siempre, pero NO escucha audio/voz si
 *   silenciar_notificaciones_admin = true (default).
 * - El MESERO con asignación activa solo recibe sus solicitudes (mesero_destino_id == él
 *   o solicitudes sin asignar).
 * - El MESERO sin asignación recibe toda la cola general.
 * - La voz usa el NOMBRE del mesero solo si la asignación está activa y la
 *   solicitud tiene destino claro; si no, frase genérica.
 * - Notifica únicamente eventos nuevos (no spam tras refresh).
 */
const NOTIFIED_KEY = 'mh_notified_solicitudes_qr';

const loadSet = () => {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
};
const saveSet = (set) => {
  try { sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-200))); } catch {}
};

export default function SolicitudesQRWatcher() {
  const { posUser } = usePOSAuth();
  const { paquete_modo, config } = useConfig();
  const role = posUser?.rol;

  const isPro = paquete_modo === 'restaurante_pro';
  const portalActivo = config?.portal_qr_activo === true;
  const watch = isPro && portalActivo && (role === ROLES.WAITER || role === ROLES.ADMIN);

  const firstLoadRef = useRef(true);
  const notifiedRef = useRef(loadSet());
  const cleanupDoneRef = useRef(false);

  // Limpieza diaria: una sola vez por sesión, al primer mount habilitado.
  useEffect(() => {
    if (!watch || cleanupDoneRef.current) return;
    cleanupDoneRef.current = true;
    // Ejecutar sin bloquear render.
    cleanupOldSolicitudes(base44, config).catch(() => {});
  }, [watch, config]);

  // HOTFIX PASO 3 — refetchInterval reducido a 3s para detección rápida en móvil.
  // Antes con 5s + red lenta el toast tardaba hasta 7-8s en aparecer y el
  // mesero pensaba que "no le llegó la solicitud". refetchIntervalInBackground
  // mantiene el polling incluso si el tab pierde foco (común en móvil cuando
  // el mesero está en otra pantalla y vuelve).
  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes_qr_watcher'],
    queryFn: () => base44.entities.SolicitudQR.filter({ estado: 'pendiente' }),
    initialData: [],
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    enabled: watch,
  });

  useEffect(() => {
    if (!watch) return;
    const todas = Array.isArray(solicitudes) ? solicitudes : [];
    // Filtramos según rol/asignación: el watcher debe notificar solo lo que le toca.
    const pendientes = filtrarSolicitudesParaUsuario(todas, posUser, config);

    if (firstLoadRef.current) {
      // HOTFIX PASO 3 — Al entrar a la pantalla:
      // Solo silenciamos las que ya estaban marcadas como vistas en una
      // sesión anterior (notifiedRef ya tenía ids cargados desde sessionStorage).
      // Las solicitudes pendientes que SÍ le tocan al usuario y nunca había visto
      // antes (porque llegaron mientras él estaba en otra pantalla) SÍ deben
      // notificarse al volver — toast, vibración, todo. Esto soluciona el caso
      // móvil donde el mesero entra a su panel y "no se entera" de solicitudes
      // que ya estaban esperando.
      const yaVistas = new Set(notifiedRef.current);
      todas.forEach(s => {
        if (yaVistas.has(s.id)) return; // ya la vio antes, ignorar
        // Si es del usuario y es de los últimos 5 min, dejarla pendiente
        // de notificar abajo. Si es vieja (>5 min), marcarla como vista.
        const ts = s?.fecha_creacion ? new Date(s.fecha_creacion).getTime() : 0;
        const ageMs = Date.now() - ts;
        const esReciente = ts > 0 && ageMs < 5 * 60 * 1000;
        if (!esReciente) {
          notifiedRef.current.add(s.id);
        }
      });
      saveSet(notifiedRef.current);
      firstLoadRef.current = false;
      // Si quedan pendientes (filtradas para él, no marcadas, recientes), seguimos.
      const pend = pendientes.filter(s => !notifiedRef.current.has(s.id));
      if (pend.length === 0) return;
      // Cae al flujo normal de notificación abajo — pero con las "primer load
      // recientes" como nuevas.
    }
    const nuevas = pendientes.filter(s => !notifiedRef.current.has(s.id));
    if (nuevas.length === 0) return;

    const alertCfg = getAlertConfig();
    const audioOk = debeEscucharAudio(posUser, config);
    const conSonido = audioOk && (alertCfg.modo === 'sonido' || alertCfg.modo === 'sonido_voz');
    const conVoz = audioOk && (alertCfg.modo === 'voz' || alertCfg.modo === 'sonido_voz');

    // Fallback móvil: si audio está bloqueado por el navegador (caso típico
    // de teléfono recién entrando a la pantalla, sin gesto previo), el toast
    // visual + vibración garantizan que el mesero se entere. No-op en iOS.
    try { vibrate('alert'); } catch {}

    const frasesAHablar = [];
    nuevas.forEach(s => {
      notifiedRef.current.add(s.id);
      const verbo = TIPO_SOLICITUD_VERBO[s.tipo] || 'requiere atención';
      // PRIMERO visual (toast). duration: 10s = persistente para no perderlo
      // si el mesero estaba mirando otra cosa cuando llegó la solicitud.
      toast.success('Solicitud QR', {
        description: `Mesa ${s.mesa_numero || '—'} ${verbo}`,
        duration: 10000,
      });
      if (conVoz) {
        const puedeNombrar = debeUsarNombreEnVoz(config, s);
        const propio = !!s?.mesero_destino_id && s.mesero_destino_id === posUser?.id;
        const nombre = (puedeNombrar && propio && alertCfg.decir_nombre)
          ? (posUser?.nombre || '')
          : '';
        frasesAHablar.push(frasePorSolicitud(s.tipo, s.mesa_numero, nombre));
      }
    });

    saveSet(notifiedRef.current);
    // Visual → voz/sonido con pequeño delay.
    if (conSonido || frasesAHablar.length > 0) {
      setTimeout(() => {
        if (conSonido) { try { playNewOrder(); } catch {} }
        frasesAHablar.forEach((frase, i) => {
          setTimeout(() => { try { speak(frase); } catch {} }, i * 1400);
        });
      }, 280);
    }
  }, [solicitudes, watch, posUser, config]);

  return null;
}
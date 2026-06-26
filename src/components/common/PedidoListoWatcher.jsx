import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLES } from '@/lib/constants';
import { playReady } from '@/lib/sounds';
import { speak, fraseListoCocina, getAlertConfig } from '@/lib/voiceAlert';
import { toast } from 'sonner';
import { vibrate } from '@/lib/vibrate';
import {
  asignacionActiva,
  debeEscucharAudio,
  resolverMeseroResponsable,
} from '@/lib/asignacionMesas';

// asignacionActiva se mantiene: se usa para diferenciar mensajes admin.

/**
 * Watcher global: avisa al mesero correspondiente cuando un pedido pasa a "listo".
 *
 * Reglas finales:
 * - Cocina NUNCA escucha audio/voz de "listo" (este watcher solo corre para mesero/admin).
 * - Modo asignación activa:
 *     - Solo el mesero asignado a la mesa escucha audio/voz.
 *     - La voz puede decir su nombre si "Decir mi nombre" está activado.
 * - Modo sin asignación:
 *     - Si la mesa tiene atendido_por_id: SOLO ese mesero escucha audio/voz.
 *     - Si NO hay atendido_por: NO se reproduce voz masiva. Solo toast genérico
 *       y el admin (si no está silenciado) ve advertencia "Mesa sin mesero".
 * - El ADMIN ve toast siempre; el audio depende de silenciar_notificaciones_admin.
 * - Orden: PRIMERO visual (toast), luego voz/sonido con pequeño delay.
 */
const NOTIFIED_KEY = 'mh_notified_pedidos_listos';

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

export default function PedidoListoWatcher() {
  const { posUser } = usePOSAuth();
  const { paquete_modo, config } = useConfig();
  const role = posUser?.rol;
  const isPro = paquete_modo === 'restaurante_pro';
  // IMPORTANTE: este watcher solo corre para mesero/admin. Cocina queda fuera.
  const watch = isPro && (role === ROLES.WAITER || role === ROLES.ADMIN);
  const firstLoadRef = useRef(true);
  const notifiedRef = useRef(loadSet());

  // HOTFIX PASO 3 — 4s en lugar de 6s. En móvil con red lenta, 6s sumado al
  // tiempo de respuesta puede llegar a 8s y el mesero piensa que no le avisaron.
  // refetchIntervalInBackground asegura que el polling siga aunque el tab
  // móvil pierda foco (común cuando el mesero está en otra pantalla).
  const { data: pedidosListos = [] } = useQuery({
    queryKey: ['pedidos_listos_watcher'],
    queryFn: () => base44.entities.PedidoPreparacion.filter({ estado: 'listo' }),
    initialData: [],
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    enabled: watch,
  });

  const { data: mesas = [] } = useQuery({
    queryKey: ['mesas_listo_watcher'],
    queryFn: () => base44.entities.Mesa.list('-created_date', 500),
    initialData: [],
    refetchInterval: 15000,
    enabled: watch,
  });

  useEffect(() => {
    if (!watch) return;
    const todos = Array.isArray(pedidosListos) ? pedidosListos : [];
    const mesasMap = {};
    (Array.isArray(mesas) ? mesas : []).forEach(m => { if (m?.id) mesasMap[m.id] = m; });

    if (firstLoadRef.current) {
      // HOTFIX PASO 3 — mismo criterio que SolicitudesQRWatcher: si hay un
      // pedido listo reciente (<5 min) que NO está en notifiedRef (sessionStorage),
      // significa que el mesero estaba en otra pantalla cuando llegó y debe
      // enterarse al volver. Pedidos viejos sí se silencian.
      const yaVistos = new Set(notifiedRef.current);
      todos.forEach(p => {
        if (yaVistos.has(p.id)) return;
        const ts = p?.fecha_listo ? new Date(p.fecha_listo).getTime()
          : (p?.fecha_creacion ? new Date(p.fecha_creacion).getTime() : 0);
        const esReciente = ts > 0 && (Date.now() - ts) < 5 * 60 * 1000;
        if (!esReciente) notifiedRef.current.add(p.id);
      });
      saveSet(notifiedRef.current);
      firstLoadRef.current = false;
      // Si quedaron pedidos recientes pendientes de notificar, cae al flujo normal.
      const pendientes = todos.filter(p => !notifiedRef.current.has(p.id));
      if (pendientes.length === 0) return;
    }

    const nuevos = todos.filter(p => !notifiedRef.current.has(p.id));
    if (nuevos.length === 0) return;

    const asign = asignacionActiva(config);
    const audioOk = debeEscucharAudio(posUser, config);
    const alertCfg = getAlertConfig();
    const conSonido = audioOk && (alertCfg.modo === 'sonido' || alertCfg.modo === 'sonido_voz');
    const conVoz = audioOk && (alertCfg.modo === 'voz' || alertCfg.modo === 'sonido_voz');

    let debeSonarUna = false;
    let debeHablar = []; // frases a hablar tras delay visual
    let debeVibrar = false; // fallback móvil: vibra si al menos un pedido le toca

    nuevos.forEach(p => {
      notifiedRef.current.add(p.id);
      const mesa = p.mesa_id ? mesasMap[p.mesa_id] : null;
      const responsable = resolverMeseroResponsable(mesa, config);

      // ¿A este usuario le toca audio/voz?
      let leToca = false;
      if (role === ROLES.WAITER) {
        if (asign) {
          // Solo si la mesa tiene mesero asignado === yo.
          leToca = !!responsable?.id && responsable.id === posUser.id;
        } else {
          // Sin asignación: solo si la mesa tiene atendido_por === yo.
          // Si la mesa NO tiene atendido_por, NO suena masivo.
          leToca = !!responsable?.id && responsable.id === posUser.id;
        }
      } else if (role === ROLES.ADMIN) {
        // Admin: toast siempre. Audio/voz solo si no está silenciado.
        leToca = true;
      }

      // F3.2: nombre de estación para mostrar/decir. Si el pedido tiene
      // estacion_preparacion_nombre, se usa; si no, fallback a "cocina".
      const estacionNombre = (p?.estacion_preparacion_nombre || '').trim();
      const destinoLegible = estacionNombre || 'cocina';

      // Toast (PRIMERO visual). Mesero solo si le toca; admin siempre.
      if (leToca || role === ROLES.ADMIN) {
        // Si admin y la mesa no tiene responsable en modo apagado, advertir.
        const sinResp = role === ROLES.ADMIN && !asign && mesa && !responsable?.id;
        toast.success('Pedido listo', {
          description: sinResp
            ? `Mesa ${p.mesa_numero || '—'} · Sin mesero atendiendo · Recoger en ${destinoLegible}`
            : `Mesa ${p.mesa_numero || '—'} · Recoger en ${destinoLegible}`,
          duration: 8000,
        });
      }

      // Voz solo para quien le toca y tenga audio.
      if (leToca && conVoz) {
        const puedeNombre = !!responsable?.id && responsable.id === posUser?.id && alertCfg.decir_nombre;
        const nombre = puedeNombre ? (posUser?.nombre || '') : '';
        debeHablar.push(fraseListoCocina(p.mesa_numero, nombre, estacionNombre));
      }
      if (leToca && conSonido) debeSonarUna = true;
      // Vibración: si al mesero le toca este pedido, vibramos como fallback
      // por si el navegador móvil bloqueó el audio. Admin silenciado no vibra.
      if (leToca && role === ROLES.WAITER) debeVibrar = true;
      if (leToca && role === ROLES.ADMIN && audioOk) debeVibrar = true;
    });

    saveSet(notifiedRef.current);

    // Fallback móvil: vibrar de inmediato si corresponde. No-op si no hay API.
    if (debeVibrar) {
      try { vibrate('double'); } catch {}
    }

    // Visual → luego voz/sonido con ~280ms de delay.
    if (debeSonarUna || debeHablar.length > 0) {
      setTimeout(() => {
        if (debeSonarUna) {
          try { playReady(); } catch {}
        }
        debeHablar.forEach((frase, i) => {
          // Pequeño stagger entre frases si hay varias.
          setTimeout(() => { try { speak(frase); } catch {} }, i * 1400);
        });
      }, 280);
    }
  }, [pedidosListos, mesas, watch, posUser, config]);

  return null;
}
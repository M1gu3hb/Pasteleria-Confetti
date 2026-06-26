import React, { useEffect, useRef } from 'react';
import { speak, fraseNuevoPedidoCocina, getCocinaVozConfig } from '@/lib/voiceAlert';
import { playNewOrder } from '@/lib/sounds';
import { toast } from 'sonner';

const NOTIFIED_KEY = 'mh_cocina_notified_nuevos';

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

/**
 * Watcher LOCAL de cocina (montado solo en /cocina).
 *
 * IMPORTANTE — Visibilidad de pedidos:
 * Este componente recibe `pedidos` desde `pages/Cocina.jsx`, que ya aplica TODA
 * la lógica de filtrado por estación/cocina general/legacy (ver `pedidosFiltrados`
 * en Cocina.jsx). Por eso aquí NO duplicamos esa lógica — solo filtramos por
 * `estado === 'nuevo'`.
 *
 * 🔴 HOTFIX bandera roja (estaciones activas):
 * Antes filtrábamos también por `p.area === 'cocina'`. Esto rompía estaciones
 * activas: si un pedido era de la estación "Barra" o "Postres", `area` puede
 * venir vacío o distinto a 'cocina', y la voz NO sonaba aunque Cocina visual
 * sí lo mostrara. Ahora confiamos en el filtro de la pantalla:
 *
 *   - Legacy (estaciones apagadas) → Cocina.jsx ya filtra por `area:'cocina'`
 *     en la query, así que `pedidos` solo trae cocina. Comportamiento intacto.
 *   - Estaciones activas + estación específica → Cocina.jsx ya filtra por
 *     `estacion_preparacion_id` del usuario. Solo escuchamos lo que ve.
 *   - Estaciones activas + cocina general / ver todas → Cocina.jsx pasa todo
 *     lo visible. Voz suena para cada pedido nuevo que ve el usuario.
 *
 * Deduplicación por `pedido.id` se mantiene intacta vía `notifiedRef` +
 * sessionStorage, así que un pedido nunca suena dos veces.
 *
 * - Detecta pedidos NUEVOS (estado=nuevo) y reproduce:
 *   1) toast visual,
 *   2) sonido básico,
 *   3) voz larga con productos/notas + alergia/celebración (si voz activa).
 * - Cocina NUNCA reproduce voz cuando los pedidos pasan a "listo".
 */
export default function CocinaNuevoPedidoWatcher({ pedidos = [] }) {
  const firstLoadRef = useRef(true);
  const notifiedRef = useRef(loadSet());

  useEffect(() => {
    const arr = Array.isArray(pedidos) ? pedidos : [];
    // Solo filtramos por estado. La visibilidad ya está aplicada por Cocina.jsx
    // (que respeta estaciones, cocina general y legacy).
    const nuevos = arr.filter(p => p?.estado === 'nuevo');

    if (firstLoadRef.current) {
      nuevos.forEach(p => notifiedRef.current.add(p.id));
      saveSet(notifiedRef.current);
      firstLoadRef.current = false;
      return;
    }
    const recien = nuevos.filter(p => !notifiedRef.current.has(p.id));
    if (recien.length === 0) return;

    const vozCfg = getCocinaVozConfig();
    const frasesAHablar = [];

    recien.forEach(p => {
      notifiedRef.current.add(p.id);
      // 1) Visual primero.
      const desc = p.mesa_numero
        ? `Mesa ${p.mesa_numero} — ${(p.items || []).length} producto(s)`
        : `Mostrador — ${(p.items || []).length} producto(s)`;
      toast.success('Nuevo pedido recibido', { description: desc, duration: 10000 });

      // 2) Voz (si activa). Pasamos alergias y celebración como extras para
      //    que se anuncien con prioridad (HOTFIX bandera roja de auditoría).
      if (vozCfg.voz_activa) {
        try {
          frasesAHablar.push(fraseNuevoPedidoCocina(p.mesa_numero, p.items, p.notas, {
            notas_alergias: p.notas_alergias,
            celebracion: p.celebracion_especial,
            tipo_celebracion: p.tipo_celebracion,
          }));
        } catch {}
      }
    });
    saveSet(notifiedRef.current);

    // 3) Audio con pequeño delay después del visual.
    // La cola interna de speak() garantiza que TODAS las frases se lean en orden,
    // sin que una pise a la otra (antes solo se oía la última con setTimeout paralelos).
    setTimeout(() => {
      try { playNewOrder(); } catch {}
      frasesAHablar.forEach((frase) => {
        try { speak(frase, { cocina: true }); } catch {}
      });
    }, 280);
  }, [pedidos]);

  return null;
}
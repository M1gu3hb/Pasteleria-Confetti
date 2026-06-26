import React, { useEffect, useRef, useState } from 'react';
import MesaShape from './MesaShape';
import { UtensilsCrossed, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TAMANOS_MESA } from '@/lib/constants';
import { useConfig } from '@/lib/ConfigContext';
import { responsableColor, responsableTexto } from '@/lib/asignacionMesas';

const MAP_HEIGHT = 600;

/**
 * Editable canvas/map for tables — REAL drag&drop with pointer events.
 * The mesa follows the cursor live while dragging; persists on release.
 * Muestra el color/nombre del mesero responsable de cada mesa (admin).
 */
export default function MesaMapEditor({ mesas, onMesaClick, onPositionChange, onCreateFirst, selectedId }) {
  const { config } = useConfig();
  const containerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  // overrides hold the visual position while dragging (per id)
  const [overrides, setOverrides] = useState({});
  const dragState = useRef(null); // { id, offsetX, offsetY, w, h, rect }

  const dimsFor = (mesa) => {
    const tamano = mesa.tamano || 'mediana';
    const forma = mesa.forma || 'redonda';
    return TAMANOS_MESA[tamano]?.[forma] || { w: 80, h: 80 };
  };

  const handlePointerDown = (e, mesa) => {
    if (e.button !== undefined && e.button !== 0) return; // only left click
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dim = dimsFor(mesa);
    const startX = mesa.posicion_x ?? 100;
    const startY = mesa.posicion_y ?? 100;
    dragState.current = {
      id: mesa.id,
      offsetX: e.clientX - rect.left - startX,
      offsetY: e.clientY - rect.top - startY,
      w: dim.w,
      h: dim.h,
      rect,
      moved: false,
    };
    setDraggingId(mesa.id);
    // capture pointer so we keep receiving moves outside the element
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e) => {
    const st = dragState.current;
    if (!st) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let x = e.clientX - rect.left - st.offsetX;
    let y = e.clientY - rect.top - st.offsetY;
    x = Math.max(0, Math.min(x, rect.width - st.w));
    y = Math.max(0, Math.min(y, rect.height - st.h));
    st.moved = true;
    setOverrides(prev => ({ ...prev, [st.id]: { x: Math.round(x), y: Math.round(y) } }));
  };

  const handlePointerUp = (e) => {
    const st = dragState.current;
    if (!st) return;
    const ov = overrides[st.id];
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
    dragState.current = null;
    setDraggingId(null);
    if (st.moved && ov) {
      // Optimistic: keep override visible. It will be cleared automatically
      // by the effect below once props.mesa.posicion_x/y match the override.
      onPositionChange?.(st.id, ov.x, ov.y);
    } else {
      setOverrides(prev => {
        const cp = { ...prev };
        delete cp[st.id];
        return cp;
      });
      // Importante: cuando se hace setPointerCapture en pointerdown y se libera
      // en pointerup, algunos navegadores NO generan click sintético. Disparamos
      // el click manualmente solo cuando NO hubo arrastre, para abrir el editor.
      const mesa = mesas.find(m => m.id === st.id);
      if (mesa) onMesaClick?.(mesa);
    }
  };

  // Limpia el override cuando los datos del padre ya reflejan la nueva posición
  // (evita que la mesa parpadee a la posición vieja durante el refetch).
  useEffect(() => {
    setOverrides(prev => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const m = mesas.find(x => x.id === id);
        if (!m) { delete next[id]; changed = true; continue; }
        if (m.posicion_x === prev[id].x && m.posicion_y === prev[id].y) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mesas]);

  // Cancel drag if pointer leaves window etc.
  useEffect(() => {
    const cancel = () => {
      if (dragState.current) {
        dragState.current = null;
        setDraggingId(null);
      }
    };
    window.addEventListener('pointercancel', cancel);
    return () => window.removeEventListener('pointercancel', cancel);
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative rounded-2xl overflow-hidden border-2 select-none"
      style={{
        height: MAP_HEIGHT,
        background: 'linear-gradient(135deg, #F4EAD5 0%, #E8DCC0 100%)',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)',
        backgroundSize: '24px 24px',
        borderColor: '#C9B68A',
        boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.15), inset 0 -2px 6px rgba(255,255,255,0.5)',
        touchAction: 'none',
        cursor: draggingId ? 'grabbing' : 'default',
      }}
    >
      {mesas.map(m => {
        const ov = overrides[m.id];
        const visMesa = ov ? { ...m, posicion_x: ov.x, posicion_y: ov.y } : m;
        const isDragging = draggingId === m.id;
        // El wrapper se posiciona en la coordenada real (no en 0,0). MesaShape
        // se renderiza relativo dentro del wrapper para evitar doble offset
        // (que causaba teletransporte al iniciar drag).
        const dim = dimsFor(visMesa);
        return (
          <div
            key={m.id}
            onPointerDown={(e) => handlePointerDown(e, m)}
            style={{
              position: 'absolute',
              left: visMesa.posicion_x ?? 100,
              top: visMesa.posicion_y ?? 100,
              width: dim.w,
              height: dim.h,
              cursor: isDragging ? 'grabbing' : 'grab',
              zIndex: isDragging ? 50 : 1,
              transition: isDragging ? 'none' : 'left 120ms ease, top 120ms ease',
              opacity: isDragging ? 0.92 : 1,
              filter: isDragging ? 'drop-shadow(0 10px 14px rgba(0,0,0,0.25))' : 'none',
              touchAction: 'none',
            }}
          >
            <MesaShape
              mesa={visMesa}
              inline
              onClick={() => {
                // suppress click if we just dragged
                if (dragState.current?.moved) return;
                onMesaClick?.(m);
              }}
              selected={selectedId === m.id}
              responsableColor={responsableColor(visMesa, config)}
              responsableNombre={responsableTexto(visMesa, config)}
            />
          </div>
        );
      })}

      {mesas.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto">
            <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 text-amber-700/40" />
            <p className="font-heading font-bold text-amber-900/70">No hay mesas configuradas</p>
            <p className="text-sm text-amber-800/60 mb-4">Crea una mesa para comenzar a diseñar el mapa</p>
            {onCreateFirst && (
              <Button onClick={onCreateFirst} className="gap-2">
                <Plus className="w-4 h-4" /> Crear primera mesa
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
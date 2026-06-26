import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, X, Plus, Minus, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';

/**
 * Ficha del producto en el carrito del mesero — expandible.
 * Permite:
 *  - Ver descripción
 *  - Ver ingredientes (solo nombres, sin gramajes ni costos)
 *  - Marcar ingredientes "sin este ingrediente"
 *  - Agregar nota especial
 *
 * onUpdateNotas(item.id, notas) — texto final que viajará a cocina.
 * onUpdateExclusiones(item.id, exclusionesEstructuradas) — array de
 *   { ingrediente_id, ingrediente_nombre, unidad, cantidad_base_excluida }.
 *
 * PASO A — Estructura de exclusiones:
 *   El estado interno `exclusionesNombres` (Set/Array de strings) sigue
 *   manejando la UI (más simple). Cuando cambia, construimos el snapshot
 *   estructurado mirando el array completo de recetas del producto y
 *   notificamos al padre vía onUpdateExclusiones con el objeto completo.
 *   En este paso NO descontamos inventario — solo persistimos el snapshot.
 */
// Convierte `_exclusiones` legacy (array de strings) a array de nombres
// para que la UI siga funcionando aunque el padre todavía mande strings.
const normalizarExclusionesIniciales = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') return e.ingrediente_nombre || '';
    return '';
  }).filter(Boolean);
};

export default function ProductoFichaExpandible({ item, onUpdateNotas, onUpdateExclusiones, onCambiarCantidad }) {
  const [open, setOpen] = useState(false);
  const [nota, setNota] = useState(item?._notaUsuario || '');
  const [exclusiones, setExclusiones] = useState(normalizarExclusionesIniciales(item?._exclusiones));

  // Sincronizar cambios externos al item (por si lo agregaron de nuevo)
  useEffect(() => {
    setNota(item?._notaUsuario || '');
    setExclusiones(normalizarExclusionesIniciales(item?._exclusiones));
  }, [item?.id]);

  // Recetas del producto — usamos las LÍNEAS COMPLETAS para poder construir
  // el snapshot estructurado (id + nombre + unidad + cantidad).
  const { data: recetas = [] } = useQuery({
    queryKey: ['mesero_receta_prod', item?.id, open],
    queryFn: () => base44.entities.RecetaEscandallo.filter({ producto_id: item.id }),
    initialData: [],
    enabled: !!item?.id && open,
  });

  const recetaLineasActivas = (Array.isArray(recetas) ? recetas : [])
    .filter((r) => r && r.activo !== false && r.ingrediente_nombre);

  const ingredientes = recetaLineasActivas
    .map((r) => r?.ingrediente_nombre)
    .filter(Boolean);

  // Construye el snapshot estructurado a partir de los nombres seleccionados.
  // Si por algún motivo no se encuentra la línea (raro), igual guardamos el
  // nombre — Caja podrá ignorar la entry de forma defensiva en el Paso B.
  const buildExclusionesEstructuradas = (nombres) => {
    const arr = Array.isArray(nombres) ? nombres : [];
    return arr.map((nombre) => {
      const linea = recetaLineasActivas.find((r) => r?.ingrediente_nombre === nombre);
      return {
        ingrediente_id: linea?.ingrediente_id || '',
        ingrediente_nombre: nombre,
        unidad: linea?.unidad_usada || '',
        // cantidad_base_excluida por unidad de producto (sin multiplicar por cantidad).
        // El Paso B la multiplicará por item.cantidad al descontar.
        cantidad_base_excluida: Number(linea?.cantidad_convertida_unidad_base) || 0,
      };
    });
  };

  // FIX 6B-AUDIT-2: Si el item viene con modificadores elegidos al agregar
  // (item._modificadores), su texto plano debe PRESERVARSE al cambiar
  // exclusiones o nota libre. Si lo perdemos, cocina deja de ver el término
  // de carne / opción elegida.
  const modificadoresPrefix = (() => {
    const arr = Array.isArray(item?._modificadores) ? item._modificadores : [];
    return arr
      .filter((m) => m && Array.isArray(m.opciones) && m.opciones.length > 0)
      .map((m) => {
        const ops = m.opciones.map((o) => o?.nombre).filter(Boolean).join(', ');
        return ops ? `${m.grupo_nombre}: ${ops}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  })();

  // Combina modificadores (prefijo fijo) + exclusiones + nota libre.
  const buildNotaFinal = (excls, freeText) => {
    const parts = [];
    if (modificadoresPrefix) parts.push(modificadoresPrefix);
    (excls || []).forEach(n => parts.push(`Sin ${n}`));
    if ((freeText || '').trim()) parts.push(freeText.trim());
    return parts.join(' · ');
  };

  const toggleExclusion = (nombre) => {
    setExclusiones(prev => {
      const exists = prev.includes(nombre);
      const next = exists ? prev.filter(n => n !== nombre) : [...prev, nombre];
      // PASO A — Avisamos al padre con el snapshot ESTRUCTURADO (no solo nombres).
      if (typeof onUpdateExclusiones === 'function') {
        onUpdateExclusiones(item.id, buildExclusionesEstructuradas(next));
      }
      if (typeof onUpdateNotas === 'function') onUpdateNotas(item.id, buildNotaFinal(next, nota));
      return next;
    });
  };

  const onNotaChange = (val) => {
    setNota(val);
    if (typeof onUpdateNotas === 'function') onUpdateNotas(item.id, buildNotaFinal(exclusiones, val));
  };

  const hayModif = exclusiones.length > 0 || (nota || '').trim().length > 0;

  // 6B / 1.D — Si el item es variable, mostramos cantidad real ("500 g" / "4 shots")
  // en vez de los controles ±. Las líneas variables NO se incrementan: para más
  // cantidad se agrega otra línea desde el modal.
  const variableSnap = item?._variable || null;
  const cantidadVariableTxt = variableSnap
    ? formatearCantidadVariable({
        tipo_venta: variableSnap.tipo_venta,
        cantidad_variable: variableSnap.cantidad_variable,
        unidad_variable: variableSnap.unidad_variable,
        cantidad_porciones: variableSnap.cantidad_porciones,
        nombre_porcion: variableSnap.nombre_porcion,
      })
    : '';

  return (
    <div className="rounded-lg bg-white border overflow-hidden">
      {/* Header compacto */}
      <div className="flex items-center gap-2 p-2">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-left w-full"
          >
            <span className="text-xs font-medium truncate">{item?.nombre || '—'}</span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {hayModif && (
            <p className="text-[10px] text-orange-700 italic truncate">
              ↳ {buildNotaFinal(exclusiones, nota)}
            </p>
          )}
        </div>
        {/* Controles cantidad */}
        {variableSnap ? (
          // 6B / 1.D — Producto variable: mostrar cantidad textual + botón quitar.
          // No permite ± porque la cantidad real va en _variable (no se puede sumar/restar 1).
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {cantidadVariableTxt || '—'}
            </span>
            <button onClick={() => onCambiarCantidad && onCambiarCantidad(item.id, -1)}
              className="w-6 h-6 rounded-full bg-white border flex items-center justify-center"
              title="Quitar línea">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onCambiarCantidad && onCambiarCantidad(item.id, -1)}
              className="w-6 h-6 rounded-full bg-white border flex items-center justify-center">
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center text-xs font-bold">{item?.cantidad || 0}</span>
            <button onClick={() => onCambiarCantidad && onCambiarCantidad(item.id, 1)}
              className="w-6 h-6 rounded-full bg-white border flex items-center justify-center">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Contenido expandido */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t bg-muted/20"
          >
            <div className="p-2.5 space-y-2">
              {item?.descripcion && (
                <p className="text-[11px] text-muted-foreground italic">
                  {item.descripcion}
                </p>
              )}

              {ingredientes.length > 0 ? (
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Ingredientes</p>
                  <div className="flex flex-wrap gap-1">
                    {ingredientes.map((nombre, i) => {
                      const excluido = exclusiones.includes(nombre);
                      return (
                        <button
                          key={`${nombre}-${i}`}
                          type="button"
                          onClick={() => toggleExclusion(nombre)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${
                            excluido
                              ? 'bg-rose-100 border-rose-300 text-rose-700 line-through'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {excluido && <X className="w-2.5 h-2.5" />}
                          {nombre}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1 italic">
                    Toca un ingrediente para marcarlo como "Sin {ingredientes[0] || '...'}"
                  </p>
                </div>
              ) : open && (
                <p className="text-[10px] text-muted-foreground italic">Este producto no tiene ingredientes registrados.</p>
              )}

              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Nota para cocina
                </p>
                <Textarea
                  value={nota}
                  onChange={(e) => onNotaChange(e.target.value)}
                  placeholder='Ej: "Sin picante", "Muy caliente", "Cliente alérgico a cacahuate"...'
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
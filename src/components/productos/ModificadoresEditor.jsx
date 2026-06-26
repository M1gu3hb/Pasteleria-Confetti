import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, X } from 'lucide-react';

/**
 * Editor de "Opciones de preparación / Modificadores" de un producto.
 *
 * Estructura del valor (array):
 * [
 *   {
 *     id: string,
 *     nombre: "Término de carne",
 *     obligatorio: true,
 *     tipo: "unica" | "multiple",
 *     activo: true,
 *     opciones: [{ id, nombre, activo }]
 *   }
 * ]
 *
 * v1: solo informativo. NO afecta precio/costo/inventario.
 *
 * Props:
 *  - value: array | null
 *  - onChange(nextArray): callback con normalización
 *  - disabled?: boolean
 */
const genId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const normalizeName = (s) => String(s || '').trim();
const isDup = (arr, idx, val) => {
  const norm = normalizeName(val).toLowerCase();
  if (!norm) return false;
  return arr.some((o, i) => i !== idx && normalizeName(o?.nombre).toLowerCase() === norm);
};

export default function ModificadoresEditor({ value, onChange, disabled = false }) {
  // Normaliza el valor inicial sin perder ids/persistencia
  const safeInit = Array.isArray(value) ? value : [];
  const [grupos, setGrupos] = useState(() => safeInit.map((g) => ({
    id: g?.id || genId(),
    nombre: g?.nombre || '',
    obligatorio: !!g?.obligatorio,
    tipo: g?.tipo === 'multiple' ? 'multiple' : 'unica',
    activo: g?.activo !== false,
    opciones: Array.isArray(g?.opciones) ? g.opciones.map((o) => ({
      id: o?.id || genId(),
      nombre: o?.nombre || '',
      activo: o?.activo !== false,
    })) : [],
  })));
  const [expandido, setExpandido] = useState(() => {
    const s = new Set();
    grupos.forEach((g) => s.add(g.id));
    return s;
  });

  // Sincronizar si el `value` externo cambia (apertura del diálogo, p.ej.)
  useEffect(() => {
    const incoming = Array.isArray(value) ? value : [];
    setGrupos(incoming.map((g) => ({
      id: g?.id || genId(),
      nombre: g?.nombre || '',
      obligatorio: !!g?.obligatorio,
      tipo: g?.tipo === 'multiple' ? 'multiple' : 'unica',
      activo: g?.activo !== false,
      opciones: Array.isArray(g?.opciones) ? g.opciones.map((o) => ({
        id: o?.id || genId(),
        nombre: o?.nombre || '',
        activo: o?.activo !== false,
      })) : [],
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const emit = (next) => {
    setGrupos(next);
    if (typeof onChange === 'function') onChange(next);
  };

  const toggleExpandido = (id) => {
    setExpandido((prev) => {
      const ns = new Set(prev);
      if (ns.has(id)) ns.delete(id);
      else ns.add(id);
      return ns;
    });
  };

  const addGrupo = () => {
    const nuevo = {
      id: genId(),
      nombre: '',
      obligatorio: false,
      tipo: 'unica',
      activo: true,
      opciones: [{ id: genId(), nombre: '', activo: true }],
    };
    emit([...grupos, nuevo]);
    setExpandido((prev) => new Set(prev).add(nuevo.id));
  };

  const updateGrupo = (idx, patch) => {
    emit(grupos.map((g, i) => i === idx ? { ...g, ...patch } : g));
  };

  const removeGrupo = (idx) => {
    emit(grupos.filter((_, i) => i !== idx));
  };

  const addOpcion = (gIdx) => {
    emit(grupos.map((g, i) => i === gIdx
      ? { ...g, opciones: [...(g.opciones || []), { id: genId(), nombre: '', activo: true }] }
      : g
    ));
  };

  const updateOpcion = (gIdx, oIdx, patch) => {
    emit(grupos.map((g, i) => i === gIdx
      ? { ...g, opciones: g.opciones.map((o, j) => j === oIdx ? { ...o, ...patch } : o) }
      : g
    ));
  };

  const removeOpcion = (gIdx, oIdx) => {
    emit(grupos.map((g, i) => i === gIdx
      ? { ...g, opciones: g.opciones.filter((_, j) => j !== oIdx) }
      : g
    ));
  };

  return (
    <div className="space-y-3">
      {grupos.length === 0 && (
        <div className="text-center py-6 px-4 rounded-xl border-2 border-dashed border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground">Sin opciones de preparación</p>
          <p className="text-xs text-muted-foreground mt-1">
            Agrega grupos como "Término de carne", "Salsa" o "Tipo de leche".
          </p>
        </div>
      )}

      {grupos.map((g, gIdx) => {
        const open = expandido.has(g.id);
        const sinNombre = !normalizeName(g.nombre);
        const opcionesActivas = (g.opciones || []).filter((o) => o.activo !== false && normalizeName(o.nombre));
        const errorObligatorio = g.obligatorio && opcionesActivas.length === 0;
        return (
          <div
            key={g.id}
            className={`rounded-xl border-2 overflow-hidden bg-card ${errorObligatorio ? 'border-rose-300' : 'border-border'}`}
          >
            {/* Header del grupo */}
            <div className="flex items-center gap-2 p-3 bg-muted/30">
              <button
                type="button"
                onClick={() => toggleExpandido(g.id)}
                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted"
                aria-label={open ? 'Colapsar' : 'Expandir'}
              >
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={g.nombre}
                onChange={(e) => updateGrupo(gIdx, { nombre: e.target.value })}
                placeholder="Nombre del grupo (Ej: Término de carne)"
                disabled={disabled}
                className="h-9 flex-1 min-w-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeGrupo(gIdx)}
                disabled={disabled}
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 shrink-0"
                title="Eliminar grupo"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Avisos rápidos */}
            {(sinNombre || errorObligatorio) && (
              <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 border-y border-rose-200 dark:border-rose-800/40 text-[11px] text-rose-700 dark:text-rose-300">
                {sinNombre && '• Falta el nombre del grupo. '}
                {errorObligatorio && '• Un grupo obligatorio necesita al menos una opción activa con nombre.'}
              </div>
            )}

            {open && (
              <div className="p-3 space-y-3">
                {/* Opciones del grupo */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Opciones
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {opcionesActivas.length} activa(s)
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {(g.opciones || []).map((o, oIdx) => {
                      const dup = isDup(g.opciones || [], oIdx, o.nombre);
                      return (
                        <div key={o.id} className="flex items-center gap-2">
                          <Input
                            value={o.nombre}
                            onChange={(e) => updateOpcion(gIdx, oIdx, { nombre: e.target.value })}
                            placeholder="Ej: Tres cuartos"
                            disabled={disabled}
                            className={`h-9 flex-1 ${dup ? 'border-rose-400' : ''}`}
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={o.activo !== false}
                              onCheckedChange={(v) => updateOpcion(gIdx, oIdx, { activo: v })}
                              disabled={disabled}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeOpcion(gIdx, oIdx)}
                              disabled={disabled}
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              title="Eliminar opción"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addOpcion(gIdx)}
                      disabled={disabled}
                      className="w-full gap-1.5 h-8 mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar opción
                    </Button>
                  </div>
                </div>

                {/* Configuración del grupo */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div className="flex items-center justify-between rounded-lg border p-2">
                    <Label className="text-xs cursor-pointer">Obligatorio</Label>
                    <Switch
                      checked={!!g.obligatorio}
                      onCheckedChange={(v) => updateGrupo(gIdx, { obligatorio: v })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-2">
                    <Label className="text-xs cursor-pointer">Selección múltiple</Label>
                    <Switch
                      checked={g.tipo === 'multiple'}
                      onCheckedChange={(v) => updateGrupo(gIdx, { tipo: v ? 'multiple' : 'unica' })}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        onClick={addGrupo}
        disabled={disabled}
        className="w-full gap-2 border-dashed h-10"
      >
        <Plus className="w-4 h-4" /> Agregar grupo de opciones
      </Button>

      <p className="text-[10px] text-muted-foreground italic">
        Estas opciones son informativas para mesero y cocina. No afectan el precio, costo ni inventario.
      </p>
    </div>
  );
}

// Helper: normaliza/limpia el array antes de guardar.
// Elimina opciones sin nombre, deduplica por nombre (case-insensitive, trim).
// Mantiene los grupos con nombre aunque estén incompletos — la VALIDACIÓN
// (bloqueo con mensaje claro) la hace `validateModificadores` antes de guardar.
//
// Diseño: dos helpers separados:
//   - validateModificadores(arr) -> { ok, errors[] }  ⇒ ANTES de guardar
//   - sanitizeModificadores(arr) -> array limpio      ⇒ AL guardar (ya válido)
//
// Si el usuario escribió un grupo con nombre, NUNCA debe "desaparecer
// silenciosamente". O se guarda, o se bloquea con explicación.
export function sanitizeModificadores(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const g of arr) {
    const nombre = normalizeName(g?.nombre);
    // Sin nombre: el editor puede crear filas vacías al hacer "Agregar grupo".
    // Solo descartamos las que el usuario NUNCA tocó (sin nombre y sin
    // opciones con nombre). Si tiene nombre, esto NO debe llegar aquí porque
    // validateModificadores lo habría bloqueado antes.
    const opcionesEntrada = Array.isArray(g?.opciones) ? g.opciones : [];
    const opcionesConNombre = opcionesEntrada.filter((o) => normalizeName(o?.nombre));
    if (!nombre && opcionesConNombre.length === 0) continue;
    if (!nombre) continue; // defensa adicional

    const seen = new Set();
    const opciones = [];
    for (const o of opcionesEntrada) {
      const nm = normalizeName(o?.nombre);
      if (!nm) continue;
      const key = nm.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opciones.push({
        id: o?.id || genId(),
        nombre: nm,
        activo: o?.activo !== false,
      });
    }
    if (opciones.length === 0) continue; // defensa adicional
    out.push({
      id: g?.id || genId(),
      nombre,
      obligatorio: !!g?.obligatorio,
      tipo: g?.tipo === 'multiple' ? 'multiple' : 'unica',
      activo: g?.activo !== false,
      opciones,
    });
  }
  return out;
}

// Valida la configuración ANTES de guardar.
// Retorna { ok: boolean, errors: string[] } con mensajes legibles para el usuario.
// Reglas:
//  1. Un grupo con nombre debe tener al menos una opción CON nombre.
//  2. Un grupo obligatorio debe tener al menos una opción activa con nombre.
//  3. Dentro de un grupo, no se permiten opciones duplicadas (case-insensitive).
//  4. Grupos completamente vacíos (sin nombre y sin opciones con nombre) se ignoran
//     silenciosamente (son filas en blanco que el usuario nunca tocó).
export function validateModificadores(arr) {
  const errors = [];
  if (!Array.isArray(arr)) return { ok: true, errors };
  for (const g of arr) {
    const nombre = normalizeName(g?.nombre);
    const opcionesEntrada = Array.isArray(g?.opciones) ? g.opciones : [];
    const opcionesConNombre = opcionesEntrada.filter((o) => normalizeName(o?.nombre));
    // Fila vacía sin tocar → ignorar
    if (!nombre && opcionesConNombre.length === 0) continue;
    if (!nombre) {
      errors.push('Hay un grupo sin nombre. Escribe un nombre o elimínalo.');
      continue;
    }
    if (opcionesConNombre.length === 0) {
      errors.push(`El grupo "${nombre}" necesita al menos una opción con nombre.`);
      continue;
    }
    // Detección de duplicados (case-insensitive, trim)
    const seen = new Map(); // nombreNormalizado -> nombreOriginal
    for (const o of opcionesConNombre) {
      const nm = normalizeName(o?.nombre);
      const key = nm.toLowerCase();
      if (seen.has(key)) {
        errors.push(`En "${nombre}", la opción "${nm}" está duplicada.`);
      } else {
        seen.set(key, nm);
      }
    }
    // Obligatorio: al menos una opción ACTIVA con nombre
    if (g?.obligatorio) {
      const opcionesActivas = opcionesConNombre.filter((o) => o?.activo !== false);
      if (opcionesActivas.length === 0) {
        errors.push(`El grupo "${nombre}" es obligatorio pero no tiene opciones activas.`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
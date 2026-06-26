import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, AlertCircle, ListChecks } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';

/**
 * Modal de personalización al agregar producto al carrito del mesero.
 *
 * Se abre SOLO cuando el producto tiene `modificadores` activos.
 * Si no tiene, el flujo continúa como antes (sin modal).
 *
 * Props:
 *  - producto: ProductoTerminado | null
 *  - open: boolean
 *  - onClose(): cerrar sin agregar
 *  - onConfirm({ modificadores, notas }): callback al agregar
 */
export default function SeleccionModificadoresDialog({ producto, open, onClose, onConfirm }) {
  // grupoId -> Set(opcionId) para múltiple, o opcionId string para única
  const [selecciones, setSelecciones] = useState({});
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  // Solo grupos/opciones activos
  const grupos = useMemo(() => {
    const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
    return arr
      .filter((g) => g?.activo !== false && (g?.nombre || '').trim())
      .map((g) => ({
        ...g,
        opciones: (Array.isArray(g.opciones) ? g.opciones : [])
          .filter((o) => o?.activo !== false && (o?.nombre || '').trim()),
      }))
      .filter((g) => g.opciones.length > 0);
  }, [producto]);

  // Reset al abrir/cambiar producto
  useEffect(() => {
    if (open) {
      setSelecciones({});
      setNotas('');
      setError('');
    }
  }, [open, producto?.id]);

  const toggleOpcion = (grupo, opcionId) => {
    setError('');
    setSelecciones((prev) => {
      const next = { ...prev };
      if (grupo.tipo === 'multiple') {
        const set = new Set(Array.isArray(next[grupo.id]) ? next[grupo.id] : []);
        if (set.has(opcionId)) set.delete(opcionId);
        else set.add(opcionId);
        next[grupo.id] = Array.from(set);
      } else {
        next[grupo.id] = next[grupo.id] === opcionId ? '' : opcionId;
      }
      return next;
    });
  };

  const isSelected = (grupo, opcionId) => {
    const v = selecciones[grupo.id];
    if (grupo.tipo === 'multiple') return Array.isArray(v) && v.includes(opcionId);
    return v === opcionId;
  };

  const construirModificadoresSeleccionados = () => {
    return grupos.map((g) => {
      const seleccionado = selecciones[g.id];
      let elegidas = [];
      if (g.tipo === 'multiple') {
        const ids = Array.isArray(seleccionado) ? seleccionado : [];
        elegidas = g.opciones
          .filter((o) => ids.includes(o.id))
          .map((o) => ({ id: o.id, nombre: o.nombre }));
      } else if (seleccionado) {
        const op = g.opciones.find((o) => o.id === seleccionado);
        if (op) elegidas = [{ id: op.id, nombre: op.nombre }];
      }
      return {
        grupo_id: g.id,
        grupo_nombre: g.nombre,
        tipo: g.tipo,
        opciones: elegidas,
      };
    }).filter((m) => m.opciones.length > 0);
  };

  const handleConfirm = () => {
    // Validar obligatorios
    const faltantes = [];
    for (const g of grupos) {
      if (!g.obligatorio) continue;
      const v = selecciones[g.id];
      const tieneSeleccion = g.tipo === 'multiple'
        ? (Array.isArray(v) && v.length > 0)
        : !!v;
      if (!tieneSeleccion) faltantes.push(g.nombre);
    }
    if (faltantes.length > 0) {
      setError(`Selecciona una opción en: ${faltantes.join(', ')}`);
      return;
    }
    const modificadores = construirModificadoresSeleccionados();
    onConfirm && onConfirm({
      modificadores,
      notas: (notas || '').trim(),
    });
  };

  if (!producto) return null;
  const precio = Number(producto?.precio_venta) || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose && onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="font-heading flex items-center gap-2 pr-8">
            <ListChecks className="w-5 h-5 text-primary" />
            Personalizar producto
          </DialogTitle>
        </DialogHeader>

        {/* Encabezado del producto (imagen + nombre + precio) */}
        <div className="px-4 pt-3 pb-3 border-b">
          <div className="flex gap-3">
            {producto.imagen_url ? (
              <img
                src={producto.imagen_url}
                alt=""
                className="w-16 h-16 rounded-lg object-cover shrink-0 border"
              />
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-base leading-tight truncate">
                {producto.nombre || '—'}
              </p>
              {producto.descripcion && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {producto.descripcion}
                </p>
              )}
              <p className="text-base font-heading font-black text-primary mt-1 tabular-nums">
                {formatCurrency(precio)}
              </p>
            </div>
          </div>
        </div>

        {/* Grupos de opciones */}
        <div className="px-4 py-3 space-y-4">
          {grupos.map((g) => (
            <div key={g.id}>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm font-bold">
                  {g.nombre}
                  {g.obligatorio && <span className="text-rose-600 ml-1">*</span>}
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {g.tipo === 'multiple' ? 'Elige una o varias' : 'Elige una'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {g.opciones.map((o) => {
                  const sel = isSelected(g, o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOpcion(g, o.id)}
                      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium text-left transition-all active:scale-[0.98] ${
                        sel
                          ? 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        sel ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}>
                        {sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                      <span className="flex-1 leading-tight">{o.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Notas libres */}
          <div>
            <Label className="text-sm font-bold flex items-center gap-1">
              Notas <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. sin cebolla, sin aguacate, poca salsa…"
              rows={2}
              className="mt-1 text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 pb-4 pt-2 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} className="flex-1">
            Agregar al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper: convierte el array de modificadores elegidos a texto plano
 * legible para cocina/tickets ("Término: Tres cuartos · Salsa: Verde").
 */
export function modificadoresToText(modificadoresArr) {
  if (!Array.isArray(modificadoresArr)) return '';
  return modificadoresArr
    .filter((m) => m && Array.isArray(m.opciones) && m.opciones.length > 0)
    .map((m) => {
      const nombres = m.opciones.map((o) => o.nombre).filter(Boolean).join(', ');
      return `${m.grupo_nombre}: ${nombres}`;
    })
    .join(' · ');
}
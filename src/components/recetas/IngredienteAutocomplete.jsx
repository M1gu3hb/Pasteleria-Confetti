import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Package } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { normalizarNombreIngrediente } from '@/utils/ingredienteMatcher';

/**
 * Live autocomplete searching ingredients from inventory.
 * Props:
 *  - ingredientes: list of available ingredients
 *  - value: selected ingrediente (object) or null
 *  - onSelect(ing): called when one is picked
 *  - onCreateNew(query): optional, opens "create new" flow
 */
export default function IngredienteAutocomplete({ ingredientes = [], value, onSelect, onCreateNew }) {
  const [query, setQuery] = useState(value?.nombre || '');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value?.nombre || '');
  }, [value?.id]);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const q = query.trim().toLowerCase();
  // Normalizamos para evitar duplicados por acentos/mayúsculas/espacios:
  // "Pan" === "pan" === "PAN" === " Pan " === "Pán" para detección de existencia.
  const qNorm = normalizarNombreIngrediente(query);
  const matches = q
    ? ingredientes.filter(i => normalizarNombreIngrediente(i.nombre).includes(qNorm)).slice(0, 8)
    : ingredientes.slice(0, 6);

  const exact = qNorm
    ? ingredientes.find(i => normalizarNombreIngrediente(i.nombre) === qNorm)
    : null;

  const handlePick = (ing) => {
    onSelect?.(ing);
    setQuery(ing.nombre);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar ingrediente..."
          className="pl-9"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-white border rounded-lg shadow-lg max-h-72 overflow-y-auto"
          style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
          {matches.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Sin coincidencias
            </div>
          )}
          {matches.map(ing => (
            <button
              key={ing.id}
              type="button"
              onClick={() => handlePick(ing)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors text-left border-b last:border-b-0"
            >
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ing.nombre}</p>
                <p className="text-[11px] text-muted-foreground">
                  Stock: {Number(ing.stock_actual || 0).toLocaleString()} {ing.unidad_base}
                  {' · '}{formatCurrency(ing.costo_por_unidad_base)}/{ing.unidad_base}
                </p>
              </div>
            </button>
          ))}
          {/* Si existe coincidencia exacta (normalizada), NO mostramos "Crear nuevo"
              — forzamos al usuario a elegir el existente para evitar duplicados. */}
          {onCreateNew && q && !exact && (
            <button
              type="button"
              onClick={() => { onCreateNew(query); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/5 border-t"
            >
              + Crear ingrediente "{query}"
            </button>
          )}
          {exact && q && (
            <button
              type="button"
              onClick={() => handlePick(exact)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 border-t"
            >
              ⚠ Ya existe "{exact.nombre}" — usar el existente para no duplicar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
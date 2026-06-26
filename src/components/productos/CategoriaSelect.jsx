import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { ensureCategoriaExists, findExistingCategoria } from '@/utils/categoriaUtils';

// Valor sentinela para "crear nueva categoría" en el select.
const NUEVA = '__nueva__';

/**
 * Select reutilizable de categoría de producto con opción inline
 * "Nueva categoría…" que crea la categoría en BD si no existe.
 *
 * Props:
 *  - value:        id actual seleccionado (string) o ''
 *  - onChange(id, nombre): callback al cambiar la selección o crear nueva
 *  - categorias:   array de CategoriaProducto (puede ser stale, usamos BD para crear)
 *  - placeholder:  texto cuando no hay selección
 *
 * Reglas:
 *  - Nunca crea producto/receta.
 *  - Nunca borra categorías.
 *  - Tolerante a duplicados (case/acentos/espacios) — si existe la reutiliza.
 *  - Invalida 'categorias_producto' tras crear para refrescar todo el sistema.
 */
export default function CategoriaSelect({ value, onChange, categorias = [], placeholder = 'Seleccionar…' }) {
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSelect = (v) => {
    if (v === NUEVA) {
      setCreando(true);
      setNuevoNombre('');
      return;
    }
    const cat = (categorias || []).find(c => c?.id === v);
    onChange?.(v, cat?.nombre || '');
  };

  const cancelarCrear = () => {
    setCreando(false);
    setNuevoNombre('');
  };

  const confirmarCrear = async () => {
    const nombre = (nuevoNombre || '').trim();
    if (!nombre) { toast.error('Escribe un nombre para la nueva categoría'); return; }
    setGuardando(true);
    try {
      // Anti-duplicado contra lista local primero (rápido)
      const dupLocal = findExistingCategoria(nombre, categorias);
      if (dupLocal) {
        onChange?.(dupLocal.id, dupLocal.nombre);
        toast.info(`La categoría "${dupLocal.nombre}" ya existía, se usó la existente.`);
        setCreando(false);
        setNuevoNombre('');
        return;
      }
      // Crear o reutilizar contra BD (tolerante a casing/acentos)
      const cat = await ensureCategoriaExists(base44, nombre, { reactivate: true });
      onChange?.(cat.id, cat.nombre);
      queryClient.invalidateQueries({ queryKey: ['categorias_producto'] });
      queryClient.invalidateQueries({ queryKey: ['categorias_menu_qr'] });
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success(`Categoría "${cat.nombre}" creada`);
      setCreando(false);
      setNuevoNombre('');
    } catch (e) {
      console.error('[CategoriaSelect] crear:', e);
      toast.error('No se pudo crear la categoría: ' + (e?.message || ''));
    } finally {
      setGuardando(false);
    }
  };

  if (creando) {
    return (
      <div className="flex gap-1.5 items-center">
        <Input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmarCrear(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelarCrear(); }
          }}
          placeholder="Nombre de la nueva categoría"
          autoFocus
          disabled={guardando}
        />
        <Button
          type="button"
          size="icon"
          variant="default"
          onClick={confirmarCrear}
          disabled={guardando || !nuevoNombre.trim()}
          title="Crear categoría"
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={cancelarCrear}
          disabled={guardando}
          title="Cancelar"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value || ''} onValueChange={handleSelect}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {(Array.isArray(categorias) ? categorias : []).map(c => (
          <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
        ))}
        <SelectItem value={NUEVA}>
          <span className="inline-flex items-center gap-1.5 text-primary font-medium">
            <Plus className="w-3.5 h-3.5" /> Nueva categoría…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
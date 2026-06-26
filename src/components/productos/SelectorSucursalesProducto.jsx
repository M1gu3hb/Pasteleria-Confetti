import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Lock } from 'lucide-react';

// Sucursales fijas de Confetti. IDs estables del proyecto.
export const SUCURSALES_CONFETTI = [
  { id: '6a28b475553d114b364bf134', nombre: 'Xochimilco / Principal' },
  { id: '6a28b475553d114b364bf135', nombre: 'Topilejo' },
  { id: '6a28b475553d114b364bf136', nombre: 'San Gregorio' },
];

/**
 * Selector multi-sucursal para asignar un producto a una o varias sucursales.
 *
 * Convención: value = array de IDs.
 *  - [] (vacío) = "Todas las sucursales" (global).
 *  - [ids...]  = solo esas sucursales.
 *
 * Props:
 *  - value: string[]   IDs seleccionados.
 *  - onChange: (ids: string[]) => void
 *  - bloqueado: boolean   Modo administrador → solo lectura, su sucursal.
 *  - nombreSucursalBloqueada: string  Texto a mostrar en modo bloqueado.
 */
export default function SelectorSucursalesProducto({
  value = [],
  onChange,
  bloqueado = false,
  nombreSucursalBloqueada = '',
}) {
  const ids = Array.isArray(value) ? value : [];
  const todas = ids.length === 0;

  // Modo administrador: control de solo lectura, su única sucursal.
  if (bloqueado) {
    return (
      <div>
        <Label className="text-xs">Disponibilidad por sucursal</Label>
        <div className="mt-1 flex items-center gap-2 px-3 h-11 rounded-md border bg-muted/40 text-sm">
          <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{nombreSucursalBloqueada || 'Esta sucursal'}</span>
          <span className="text-[11px] text-muted-foreground ml-auto">Solo esta sucursal</span>
        </div>
      </div>
    );
  }

  const toggleTodas = (checked) => {
    if (checked) onChange?.([]); // vacío = global
  };

  const toggleSucursal = (sucId, checked) => {
    let next = ids.filter((x) => x !== sucId);
    if (checked) next = [...next, sucId];
    onChange?.(next);
  };

  return (
    <div>
      <Label className="text-xs flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5" /> Disponibilidad por sucursal
      </Label>
      <div className="mt-1.5 space-y-1.5">
        <label className="flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/40">
          <Checkbox checked={todas} onCheckedChange={(v) => toggleTodas(v === true)} />
          <span className="text-sm font-medium">Todas las sucursales</span>
        </label>
        {SUCURSALES_CONFETTI.map((s) => (
          <label
            key={s.id}
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/40 ${todas ? 'opacity-50' : ''}`}
          >
            <Checkbox
              checked={ids.includes(s.id)}
              onCheckedChange={(v) => toggleSucursal(s.id, v === true)}
            />
            <span className="text-sm">{s.nombre}</span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        "Todas" = visible en las 3 sucursales. Elige una o varias para limitarlo.
      </p>
    </div>
  );
}
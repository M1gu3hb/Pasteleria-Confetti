import React from 'react';
import { Input } from '@/components/ui/input';

// InputDinero — input de dinero que SÍ se puede vaciar por completo.
// El bug clásico (no poder borrar el último dígito) ocurre cuando el `value`
// se fuerza a número y el `onChange` coerce con `|| 0`. Aquí mantenemos el
// TEXTO CRUDO mientras se edita (permitiendo ''), y el padre coerce a número
// solo al guardar / onBlur. `onChange(rawString)` recibe el string tal cual.
export default function InputDinero({ value, onChange, ...props }) {
  const shown = value === null || value === undefined ? '' : String(value);
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={shown}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}

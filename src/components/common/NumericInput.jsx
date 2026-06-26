import React from 'react';
import { Input } from '@/components/ui/input';

/**
 * NumericInput — input numérico permisivo.
 *
 * Resuelve el bug "no me deja escribir" en iOS/Android/PC con type="number":
 *   - filtros agresivos de coma/punto,
 *   - foco que se rompe al re-renderizar,
 *   - pegado con espacios.
 *
 * Estrategia:
 *   - type="text" + inputMode="decimal" (teclado numérico en móvil sin bloquear teclas).
 *   - Permite escribir TEMPORALMENTE: "", "0", ".", "0.", "1.5", "1,5".
 *   - La validación/parseo se hace al guardar (no en cada tecla).
 *   - Reemplaza coma por punto al onChange para que parseFloat siempre funcione.
 *   - No fuerza Number() ni recorta ceros mientras el usuario escribe.
 *
 * Props: igual que <Input/> de shadcn. Pasa todo lo que no usemos.
 */
export default function NumericInput({ value, onChange, allowNegative = false, ...rest }) {
  const handleChange = (e) => {
    let v = e?.target?.value ?? '';
    // Reemplazar coma por punto (algunos teclados móviles ponen ,)
    v = String(v).replace(',', '.');
    // Permitir vacío, signo negativo opcional, dígitos y un solo punto
    const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    if (v === '' || re.test(v)) {
      // Propagar como string crudo. El padre decide cuándo parsearlo.
      if (typeof onChange === 'function') {
        onChange({ ...e, target: { ...e.target, value: v } });
      }
    }
    // Si no matchea: silenciamos el cambio (no bloqueamos teclado, solo no aceptamos).
  };
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value ?? ''}
      onChange={handleChange}
      {...rest}
    />
  );
}
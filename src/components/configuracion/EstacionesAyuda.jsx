import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

/**
 * Bloque pequeño y discreto de ayuda contextual para Estaciones.
 * No es un sistema global de tutoriales — solo aquí.
 */
export default function EstacionesAyuda() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span>¿Cómo funcionan las estaciones?</span>
        <ChevronDown
          className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <p>
            Las estaciones sirven para separar los pedidos por área de preparación.
            Por ejemplo: las bebidas pueden ir a <strong>Barra</strong>, los postres
            a <strong>Postres</strong> y los alimentos a <strong>Cocina</strong>.
          </p>
          <p>
            Pasos:
          </p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Crea tus estaciones (Barra, Postres, Barbacoa, etc.).</li>
            <li>Asigna cada categoría de producto a una estación.</li>
            <li>Las categorías sin estación van a <strong>Cocina general</strong>.</li>
          </ol>
          <p className="pt-1">
            <strong>Importante:</strong> en esta versión la cocina sigue funcionando
            como hoy. En la siguiente actualización cada usuario de cocina podrá ver
            solo los pedidos de su estación.
          </p>
        </div>
      )}
    </div>
  );
}
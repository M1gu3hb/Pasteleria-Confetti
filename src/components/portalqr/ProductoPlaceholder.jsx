import React from 'react';
import { Coffee, IceCream, Pizza, Salad, Beer, Soup, UtensilsCrossed, Cookie, Sandwich, Wine } from 'lucide-react';

// Mapa categoría → { gradiente, icono }. No depende de servicios externos.
const MAPA = [
  { kws: ['cafe', 'café', 'capuchino', 'latte', 'espresso'], grad: ['#6B4226', '#3D2419'], Icon: Coffee },
  { kws: ['bebida', 'refresco', 'jugo', 'agua', 'cerveza', 'beer'], grad: ['#1E5FCF', '#0F3F8F'], Icon: Beer },
  { kws: ['vino', 'copas', 'tinto', 'blanco'], grad: ['#7A1B2F', '#4A0E1A'], Icon: Wine },
  { kws: ['postre', 'dulce', 'pastel', 'flan', 'cheesecake', 'helado', 'nieve'], grad: ['#D946AB', '#7A1F61'], Icon: IceCream },
  { kws: ['galleta', 'cookie', 'pan', 'panqu'], grad: ['#B45309', '#7C3D04'], Icon: Cookie },
  { kws: ['ensalada', 'verdura'], grad: ['#3F6212', '#1F3608'], Icon: Salad },
  { kws: ['sopa', 'caldo', 'crema'], grad: ['#E68A33', '#8C4A14'], Icon: Soup },
  { kws: ['pizza'], grad: ['#E63946', '#8C1E26'], Icon: Pizza },
  { kws: ['hamburguesa', 'sandwich', 'torta', 'baguette'], grad: ['#B45309', '#7C3D04'], Icon: Sandwich },
];

function resolverEstilo(producto, categoriaNombre) {
  const txt = `${producto?.nombre || ''} ${producto?.categoria_nombre || categoriaNombre || ''} ${producto?.descripcion || ''}`.toLowerCase();
  for (const m of MAPA) {
    if (m.kws.some(k => txt.includes(k))) return m;
  }
  return { grad: ['#475569', '#1e293b'], Icon: UtensilsCrossed };
}

/**
 * Placeholder visual para productos del Portal QR sin imagen.
 * Sin APIs externas. Estilo basado en categoría/keywords del producto.
 */
export default function ProductoPlaceholder({ producto, categoriaNombre, className = '' }) {
  const { grad, Icon } = resolverEstilo(producto, categoriaNombre);
  const inicial = (producto?.nombre || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className={`w-full h-32 flex items-center justify-center relative overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.2) 0%, transparent 50%)',
        }}
      />
      <Icon className="w-12 h-12 text-white/80 absolute" strokeWidth={1.5} />
      <span className="absolute bottom-2 right-3 text-white font-heading font-black text-2xl opacity-30 leading-none">
        {inicial}
      </span>
    </div>
  );
}
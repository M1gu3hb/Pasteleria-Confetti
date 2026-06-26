import React, { useRef, useEffect } from 'react';
import { Eraser, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * CanvasDibujo — lienzo blanco con trazo negro para dibujar el diseño del
 * pastel con dedo (tablet) o mouse. Al guardar, devuelve un PNG base64 vía
 * onGuardar(dataUrl) que el formulario almacena en imagen_referencia_url.
 *
 * Estable: el canvas se inicializa una sola vez (fondo blanco) y los eventos
 * touch usan preventDefault para no hacer scroll mientras se dibuja.
 */
export default function CanvasDibujo({ onGuardar }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  // Inicializa el canvas con fondo blanco (para que se imprima bien).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Resolución interna fija para trazos nítidos.
    canvas.width = 600;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Convierte coordenadas de pantalla a coordenadas internas del canvas.
  const getPos = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const start = (clientX, clientY) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    isDrawing.current = true;
    const { x, y } = getPos(clientX, clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (clientX, clientY) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(clientX, clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => { isDrawing.current = false; };

  const borrar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const guardar = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      onGuardar?.(dataUrl);
      toast.success('Dibujo guardado como referencia');
    } catch (err) {
      console.error('[CanvasDibujo] guardar:', err);
      toast.error('No se pudo guardar el dibujo');
    }
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border-2 border-border bg-white touch-none cursor-crosshair"
        style={{ height: 280 }}
        onMouseDown={e => start(e.clientX, e.clientY)}
        onMouseMove={e => move(e.clientX, e.clientY)}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={e => { e.preventDefault(); const t = e.touches[0]; if (t) start(t.clientX, t.clientY); }}
        onTouchMove={e => { e.preventDefault(); const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }}
        onTouchEnd={e => { e.preventDefault(); end(); }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={borrar}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          <Eraser className="w-4 h-4" /> Borrar
        </button>
        <button
          type="button"
          onClick={guardar}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-primary bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
        >
          <Check className="w-4 h-4" /> Guardar dibujo
        </button>
      </div>
    </div>
  );
}
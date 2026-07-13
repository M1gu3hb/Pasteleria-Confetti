import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Printer, Info } from 'lucide-react';
import { printDocument } from '@/lib/print';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import TicketPastelConfetti from '@/components/pedidos/TicketPastelConfetti';

/**
 * Sección "Impresora térmica" (Configuración → Operación).
 *
 * - Ancho de papel: 58mm (default) u 80mm. Es solo el valor del form; el guardado
 *   lo hace la pantalla padre (saveBiz) junto al resto de Operación.
 * - Botones de PRUEBA: renderizan un ticket de ejemplo (oculto) y lo imprimen por
 *   el helper térmico (mismo camino real: iframe + @page → AirPrint en iPad).
 * - Guía para iPad (AirPrint).
 *
 * No toca dinero ni RLS. Datos de los tickets 100% simulados.
 */

// Ticket de VENTA de ejemplo (para PreCuentaTicket).
const VENTA_DEMO = {
  folio: 'A-PRUEBA-001',
  fecha_cierre: new Date().toISOString(),
  estado: 'pagada',
  cliente_nombre: 'Cliente de prueba',
  usuario_cajero_nombre: 'Cajero',
  metodo_pago: 'efectivo',
  monto_efectivo: 180,
  total: 180,
  subtotal: 180,
};
const DETALLES_DEMO = [
  { producto_nombre: 'Rebanada de pastel', cantidad: 2, subtotal: 120 },
  { producto_nombre: 'Gelatina individual', cantidad: 1, subtotal: 60 },
];

// Pedido de PASTEL de ejemplo (para TicketPastelConfetti). requiere_entrega=true
// para que también se vea el bloque "PIDIERON ENTREGA A DOMICILIO".
const PEDIDO_DEMO = {
  folio: 'PP-PRUEBA-001',
  created_date: new Date().toISOString(),
  tipo_pedido: 'pastel_personalizado',
  cliente_nombre: 'Cliente de prueba',
  cliente_telefono: '55 1234 5678',
  fecha_entrega: '2026-07-10',
  hora_entrega: '14:00',
  kilos: 2,
  personas_estimadas: 15,
  concepto: 'Pastel de chocolate',
  rellenos: 'Fresas con crema',
  decorado: 'Flores de fondant',
  leyenda_pastel: 'Feliz Cumpleaños',
  subtotal_pastel: 700,
  incluye_base: false,
  precio_base: 0,
  total_final: 700,
  a_cuenta: 300,
  saldo_pendiente: 400,
  requiere_entrega: true,
  cliente_direccion: 'Av. Ejemplo 123, Col. Centro, Xochimilco',
};

export default function ImpresoraTermicaSection({ ancho = '58', onChangeAncho, config }) {
  const anchoActual = ancho === '80' ? '80' : '58';
  const [prueba, setPrueba] = useState(null); // 'venta' | 'pastel' | null

  // Al pedir una prueba: se renderiza el ticket oculto (abajo) y, tras un tick
  // para que exista en el DOM, se imprime por el helper. Se pasa widthMm para
  // que la prueba respete el ancho SELECCIONADO aunque aún no se guarde.
  useEffect(() => {
    if (!prueba) return;
    let vivo = true;
    // FASE C (v1.1.1): el reset del botón depende de la PROMESA real de impresión, NO de
    // un timer fijo. Antes se reseteaba a los 2.6s aunque la impresión tardara ~1min
    // (feedback falso). Ahora `finally` resetea al RESOLVER/RECHAZAR la promesa; `vivo`
    // evita setState tras desmontar. Mientras `prueba` esté activo el botón está disabled.
    const tPrint = setTimeout(() => {
      printDocument({
        mode: 'thermal',
        title: prueba === 'venta' ? 'Prueba de venta' : 'Prueba de pastel',
        widthMm: anchoActual === '80' ? 80 : 58,
      })
        .catch(() => { /* el helper ya avisó con un toast */ })
        .finally(() => { if (vivo) setPrueba(null); });
    }, 180);
    // Failsafe LARGO (60s) por si la promesa NUNCA resolviera (no el 2.6s viejo, que mentía).
    const tFailsafe = setTimeout(() => { if (vivo) setPrueba(null); }, 60000);
    return () => { vivo = false; clearTimeout(tPrint); clearTimeout(tFailsafe); };
  }, [prueba, anchoActual]);

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-heading font-bold text-base flex items-center gap-2">
          <Printer className="w-4 h-4" /> Impresora térmica
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ancho del papel del rollo. Afecta cómo se imprimen los tickets.
        </p>
      </div>

      {/* Ancho de papel: 58 / 80 */}
      <div>
        <p className="text-sm font-semibold mb-1.5">Ancho de papel</p>
        <div className="flex gap-2">
          {['58', '80'].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChangeAncho?.(w)}
              className={`flex-1 h-11 rounded-xl border font-bold transition ${
                anchoActual === w
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted text-muted-foreground hover:border-primary/40'
              }`}
            >
              {w} mm{w === '58' ? ' (recomendado)' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Botones de prueba */}
      <div>
        <p className="text-sm font-semibold mb-1.5">Imprimir prueba</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="flex-1 h-11" disabled={!!prueba}
            onClick={() => setPrueba('venta')}>
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir prueba (venta)
          </Button>
          <Button variant="outline" className="flex-1 h-11" disabled={!!prueba}
            onClick={() => setPrueba('pastel')}>
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir prueba (pastel)
          </Button>
        </div>
      </div>

      {/* Guía iPad / AirPrint */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
        <p className="font-semibold flex items-center gap-1.5 text-blue-800 dark:text-blue-200">
          <Info className="w-4 h-4" /> Cómo imprimir en iPad (AirPrint)
        </p>
        <ol className="list-decimal ml-5 mt-1.5 space-y-1 text-blue-900/90 dark:text-blue-100/90 text-[13px]">
          <li>Conecta la impresora a la <b>misma red WiFi</b> que el iPad (debe ser una impresora <b>AirPrint</b>).</li>
          <li>Toca <b>Imprimir</b> en un ticket: iOS abre su diálogo de impresión.</li>
          <li>Elige tu impresora en <b>“Impresora”</b> y toca <b>Imprimir</b>.</li>
          <li>Verifica que el <b>ancho</b> de arriba (58/80 mm) coincida con tu rollo.</li>
        </ol>
        <p className="mt-2 text-[12px] text-blue-900/80 dark:text-blue-100/80">
          En iPad (Safari) se requiere una impresora <b>AirPrint/WiFi</b>; en Android funciona con más impresoras.
          Si el ticket sale recortado, revisa que el ancho sea <b>58 mm</b> y que elegiste la impresora correcta.
        </p>
      </div>

      {/* Tickets de ejemplo OCULTOS: solo el seleccionado está en el DOM al
          imprimir, para que el helper tome el ticket correcto. */}
      <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '80mm' }} aria-hidden="true">
        {prueba === 'venta' && (
          <PreCuentaTicket venta={VENTA_DEMO} detalles={DETALLES_DEMO} mesa={null} config={config} esFinal />
        )}
        {prueba === 'pastel' && (
          <TicketPastelConfetti pedido={PEDIDO_DEMO} config={config} />
        )}
      </div>
    </Card>
  );
}

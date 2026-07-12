import React, { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Printer, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { getPrinterConfig, setPrinterConfig } from '@/native/printerConfig';
import { imprimirTicketNativo, imprimirCorteTermico } from '@/native/printTicket';
import { listarDispositivosUSB } from '@/native/confettiPrinter';
import { abrirCajon } from '@/native/cajon';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import CorteTicketTermico from '@/components/tickets/CorteTicketTermico';

/**
 * "Impresora y cajón (app)" — Configuración → Operación (Fase 6).
 *
 * Selecciona y PRUEBA en sitio: conexión (USB/Ethernet), modo (imagen/texto),
 * cajón y formato de corte. Cada cambio se guarda en printerConfig (LOCAL por
 * dispositivo, localStorage — NO en la config compartida de Supabase).
 *
 * 🔒 GATE: la sección es FUNCIONAL solo dentro del APK (Capacitor.isNativePlatform()).
 * En el NAVEGADOR se muestra DESHABILITADA con una nota (para no confundir a Abel y
 * no tocar el flujo del navegador). NO toca dinero/RLS/tickets/print.js del navegador.
 * `previewNativo` es solo para capturas de layout (no cambia el gate real de las pruebas).
 */

// Datos 100% simulados para las pruebas.
const VENTA_DEMO = {
  folio: 'A-PRUEBA-001', fecha_cierre: new Date().toISOString(), estado: 'pagada',
  cliente_nombre: 'Cliente de prueba', usuario_cajero_nombre: 'Cajero',
  metodo_pago: 'efectivo', monto_efectivo: 180, total: 180, subtotal: 180,
};
const DETALLES_DEMO = [
  { producto_nombre: 'Rebanada de pastel', cantidad: 2, subtotal: 120 },
  { producto_nombre: 'Gelatina individual', cantidad: 1, subtotal: 60 },
];
const CORTE_DEMO = {
  corte: {
    folio: 'C-PRUEBA-001', fecha_inicio: new Date().toISOString(), fecha_cierre: new Date().toISOString(),
    usuario_cajero_nombre: 'Cajero', estado: 'cerrado', tipo_corte: 'cierre_diario',
    fondo_esperado_apertura: 500, efectivo_inicial_contado: 500, diferencia_apertura: 0,
    efectivo_contado: 680, diferencia_efectivo: 0, dinero_dejado_en_caja: 500,
    total_general: 180, numero_ventas: 1, ticket_promedio: 180,
    total_efectivo: 180, total_tarjeta: 0, total_transferencia: 0, total_gastos: 0, total_propinas: 0,
  },
  ventas: [{ id: 'x', folio: 'A-PRUEBA-001', fecha_cierre: new Date().toISOString(), total: 180, estado: 'pagada', metodo_pago: 'efectivo', monto_efectivo: 180 }],
  detalles: [{ venta_id: 'x', producto_nombre: 'Rebanada de pastel', cantidad: 2, subtotal: 120 }],
};

export default function ImpresoraCajonAppSection({ config, previewNativo }) {
  const nativo = (previewNativo != null) ? previewNativo : Capacitor.isNativePlatform();
  const [cfg, setCfg] = useState(() => getPrinterConfig());
  const [probando, setProbando] = useState(null);
  const [res, setRes] = useState({});
  // FIX B (selección de impresora USB): dispositivos detectados + estado del botón "Detectar".
  const [dispositivosUSB, setDispositivosUSB] = useState([]);
  const [detectandoUSB, setDetectandoUSB] = useState(false);
  const [usbErr, setUsbErr] = useState(null);
  const ventaRef = useRef(null);
  const corteRef = useRef(null);

  const actualizar = (patch) => setCfg(setPrinterConfig(patch));

  // FIX B: enumera las impresoras USB conectadas para elegir una (requiere el APK actualizado).
  const detectarUSB = async () => {
    setDetectandoUSB(true);
    setUsbErr(null);
    try {
      const r = await listarDispositivosUSB();
      const lista = Array.isArray(r?.dispositivos) ? r.dispositivos : [];
      setDispositivosUSB(lista);
      if (lista.length === 0) setUsbErr('No se detectaron dispositivos USB. Conecta la impresora y reintenta.');
    } catch (e) {
      setUsbErr((e && e.message) || 'No se pudo detectar (actualiza la app a la última versión).');
    } finally {
      setDetectandoUSB(false);
    }
  };

  const correr = async (key, fn) => {
    setProbando(key);
    setRes((r) => ({ ...r, [key]: null }));
    try {
      await fn();
      setRes((r) => ({ ...r, [key]: { ok: true, msg: 'Enviado.' } }));
    } catch (e) {
      setRes((r) => ({ ...r, [key]: { ok: false, msg: (e && e.message) || 'No salió.' } }));
    } finally {
      setProbando(null);
    }
  };

  const probarImpresion = () => correr('impresion', () =>
    imprimirTicketNativo({ title: 'Prueba de impresión', node: ventaRef.current?.querySelector('.ticket-printable'), anchoImpresora: config?.ancho_impresora }));
  const probarCajon = () => correr('cajon', () => abrirCajon(cfg.metodoCajon));
  const probarCorte = () => correr('corte', () =>
    imprimirCorteTermico(corteRef.current?.querySelector('.corte-termico'), config?.ancho_impresora));

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-heading font-bold text-base flex items-center gap-2">
          <Printer className="w-4 h-4" /> Impresora y cajón (app)
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ajustes de ESTA tablet. Se guardan en el dispositivo (no en la nube). El ancho 58/80 se ajusta arriba.
        </p>
      </div>

      {!nativo && (
        <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
          🔒 Solo disponible en la <strong>app instalada</strong> (APK). Aquí en el navegador esta sección es informativa; las pruebas y el guardado aplican en la tablet.
        </div>
      )}

      <Seg label="Conexión de impresora" value={cfg.conexion} disabled={!nativo}
        onChange={(v) => actualizar({ conexion: v })}
        options={[{ v: 'usb', t: 'USB' }, { v: 'tcp', t: 'Ethernet (IP)' }]} />
      {cfg.conexion === 'tcp' && (
        <div className="flex gap-2">
          <Input placeholder="IP (ej. 192.168.1.50)" value={cfg.ip} disabled={!nativo}
            onChange={(e) => actualizar({ ip: e.target.value })} />
          <Input placeholder="Puerto" value={cfg.puerto} disabled={!nativo} className="w-24"
            onChange={(e) => actualizar({ puerto: Number(e.target.value) || 9100 })} />
        </div>
      )}

      {/* FIX B: elegir la impresora USB (por si hay varias). "Detectar" lista las conectadas; la
          elegida se persiste (usbVendorId/productId) y la usa la ruta de impresión. Sin elección
          → primera conectada (byte-idéntico). "Detectar" requiere el APK actualizado. */}
      {cfg.conexion === 'usb' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-10" onClick={detectarUSB} disabled={!nativo || detectandoUSB}>
              {detectandoUSB ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
              Detectar impresoras USB
            </Button>
            <span className="text-xs text-muted-foreground">
              {cfg.usbNombre ? <>Elegida: <strong>{cfg.usbNombre}</strong></> : 'Sin elegir (usa la primera conectada)'}
            </span>
            {cfg.usbVendorId != null && (
              <button type="button" disabled={!nativo}
                onClick={() => actualizar({ usbVendorId: null, usbProductId: null, usbNombre: '' })}
                className="text-xs text-muted-foreground underline hover:text-foreground">
                Quitar elección
              </button>
            )}
          </div>
          {dispositivosUSB.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {/* Las que exponen interfaz de impresora se muestran primero y con 🖨️ (las demás
                  siguen elegibles: algunas ESC/POS no se enumeran como printer-class). */}
              {[...dispositivosUSB]
                .sort((a, b) => (b.esImpresora ? 1 : 0) - (a.esImpresora ? 1 : 0))
                .map((d) => {
                  const elegido = cfg.usbVendorId === d.vendorId && cfg.usbProductId === d.productId;
                  return (
                    <button
                      key={`${d.vendorId}:${d.productId}:${d.deviceName}`}
                      type="button"
                      disabled={!nativo}
                      onClick={() => actualizar({ usbVendorId: d.vendorId, usbProductId: d.productId, usbNombre: d.nombre })}
                      className={`min-w-[140px] h-11 px-3 rounded-xl border font-semibold text-sm transition ${
                        elegido
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {d.nombre}
                      {d.esImpresora && <span className="ml-1 text-[11px] opacity-70" title="Interfaz de impresora">🖨️</span>}
                    </button>
                  );
                })}
            </div>
          )}
          {usbErr && <p className="text-xs text-red-600">{usbErr}</p>}
        </div>
      )}

      <Seg label="Modo de impresión" value={cfg.modo} disabled={!nativo}
        onChange={(v) => actualizar({ modo: v })}
        options={[{ v: 'imagen', t: 'Imagen (recomendado)' }, { v: 'texto', t: 'Texto ESC/POS' }]} />
      {/* Deshabilita TODAS las pruebas mientras UNA corre: comparten una sola conexión nativa
          (this.connection); solaparlas la enredaría. */}
      <TestBtn label="Probar impresión" onClick={probarImpresion} running={probando === 'impresion'} res={res.impresion} disabled={!nativo || probando !== null} />

      <Seg label="Cajón de dinero" value={cfg.metodoCajon} disabled={!nativo}
        onChange={(v) => actualizar({ metodoCajon: v })}
        options={[{ v: 'ninguno', t: 'Ninguno' }, { v: 'usb_trigger', t: 'Disparador USB' }, { v: 'kick_impresora', t: 'Kick impresora' }]} />
      <TestBtn label="Probar cajón" onClick={probarCajon} running={probando === 'cajon'} res={res.cajon} disabled={!nativo || probando !== null} />

      <Seg label="Formato del corte de caja" value={cfg.formatoCorte} disabled={!nativo}
        onChange={(v) => actualizar({ formatoCorte: v })}
        options={[{ v: 'pdf', t: 'PDF (carta)' }, { v: 'termico', t: 'Térmico' }]} />
      <TestBtn label="Probar corte" onClick={probarCorte} running={probando === 'corte'} res={res.corte}
        disabled={!nativo || probando !== null || cfg.formatoCorte !== 'termico'}
        nota={cfg.formatoCorte !== 'termico' ? 'Cambia el formato a Térmico para probar.' : null} />

      {/* Tickets ocultos SOLO en el APK, para que las pruebas tengan qué imprimir. */}
      {nativo && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0 }} aria-hidden>
          <div ref={ventaRef}><PreCuentaTicket venta={VENTA_DEMO} detalles={DETALLES_DEMO} config={config} esFinal /></div>
          <div ref={corteRef}><CorteTicketTermico {...CORTE_DEMO} gastos={[]} ingredientes={[]} cancelaciones={[]} detallesCancel={[]} alertas={[]} entregas={[]} config={config} isEsencial /></div>
        </div>
      )}
    </Card>
  );
}

function Seg({ label, value, options, onChange, disabled }) {
  return (
    <div className={disabled ? 'opacity-70' : ''}>
      <p className="text-sm font-semibold mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={`flex-1 min-w-[110px] h-11 px-2 rounded-xl border font-bold text-sm transition ${
              value === o.v
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-muted text-muted-foreground hover:border-primary/40'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

function TestBtn({ label, onClick, running, res, disabled, nota }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="h-10" onClick={onClick} disabled={disabled || running}>
          {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
          {label}
        </Button>
        {res && (
          res.ok
            ? <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> ✅ salió</span>
            : <span className="text-sm text-red-600 flex items-center gap-1"><XCircle className="w-4 h-4" /> ❌ no salió</span>
        )}
      </div>
      {res && !res.ok && res.msg && <p className="text-xs text-red-600 mt-1">{res.msg}</p>}
      {nota && <p className="text-xs text-muted-foreground mt-1">{nota}</p>}
    </div>
  );
}

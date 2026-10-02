import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Download, Loader2 } from 'lucide-react';
import { cargarDatosCorte } from '@/lib/datosCorte';
import { useConfig } from '@/lib/ConfigContext';
import { downloadNodeAsPDF, printNodeAsPDF, safeFileName } from '@/lib/pdfDownload';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import CorteTicket from '@/components/tickets/CorteTicket';
import CorteTicketTermico from '@/components/tickets/CorteTicketTermico';
import { getPrinterConfig } from '@/native/printerConfig';
import { imprimirCorteTermico } from '@/native/printTicket';

export default function CorteViewerDialog({ corte, open, onClose }) {
  const { config, paquete_modo } = useConfig();
  const isEsencial = paquete_modo === 'esencial';
  const isRP = paquete_modo === 'restaurante_pro';
  const ticketRef = useRef(null);
  const termicoRef = useRef(null);
  // Ocupado = hay una impresión o una descarga en curso. Es un ref, no state,
  // porque tiene que verse en el MISMO tick que el segundo clic.
  const ocupadoRef = useRef(false);
  const [downloading, setDownloading] = useState(false);

  const corteId = corte?.id || null;
  const corteSucId = corte?.sucursal_id || null;

  // ── Carga ROBUSTA y ESTABLE del corte (B1/B2/B5) ──
  // queryKey incluye corte.id → nunca reutiliza cache de otro corte.
  // Filtra ESTRICTAMENTE: corte_caja_id === corte.id Y (si el corte tiene
  // sucursal) sucursal_id === corte.sucursal_id Y estado === 'pagada'.
  // Cero contaminación entre cortes/sucursales.
  const { data, isPending, error: errorDatos, refetch } = useQuery({
    queryKey: ['pdf_corte', corteId, corteSucId],
    enabled: !!(open && corteId),
    staleTime: 0,
    queryFn: () => cargarDatosCorte(corte),
  });

  // Estado hidratado único (preview Y descarga usan EXACTAMENTE esto).
  const safeData = data || { ventas: [], detalles: [], gastos: [], ingredientes: [], cancelaciones: [], detallesCancel: [], alertas: [], entregas: [] };
  const loading = isPending && open && !!corteId;

  // === Imprimir — usa EL MISMO PDF que se descargaría.
  // Generamos el blob (mismo render que el preview, paginado carta real),
  // y lo imprimimos vía iframe offscreen visible. Así NUNCA imprime el POS
  // completo, modal vacío ni hoja en blanco: imprime el PDF real.
  const handlePrintCashCut = async () => {
    // GUARDA DE REENTRADA. El botón sólo llevaba `disabled={loading || !!errorDatos}`, y
    // `loading` es únicamente el `isPending` de la query: una vez cargados los
    // datos vale false DURANTE TODA la impresión. Su botón hermano (Descargar)
    // ya tenía `disabled={loading || downloading || !!errorDatos}`; a éste se le olvidó.
    // El ref hace falta además del state porque `setDownloading` no se ve hasta
    // el siguiente render y un doble toque rápido entra dos veces.
    if (ocupadoRef.current) return;
    if (loading || errorDatos) {
      toast.info('Espera a que termine de prepararse el PDF.');
      return;
    }
    ocupadoRef.current = true;
    try {
      await ejecutarImpresionCorte();
    } finally {
      ocupadoRef.current = false;
    }
  };

  const ejecutarImpresionCorte = async () => {
    // Ruta TÉRMICA (SOLO en el APK y si la config del corte es 'termico'):
    // imprime el corte por la impresora ESC/POS reusando los MISMOS datos que el
    // PDF (CorteTicketTermico). En el NAVEGADOR esto nunca corre → la ruta PDF
    // de abajo queda idéntica.
    if (getPrinterConfig().formatoCorte === 'termico' && Capacitor.isNativePlatform()) {
      if (!termicoRef.current) {
        toast.error('No se encontró el corte para imprimir');
        return;
      }
      setDownloading(true);
      try {
        await imprimirCorteTermico(termicoRef.current, config?.ancho_impresora);
      } catch (err) {
        console.error('[CorteViewerDialog] corte térmico:', err);
        // imprimirCorteTermico ya muestra el toast del error.
      } finally {
        setDownloading(false);
      }
      return;
    }
    // Ruta PDF (navegador / default) — EXACTAMENTE como antes.
    if (!ticketRef.current) {
      toast.error('No se encontró el contenido para imprimir');
      return;
    }
    setDownloading(true);
    try {
      await printNodeAsPDF(ticketRef.current, `Corte-${corte?.folio || ''}`);
    } catch (err) {
      console.error('[CorteViewerDialog] Error imprimiendo PDF:', err);
      toast.error('No se pudo preparar la impresión. Intenta descargar el PDF.');
    } finally {
      setDownloading(false);
    }
  };

  // === Descargar PDF (NO abre imprimir) ===
  const handleDownloadCashCutPDF = async () => {
    if (ocupadoRef.current) return;   // no solapar con la impresión ni consigo misma
    if (loading || errorDatos) {
      toast.info('Espera a que termine de prepararse el PDF.');
      return;
    }
    if (!ticketRef.current) {
      toast.error('No se encontró el contenido para generar el PDF');
      return;
    }
    // FALLO DE MI PROPIO PARCHE DE HACE UN RATO: aquí se LEÍA `ocupadoRef` pero
    // nunca se PONÍA, así que la guarda cubría Imprimir↔Descargar e
    // Imprimir↔Imprimir, pero NO Descargar↔Descargar. Dos toques rápidos en
    // "Descargar" seguían generando dos PDF del mismo corte.
    ocupadoRef.current = true;
    setDownloading(true);
    try {
      const fecha = corte?.fecha_cierre ? format(new Date(corte.fecha_cierre), 'yyyyMMdd') : format(new Date(), 'yyyyMMdd');
      const negocio = safeFileName(config?.nombre_negocio || config?.platform_brand || 'MH-Astral-Systems');
      const folio = safeFileName(corte?.folio || 'corte');
      const filename = `Corte_${folio}_${fecha}_${negocio}.pdf`;
      await downloadNodeAsPDF(ticketRef.current, filename);
      toast.success('PDF descargado');
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('No se pudo generar el PDF');
    } finally {
      ocupadoRef.current = false;
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="no-print px-6 pt-5 pb-3 border-b sticky top-0 bg-white z-10 flex-row items-center justify-between">
          <DialogTitle className="font-heading">PDF de corte · {corte?.folio}</DialogTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePrintCashCut} disabled={loading || downloading || !!errorDatos} aria-busy={downloading}>
              {downloading
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Imprimiendo…</>
                : <><Printer className="w-4 h-4 mr-1" /> Imprimir / PDF</>}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadCashCutPDF} disabled={loading || downloading || !!errorDatos}>
              {downloading
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Download className="w-4 h-4 mr-1" />}
              Descargar
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="p-4 bg-gray-100">
          {loading ? (
            <p className="text-center py-12 text-muted-foreground">Preparando PDF de corte…</p>
          ) : errorDatos ? (
            <div className="text-center py-8"><p>No se pudo verificar el corte. {errorDatos.message}</p><button className="mt-2 underline" onClick={() => { void refetch(); }}>Reintentar</button></div>
          ) : (
            <>
              <CorteTicket
                ref={ticketRef}
                corte={safeData.corte || corte}
                ventas={safeData.ventas}
                detalles={safeData.detalles}
                gastos={safeData.gastos}
                abonos={safeData.abonos || []}
                ingredientes={safeData.ingredientes}
                cancelaciones={safeData.cancelaciones}
                detallesCancel={safeData.detallesCancel}
                alertas={safeData.alertas}
                entregas={safeData.entregas}
                config={config}
                isEsencial={isEsencial}
                isRP={isRP}
              />
              {/* Corte TÉRMICO — SOLO se renderiza dentro del APK, fuera de
                  pantalla, para rasterizarlo al imprimir. En el navegador NO se
                  renderiza (isNativePlatform=false) → DOM/preview idéntico. */}
              {Capacitor.isNativePlatform() && (
                <div style={{ position: 'fixed', left: '-10000px', top: 0 }} aria-hidden>
                  <CorteTicketTermico
                    ref={termicoRef}
                    corte={safeData.corte || corte}
                    ventas={safeData.ventas}
                    detalles={safeData.detalles}
                    gastos={safeData.gastos}
                    abonos={safeData.abonos || []}
                    ingredientes={safeData.ingredientes}
                    cancelaciones={safeData.cancelaciones}
                    detallesCancel={safeData.detallesCancel}
                    alertas={safeData.alertas}
                    entregas={safeData.entregas}
                    config={config}
                    isEsencial={isEsencial}
                    isRP={isRP}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

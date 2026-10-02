import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargarDatosCorte } from '@/lib/datosCorte';
import { useConfig } from '@/lib/ConfigContext';
import { downloadNodeAsPDF, safeFileName } from '@/lib/pdfDownload';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import CorteTicket from '@/components/tickets/CorteTicket';

/**
 * Renderiza el CorteTicket fuera de pantalla, genera el PDF y lo descarga.
 * Si el navegador bloquea, expone un botón visible para reintentar.
 */
export default function CorteAutoDownloader({ corte, onDone }) {
  const { config, paquete_modo } = useConfig();
  const isEsencial = paquete_modo === 'esencial';
  const isRP = paquete_modo === 'restaurante_pro';
  const ref = useRef(null);
  // Guarda de reentrada SÍNCRONA para que el disparo automático y el botón
  // manual no se pisen (el state llega tarde a un setTimeout).
  const enCursoRef = useRef(false);
  const [data, setData] = useState(null);
  const [reintento, setReintento] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  // Carga de datos del corte
  useEffect(() => {
    if (!corte) return;
    setData(null);
    setError(false);
    setDone(false);
    let cancelled = false;
    (async () => {
      try {
        const resultado = await cargarDatosCorte(corte);
        if (!cancelled) setData(resultado);
      } catch (e) {
        if (!cancelled) { setError(true); toast.error(`No se preparó el PDF: ${e.message}`); }
      }
    })();
    return () => { cancelled = true; };
  }, [corte, reintento]);

  const triggerDownload = async () => {
    if (!data) { setReintento(n => n + 1); return; }
    if (!ref.current) return;
    // GUARDA SÍNCRONA. El `downloading` de estado NO sirve aquí: el disparo
    // automático es un setTimeout de 300 ms y el botón manual ya está activo en
    // esa ventana, así que los dos podían entrar a la vez y generar DOS PDFs
    // idénticos. Un ref se ve al instante; un setState, no.
    if (enCursoRef.current) return;
    enCursoRef.current = true;
    setDownloading(true);
    setError(false);
    try {
      const fecha = corte?.fecha_cierre ? format(new Date(corte.fecha_cierre), 'yyyyMMdd') : format(new Date(), 'yyyyMMdd');
      const negocio = safeFileName(config?.nombre_negocio || config?.platform_brand || 'MH-Astral-Systems');
      const folio = safeFileName(corte?.folio || 'corte');
      await downloadNodeAsPDF(ref.current, `Corte_${folio}_${fecha}_${negocio}.pdf`);
      setDone(true);
      toast.success('PDF del corte descargado');
      // AVISAR AL PADRE. Antes esto sólo colgaba del botón "Listo", que era
      // INALCANZABLE (estaba anidado dentro de `{!done && …}`), así que `onDone`
      // no se llamaba nunca y `autoDownloadCorte` se quedaba puesto en Caja.jsx.
      // Consecuencia real, silenciosa: al cerrar un SEGUNDO corte sin salir de
      // /caja, el componente no se remontaba, `done` seguía en true, el efecto
      // no descargaba y el botón de rescate tampoco se mostraba -> el PDF de ese
      // corte y de todos los siguientes NO se descargaba y no había forma de
      // pedirlo. Se recuperaba sólo navegando fuera de /caja y volviendo.
      onDone?.();
    } catch (err) {
      console.error('Error generando PDF auto:', err);
      setError(true);
      toast.error('No se pudo descargar automáticamente. Usa el botón.');
    } finally {
      enCursoRef.current = false;
      setDownloading(false);
    }
  };

  // Auto-trigger una vez cargados los datos
  useEffect(() => {
    if (data && !done && !downloading && !error) {
      // pequeño delay para asegurar render del nodo
      const t = setTimeout(triggerDownload, 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      {/* Botón visible (fallback / reintento) */}
      {!done && (
        <div className="fixed bottom-6 right-6 z-[60] no-print">
          <Button onClick={triggerDownload} disabled={downloading || (!data && !error)} className="shadow-lg">
            {downloading
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generando PDF…</>
              : <><Download className="w-4 h-4 mr-1" /> Descargar PDF del corte</>}
          </Button>
        </div>
      )}

      {/* Escape manual. Vive FUERA del bloque `{!done && …}` a propósito: antes
          estaba DENTRO, o sea dentro de `!done && done`, una contradicción que
          lo hacía inalcanzable. Hoy el camino normal ya llama `onDone` solo al
          terminar la descarga, así que esto sólo se ve si algo dejó `done` en
          true sin que el padre se enterara: es la salida de rescate. */}
      {done && (
        <div className="fixed bottom-6 right-6 z-[60] no-print">
          <Button variant="ghost" size="sm" onClick={onDone}>Listo</Button>
        </div>
      )}

      {/* Render fuera de pantalla del ticket para captura */}
      {data && createPortal(
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', background: '#fff', zIndex: -1 }} aria-hidden>
          <CorteTicket
            ref={ref}
            corte={data.corte}
            ventas={data.ventas}
            detalles={data.detalles}
            gastos={data.gastos}
            abonos={data.abonos}
            ingredientes={data.ingredientes}
            cancelaciones={data.cancelaciones}
            detallesCancel={data.detallesCancel}
            alertas={data.alertas}
            entregas={data.entregas}
            config={config}
            isEsencial={isEsencial}
            isRP={isRP}
          />
        </div>,
        document.body
      )}
    </>
  );
}

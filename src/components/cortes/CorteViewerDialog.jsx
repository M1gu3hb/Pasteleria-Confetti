import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Download, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useConfig } from '@/lib/ConfigContext';
import { getStockStatus } from '@/utils/inventoryUtils';
import { obtenerEntregasDelCorte } from '@/utils/entregasCorte';
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
  const { data, isPending } = useQuery({
    queryKey: ['pdf_corte', corteId, corteSucId],
    enabled: !!(open && corteId),
    staleTime: 0,
    queryFn: async () => {
      const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
      const cierre = corte.fecha_cierre ? new Date(corte.fecha_cierre).getTime() : Date.now();

      // Ventas del corte: SIEMPRE filtradas por corte_caja_id. Pedimos a BD ya
      // acotado por corte. Doble verificación de sucursal en memoria.
      const ventasDelCorte = await base44.entities.Venta.filter(
        { corte_caja_id: corteId },
        '-fecha_cierre',
        2000
      ).catch(() => []);
      const ventasArr = Array.isArray(ventasDelCorte) ? ventasDelCorte : [];

      const mismaSucursal = (v) => !corteSucId || !v?.sucursal_id || v.sucursal_id === corteSucId;
      const ventasCorte = ventasArr.filter(v => v?.estado === 'pagada' && mismaSucursal(v));
      const cancelaciones = ventasArr.filter(v => v?.estado === 'cancelada' && mismaSucursal(v));

      // 5b — Incluimos también las ventas canceladas en la carga por LOTES de
      // DetalleVenta, para poder listar sus productos en la sección
      // "Cancelaciones". Reusamos EXACTAMENTE el mismo mecanismo $in (sin
      // consultas sueltas por venta). Las canceladas siguen fuera de todos los
      // totales (el total lee solo 'pagada'); esto es solo informativo.
      const ventaIds = ventasCorte.map(v => v.id);
      const cancelIds = cancelaciones.map(v => v.id);
      const todosLosIds = [...ventaIds, ...cancelIds];
      // Productos del corte = DetalleVenta de TODAS las ventas del corte.
      // FIX condición de carrera: antes hacíamos una consulta SUELTA por cada
      // venta (N requests con .catch(()=>[])). Si alguna fallaba por rate-limit
      // o timeout, devolvía [] en silencio → productos incompletos NO
      // deterministas que "se iban llenando" al reentrar (efecto caché).
      // Ahora: UNA consulta con venta_id $in [...] por LOTES de ids, esperada
      // por completo (sin tragar errores). Si un lote falla, se reintenta una
      // vez; si vuelve a fallar, se propaga para no mostrar datos parciales.
      const detalles = [];
      const ID_CHUNK = 50; // ids por consulta $in
      for (let i = 0; i < todosLosIds.length; i += ID_CHUNK) {
        const idsLote = todosLosIds.slice(i, i + ID_CHUNK);
        const fetchLote = async () => {
          // Paginamos el lote por si un grupo de ventas tiene muchos productos.
          const acc = [];
          let skip = 0;
          const LIMIT = 1000;
          // hasta 20 páginas por lote (20k líneas) — tope de seguridad.
          for (let p = 0; p < 20; p++) {
            const page = await base44.entities.DetalleVenta.filter(
              { venta_id: { $in: idsLote } }, '-created_date', LIMIT, skip
            );
            const arr = Array.isArray(page) ? page : [];
            acc.push(...arr);
            if (arr.length < LIMIT) break;
            skip += LIMIT;
          }
          return acc;
        };
        let loteData;
        try {
          loteData = await fetchLote();
        } catch (_) {
          // Un reintento antes de fallar — evita parciales por glitch puntual.
          loteData = await fetchLote();
        }
        detalles.push(...loteData);
      }

      // 5b — Separamos: 'detalles' (para Productos vendidos / Ingredientes /
      // ventas pagadas) debe contener SOLO líneas de ventas pagadas, igual que
      // antes. Las líneas de ventas canceladas van aparte ('detallesCancel'),
      // solo para listar productos en la sección Cancelaciones (informativo).
      const cancelIdSet = new Set(cancelIds);
      const detallesPagadas = detalles.filter(d => !cancelIdSet.has(d.venta_id));
      const detallesCancel = detalles.filter(d => cancelIdSet.has(d.venta_id));

      // Gastos / ingredientes / recetas (solo para Operativo/Pro). En Esencial
      // no se muestran, pero el cálculo es barato y no contamina ventas.
      const [allGastos, allDescuentos, allIngredientes, allRecetas] = await Promise.all([
        base44.entities.GastoOperativo.list('-created_date', 500).catch(() => []),
        base44.entities.DescuentoInventarioVenta.list('-created_date', 3000).catch(() => []),
        base44.entities.Ingrediente.list().catch(() => []),
        base44.entities.RecetaEscandallo.list('-created_date', 2000).catch(() => []),
      ]);

      const gastosCorte = (Array.isArray(allGastos) ? allGastos : []).filter(g => {
        // CAMBIOS_V2 Fase 07 — scoping exacto por corte_caja_id; legacy por fecha+sucursal.
        if (g?.corte_caja_id) return g.corte_caja_id === corteId;
        if (corteSucId && g?.sucursal_id && g.sucursal_id !== corteSucId) return false;
        const t = g?.created_date ? new Date(g.created_date).getTime() : 0;
        return t >= inicio && t <= cierre;
      });

      const ingMap = {};
      const ingArr = Array.isArray(allIngredientes) ? allIngredientes : [];
      const recArr = Array.isArray(allRecetas) ? allRecetas : [];
      const descArr = Array.isArray(allDescuentos) ? allDescuentos : [];
      const ingPorId = Object.fromEntries(ingArr.map(i => [i.id, i]));
      const descuentosCorte = descArr.filter(d => ventaIds.includes(d.venta_id));

      const addIng = (ingId, nombre, unidad, qty, costoUnit) => {
        if (!ingId || !qty) return;
        if (!ingMap[ingId]) ingMap[ingId] = { nombre, unidad, cantidad: 0, costoUnit: costoUnit || 0, costoTotal: 0 };
        ingMap[ingId].cantidad += qty;
        ingMap[ingId].costoTotal += qty * (costoUnit || 0);
      };

      if (descuentosCorte.length > 0) {
        descuentosCorte.forEach(d => {
          addIng(d.ingrediente_id, d.ingrediente_nombre, d.unidad_base,
            d.cantidad_total_descontada || 0, d.costo_unitario_snapshot || 0);
        });
      } else {
        detallesPagadas.forEach(det => {
          const recetaLines = recArr.filter(r => r.producto_id === det.producto_id && r.activo !== false);
          recetaLines.forEach(l => {
            const ing = ingPorId[l.ingrediente_id];
            if (!ing) return;
            const merma = 1 + ((l.merma_porcentaje || 0) / 100);
            const cantPorProd = (l.cantidad_convertida_unidad_base || 0) * merma;
            const totalCant = cantPorProd * (det.cantidad || 0);
            addIng(ing.id, ing.nombre, ing.unidad_base, totalCant, ing.costo_por_unidad_base || 0);
          });
        });
      }

      const ingredientesConsumidos = Object.values(ingMap).sort((a, b) => b.costoTotal - a.costoTotal);
      const alertas = ingArr
        .map(i => ({ ...i, status: getStockStatus(i) }))
        .filter(i => ['critico', 'agotado', 'bajo'].includes(i.status));

      // Fase 3 #6 — entregas del rango del corte (informativo, no toca totales).
      const entregas = await obtenerEntregasDelCorte({
        sucursalId: corteSucId,
        desde: corte.fecha_inicio,
        hasta: corte.fecha_cierre,
      }).catch(() => []);

      return {
        ventas: ventasCorte, detalles: detallesPagadas, gastos: gastosCorte,
        ingredientes: ingredientesConsumidos, cancelaciones, detallesCancel, alertas, entregas,
      };
    },
  });

  // Estado hidratado único (preview Y descarga usan EXACTAMENTE esto).
  const safeData = data || { ventas: [], detalles: [], gastos: [], ingredientes: [], cancelaciones: [], detallesCancel: [], alertas: [], entregas: [] };
  const loading = isPending && open && !!corteId;

  // === Imprimir — usa EL MISMO PDF que se descargaría.
  // Generamos el blob (mismo render que el preview, paginado carta real),
  // y lo imprimimos vía iframe offscreen visible. Así NUNCA imprime el POS
  // completo, modal vacío ni hoja en blanco: imprime el PDF real.
  const handlePrintCashCut = async () => {
    // GUARDA DE REENTRADA. El botón sólo llevaba `disabled={loading}`, y
    // `loading` es únicamente el `isPending` de la query: una vez cargados los
    // datos vale false DURANTE TODA la impresión. Su botón hermano (Descargar)
    // ya tenía `disabled={loading || downloading}`; a éste se le olvidó.
    // El ref hace falta además del state porque `setDownloading` no se ve hasta
    // el siguiente render y un doble toque rápido entra dos veces.
    if (ocupadoRef.current) return;
    if (loading) {
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
    if (loading) {
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
            <Button size="sm" onClick={handlePrintCashCut} disabled={loading || downloading} aria-busy={downloading}>
              {downloading
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Imprimiendo…</>
                : <><Printer className="w-4 h-4 mr-1" /> Imprimir / PDF</>}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadCashCutPDF} disabled={loading || downloading}>
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
          ) : (
            <>
              <CorteTicket
                ref={ticketRef}
                corte={corte}
                ventas={safeData.ventas}
                detalles={safeData.detalles}
                gastos={safeData.gastos}
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
                    corte={corte}
                    ventas={safeData.ventas}
                    detalles={safeData.detalles}
                    gastos={safeData.gastos}
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
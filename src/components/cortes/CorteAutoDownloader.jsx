import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { useConfig } from '@/lib/ConfigContext';
import { getStockStatus } from '@/utils/inventoryUtils';
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
  const [data, setData] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  // Carga de datos del corte
  useEffect(() => {
    if (!corte) return;
    let cancelled = false;
    (async () => {
      const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
      const cierre = corte.fecha_cierre ? new Date(corte.fecha_cierre).getTime() : Date.now();
      const corteId = corte.id;

      const [allVentas, allGastos, allDescuentos, allIngredientes, allRecetas] = await Promise.all([
        base44.entities.Venta.list('-fecha_cierre', 2000).catch(() => []),
        base44.entities.GastoOperativo.list('-created_date', 500).catch(() => []),
        base44.entities.DescuentoInventarioVenta.list('-created_date', 3000).catch(() => []),
        base44.entities.Ingrediente.list().catch(() => []),
        base44.entities.RecetaEscandallo.list('-created_date', 2000).catch(() => []),
      ]);

      const matchVenta = (v) => {
        if (corteId && v.corte_caja_id === corteId) return true;
        const t = v.fecha_cierre ? new Date(v.fecha_cierre).getTime() : 0;
        if (t >= inicio && t <= cierre) return true;
        if (!v.corte_caja_id && corte.fecha_inicio) {
          const dayCorte = corte.fecha_inicio.slice(0, 10);
          const dayVenta = (v.fecha_apertura || v.fecha_cierre || '').slice(0, 10);
          if (dayCorte && dayCorte === dayVenta) return true;
        }
        return false;
      };

      const ventasCorte = allVentas.filter(v => v.estado === 'pagada' && matchVenta(v));
      const cancelaciones = allVentas.filter(v => v.estado === 'cancelada' && (
        (corteId && v.corte_caja_id === corteId) ||
        (v.fecha_cierre && new Date(v.fecha_cierre).getTime() >= inicio && new Date(v.fecha_cierre).getTime() <= cierre)
      ));
      const ventaIds = ventasCorte.map(v => v.id);
      const detalles = ventaIds.length
        ? (await Promise.all(ventaIds.map(id => base44.entities.DetalleVenta.filter({ venta_id: id }).catch(() => [])))).flat()
        : [];
      const gastosCorte = allGastos.filter(g => {
        const t = g.created_date ? new Date(g.created_date).getTime() : 0;
        return t >= inicio && t <= cierre;
      });

      const descuentosCorte = allDescuentos.filter(d => ventaIds.includes(d.venta_id));
      const ingMap = {};
      const ingPorId = Object.fromEntries(allIngredientes.map(i => [i.id, i]));
      const addIng = (ingId, nombre, unidad, qty, costoUnit) => {
        if (!ingId || !qty) return;
        if (!ingMap[ingId]) ingMap[ingId] = { nombre, unidad, cantidad: 0, costoUnit: costoUnit || 0, costoTotal: 0 };
        ingMap[ingId].cantidad += qty;
        ingMap[ingId].costoTotal += qty * (costoUnit || 0);
      };
      if (descuentosCorte.length > 0) {
        descuentosCorte.forEach(d => addIng(d.ingrediente_id, d.ingrediente_nombre, d.unidad_base, d.cantidad_total_descontada || 0, d.costo_unitario_snapshot || 0));
      } else {
        detalles.forEach(det => {
          const recetaLines = allRecetas.filter(r => r.producto_id === det.producto_id && r.activo !== false);
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
      const alertas = allIngredientes
        .map(i => ({ ...i, status: getStockStatus(i) }))
        .filter(i => ['critico', 'agotado', 'bajo'].includes(i.status));

      if (!cancelled) {
        setData({ ventas: ventasCorte, detalles, gastos: gastosCorte, ingredientes: ingredientesConsumidos, cancelaciones, alertas });
      }
    })();
    return () => { cancelled = true; };
  }, [corte]);

  const triggerDownload = async () => {
    if (!ref.current || !data) return;
    setDownloading(true);
    setError(false);
    try {
      const fecha = corte?.fecha_cierre ? format(new Date(corte.fecha_cierre), 'yyyyMMdd') : format(new Date(), 'yyyyMMdd');
      const negocio = safeFileName(config?.nombre_negocio || config?.platform_brand || 'MH-Astral-Systems');
      const folio = safeFileName(corte?.folio || 'corte');
      await downloadNodeAsPDF(ref.current, `Corte_${folio}_${fecha}_${negocio}.pdf`);
      setDone(true);
      toast.success('PDF del corte descargado');
    } catch (err) {
      console.error('Error generando PDF auto:', err);
      setError(true);
      toast.error('No se pudo descargar automáticamente. Usa el botón.');
    } finally {
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
          <Button onClick={triggerDownload} disabled={downloading || !data} className="shadow-lg">
            {downloading
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generando PDF…</>
              : <><Download className="w-4 h-4 mr-1" /> Descargar PDF del corte</>}
          </Button>
          {done && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={onDone}>Listo</Button>
          )}
        </div>
      )}

      {/* Render fuera de pantalla del ticket para captura */}
      {data && createPortal(
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', background: '#fff', zIndex: -1 }} aria-hidden>
          <CorteTicket
            ref={ref}
            corte={corte}
            ventas={data.ventas}
            detalles={data.detalles}
            gastos={data.gastos}
            ingredientes={data.ingredientes}
            cancelaciones={data.cancelaciones}
            alertas={data.alertas}
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
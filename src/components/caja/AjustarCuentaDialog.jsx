import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NumericInput from '@/components/common/NumericInput';
import { formatCurrency } from '@/utils/financialUtils';
import { desgloseIvaDesdeConfig } from '@/utils/ivaUtils';
import { TIPO_VENTA, formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { toast } from 'sonner';
import { Plus, Minus, Trash2, Search, Pencil, Check, X, AlertTriangle } from 'lucide-react';

/**
 * AjustarCuentaDialog
 * ===================
 * Permite a Caja AJUSTAR la cuenta antes de cobrar.
 *
 * Reglas duras (auditadas):
 *  - NO descuenta inventario aquí. Inventario se descuenta SOLO al cobrar
 *    (pages/Caja.jsx → handleCobrar, líneas 593-789). Confirmado.
 *  - NO permite ajustar ventas pagadas / canceladas (defensa propia + el
 *    padre solo lo monta para ventas pendientes).
 *  - Recalcula total, costo, utilidad y margen al guardar. NO toca propina
 *    automáticamente; si ya había propina y el subtotal cambió, muestra
 *    aviso para que Caja revise antes de cobrar.
 *  - Preserva snapshots de productos variables (tipo_venta_snapshot,
 *    cantidad_variable_snapshot, etc.).
 *  - Permite agregar productos PRECIO_FIJO solo (los variables se mantienen
 *    si ya estaban; agregar nuevo variable requiere selectores 6B existentes
 *    que viven fuera de Caja — para no complicar este modal, restringimos
 *    "agregar nuevo" a precio_fijo y dejamos quitar/ajustar para los variables).
 *  - Permite editar precio de línea (subtotal final) y cantidad. Bloquea
 *    valores negativos.
 *  - Guarda en Venta un log de ajuste: cuenta_ajustada, ajustes_cuenta[], etc.
 *    Si esos campos no existen en el schema, el backend los ignora — no rompe.
 *
 * Lo que NO hace (consciente):
 *  - No permite agregar productos variables nuevos (g/ml/shots). Si Caja
 *    necesita eso, debe cancelar el ajuste y avisar al mesero. Razón: evitar
 *    duplicar el flujo de selectores variables del POS dentro de Caja.
 *  - No toca pedidos de cocina. El ajuste ocurre cuando ya fue solicitada la
 *    cuenta: cocina ya entregó. Si se agrega un producto nuevo en ajuste, NO
 *    se manda a cocina automáticamente (Caja lo cobra y entrega físicamente).
 */
export default function AjustarCuentaDialog({
  open,
  onClose,
  venta,
  detalles,
  config,
  posUser,
  onSaved,
}) {
  // ----- Defensa: no permitir ajustar ventas pagadas o canceladas -----
  const bloqueado = !venta || venta.estado === 'pagada' || venta.estado === 'cancelada';

  // ----- Estado interno: copia editable de las líneas -----
  // Cada línea: {id, producto_id, producto_nombre, cantidad, precio_unitario, subtotal,
  //   costo_unitario, costo_total_linea, _snapshotOriginal (para restaurar), _es_nuevo, _eliminado}
  const [lineas, setLineas] = useState([]);
  // Para producto nuevo: cuál estamos editando (snapshot pendiente de confirmar).
  const [busqueda, setBusqueda] = useState('');
  const [agregarOpen, setAgregarOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Edición inline de precio: cuál línea está siendo editada y su valor temporal.
  const [editandoPrecioId, setEditandoPrecioId] = useState(null);
  const [editPrecioVal, setEditPrecioVal] = useState('');

  // Productos POS (solo precio_fijo visibles en POS, evitamos variables aquí).
  const { data: productos = [] } = useQuery({
    queryKey: ['productos_ajuste_cuenta'],
    queryFn: () => base44.entities.ProductoTerminado.filter({ activo: true, visible_en_pos: true }),
    initialData: [],
    enabled: open && !bloqueado,
  });

  // Sincronizar copia editable cuando el dialog abre.
  useEffect(() => {
    if (!open) return;
    const arr = Array.isArray(detalles) ? detalles : [];
    const copia = arr.map((d) => ({
      // Campos editables
      id: d.id, // null en líneas nuevas
      producto_id: d.producto_id,
      producto_nombre: d.producto_nombre || '',
      cantidad: Number(d.cantidad) || 0,
      precio_unitario: Number(d.precio_unitario_snapshot) || (Number(d.subtotal) / (Number(d.cantidad) || 1)) || 0,
      subtotal: Number(d.subtotal) || 0,
      costo_unitario: Number(d.costo_unitario_snapshot) || 0,
      costo_total_linea: Number(d.costo_total_linea_snapshot) || 0,
      // Snapshots variables (NO se editan en este modal — solo se preservan)
      tipo_venta_snapshot: d.tipo_venta_snapshot || '',
      unidad_variable_snapshot: d.unidad_variable_snapshot || '',
      cantidad_variable_snapshot: Number(d.cantidad_variable_snapshot) || 0,
      cantidad_base_consumo: Number(d.cantidad_base_consumo) || 0,
      ingrediente_base_id_snapshot: d.ingrediente_base_id_snapshot || '',
      ingrediente_base_nombre_snapshot: d.ingrediente_base_nombre_snapshot || '',
      precio_por_unidad_snapshot: Number(d.precio_por_unidad_snapshot) || 0,
      nombre_porcion_snapshot: d.nombre_porcion_snapshot || '',
      ml_por_porcion_snapshot: Number(d.ml_por_porcion_snapshot) || 0,
      cantidad_porciones_snapshot: Number(d.cantidad_porciones_snapshot) || 0,
      modificadores_snapshot: d.modificadores_snapshot || '',
      notas_producto: d.notas_producto || '',
      area_preparacion_snapshot: d.area_preparacion_snapshot || 'cocina',
      // Originales para diff
      _precio_unitario_original: Number(d.precio_unitario_snapshot) || (Number(d.subtotal) / (Number(d.cantidad) || 1)) || 0,
      _subtotal_original: Number(d.subtotal) || 0,
      _cantidad_original: Number(d.cantidad) || 0,
      _es_nuevo: false,
      _eliminado: false,
      _editada: false, // true si cambia cantidad/precio
    }));
    setLineas(copia);
    setBusqueda('');
    setAgregarOpen(false);
    setMotivo('');
    setEditandoPrecioId(null);
    setEditPrecioVal('');
  }, [open, detalles]);

  // ----- Es producto variable (no se permite editar precio/cantidad libremente
  // en este modal — solo quitar). Para agregar nuevamente uno variable, el
  // cajero debe ir al POS o pedir al mesero. -----
  const esLineaVariable = (l) => {
    const t = l?.tipo_venta_snapshot;
    return t === TIPO_VENTA.VARIABLE_MEDIDA || t === TIPO_VENTA.PORCION_CONTENEDOR;
  };

  // ----- Recálculo de totales (memo) -----
  const totales = useMemo(() => {
    const vivas = lineas.filter((l) => !l._eliminado);
    const subtotal = vivas.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    const costo = vivas.reduce((s, l) => s + (Number(l.costo_total_linea) || 0), 0);
    const utilidad = subtotal - costo;
    const margen = subtotal > 0 ? (utilidad / subtotal) * 100 : 0;
    return { subtotal, costo, utilidad, margen, lineas_vivas: vivas.length };
  }, [lineas]);

  const totalAntes = Number(venta?.total) || 0;
  const diferencia = totales.subtotal - totalAntes;
  const ivaInfo = useMemo(
    () => desgloseIvaDesdeConfig(totales.subtotal, config),
    [totales.subtotal, config]
  );

  // Aviso de propina: si la venta YA tenía propina manual y el subtotal cambió.
  const tienePropinaManual = Number(venta?.propina_monto) > 0;
  const propinaPotencialmenteDesfasada =
    tienePropinaManual && Math.abs(diferencia) > 0.01;

  // ----- Acciones -----
  const cambiarCantidad = (idx, delta) => {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        if (l._eliminado) return l;
        if (esLineaVariable(l) && delta < 0) {
          // En variables solo permitimos quitar la línea entera (no fraccionar).
          toast.info('Productos por gramos/shots: usa el botón eliminar para quitar la línea.');
          return l;
        }
        if (esLineaVariable(l) && delta > 0) {
          // No duplicamos variable simplemente sumando cantidad — eso falsearía
          // los snapshots de cantidad real (g/ml/shots).
          toast.info('Para repetir un producto por gramos/shots, agrega una línea nueva desde el mesero o quita y vuelve a pedirlo.');
          return l;
        }
        const nuevaCant = Math.max(0, (Number(l.cantidad) || 0) + delta);
        if (nuevaCant === 0) {
          // Cantidad a 0 = eliminar línea.
          return { ...l, _eliminado: true, _editada: true };
        }
        const precio = Number(l.precio_unitario) || 0;
        const costoUnit = Number(l.costo_unitario) || 0;
        return {
          ...l,
          cantidad: nuevaCant,
          subtotal: Math.round(precio * nuevaCant * 100) / 100,
          costo_total_linea: Math.round(costoUnit * nuevaCant * 100) / 100,
          _editada: true,
        };
      })
    );
  };

  const eliminarLinea = (idx) => {
    setLineas((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, _eliminado: true, _editada: true } : l))
    );
  };

  const empezarEditarPrecio = (l) => {
    if (esLineaVariable(l)) {
      toast.info('Productos por gramos/shots: el precio depende de cantidad y no se edita aquí.');
      return;
    }
    setEditandoPrecioId(l.id || `nuevo-${l._uid}`);
    setEditPrecioVal(String(Number(l.precio_unitario) || 0));
  };

  const confirmarEditarPrecio = (idx) => {
    const raw = String(editPrecioVal || '').replace(',', '.');
    const nuevo = Number.parseFloat(raw);
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      toast.error('Precio inválido. Debe ser un número mayor o igual a 0.');
      return;
    }
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const precioRedondeado = Math.round(nuevo * 100) / 100;
        const cant = Number(l.cantidad) || 0;
        return {
          ...l,
          precio_unitario: precioRedondeado,
          subtotal: Math.round(precioRedondeado * cant * 100) / 100,
          _editada: true,
        };
      })
    );
    setEditandoPrecioId(null);
    setEditPrecioVal('');
  };

  const cancelarEditarPrecio = () => {
    setEditandoPrecioId(null);
    setEditPrecioVal('');
  };

  const agregarProducto = (p) => {
    // Solo agregamos precio_fijo en este modal.
    const tipo = p?.tipo_venta || TIPO_VENTA.PRECIO_FIJO;
    if (tipo !== TIPO_VENTA.PRECIO_FIJO) {
      toast.error('Para productos por gramos/shots, ajusta desde el flujo del mesero.');
      return;
    }
    const precio = Number(p.precio_venta) || 0;
    if (precio <= 0) {
      toast.error('Este producto no tiene precio.');
      return;
    }
    const costoUnit = Number(p.costo_calculado_actual) || 0;
    setLineas((prev) => [
      ...prev,
      {
        id: null, // se creará en BD al guardar
        _uid: `nuevo-${p.id}-${Date.now()}`,
        producto_id: p.id,
        producto_nombre: p.nombre || '',
        cantidad: 1,
        precio_unitario: precio,
        subtotal: precio,
        costo_unitario: costoUnit,
        costo_total_linea: costoUnit,
        tipo_venta_snapshot: TIPO_VENTA.PRECIO_FIJO,
        area_preparacion_snapshot: p.area_preparacion || 'cocina',
        notas_producto: '',
        modificadores_snapshot: '',
        _precio_unitario_original: precio,
        _subtotal_original: 0,
        _cantidad_original: 0,
        _es_nuevo: true,
        _eliminado: false,
        _editada: true,
      },
    ]);
    setAgregarOpen(false);
    setBusqueda('');
  };

  // Filtro productos en buscador.
  const productosFiltrados = useMemo(() => {
    const arr = Array.isArray(productos) ? productos : [];
    const soloFijos = arr.filter(
      (p) => !p.tipo_venta || p.tipo_venta === TIPO_VENTA.PRECIO_FIJO
    );
    const q = busqueda.trim().toLowerCase();
    if (!q) return soloFijos.slice(0, 30);
    return soloFijos
      .filter((p) => (p.nombre || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [productos, busqueda]);

  // ----- Validaciones antes de guardar -----
  const validar = () => {
    if (totales.lineas_vivas === 0) {
      toast.error('La cuenta quedaría vacía. Si la mesa no consumió, cancela la venta desde el flujo normal.');
      return false;
    }
    if (totales.subtotal < 0) {
      toast.error('El total no puede ser negativo.');
      return false;
    }
    for (const l of lineas) {
      if (l._eliminado) continue;
      if (Number(l.cantidad) <= 0) {
        toast.error(`Cantidad inválida en ${l.producto_nombre}`);
        return false;
      }
      if (Number(l.precio_unitario) < 0) {
        toast.error(`Precio negativo en ${l.producto_nombre}`);
        return false;
      }
    }
    return true;
  };

  // ----- Guardar -----
  const guardar = async () => {
    if (guardando) return;
    if (bloqueado) {
      toast.error('Esta venta no puede ajustarse.');
      return;
    }
    if (!venta?.id) {
      toast.error('Venta inválida.');
      return;
    }
    if (!validar()) return;

    setGuardando(true);
    try {
      // ============================================================
      // ORDEN SEGURO DE PERSISTENCIA (auditoría primero)
      // ============================================================
      // Garantía clave: NUNCA debe desaparecer un producto sin que quede
      // evidencia. Por eso:
      //   1) Construimos el log de ajuste con TODOS los cambios planificados.
      //   2) Persistimos la VENTA con el log ANTES de aplicar deletes.
      //   3) Solo si el log se guardó OK, aplicamos los cambios en DetalleVenta.
      //
      // Si el paso 2 falla, abortamos antes de borrar nada. Si el paso 3 falla
      // parcialmente, queda evidencia en `ajustes_cuenta` con los cambios
      // intentados (no se perdió la huella).

      // 1) Construir log planificado SIN tocar BD.
      const ajustesLog = [];
      for (const l of lineas) {
        if (l._eliminado && l.id) {
          ajustesLog.push({
            tipo: 'eliminado',
            producto_nombre: l.producto_nombre,
            cantidad: l._cantidad_original,
            precio_unitario: l._precio_unitario_original,
            subtotal_original: l._subtotal_original,
            detalle_id: l.id,
          });
        } else if (!l.id && !l._eliminado) {
          const subtotal = Number(l.subtotal) || 0;
          ajustesLog.push({
            tipo: 'agregado',
            producto_nombre: l.producto_nombre,
            cantidad: Number(l.cantidad) || 0,
            precio_unitario: Number(l.precio_unitario) || 0,
            subtotal,
          });
        } else if (l.id && l._editada && !l._eliminado) {
          const cant = Number(l.cantidad) || 0;
          const precio = Number(l.precio_unitario) || 0;
          const subtotal = Math.round(precio * cant * 100) / 100;
          ajustesLog.push({
            tipo: 'modificado',
            producto_nombre: l.producto_nombre,
            cantidad_original: l._cantidad_original,
            cantidad_nueva: cant,
            precio_original: l._precio_unitario_original,
            precio_nuevo: precio,
            subtotal_original: l._subtotal_original,
            subtotal_nuevo: subtotal,
            detalle_id: l.id,
          });
        }
      }

      // Si no hay cambios reales, no hacemos nada.
      if (ajustesLog.length === 0) {
        toast.info('No hay cambios para aplicar.');
        setGuardando(false);
        return;
      }

      // 2) Persistir la VENTA con el log ANTES de tocar detalles.
      const nuevoSubtotal = Number(totales.subtotal.toFixed(2));
      const nuevoCosto = Number(totales.costo.toFixed(2));
      const nuevaUtilidad = Number(totales.utilidad.toFixed(2));
      const nuevoMargen = Number(totales.margen.toFixed(2));

      // Log acumulado: si ya había uno previo, lo respetamos.
      let logPrevio = [];
      try {
        if (Array.isArray(venta?.ajustes_cuenta)) {
          logPrevio = venta.ajustes_cuenta;
        } else if (typeof venta?.ajustes_cuenta === 'string' && venta.ajustes_cuenta) {
          const parsed = JSON.parse(venta.ajustes_cuenta);
          if (Array.isArray(parsed)) logPrevio = parsed;
        }
      } catch {}

      const nuevoLog = [
        ...logPrevio,
        {
          fecha: new Date().toISOString(),
          usuario_id: posUser?.id || '',
          usuario_nombre: posUser?.nombre || '',
          total_antes: totalAntes,
          total_despues: nuevoSubtotal,
          diferencia: Number((nuevoSubtotal - totalAntes).toFixed(2)),
          motivo: (motivo || '').trim(),
          cambios: ajustesLog,
        },
      ];

      // total_antes_ajuste: SOLO se setea en el PRIMER ajuste (no se sobrescribe
      // en ajustes posteriores) — para preservar el "original" de la cuenta.
      const totalAntesOriginal =
        Number.isFinite(Number(venta?.total_antes_ajuste))
          ? Number(venta.total_antes_ajuste)
          : totalAntes;

      const payloadVenta = {
        subtotal: nuevoSubtotal,
        total: nuevoSubtotal,
        costo_total_snapshot: nuevoCosto,
        utilidad_bruta_snapshot: nuevaUtilidad,
        margen_snapshot: nuevoMargen,
        cuenta_ajustada: true,
        ajuste_fecha: new Date().toISOString(),
        ajuste_usuario_id: posUser?.id || '',
        ajuste_usuario_nombre: posUser?.nombre || '',
        ajuste_motivo: (motivo || '').trim(),
        ajuste_monto: Number((nuevoSubtotal - totalAntes).toFixed(2)),
        total_antes_ajuste: totalAntesOriginal,
        total_despues_ajuste: nuevoSubtotal,
        ajustes_cuenta: JSON.stringify(nuevoLog),
      };

      // ⚠ Si esto falla, NO seguimos. No queremos borrar líneas sin auditoría.
      await base44.entities.Venta.update(venta.id, payloadVenta);

      // 3) Recién ahora aplicamos cambios en DetalleVenta.
      const ops = [];
      for (const l of lineas) {
        if (l._eliminado && l.id) {
          ops.push(base44.entities.DetalleVenta.delete(l.id).catch((e) => {
            console.error('[AjustarCuenta] delete linea:', e);
          }));
          continue;
        }
        if (l._eliminado && !l.id) continue;

        if (!l.id && !l._eliminado) {
          const subtotal = Number(l.subtotal) || 0;
          const costoLinea = Number(l.costo_total_linea) || 0;
          const utilidad = subtotal - costoLinea;
          const margen = subtotal > 0 ? (utilidad / subtotal) * 100 : 0;
          ops.push(
            base44.entities.DetalleVenta.create({
              venta_id: venta.id,
              producto_id: l.producto_id,
              producto_nombre: l.producto_nombre,
              cantidad: Number(l.cantidad) || 0,
              precio_unitario_snapshot: Number(l.precio_unitario) || 0,
              costo_unitario_snapshot: Number(l.costo_unitario) || 0,
              subtotal,
              costo_total_linea_snapshot: costoLinea,
              utilidad_linea_snapshot: utilidad,
              margen_linea_snapshot: margen,
              notas_producto: l.notas_producto || '',
              estado_preparacion: 'entregado',
              area_preparacion_snapshot: l.area_preparacion_snapshot || 'cocina',
            }).catch((e) => {
              console.error('[AjustarCuenta] create nueva:', e);
            })
          );
          continue;
        }

        if (l.id && l._editada && !l._eliminado) {
          const cant = Number(l.cantidad) || 0;
          const precio = Number(l.precio_unitario) || 0;
          const subtotal = Math.round(precio * cant * 100) / 100;
          const costoUnit = Number(l.costo_unitario) || 0;
          const costoLinea = Math.round(costoUnit * cant * 100) / 100;
          const utilidad = subtotal - costoLinea;
          const margen = subtotal > 0 ? (utilidad / subtotal) * 100 : 0;

          ops.push(
            base44.entities.DetalleVenta.update(l.id, {
              cantidad: cant,
              precio_unitario_snapshot: precio,
              subtotal,
              costo_total_linea_snapshot: costoLinea,
              utilidad_linea_snapshot: utilidad,
              margen_linea_snapshot: margen,
            }).catch((e) => {
              console.error('[AjustarCuenta] update linea:', e);
            })
          );
        }
      }
      await Promise.all(ops);

      toast.success('Cuenta ajustada. Revisa el total antes de cobrar.');

      // Invalidaciones y callback al padre con los nuevos datos.
      if (typeof onSaved === 'function') {
        try {
          onSaved({
            ventaPatch: payloadVenta,
            // Cargamos los detalles frescos para el padre.
          });
        } catch (e) {
          console.warn('[AjustarCuenta] onSaved:', e);
        }
      }
      onClose?.();
    } catch (err) {
      console.error('[AjustarCuenta] guardar:', err);
      toast.error('No se pudo guardar el ajuste. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  // ----- Render -----
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !guardando) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            Ajustar cuenta — {venta?.folio || ''}
          </DialogTitle>
        </DialogHeader>

        {bloqueado ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>Esta venta no puede ajustarse (ya está {venta?.estado === 'pagada' ? 'pagada' : 'cancelada'}).</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Aviso si la venta YA tenía propina manual */}
            {propinaPotencialmenteDesfasada && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  La cuenta tenía propina de <b>{formatCurrency(Number(venta?.propina_monto) || 0)}</b>.
                  Como el consumo va a cambiar, revisa la propina antes de cobrar (puedes redefinirla en el cobro).
                </p>
              </div>
            )}

            {/* Lista de líneas editables */}
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
              {lineas.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin productos en la cuenta.</p>
              )}
              {lineas.map((l, idx) => {
                if (l._eliminado) {
                  return (
                    <div
                      key={l.id || l._uid || `del-${idx}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-dashed border-red-200 bg-red-50/50 text-red-700"
                    >
                      <span className="text-xs line-through">{l.producto_nombre} (eliminado)</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLineas((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, _eliminado: false } : x))
                          )
                        }
                        className="text-xs underline"
                      >
                        Restaurar
                      </button>
                    </div>
                  );
                }
                const variable = esLineaVariable(l);
                const txtVar = variable
                  ? formatearCantidadVariable({
                      tipo_venta: l.tipo_venta_snapshot,
                      cantidad_variable: l.cantidad_variable_snapshot,
                      unidad_variable: l.unidad_variable_snapshot,
                      cantidad_porciones: l.cantidad_porciones_snapshot,
                      nombre_porcion: l.nombre_porcion_snapshot,
                    })
                  : '';
                const editando = editandoPrecioId === (l.id || `nuevo-${l._uid}`);

                return (
                  <div
                    key={l.id || l._uid || `linea-${idx}`}
                    className={`grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg border ${
                      l._es_nuevo ? 'border-emerald-300 bg-emerald-50/40' : 'border-border bg-card'
                    }`}
                  >
                    {/* Nombre */}
                    <div className="col-span-5 min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">
                        {l.producto_nombre}
                        {variable && (
                          <span className="ml-1 text-xs font-bold text-primary">· {txtVar}</span>
                        )}
                        {l._es_nuevo && (
                          <span className="ml-1.5 text-[10px] font-bold text-emerald-700 uppercase">Nuevo</span>
                        )}
                      </p>
                      {!editando && !variable && (
                        <button
                          type="button"
                          onClick={() => empezarEditarPrecio(l)}
                          className="text-[11px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                          title="Editar precio unitario"
                        >
                          {formatCurrency(l.precio_unitario)} c/u · editar
                        </button>
                      )}
                      {!editando && variable && (
                        <p className="text-[11px] text-muted-foreground">{formatCurrency(l.subtotal)}</p>
                      )}
                      {editando && (
                        <div className="flex items-center gap-1 mt-1">
                          <NumericInput
                            value={editPrecioVal}
                            onChange={(e) => setEditPrecioVal(e.target.value)}
                            placeholder="0.00"
                            className="h-7 text-xs w-24"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => confirmarEditarPrecio(idx)}
                            title="Aplicar"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={cancelarEditarPrecio}
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Cantidad */}
                    <div className="col-span-4 flex items-center justify-center gap-1.5">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => cambiarCantidad(idx, -1)}
                        disabled={variable}
                        title={variable ? 'Usa el botón eliminar' : 'Disminuir'}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-bold w-7 text-center tabular-nums">
                        {variable ? '—' : l.cantidad}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => cambiarCantidad(idx, +1)}
                        disabled={variable}
                        title={variable ? 'Productos variables no se duplican aquí' : 'Aumentar'}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Subtotal + eliminar */}
                    <div className="col-span-3 flex items-center justify-end gap-1.5">
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(l.subtotal)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => eliminarLinea(idx)}
                        title="Quitar línea"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Agregar producto */}
            <div className="rounded-lg border bg-muted/30 p-2.5">
              {!agregarOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setAgregarOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Agregar producto
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar producto…"
                      className="pl-8 h-9"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1.5">
                    {productosFiltrados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => agregarProducto(p)}
                        className="text-left px-2.5 py-2 rounded-md border bg-card hover:bg-muted/50 active:scale-[0.98] transition"
                      >
                        <p className="text-xs font-semibold truncate">{p.nombre}</p>
                        <p className="text-[11px] text-muted-foreground">{formatCurrency(p.precio_venta)}</p>
                      </button>
                    ))}
                    {productosFiltrados.length === 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground text-center py-3">
                        Sin resultados
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Nota: aquí solo se agregan productos a precio fijo. Para productos por gramos/shots, pide al mesero ajustar desde su flujo.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => { setAgregarOpen(false); setBusqueda(''); }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>

            {/* Resumen y motivo */}
            <div className="rounded-lg border-2 border-primary/20 bg-primary/[0.04] p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total antes</span>
                <span className="tabular-nums">{formatCurrency(totalAntes)}</span>
              </div>
              {ivaInfo.aplica && (
                <>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Subtotal s/IVA</span>
                    <span className="tabular-nums">{formatCurrency(ivaInfo.subtotalSinIva)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>IVA {ivaInfo.porcentaje}%</span>
                    <span className="tabular-nums">{formatCurrency(ivaInfo.ivaMonto)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-bold border-t pt-1.5">
                <span>Total ajustado</span>
                <span className="tabular-nums text-primary">{formatCurrency(totales.subtotal)}</span>
              </div>
              <div className={`flex justify-between text-xs ${diferencia < 0 ? 'text-emerald-700' : diferencia > 0 ? 'text-rose-700' : 'text-muted-foreground'}`}>
                <span>Diferencia</span>
                <span className="tabular-nums">
                  {diferencia > 0 ? '+' : ''}{formatCurrency(diferencia)}
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="ajuste-motivo" className="text-xs text-muted-foreground">
                Motivo del ajuste (opcional)
              </Label>
              <Input
                id="ajuste-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Error de captura, Cortesía, Descuento autorizado…"
                className="mt-1 h-9 text-sm"
                maxLength={120}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => !guardando && onClose?.()} disabled={guardando}>
            Cancelar
          </Button>
          {!bloqueado && (
            <Button
              onClick={guardar}
              disabled={guardando || totales.lineas_vivas === 0}
              className="min-w-[140px]"
            >
              {guardando ? 'Guardando…' : 'Guardar ajuste'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, X, Heart, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import { getVentaTotal } from '@/utils/ventaTotales';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { desgloseIvaDesdeConfig } from '@/utils/ivaUtils';
import { toast } from 'sonner';

/**
 * Vista "Pedir cuenta" del Portal QR.
 *
 * Reglas:
 * - Si no hay venta activa en la mesa: mensaje claro "Sin consumo activo".
 *   NO crea solicitud falsa.
 * - Si precuenta está apagada: solo botón "Solicitar cuenta" sin ver detalle.
 * - Si propina QR está apagada: no muestra opciones de propina.
 * - Si propinas globales están apagadas: ignora completamente la propina QR.
 * - Anti-duplicado: si ya existe SolicitudQR tipo:'cuenta' pendiente para
 *   la misma mesa, ACTUALIZA la propina/snapshot en lugar de crear otra.
 * - Si la venta cambia de estado a "cuenta_solicitada" la marcamos también
 *   para que Mesero/Caja vean el indicador.
 * - NO cobra, NO cierra mesa, NO descuenta inventario.
 *
 * Props:
 *  - mesa: objeto Mesa (con id, numero, nombre, qr_token, mesero_asignado_*)
 *  - config: ConfiguracionNegocio
 *  - ventaHint: (opcional) venta activa ya detectada por el padre. Sirve para
 *    evitar el "flash" de "no hay consumo activo" mientras carga la query interna.
 *  - detallesHint: (opcional) detalles ya cargados por el padre. Evita el flash
 *    "Aún no hay productos registrados" mientras la query interna carga.
 *  - onClose(): cerrar la vista.
 *  - onConfirmed(): callback cuando se solicitó la cuenta con éxito.
 */
export default function PedirCuentaQR({ mesa, config, ventaHint, detallesHint, onClose, onConfirmed }) {
  const queryClient = useQueryClient();
  const verPrecuenta = config?.portal_qr_mostrar_precuenta !== false;
  const propinasGlobales = tipsEnabled(config);
  const propinaQRPermitida = config?.portal_qr_permitir_propina_cliente !== false;
  const propinaActiva = propinasGlobales && propinaQRPermitida;
  const porcentajes = getPorcentajesSugeridos(config);

  // HOTFIX 6A.2: si el padre nos pasó la venta detectada por su polling,
  // la usamos como estado inicial para evitar el flash "sin consumo activo".
  const [venta, setVenta] = useState(ventaHint || null);
  // HOTFIX 6A.3: usar detallesHint como estado inicial para que la lista
  // "Mi consumo" muestre productos desde el primer frame, sin esperar query.
  const [detalles, setDetalles] = useState(Array.isArray(detallesHint) ? detallesHint : []);
  const [loading, setLoading] = useState(true);
  // null = aún no eligió. 0 = "Sin propina". -1 = monto manual. >0 = porcentaje.
  // -2 = "Decidir en caja".
  const [pctActivo, setPctActivo] = useState(null);
  const [montoManual, setMontoManual] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [decidirEnCaja, setDecidirEnCaja] = useState(false);

  // HOTFIX 6A.3: cuando el padre nos pasa detalles frescos (cliente agregó
  // productos mientras este modal está abierto), reflejarlos aquí.
  useEffect(() => {
    if (Array.isArray(detallesHint) && detallesHint.length > 0) {
      setDetalles(detallesHint);
    }
  }, [detallesHint]);

  // HOTFIX 6A.3: reintento automático de detalles si están vacíos pero la
  // venta tiene total > 0. Polling discreto cada 2.5s mientras esté abierto.
  useEffect(() => {
    const ventaActual = venta || ventaHint;
    if (!ventaActual?.id) return;
    if (Array.isArray(detalles) && detalles.length > 0) return;
    const total = Number(ventaActual?.total) || Number(ventaActual?.subtotal) || 0;
    if (total <= 0) return;
    // Hay total pero no detalles → reintentar.
    let cancel = false;
    const tick = async () => {
      try {
        const det = await base44.entities.DetalleVenta.filter({ venta_id: ventaActual.id }).catch(() => []);
        if (cancel) return;
        const arr = Array.isArray(det) ? det : [];
        if (arr.length > 0) setDetalles(arr);
      } catch (e) {
        if (!cancel) console.warn('[PedirCuentaQR] reintento detalles:', e);
      }
    };
    // Reintento corto inmediato + interval.
    tick();
    const interval = setInterval(tick, 2500);
    return () => { cancel = true; clearInterval(interval); };
  }, [venta?.id, ventaHint?.id, detalles.length]);

  // Cargar venta activa de la mesa
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!mesa?.id) { setLoading(false); return; }
      try {
        // Estados que cuentan como "consumo activo"
        const estadosActivos = ['abierta', 'enviada', 'en_preparacion', 'lista', 'cuenta_solicitada'];
        const ventas = await base44.entities.Venta.filter({ mesa_id: mesa.id }).catch(() => []);
        const v = (Array.isArray(ventas) ? ventas : [])
          .filter(x => x && estadosActivos.includes(x.estado))
          .sort((a, b) => new Date(b?.fecha_apertura || b?.created_date || 0) - new Date(a?.fecha_apertura || a?.created_date || 0))[0] || null;
        if (cancel) return;
        // HOTFIX 6A.2: si la query no encontró venta pero tenemos un hint válido
        // del padre, conservar el hint en vez de "limpiar" → evita flash "sin consumo".
        if (v) {
          setVenta(v);
        } else if (!ventaHint) {
          setVenta(null);
        }
        // Cargar detalles desde la venta encontrada por la query o, si no hay,
        // desde el hint del padre.
        // HOTFIX 6A.3: si la query no devuelve nada pero el padre nos pasó
        // detallesHint, NO los pisamos con [] — los preservamos.
        const ventaParaDetalles = v?.id ? v : ventaHint;
        if (ventaParaDetalles?.id) {
          const det = await base44.entities.DetalleVenta.filter({ venta_id: ventaParaDetalles.id }).catch(() => []);
          const detArr = Array.isArray(det) ? det : [];
          if (!cancel) {
            if (detArr.length > 0) {
              setDetalles(detArr);
            } else if (Array.isArray(detallesHint) && detallesHint.length > 0) {
              // Conservar hint del padre si la query interna no encontró.
              setDetalles(detallesHint);
            } else {
              setDetalles([]);
            }
          }
        } else if (!Array.isArray(detallesHint) || detallesHint.length === 0) {
          setDetalles([]);
        }
        // Pre-seleccionar la opción que el cliente ya eligió antes (si volvió a entrar).
        // No resetear su elección previa.
        if (!cancel && v && v.propina_origen === 'portal_qr') {
          const tipo = v.propina_tipo;
          if (tipo === 'decidir_en_caja') {
            setDecidirEnCaja(true);
            setPctActivo(null);
          } else if (tipo === 'porcentaje' && Number(v.propina_porcentaje) > 0) {
            setPctActivo(Number(v.propina_porcentaje));
          } else if (tipo === 'monto_manual' && Number(v.propina_monto) > 0) {
            setMontoManual(String(Number(v.propina_monto)));
            setPctActivo(-1);
          } else if (tipo === 'sin_propina') {
            setPctActivo(0);
          }
        }
      } catch (err) {
        console.error('[PedirCuentaQR] cargar venta:', err);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [mesa?.id]);

  // HOTFIX 6A.2: usar getVentaTotal — defensa contra venta con total=0 cuando
  // hay detalles reales (rate-limit en envío). Igual que Caja y Mesero.
  const subtotal = getVentaTotal(venta, detalles);

  const propinaCalculada = useMemo(() => {
    if (!propinaActiva) return 0;
    if (decidirEnCaja) return 0;
    if (pctActivo === null) return 0;
    if (pctActivo > 0) {
      return Math.round((subtotal * (pctActivo / 100)) * 100) / 100;
    }
    const manual = Number.parseFloat(montoManual);
    if (Number.isFinite(manual) && manual >= 0) return Math.round(manual * 100) / 100;
    return 0;
  }, [propinaActiva, decidirEnCaja, pctActivo, montoManual, subtotal]);

  const totalEstimado = subtotal + propinaCalculada;

  // Tipo de propina elegido por el cliente. NOTA: `decidir_en_caja` se distingue
  // de `sin_propina` para que Caja pueda mostrar mensajes diferentes.
  const propinaTipo = (() => {
    if (!propinaActiva) return 'sin_propina';
    if (decidirEnCaja) return 'decidir_en_caja';
    if (pctActivo === 0) return 'sin_propina';
    if (pctActivo > 0) return 'porcentaje';
    if (Number.parseFloat(montoManual) > 0) return 'monto_manual';
    return 'sin_propina';
  })();

  const yaEligio = decidirEnCaja || pctActivo !== null || Number.parseFloat(montoManual) > 0;

  const elegirPorcentaje = (pct) => {
    setDecidirEnCaja(false);
    setPctActivo(pct);
    setMontoManual('');
  };

  const elegirDecidirEnCaja = () => {
    setDecidirEnCaja(true);
    setPctActivo(null);
    setMontoManual('');
  };

  const onChangeManual = (raw) => {
    const v = (raw || '').replace(',', '.');
    // Solo dígitos y un punto; rechazar negativos
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      setMontoManual(v);
      setPctActivo(-1); // -1 marca "usuario usando manual"
      setDecidirEnCaja(false);
    }
  };

  const confirmar = async () => {
    if (enviando) return;
    if (!mesa?.id) { toast.error('Mesa no válida'); return; }
    setEnviando(true);
    try {
      const ahora = new Date().toISOString();
      const asign = config?.asignacion_mesas_activa === true;
      const tieneAsignado = !!mesa.mesero_asignado_id;
      const ruteo = asign && tieneAsignado ? 'asignado' : 'general';

      // === FIX 6B-C: No crear "notificación falsa" cuando el mesero inició la cuenta ===
      // Caso "mesero disparó la cuenta":
      //   - venta.propina_origen === 'pendiente_portal_qr', o
      //   - venta.propina_tipo === 'pendiente_cliente'
      // En ese caso, el comensal SOLO está confirmando su propina desde el QR;
      // NO está creando una solicitud nueva. La cuenta YA fue solicitada por
      // el mesero. Solo actualizamos solicitud existente (si hubiera) sin crear.
      //
      // Caso "comensal inició la cuenta": no hay esos flags → SÍ creamos
      // SolicitudQR como notificación entrante para el mesero asignado.
      const meseroDisparoLaCuenta =
        venta?.propina_origen === 'pendiente_portal_qr' ||
        venta?.propina_tipo === 'pendiente_cliente';

      // ----- Anti-duplicado: buscar solicitud pendiente -----
      const pendientes = await base44.entities.SolicitudQR.filter({
        mesa_id: mesa.id, tipo: 'cuenta', estado: 'pendiente',
      }).catch(() => []);
      const yaPendiente = Array.isArray(pendientes) && pendientes.length > 0 ? pendientes[0] : null;

      const payloadBase = {
        mesa_id: mesa.id,
        mesa_nombre: mesa.nombre || '',
        mesa_numero: mesa.numero || 0,
        tipo: 'cuenta',
        estado: 'pendiente',
        origen: 'portal_qr',
        token_mesa: mesa.qr_token || '',
        mesero_destino_id: ruteo === 'asignado' ? mesa.mesero_asignado_id : '',
        mesero_destino_nombre: ruteo === 'asignado' ? (mesa.mesero_asignado_nombre || '') : '',
        ruteo_modo: ruteo,
        venta_id: venta?.id || '',
        subtotal_consumo: subtotal,
        propina_monto_sugerida: propinaCalculada,
        propina_porcentaje_sugerido: pctActivo > 0 ? pctActivo : 0,
        propina_tipo: propinaTipo,
        total_estimado: totalEstimado,
      };

      if (yaPendiente?.id) {
        // Ya hay solicitud — actualizamos snapshot sin crear duplicada.
        await base44.entities.SolicitudQR.update(yaPendiente.id, {
          ...payloadBase,
          fecha_creacion: yaPendiente.fecha_creacion || ahora,
        });
      } else if (!meseroDisparoLaCuenta) {
        // Solo creamos solicitud si el COMENSAL inició el flujo.
        // Si el mesero ya solicitó la cuenta, esto NO debe crear notificación falsa.
        await base44.entities.SolicitudQR.create({
          ...payloadBase,
          fecha_creacion: ahora,
        });
      }
      // Si meseroDisparoLaCuenta y no hay solicitud previa → NO crear. El mesero
      // ya sabe (porque él mismo apretó "Solicitar cuenta"). El estado se ve en
      // la mesa con el badge "Cuenta solicitada / Esperando propina del comensal".

      // ----- Actualizar la VENTA con la propina sugerida -----
      // Caja la cobra desde la venta (no desde la solicitud). Origen 'portal_qr'.
      // Si propinas globales están apagadas, NO tocamos la venta.
      if (venta?.id && propinasGlobales) {
        try {
          const update = {
            estado: 'cuenta_solicitada',
          };
          if (propinaActiva) {
            update.propina_monto = propinaCalculada;
            update.propina_porcentaje = pctActivo > 0 ? pctActivo : 0;
            update.propina_tipo = propinaTipo;
            // Siempre 'portal_qr' una vez que el cliente eligió algo (incluso
            // "decidir en caja" o "sin propina"). Esto sobrescribe el
            // estado intermedio 'pendiente_portal_qr' que dejó el mesero.
            update.propina_origen = 'portal_qr';
          }
          await base44.entities.Venta.update(venta.id, update);
        } catch (errV) {
          console.warn('[PedirCuentaQR] no se pudo actualizar venta:', errV);
        }
      } else if (venta?.id && venta.estado !== 'cuenta_solicitada') {
        // Sin propinas: solo marcar la venta como cuenta_solicitada
        try {
          await base44.entities.Venta.update(venta.id, { estado: 'cuenta_solicitada' });
        } catch {}
      }

      // Marcar mesa con estado cuenta_solicitada (solo si la venta existe)
      if (venta?.id && mesa?.id) {
        try {
          await base44.entities.Mesa.update(mesa.id, { estado: 'cuenta_solicitada' });
        } catch {}
      }

      // BLOQUE 0 — Que Caja vea la cuenta solicitada en ≤2s desde QR.
      try {
        queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        queryClient.refetchQueries({ queryKey: ['ventas_pendientes_caja'], type: 'active' }).catch(() => {});
      } catch (e) {
        console.warn('[PedirCuentaQR] invalidar caja:', e);
      }

      setEnviado(true);
      if (typeof onConfirmed === 'function') onConfirmed();
    } catch (err) {
      console.error('[PedirCuentaQR] confirmar:', err);
      toast.error('No pudimos enviar tu solicitud. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  // ----- RENDER -----
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
    >
      <motion.div
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        className="bg-card text-card-foreground w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="flex-1 font-heading font-bold">
            {venta?.propina_origen === 'pendiente_portal_qr' || venta?.propina_tipo === 'pendiente_cliente'
              ? 'Tu cuenta fue solicitada'
              : `Pedir cuenta — Mesa ${mesa?.numero ?? '—'}`}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && (
            <div className="py-10 text-center">
              <Loader2 className="w-7 h-7 mx-auto animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-2">Cargando tu cuenta…</p>
            </div>
          )}

          {/* HOTFIX 6A.3: "Sin consumo activo" SOLO si NO hay venta, NO hay hint,
              NO hay total > 0 y NO hay detalles. Antes salía como flash falso. */}
          {!loading && !venta && !ventaHint && (Number(subtotal) || 0) <= 0 && detalles.length === 0 && (
            <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold">Esta mesa no tiene consumo activo</p>
                <p className="text-xs opacity-90 mt-1">
                  Llama a un mesero para iniciar tu cuenta. Si ya pediste y aún no aparece, espera un momento.
                </p>
              </div>
            </div>
          )}

          {!loading && venta && enviado && (
            <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold">¡Cuenta solicitada!</p>
                <p className="text-xs opacity-90 mt-1">
                  En breve te atenderemos. El cobro final se confirma en caja.
                </p>
              </div>
            </div>
          )}

          {!loading && venta && !enviado && (
            <>
              {/* Precuenta — diseño premium, jerarquía clara
                  FIX BUG: el precio unitario se lee de `precio_unitario_snapshot`
                  (campo real en DetalleVenta). Antes leíamos `precio_unitario`
                  que no existe → mostraba $0.00 aunque el subtotal sí salía bien.
                  Fallback: si no hay snapshot, derivamos de subtotal/cantidad. */}
              {verPrecuenta ? (
                <div
                  className="rounded-2xl overflow-hidden bg-card border shadow-sm"
                  style={{
                    boxShadow:
                      '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px rgba(0,0,0,0.06)',
                  }}
                >
                  <div className="px-4 py-3 border-b bg-gradient-to-b from-muted/60 to-muted/30 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-heading font-bold uppercase tracking-wider">
                      Tu consumo
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5 max-h-64 overflow-y-auto divide-y divide-border/50">
                    {Array.isArray(detalles) && detalles.length > 0 ? (
                      detalles.map((d, i) => {
                        const qty = Number(d?.cantidad) || 0;
                        const lineSubtotal = Number(d?.subtotal) || 0;
                        // Precio unitario: snapshot real, con fallback derivado.
                        const snap = Number(d?.precio_unitario_snapshot);
                        const unit = Number.isFinite(snap) && snap > 0
                          ? snap
                          : (qty > 0 ? lineSubtotal / qty : 0);
                        // 6B / 1.G — Texto legible si la línea es variable.
                        const txtVar = formatearCantidadVariable({
                          tipo_venta: d?.tipo_venta_snapshot,
                          cantidad_variable: d?.cantidad_variable_snapshot,
                          unidad_variable: d?.unidad_variable_snapshot,
                          cantidad_porciones: d?.cantidad_porciones_snapshot,
                          nombre_porcion: d?.nombre_porcion_snapshot,
                        });
                        const esVariable = !!txtVar;
                        return (
                          <div
                            key={d?.id || i}
                            className="flex justify-between items-start gap-3 pt-2.5 first:pt-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">
                                {d?.producto_nombre || '—'}
                                {esVariable && (
                                  <span className="ml-1.5 text-xs font-bold text-primary">· {txtVar}</span>
                                )}
                              </p>
                              {!esVariable && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  <span className="font-semibold text-foreground/80">{qty}</span>
                                  <span className="mx-1">×</span>
                                  <span>{formatCurrency(unit)}</span>
                                </p>
                              )}
                            </div>
                            <p className="font-heading font-bold text-sm shrink-0 tabular-nums">
                              {formatCurrency(lineSubtotal)}
                            </p>
                          </div>
                        );
                      })
                    ) : subtotal > 0 ? (
                      // HOTFIX 6A.3: hay total pero aún no llegan las líneas.
                      // No mostrar "no hay productos" — mostrar carga + reintento.
                      <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Cargando detalle de tu consumo…</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Aún no hay productos registrados.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border bg-card p-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-bold tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}

              {/* Propina — premium con icono destacado */}
              {propinaActiva && subtotal > 0 && (
                <div
                  className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm"
                  style={{
                    boxShadow:
                      '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px rgba(244,63,94,0.06)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
                      <Heart className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <p className="text-sm font-heading font-bold">¿Quieres dejar propina?</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <PropinaBtn
                      label="Sin propina"
                      sub="0%"
                      active={pctActivo === 0 && montoManual === '' && !decidirEnCaja}
                      onClick={() => elegirPorcentaje(0)}
                    />
                    {porcentajes.map(p => (
                      <PropinaBtn
                        key={p}
                        label={`${p}%`}
                        sub={formatCurrency(Math.round((subtotal * (p / 100)) * 100) / 100)}
                        active={pctActivo === p}
                        onClick={() => elegirPorcentaje(p)}
                      />
                    ))}
                  </div>

                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">O escribe otro monto:</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={montoManual}
                      onChange={(e) => onChangeManual(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 px-3 rounded-lg border bg-card text-center text-lg font-bold"
                    />
                  </div>

                  {/* Decidir en caja — distinto de "sin propina" */}
                  <button
                    type="button"
                    onClick={elegirDecidirEnCaja}
                    className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      decidirEnCaja
                        ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    Decidir en caja
                  </button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    El cobro final se confirma en caja.
                  </p>
                </div>
              )}

              {/* Resumen de totales — subtotal, propina y total final separados.
                  PASO 2 IVA: desglose visual de IVA incluido si está configurado.
                  El subtotal del consumo NO cambia (sigue siendo el total con
                  IVA incluido). La propina sigue calculándose como ya estaba. */}
              {(() => {
                const ivaPC = desgloseIvaDesdeConfig(subtotal, config);
                return (
              <div
                className="rounded-2xl p-4 bg-gradient-to-br from-primary/[0.07] via-primary/[0.04] to-primary/[0.07] border border-primary/25 space-y-2"
                style={{
                  boxShadow:
                    '0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 18px rgba(0,0,0,0.06)',
                }}
              >
                {ivaPC.aplica ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal sin IVA</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(ivaPC.subtotalSinIva)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA {ivaPC.porcentaje}%</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(ivaPC.ivaMonto)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-primary/10 pt-1.5">
                      <span className="font-semibold">Consumo</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>
                )}
                {propinaActiva && propinaCalculada > 0 && (
                  <div className="flex justify-between text-sm text-rose-600 dark:text-rose-400">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      Propina {pctActivo > 0 ? `(${pctActivo}%)` : ''}
                    </span>
                    <span className="font-semibold tabular-nums">
                      + {formatCurrency(propinaCalculada)}
                    </span>
                  </div>
                )}
                {decidirEnCaja && (
                  <div className="flex justify-between text-xs text-amber-700 dark:text-amber-400">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" /> Propina
                    </span>
                    <span className="italic">Se decide en caja</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline font-heading font-black border-t border-primary/25 pt-2 mt-1">
                  <span className="text-sm uppercase tracking-wider">Total</span>
                  <span className="text-2xl tabular-nums text-primary">
                    {formatCurrency(totalEstimado)}
                  </span>
                </div>
                {ivaPC.aplica && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    IVA {ivaPC.porcentaje}% incluido en el consumo
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground text-center pt-1 border-t border-primary/10">
                  Esta es una precuenta. El cobro final se confirma en caja.
                </p>
              </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer / acciones */}
        <div className="sticky bottom-0 bg-card border-t px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="flex-1 h-12 rounded-xl border font-semibold disabled:opacity-50"
          >
            {enviado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!enviado && venta && (
            <button
              type="button"
              onClick={confirmar}
              disabled={enviando || subtotal <= 0 || (propinaActiva && !yaEligio)}
              className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 active:scale-95 transition-transform"
            >
              {enviando ? 'Enviando…' : (propinaActiva && !yaEligio ? 'Elige una opción' : 'Confirmar')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function PropinaBtn({ label, sub, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-2 rounded-xl border-2 text-center transition-all min-w-0 ${
        active
          ? 'border-rose-400 bg-rose-50 text-rose-700 shadow-md dark:bg-rose-950/40 dark:text-rose-300'
          : 'border-border bg-card text-muted-foreground'
      }`}
    >
      <p className="font-heading font-black text-base leading-none">{label}</p>
      <p className="text-[10px] mt-1 truncate">{sub}</p>
    </button>
  );
}
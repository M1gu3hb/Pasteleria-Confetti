import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTerminal } from '@/lib/TerminalContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Cake, Save, MessageCircle, Printer, Upload, Eye, ListChecks, Camera, X, Mic } from 'lucide-react';
import NotaVozRecorder from '@/components/pedidos/NotaVozRecorder';
import {
  getPrecioKilo, getRatioPersonas, generarFolioPedido, buildWhatsAppLink,
} from '@/utils/pedidoPastelUtils';
import TicketPedidoPastel from '@/components/pedidos/TicketPedidoPastel';
import PedidoPastelDetalleDialog from '@/components/pedidos/PedidoPastelDetalleDialog';
import CanvasDibujo from '@/components/pedidos/CanvasDibujo';

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// Fallback si config.extras_pastel no llegó. Mantiene el flujo si la BD
// no devolvió el campo (no debe pasar, pero evita pantalla en blanco).
const EXTRAS_FALLBACK = [
  { id: 'base', nombre: 'Pastel de base', precio: 0, activo: true },
  { id: 'oblea', nombre: 'Oblea personalizada', precio: 0, activo: true },
  { id: 'muneca', nombre: 'Muñeca decorativa', precio: 0, activo: true },
  { id: 'velas', nombre: 'Velas', precio: 0, activo: true },
];

// Formulario digital del ticket físico de Pastelería Confetti.
// Secciones con scroll (tablet-first), calculadora en tiempo real.
export default function NuevoPedidoPastel() {
  const { sucursalEfectiva } = useTerminal();
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { hayCaja } = useCajaAbierta();
  const sucId = sucursalEfectiva?.sucursal_id || null;
  const sucNombre = sucursalEfectiva?.sucursal_nombre || '';

  // Edición: ?id=<pedido_id>
  const editId = new URLSearchParams(window.location.search).get('id');

  const precioKiloConfig = getPrecioKilo(config, sucId);
  const ratioConfig = getRatioPersonas(config, sucId);

  // Función 1 — Extras configurables. Se leen desde ConfiguracionNegocio
  // (campo extras_pastel, JSON string). Solo se muestran los activos.
  // Los IDs (base/oblea/muneca/velas) coinciden con los campos del form.
  const extrasPastel = useMemo(() => {
    if (!config?.extras_pastel) return EXTRAS_FALLBACK.filter(e => e.activo);
    try {
      const arr = JSON.parse(config.extras_pastel);
      return Array.isArray(arr) ? arr.filter(e => e?.activo) : [];
    } catch {
      return [];
    }
  }, [config?.extras_pastel]);

  // Rellenos configurables (mismo patrón que extras). Solo activos.
  // Cada relleno: { id, nombre, precio_kilo, activo }.
  const rellenosPastel = useMemo(() => {
    if (!config?.rellenos_pastel) return [];
    try {
      const arr = JSON.parse(config.rellenos_pastel);
      return Array.isArray(arr) ? arr.filter(r => r?.activo) : [];
    } catch {
      return [];
    }
  }, [config?.rellenos_pastel]);

  const [form, setForm] = useState({
    cliente_nombre: '', cliente_telefono: '', cliente_email: '', cliente_direccion: '',
    fecha_entrega: '', hora_entrega: '',
    personas_estimadas: '', kilos: '', precio_kilo: String(precioKiloConfig),
    extras: { base: false, oblea: false, muneca: false, velas: false },
    preciosExtras: { base: '', oblea: '', muneca: '', velas: '' },
    total_final: '',
    decorado: '', concepto: '', rellenos: '', leyenda_pastel: '',
    nota_interna: '', imagen_referencia_url: '', notas_generales: '',
    nota_voz_url: '', nota_voz_transcripcion: '',
    a_cuenta: '0', devolver_base: true,
  });
  // FIX 2 — Detecta relleno de texto libre (pedidos viejos) que no coincide
  // con ningún chip configurado. Solo aplica si hay chips disponibles.
  const rellenoTextoLibre = !!form.rellenos
    && rellenosPastel.length > 0
    && !rellenosPastel.some(r => r.nombre === form.rellenos);

  // FIX — visibilidad del aviso de relleno de texto libre. "Conservar texto"
  // solo oculta el aviso (el valor ya vive en form.rellenos).
  const [avisoTextoLibreOculto, setAvisoTextoLibreOculto] = useState(false);

  // Si cambia el relleno (eligió un chip o lo vació), reseteamos el aviso para
  // que vuelva a mostrarse si aparece otro texto libre en el futuro.
  useEffect(() => {
    setAvisoTextoLibreOculto(false);
  }, [form.rellenos]);

  const [guardando, setGuardando] = useState(false);
  const [subiendoImg, setSubiendoImg] = useState(false);
  // Modo de captura de la referencia: subir foto o dibujar.
  const [modoEntrada, setModoEntrada] = useState('imagen'); // 'imagen' | 'dibujo'
  const [pedidoGuardado, setPedidoGuardado] = useState(null);
  const [verDetalle, setVerDetalle] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Refrescar precio/kilo si llega config después del montaje (solo si el
  // usuario no lo ha tocado: campo aún con el default inicial).
  useEffect(() => {
    setForm(f => (f.precio_kilo === '' || f.precio_kilo === '350')
      ? { ...f, precio_kilo: String(precioKiloConfig) } : f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precioKiloConfig]);

  // Cargar pedido existente para editar.
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const p = await base44.entities.PedidoPastel.get(editId);
        if (!p) return;
        setForm({
          cliente_nombre: p.cliente_nombre || '', cliente_telefono: p.cliente_telefono || '',
          cliente_email: p.cliente_email || '', cliente_direccion: p.cliente_direccion || '',
          fecha_entrega: p.fecha_entrega || '', hora_entrega: p.hora_entrega || '',
          personas_estimadas: p.personas_estimadas ? String(p.personas_estimadas) : '',
          kilos: p.kilos ? String(p.kilos) : '',
          precio_kilo: String(p.precio_kilo_usado ?? precioKiloConfig),
          extras: {
            base: p.incluye_base === true, oblea: p.incluye_oblea === true,
            muneca: p.incluye_muneca === true, velas: p.incluye_velas === true,
          },
          preciosExtras: {
            base: p.precio_base ? String(p.precio_base) : '',
            oblea: p.precio_oblea ? String(p.precio_oblea) : '',
            muneca: p.precio_muneca ? String(p.precio_muneca) : '',
            velas: p.precio_velas ? String(p.precio_velas) : '',
          },
          total_final: p.total_final != null ? String(p.total_final) : '',
          decorado: p.decorado || '', concepto: p.concepto || '', rellenos: p.rellenos || '',
          leyenda_pastel: p.leyenda_pastel || '', nota_interna: p.nota_interna || '',
          imagen_referencia_url: p.imagen_referencia_url || '', notas_generales: p.notas_generales || '',
          nota_voz_url: p.nota_voz_url || '', nota_voz_transcripcion: p.nota_voz_transcripcion || '',
          a_cuenta: String(p.a_cuenta ?? 0), devolver_base: p.devolver_base !== false,
        });
        setPedidoGuardado(p);
      } catch (err) {
        console.error('[NuevoPedidoPastel] cargar edición:', err);
        toast.error('No se pudo cargar el pedido para editar');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // === Calculadora en tiempo real ===
  const calc = useMemo(() => {
    const personas = parseFloat(form.personas_estimadas) || 0;
    const kilosSugeridos = personas > 0 ? Math.ceil(personas / ratioConfig) : 0;
    const kilos = parseFloat(form.kilos) || 0;
    const precioKiloManual = parseFloat(form.precio_kilo) || 0;
    // Si el relleno elegido tiene precio_kilo > 0, sobreescribe el precio/kilo.
    const rellenoSel = rellenosPastel.find(r => r.nombre === form.rellenos);
    const precioKiloRelleno = Number(rellenoSel?.precio_kilo) || 0;
    const precioKilo = precioKiloRelleno > 0 ? precioKiloRelleno : precioKiloManual;
    const subtotalPastel = Math.round(kilos * precioKilo * 100) / 100;
    const subtotalExtras = extrasPastel.reduce((s, e) =>
      s + (form.extras[e.id] ? (parseFloat(form.preciosExtras[e.id]) || 0) : 0), 0);
    const totalCalculado = subtotalPastel + subtotalExtras;
    const totalFinal = form.total_final === '' ? totalCalculado : (parseFloat(form.total_final) || 0);
    const aCuenta = parseFloat(form.a_cuenta) || 0;
    const resta = Math.max(0, totalFinal - aCuenta);
    const difiere = totalCalculado > 0 && Math.abs(totalFinal - totalCalculado) / totalCalculado > 0.2;
    return { kilosSugeridos, subtotalPastel, subtotalExtras, totalCalculado, totalFinal, aCuenta, resta, difiere, precioKilo };
  }, [form, ratioConfig, extrasPastel, rellenosPastel]);

  // Fase 4 — Guardia: sin caja abierta no se registran pedidos.
  // Colocado DESPUÉS de todos los hooks para no romper las reglas de hooks.
  if (!hayCaja) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <Cake className="w-16 h-16 opacity-20" />
        <p className="text-xl font-heading font-bold">Caja cerrada</p>
        <p className="text-muted-foreground text-sm max-w-xs">
          Para registrar un pedido de pastel personalizado primero debes
          abrir la caja de tu sucursal.
        </p>
        <Button onClick={() => navigate('/caja')} className="h-12 px-6">
          Ir a Caja y abrir
        </Button>
      </div>
    );
  }

  const onPersonasChange = (v) => {
    const personas = parseFloat(v) || 0;
    const sugeridos = personas > 0 ? Math.ceil(personas / ratioConfig) : '';
    setForm(f => ({
      ...f, personas_estimadas: v,
      kilos: f.kilos === '' || f.kilos === String(Math.ceil((parseFloat(f.personas_estimadas) || 0) / ratioConfig) || '')
        ? String(sugeridos) : f.kilos,
    }));
  };

  const subirImagen = async (file) => {
    if (!file) return;
    setSubiendoImg(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('imagen_referencia_url', file_url);
      toast.success('Imagen de referencia subida');
    } catch (err) {
      console.error('[NuevoPedidoPastel] subir imagen:', err);
      toast.error('No se pudo subir la imagen');
    } finally {
      setSubiendoImg(false);
    }
  };

  const guardar = async () => {
    if (guardando) return;
    // Validaciones required
    if (!form.cliente_nombre.trim()) { toast.error('Falta el nombre del cliente'); return; }
    if (!form.cliente_telefono.trim()) { toast.error('Falta el teléfono del cliente'); return; }
    if (!form.fecha_entrega) { toast.error('Falta la fecha de entrega'); return; }
    if (!(parseFloat(form.kilos) > 0)) { toast.error('Los kilos deben ser mayores a 0'); return; }
    if (!sucId) { toast.error('No hay sucursal activa. Selecciona una sucursal primero.'); return; }

    setGuardando(true);
    try {
      const payload = {
        sucursal_id: sucId,
        sucursal_nombre: sucNombre,
        origen: 'pos_interno',
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_telefono: form.cliente_telefono.trim(),
        cliente_email: form.cliente_email.trim(),
        cliente_direccion: form.cliente_direccion.trim(),
        fecha_entrega: form.fecha_entrega,
        hora_entrega: form.hora_entrega,
        kilos: parseFloat(form.kilos) || 0,
        personas_estimadas: parseFloat(form.personas_estimadas) || 0,
        ratio_personas_por_kilo_usado: ratioConfig,
        decorado: form.decorado, concepto: form.concepto, rellenos: form.rellenos,
        leyenda_pastel: form.leyenda_pastel,
        incluye_base: form.extras.base, precio_base: form.extras.base ? (parseFloat(form.preciosExtras.base) || 0) : 0,
        incluye_oblea: form.extras.oblea, precio_oblea: form.extras.oblea ? (parseFloat(form.preciosExtras.oblea) || 0) : 0,
        incluye_muneca: form.extras.muneca, precio_muneca: form.extras.muneca ? (parseFloat(form.preciosExtras.muneca) || 0) : 0,
        incluye_velas: form.extras.velas, precio_velas: form.extras.velas ? (parseFloat(form.preciosExtras.velas) || 0) : 0,
        precio_kilo_usado: calc.precioKilo,
        subtotal_pastel: calc.subtotalPastel,
        subtotal_extras: calc.subtotalExtras,
        total_calculado: calc.totalCalculado,
        total_final: calc.totalFinal,
        a_cuenta: calc.aCuenta,
        resta: calc.resta,
        // PARTE D — inicializar saldo/total_abonado al crear para que el pedido
        // no nazca con saldo_pendiente=null. Math.max evita negativos.
        total_abonado: calc.aCuenta,
        saldo_pendiente: Math.max(0, (Number(calc.totalFinal) || 0) - (Number(calc.aCuenta) || 0)),
        devolver_base: form.devolver_base,
        nota_interna: form.nota_interna,
        imagen_referencia_url: form.imagen_referencia_url,
        notas_generales: form.notas_generales,
        nota_voz_url: form.nota_voz_url,
        nota_voz_transcripcion: form.nota_voz_transcripcion,
      };

      let saved;
      if (editId && pedidoGuardado?.id) {
        await base44.entities.PedidoPastel.update(pedidoGuardado.id, payload);
        saved = { ...pedidoGuardado, ...payload };
        toast.success('Pedido actualizado');
      } else {
        // Folio: prefijo de la sucursal desde entidad Sucursal (fallback inicial del nombre)
        let prefijo = '';
        try {
          const s = await base44.entities.Sucursal.get(sucId);
          prefijo = s?.folio_prefijo || '';
        } catch { /* fallback abajo */ }
        if (!prefijo) prefijo = (sucNombre || 'X').trim().charAt(0).toUpperCase();
        const folio = await generarFolioPedido(sucId, prefijo);
        saved = await base44.entities.PedidoPastel.create({
          ...payload,
          folio,
          estado: 'pendiente',
          creado_por_id: posUser?.id || '',
          creado_por_nombre: posUser?.nombre || '',
        });
        toast.success(`Pedido guardado · ${folio}`);
      }
      queryClient.invalidateQueries({ queryKey: ['pedidos_pastel'] });
      setPedidoGuardado(saved);
    } catch (err) {
      console.error('[NuevoPedidoPastel] guardar:', err);
      toast.error('No se pudo guardar el pedido. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const imprimir = () => {
    try {
      setVerDetalle(true);
    } catch (err) {
      console.error('[NuevoPedidoPastel] imprimir:', err);
    }
  };

  const limpiar = () => {
    setPedidoGuardado(null);
    setForm({
      cliente_nombre: '', cliente_telefono: '', cliente_email: '', cliente_direccion: '',
      fecha_entrega: '', hora_entrega: '',
      personas_estimadas: '', kilos: '', precio_kilo: String(precioKiloConfig),
      extras: { base: false, oblea: false, muneca: false, velas: false },
      preciosExtras: { base: '', oblea: '', muneca: '', velas: '' },
      total_final: '',
      decorado: '', concepto: '', rellenos: '', leyenda_pastel: '',
      nota_interna: '', imagen_referencia_url: '', notas_generales: '',
      nota_voz_url: '', nota_voz_transcripcion: '',
      a_cuenta: '0', devolver_base: true,
    });
    navigate('/pedidos-pastel/nuevo', { replace: true });
  };

  const hoyStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10 bg-transparent">
      {/* SECCIÓN 1 — Encabezado */}
      <Card className="border-2" style={{ borderColor: 'hsl(330,70%,75%)' }}>
        <CardContent className="pt-5 text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Cake className="w-6 h-6" style={{ color: 'hsl(330,70%,50%)' }} />
            <h1 className="text-xl font-heading font-black">Pastelería Confetti</h1>
          </div>
          <p className="text-sm text-muted-foreground">{sucNombre || 'Sin sucursal'}</p>
          <p className="text-xs text-muted-foreground">CDMX a {hoyStr}</p>
          {pedidoGuardado?.folio && (
            <p className="font-mono font-bold text-base">{pedidoGuardado.folio}</p>
          )}
          <p className="text-xs font-semibold" style={{ color: 'hsl(330,70%,50%)' }}>
            {editId ? 'Editando pedido' : 'Pedido de pastel personalizado'}
          </p>
        </CardContent>
      </Card>

      {/* SECCIÓN 2 — Cliente */}
      <Card>
        <CardHeader><CardTitle className="text-base font-heading">2 · Datos del cliente</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nombre del cliente *</Label>
            <Input value={form.cliente_nombre} onChange={e => set('cliente_nombre', e.target.value)} className="skeu-input h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Teléfono / WhatsApp *</Label>
            <Input type="tel" value={form.cliente_telefono} onChange={e => set('cliente_telefono', e.target.value)} className="skeu-input h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Correo electrónico</Label>
            <Input type="email" value={form.cliente_email} onChange={e => set('cliente_email', e.target.value)} className="skeu-input h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Dirección</Label>
            <Input value={form.cliente_direccion} onChange={e => set('cliente_direccion', e.target.value)} className="skeu-input h-11 mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 3 — Entrega */}
      <Card>
        <CardHeader><CardTitle className="text-base font-heading">3 · Datos de entrega</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Fecha de entrega *</Label>
            <Input type="date" value={form.fecha_entrega} onChange={e => set('fecha_entrega', e.target.value)} className="skeu-input h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Hora de entrega</Label>
            <Input type="time" value={form.hora_entrega} onChange={e => set('hora_entrega', e.target.value)} className="skeu-input h-11 mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 4 — Calculadora */}
      <Card className="border-2 border-primary/30">
        <CardHeader><CardTitle className="text-base font-heading">4 · Kilos y precio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Número de personas</Label>
              <Input type="number" min="1" value={form.personas_estimadas}
                onChange={e => onPersonasChange(e.target.value)} className="skeu-input h-11 mt-1" />
              {calc.kilosSugeridos > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">Kilos sugeridos: <strong>{calc.kilosSugeridos} kg</strong> ({ratioConfig} pers/kg)</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Kilos finales *</Label>
              <Input type="number" min="0" step="0.25" value={form.kilos}
                onChange={e => set('kilos', e.target.value)} className="skeu-input h-11 mt-1 font-bold text-lg" />
            </div>
          </div>
          <div className="max-w-xs">
            <Label className="text-xs">Precio por kilo ($)</Label>
            <Input type="number" min="0" step="0.01" value={form.precio_kilo}
              onChange={e => set('precio_kilo', e.target.value)} className="skeu-input h-11 mt-1 font-bold" />
            <p className="text-[10px] text-muted-foreground mt-1">Precio base de configuración: {fmt(precioKiloConfig)}/kg</p>
          </div>

          {/* Extras */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs font-semibold">Extras</Label>
            {extrasPastel.map(e => {
              const precioCfg = Number(e.precio) || 0;
              return (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-2xl skeu-card">
                  <Checkbox
                    id={`extra-${e.id}`}
                    checked={!!form.extras[e.id]}
                    onCheckedChange={v => setForm(f => ({
                      ...f,
                      extras: { ...f.extras, [e.id]: v === true },
                      // Al activar, precargar el precio configurado (si lo hay).
                      preciosExtras: v === true && precioCfg > 0 && !f.preciosExtras[e.id]
                        ? { ...f.preciosExtras, [e.id]: String(precioCfg) }
                        : f.preciosExtras,
                    }))}
                  />
                  <Label htmlFor={`extra-${e.id}`} className="flex-1 cursor-pointer">
                    {e.nombre}
                    <span className="ml-2 text-[11px] text-muted-foreground font-normal">
                      {precioCfg > 0 ? fmt(precioCfg) : 'A consultar'}
                    </span>
                  </Label>
                  <Input
                    type="number" min="0" step="0.01" placeholder="$0"
                    value={form.preciosExtras[e.id] ?? ''}
                    disabled={!form.extras[e.id]}
                    onChange={ev => setForm(f => ({ ...f, preciosExtras: { ...f.preciosExtras, [e.id]: ev.target.value } }))}
                    className="skeu-input w-28 h-10 text-right"
                  />
                </div>
              );
            })}
          </div>

          {/* Resumen */}
          <div className="skeu-card rounded-2xl p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal pastel ({form.kilos || 0} kg × {fmt(calc.precioKilo)})</span><span className="font-semibold">{fmt(calc.subtotalPastel)}</span></div>
            <div className="flex justify-between"><span>Extras</span><span className="font-semibold">{fmt(calc.subtotalExtras)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Total calculado</span><span>{fmt(calc.totalCalculado)}</span></div>
          </div>
          <div className="max-w-xs">
            <Label className="text-xs">Total final ($)</Label>
            <Input type="number" min="0" step="0.01"
              value={form.total_final}
              placeholder={String(calc.totalCalculado)}
              onChange={e => set('total_final', e.target.value)}
              className="skeu-input h-12 mt-1 font-black text-xl" />
            {calc.difiere && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                ⚠ El total difiere significativamente del calculado ({fmt(calc.totalCalculado)})
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 5 — Descripción */}
      <Card>
        <CardHeader><CardTitle className="text-base font-heading">5 · Descripción del pastel</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Decorado</Label>
            <Textarea value={form.decorado} onChange={e => set('decorado', e.target.value)}
              placeholder="Describe cómo debe ir decorado..." className="mt-1 skeu-textarea" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Concepto</Label>
              <Input value={form.concepto} onChange={e => set('concepto', e.target.value)}
                placeholder="XV años, boda, infantil..." className="skeu-input h-11 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Relleno</Label>
              {rellenosPastel.length > 0 ? (
                <>
                  {/* FIX 2 — Si el pedido trae un relleno de texto libre que NO
                      coincide con ningún chip, avisamos para no perder el texto. */}
                  {rellenoTextoLibre && !avisoTextoLibreOculto && (
                    <div className="mt-1.5 mb-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                      <p>
                        Relleno actual (no está en la lista):{' '}
                        <strong className="break-words">{form.rellenos}</strong>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAvisoTextoLibreOculto(true)}
                          className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
                        >
                          Conservar texto
                        </button>
                        <button
                          type="button"
                          onClick={() => set('rellenos', '')}
                          className="px-3 py-1.5 rounded-md border border-amber-400 text-amber-800 text-xs font-medium hover:bg-amber-100"
                        >
                          Cambiar por un chip
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {rellenosPastel.map(r => {
                      const activo = form.rellenos === r.nombre;
                      const precio = Number(r.precio_kilo) || 0;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => set('rellenos', activo ? '' : r.nombre)}
                          className={`px-3 py-2 rounded-full text-sm font-medium border-2 transition-all ${activo
                            ? 'bg-primary text-primary-foreground border-primary shadow'
                            : 'bg-card text-foreground border-border hover:border-primary/50'}`}
                        >
                          {r.nombre}
                          {precio > 0 && (
                            <span className={`ml-1.5 text-[10px] font-normal ${activo ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                              {fmt(precio)}/kg
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <Input value={form.rellenos} onChange={e => set('rellenos', e.target.value)}
                  placeholder="Fruta natural, tres leches, chocolate..." className="skeu-input h-11 mt-1" />
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs">Leyenda en el pastel</Label>
            <Input value={form.leyenda_pastel} onChange={e => set('leyenda_pastel', e.target.value)}
              placeholder="Texto que irá escrito en el pastel" className="skeu-input h-11 mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 6 — Nota interna y referencia */}
      <Card>
        <CardHeader><CardTitle className="text-base font-heading">6 · Nota interna y referencia</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Nota interna (para búsqueda rápida)</Label>
            <Input value={form.nota_interna} onChange={e => set('nota_interna', e.target.value)}
              placeholder="Ej: pastel para Lupita, cliente especial..." className="skeu-input h-11 mt-1" />
          </div>

          {/* FASE 4 — Nota de voz: graba audio + transcripción (dictado es-MX) */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Nota de voz (se graba y se transcribe)
            </Label>
            <NotaVozRecorder
              audioUrl={form.nota_voz_url}
              transcript={form.nota_voz_transcripcion}
              onChange={({ audioUrl, transcript }) => setForm(f => ({ ...f, nota_voz_url: audioUrl, nota_voz_transcripcion: transcript }))}
              disabled={guardando}
            />
            {(form.nota_voz_url || form.nota_voz_transcripcion) && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Transcripción (editable como nota interna)</Label>
                <Textarea
                  value={form.nota_voz_transcripcion}
                  onChange={e => set('nota_voz_transcripcion', e.target.value)}
                  rows={2}
                  placeholder="Lo dictado aparece aquí; puedes corregirlo."
                  className="mt-1"
                />
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Imagen de referencia</Label>
            {/* Selector de modo: subir foto o dibujar */}
            <div className="flex gap-2 mt-1 mb-3">
              <button
                type="button"
                onClick={() => setModoEntrada('imagen')}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${modoEntrada === 'imagen'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'}`}
              >
                📷 Subir foto
              </button>
              <button
                type="button"
                onClick={() => setModoEntrada('dibujo')}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${modoEntrada === 'dibujo'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'}`}
              >
                ✏️ Dibujar
              </button>
            </div>

            {modoEntrada === 'imagen' ? (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 px-4 h-11 rounded-lg border-2 border-dashed cursor-pointer hover:bg-muted/40 text-sm font-medium">
                  <Upload className="w-4 h-4" />
                  {subiendoImg ? 'Subiendo…' : 'Subir imagen'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => subirImagen(e.target.files?.[0])} disabled={subiendoImg} />
                </label>
                <label className="flex items-center gap-2 px-4 h-11 rounded-lg border-2 border-dashed cursor-pointer hover:bg-muted/40 text-sm font-medium">
                  <Camera className="w-4 h-4" />
                  Tomar foto
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => subirImagen(e.target.files?.[0])} disabled={subiendoImg} />
                </label>
                {form.imagen_referencia_url && (
                  <div className="relative">
                    <img src={form.imagen_referencia_url} alt="referencia"
                      className="w-16 h-16 rounded-lg object-cover border" />
                    <button
                      type="button"
                      onClick={() => set('imagen_referencia_url', '')}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600"
                      title="Quitar imagen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <CanvasDibujo onGuardar={(dataUrl) => set('imagen_referencia_url', dataUrl)} />
            )}

            {/* Vista previa del dibujo guardado (mismo campo que la foto) */}
            {modoEntrada === 'dibujo' && form.imagen_referencia_url && (
              <div className="relative inline-block mt-3">
                <img src={form.imagen_referencia_url} alt="dibujo de referencia"
                  className="w-24 h-24 rounded-lg object-cover border bg-white" />
                <button
                  type="button"
                  onClick={() => set('imagen_referencia_url', '')}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600"
                  title="Quitar dibujo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Notas generales</Label>
            <Textarea value={form.notas_generales} onChange={e => set('notas_generales', e.target.value)} className="mt-1 skeu-textarea" />
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 7 — Anticipo (solo datos) */}
      <Card>
        <CardHeader><CardTitle className="text-base font-heading">7 · Anticipo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-xl bg-[#FEF0E7] border border-[#F0DDD5] text-[#5C2D1E] text-sm font-medium dark:bg-[rgba(92,45,30,0.3)] dark:border-[rgba(240,221,213,0.2)] dark:text-[#F5A0C8]">
            Los anticipos se registran aquí. El cobro completo se gestiona desde Pedidos de Pastel.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">A cuenta ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.a_cuenta}
                onChange={e => set('a_cuenta', e.target.value)} className="skeu-input h-11 mt-1 font-bold" />
            </div>
            <div>
              <Label className="text-xs">Resta</Label>
              <div className="h-11 mt-1 px-3 flex items-center rounded-md border bg-muted/40 font-black text-lg">
                {fmt(calc.resta)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 8 — Guardado */}
      <div className="space-y-2">
        <Button onClick={guardar} disabled={guardando}
          className="btn-cobrar w-full rounded-2xl text-lg font-semibold min-h-[56px] text-white">
          <Save className="w-5 h-5 mr-2" />
          {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar pedido'}
        </Button>
        {pedidoGuardado?.id && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" asChild>
                <a href={buildWhatsAppLink(pedidoGuardado)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
                </a>
              </Button>
              <Button variant="outline" className="h-12" onClick={imprimir}>
                <Printer className="w-4 h-4 mr-1.5" />Imprimir ticket
              </Button>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <p className="text-sm font-bold text-emerald-800">✓ Pedido guardado · ¿Qué quieres hacer ahora?</p>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={() => setVerDetalle(true)}>
                  <Eye className="w-4 h-4 mr-1" />Ver pedido
                </Button>
                <Button size="sm" variant="outline" onClick={limpiar}>
                  <Cake className="w-4 h-4 mr-1" />Nuevo pedido
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/pedidos-pastel')}>
                  <ListChecks className="w-4 h-4 mr-1" />Ir a Pedidos
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detalle/impresión del pedido guardado */}
      <PedidoPastelDetalleDialog
        pedido={pedidoGuardado}
        open={verDetalle}
        onClose={() => setVerDetalle(false)}
      />
    </div>
  );
}
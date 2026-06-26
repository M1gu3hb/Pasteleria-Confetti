import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { formatCurrency } from '@/utils/financialUtils';
import { calculateCostPerBaseUnit } from '@/utils/unitConversions';
import {
  getUnidadesCompra, UNIDADES_BASE,
  esUnidadEstandar, validarCompatibilidad,
  convertirAUnidadBase, canonicalUnidad,
} from '@/utils/unidadesMedida';
import IngredienteAutocomplete from '@/components/recetas/IngredienteAutocomplete';
import RepetirCompraDialog from '@/components/compras/RepetirCompraDialog';
import { History, Star, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { normalizarNombreIngrediente, construirMapaIngredientes } from '@/utils/ingredienteMatcher';
import StockMinCritInput from '@/components/inventario/StockMinCritInput';

/** Cada línea: ingrediente existente o nuevo; cantidad/unidad/costo. */
export default function RegistrarCompraDialog({ open, onClose, ingredientes = [] }) {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();
  // Unidades disponibles — combinan las del admin (Configuración) + defaults inalterables.
  const UNIDADES = getUnidadesCompra(config);
  const [lines, setLines] = useState([emptyLine()]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState('efectivo');
  // proveedor: 'directa' (sin proveedor), o el ID del Proveedor seleccionado, o '__libre__' (texto manual).
  const [proveedorMode, setProveedorMode] = useState('directa');
  const [proveedor, setProveedor] = useState(''); // texto libre cuando proveedorMode === '__libre__'
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRepetir, setShowRepetir] = useState(false);
  const [guardarPlantilla, setGuardarPlantilla] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');

  // Proveedores activos para el selector. Solo se cargan cuando el dialog está abierto.
  const { data: proveedoresActivos = [] } = useQuery({
    queryKey: ['proveedores_activos'],
    queryFn: () => base44.entities.Proveedor.filter({ activo: true }),
    initialData: [],
    enabled: open,
  });
  const safeProveedores = Array.isArray(proveedoresActivos) ? proveedoresActivos : [];

  function emptyLine() {
    return {
      tipo: 'existente', // 'existente' | 'nuevo'
      ingrediente: null,
      // Para "nuevo":
      nuevo_nombre: '',
      nuevo_unidad_base: 'g',
      cantidad: '',
      unidad_compra: 'kg',
      costo_total: '',
      piezas_por_paquete: '',
      // Alertas (solo aplican cuando tipo === 'nuevo'). Ya en UNIDAD BASE
      // porque StockMinCritInput convierte antes de retornar.
      // Si el usuario no las toca, quedan en 0 (comportamiento previo).
      stock_minimo_base: 0,
      stock_critico_base: 0,
      // UI: sección visible por defecto. Las alertas son IMPORTANTES para un
      // restaurante, no se esconden como si fueran opcionales sin valor.
      alertasOpen: true,
    };
  }

  const reset = () => {
    setLines([emptyLine()]);
    setProveedorMode('directa');
    setProveedor('');
    setNotas('');
    setMetodoPago('efectivo');
    setFecha(new Date().toISOString().slice(0, 10));
    setGuardarPlantilla(false);
    setNombrePlantilla('');
  };

  // Al repetir compra, intenta mapear el nombre histórico al proveedor activo
  // actual. Si no hay match (proveedor desactivado o no existente), cae a
  // "Otro" con el nombre histórico para que NO se pierda el dato.
  const handleSelectedFromHistory = ({ lineas, proveedor: prov, metodoPago: mp }) => {
    if (lineas?.length) setLines(lineas);
    if (mp) setMetodoPago(mp);
    const provName = String(prov || '').trim();
    if (!provName || provName.toLowerCase() === 'compra directa') {
      setProveedorMode('directa');
      setProveedor('');
    } else {
      const match = safeProveedores.find(
        p => String(p?.nombre || '').trim().toLowerCase() === provName.toLowerCase()
      );
      if (match?.id) {
        setProveedorMode(match.id);
        setProveedor('');
      } else {
        setProveedorMode('__libre__');
        setProveedor(provName);
      }
    }
    toast.success(`${lineas?.length || 0} línea(s) cargadas — revisa y ajusta antes de guardar`);
  };

  const close = () => { reset(); onClose(); };

  const updateLine = (idx, patch) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const totalCompra = lines.reduce((s, l) => s + (parseFloat(l.costo_total) || 0), 0);

  const handleSelectExistente = (idx, ing) => {
    updateLine(idx, {
      ingrediente: ing,
      tipo: 'existente',
      unidad_compra: ing.unidad_compra_default || 'kg',
    });
  };

  const handleCreateNew = (idx, query) => {
    updateLine(idx, {
      tipo: 'nuevo',
      ingrediente: null,
      nuevo_nombre: query,
    });
  };

  // Una unidad requiere equivalencia si NO es estándar directa (kg/g/litro/ml/pieza/alias).
  // Empaques (caja/paquete/bolsa) y unidades personalizadas la requieren.
  const requiereEquivalencia = (u) => {
    const canon = canonicalUnidad(u);
    return canon === null; // null = personalizada o empaque
  };

  const handleSave = async () => {
    const baseValid = lines.filter(l =>
      (l.tipo === 'existente' ? l.ingrediente : l.nuevo_nombre.trim()) &&
      parseFloat(l.cantidad) > 0 &&
      parseFloat(l.costo_total) > 0
    );
    if (baseValid.length === 0) {
      toast.error('Agrega al menos una línea válida con cantidad y costo');
      return;
    }

    // Validar equivalencia + compatibilidad por línea (mensajes específicos)
    for (const l of baseValid) {
      if (requiereEquivalencia(l.unidad_compra) && !(parseFloat(l.piezas_por_paquete) > 0)) {
        toast.error(`Falta indicar a cuánto equivale 1 ${l.unidad_compra} en unidad base.`);
        return;
      }
      const unidadBase = l.tipo === 'existente' ? l.ingrediente?.unidad_base : l.nuevo_unidad_base;
      const { compatible, mensaje } = validarCompatibilidad(l.unidad_compra, unidadBase);
      if (!compatible) {
        toast.error(mensaje || 'La unidad seleccionada no es compatible con la unidad base.');
        return;
      }
    }

    const validLines = baseValid;

    setSaving(true);
    try {
      // Para detectar duplicados contra ingredientes inactivos también, traemos
      // la lista completa una sola vez. Si falla, caemos al prop `ingredientes`
      // (que solo trae activos pero ya cubre 99% de los casos).
      let baseList = ingredientes;
      try {
        const all = await base44.entities.Ingrediente.list('-created_date', 5000);
        if (Array.isArray(all) && all.length > 0) baseList = all;
      } catch {}

      // MAPA EN-VUELO: clave = nombre normalizado, valor = ingrediente vivo.
      // Se actualiza durante el bucle para que líneas posteriores con el mismo
      // nombre normalizado reutilicen el ingrediente recién creado/usado y
      // acumulen stock+costo sobre la VERSIÓN ACTUALIZADA, no la inicial.
      const mapaIng = construirMapaIngredientes(baseList);

      // PRE-VALIDACIÓN DE INACTIVOS: revisamos TODAS las líneas "nuevas" contra el
      // mapa antes de crear la CompraInsumo. Si alguna apunta a un ingrediente
      // desactivado, bloqueamos antes de tocar BD para no dejar una compra
      // huérfana sin detalles.
      const inactivosBloqueantes = [];
      for (const l of validLines) {
        if (l.tipo !== 'nuevo') continue;
        const k = normalizarNombreIngrediente(l.nuevo_nombre);
        const match = k ? mapaIng.get(k) : null;
        if (match && match.activo === false) {
          inactivosBloqueantes.push(match.nombre);
        }
      }
      if (inactivosBloqueantes.length > 0) {
        toast.error(
          `Existe ${inactivosBloqueantes.length === 1 ? 'un ingrediente desactivado' : 'ingredientes desactivados'}: ` +
          `${inactivosBloqueantes.join(', ')}. Reactívalo(s) desde Inventario o cambia el nombre.`
        );
        setSaving(false);
        return;
      }

      // Resolver proveedor antes de guardar:
      //  - 'directa'      → sin proveedor, snapshot = 'Compra directa'
      //  - id de Proveedor → guardar id + nombre como snapshot (para que sobreviva si lo desactivan)
      //  - '__libre__'    → texto manual, sin id
      let provIdFinal = '';
      let provNombreFinal = 'Compra directa';
      if (proveedorMode === '__libre__') {
        provIdFinal = '';
        provNombreFinal = String(proveedor || '').trim() || 'Compra directa';
      } else if (proveedorMode && proveedorMode !== 'directa') {
        const sel = safeProveedores.find(p => p.id === proveedorMode);
        if (sel?.id) {
          provIdFinal = sel.id;
          provNombreFinal = sel.nombre || 'Compra directa';
        }
      }

      const compra = await base44.entities.CompraInsumo.create({
        proveedor_id: provIdFinal,
        proveedor_nombre: provNombreFinal,
        fecha,
        total_compra: totalCompra,
        metodo_pago: metodoPago,
        usuario_id: posUser?.id,
        usuario_nombre: posUser?.nombre,
        notas,
      });

      for (const line of validLines) {
        let ing = line.ingrediente;

        // CASO 1: usuario seleccionó "existente" desde autocomplete.
        // Si dentro de la misma compra ya procesamos ese mismo ingrediente,
        // usamos la versión del mapa (que tiene stock/costo actualizados).
        if (ing) {
          const key = normalizarNombreIngrediente(ing.nombre);
          if (key && mapaIng.has(key)) {
            ing = mapaIng.get(key);
          }
        }

        // CASO 2: línea "nueva". ANTI-DUPLICADO:
        //  a) buscar en el mapa en-vuelo (cubre activos, inactivos y los recién
        //     creados/usados en esta misma compra).
        //  b) si existe → reusar (refrescando desde BD la primera vez).
        //     Si el match estaba inactivo, lo reactivamos para que vuelva a
        //     estar disponible en recetas/compras.
        //  c) si no existe → crear nuevo.
        if (line.tipo === 'nuevo') {
          const key = normalizarNombreIngrediente(line.nuevo_nombre);
          const yaExiste = key ? mapaIng.get(key) : null;
          if (yaExiste) {
            try {
              const fresco = await base44.entities.Ingrediente.get(yaExiste.id);
              ing = fresco || yaExiste;
            } catch {
              ing = yaExiste;
            }
            // Defensa secundaria: la pre-validación ya bloquea inactivos antes de
            // crear la cabecera. Esta guardia es un cinturón extra por si algo
            // cambió entre la validación y este momento.
            if (ing && ing.activo === false) {
              toast.error(
                `"${ing.nombre}" está desactivado. Saltando esta línea.`
              );
              continue;
            }
            toast.info(`"${line.nuevo_nombre.trim()}" ya existe — sumando al ingrediente existente.`);
          } else {
            // Ingrediente NUEVO real. Si el usuario capturó alertas, las
            // persistimos ya convertidas a unidad base (StockMinCritInput).
            // Si no, quedan en 0 (sin alertas), igual que antes.
            ing = await base44.entities.Ingrediente.create({
              nombre: line.nuevo_nombre.trim(),
              unidad_base: line.nuevo_unidad_base,
              unidad_compra_default: line.unidad_compra,
              stock_actual: 0,
              stock_minimo: Math.max(0, Number(line.stock_minimo_base) || 0),
              stock_critico: Math.max(0, Number(line.stock_critico_base) || 0),
              activo: true,
            });
          }
          // OJO: en la rama anti-duplicado (yaExiste) NO tocamos stock_minimo
          // ni stock_critico — respetamos lo que ya tenía configurado el admin.
        }
        if (!ing) continue;

        const qty = parseFloat(line.cantidad) || 0;
        const cost = parseFloat(line.costo_total) || 0;
        const equivalencia = parseFloat(line.piezas_por_paquete) || ing.cantidad_por_compra_default || 1;

        // Conversión central — soporta alias (kg/kilogramo/kilo, l/lt/litro, etc.) y
        // unidades personalizadas con equivalencia. Para estándar se ignora el segundo arg.
        const qtyBase = convertirAUnidadBase(qty, line.unidad_compra, equivalencia);
        const costPerBase = calculateCostPerBaseUnit(cost, qtyBase);

        const oldStock = ing.stock_actual || 0;
        const oldCost = ing.costo_por_unidad_base || 0;
        const newStock = oldStock + qtyBase;
        const newAvgCost = newStock > 0
          ? ((oldStock * oldCost) + (qtyBase * costPerBase)) / newStock
          : costPerBase;

        await base44.entities.DetalleCompra.create({
          compra_id: compra.id,
          ingrediente_id: ing.id,
          ingrediente_nombre: ing.nombre,
          cantidad_comprada: qty,
          unidad_compra: line.unidad_compra,
          cantidad_convertida_unidad_base: qtyBase,
          costo_total: cost,
          costo_unitario_base_calculado: costPerBase,
        });

        const ingActualizado = {
          ...ing,
          stock_actual: newStock,
          costo_por_unidad_base: Math.round(newAvgCost * 10000) / 10000,
          costo_compra_default: cost / qty,
          unidad_compra_default: line.unidad_compra,
          cantidad_por_compra_default: qty,
        };

        await base44.entities.Ingrediente.update(ing.id, {
          stock_actual: ingActualizado.stock_actual,
          costo_por_unidad_base: ingActualizado.costo_por_unidad_base,
          costo_compra_default: ingActualizado.costo_compra_default,
          unidad_compra_default: ingActualizado.unidad_compra_default,
          cantidad_por_compra_default: ingActualizado.cantidad_por_compra_default,
        });

        // Actualizamos el mapa en-vuelo con el estado nuevo del ingrediente
        // para que líneas posteriores con el mismo nombre normalizado
        // acumulen sobre estos valores y NO sobre los originales.
        const keyAct = normalizarNombreIngrediente(ing.nombre);
        if (keyAct) mapaIng.set(keyAct, ingActualizado);

        await base44.entities.MovimientoInventario.create({
          ingrediente_id: ing.id,
          ingrediente_nombre: ing.nombre,
          tipo_movimiento: 'entrada_compra',
          cantidad: qtyBase,
          unidad_base: ing.unidad_base,
          stock_anterior: oldStock,
          stock_nuevo: newStock,
          costo_unitario_en_momento: costPerBase,
          costo_total_movimiento: cost,
          referencia_tipo: 'compra',
          referencia_id: compra.id,
          motivo: line.tipo === 'nuevo' ? 'Compra de ingrediente nuevo' : 'Reabasto',
          usuario_id: posUser?.id,
          usuario_nombre: posUser?.nombre,
          fecha: new Date().toISOString(),
        });
      }

      // Guardar como plantilla recurrente
      if (guardarPlantilla && nombrePlantilla.trim()) {
        await base44.entities.PlantillaCompra.create({
          nombre: nombrePlantilla.trim(),
          proveedor_nombre: provNombreFinal === 'Compra directa' ? '' : provNombreFinal,
          activa: true,
          ultima_fecha_uso: new Date().toISOString(),
          veces_usada: 1,
          lineas: validLines.map(l => ({
            ingrediente_id: l.ingrediente?.id || '',
            ingrediente_nombre: l.ingrediente?.nombre || l.nuevo_nombre,
            cantidad: parseFloat(l.cantidad) || 0,
            unidad_compra: l.unidad_compra,
            costo_total: parseFloat(l.costo_total) || 0,
          })),
        }).catch(() => {});
      }

      ['ingredientes_all', 'compras_all', 'movimientos_inv', 'registros_compras', 'registros_movimientos'].forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      toast.success(`Compra registrada — ${validLines.length} línea(s) · ${formatCurrency(totalCompra)}`);
      close();
    } catch (e) {
      toast.error('Error al registrar: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Registrar compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Repetir compra anterior */}
          <Button type="button" variant="outline" onClick={() => setShowRepetir(true)} className="w-full justify-start gap-2">
            <History className="w-4 h-4" /> Repetir compra anterior o usar plantilla recurrente
          </Button>
          {/* Datos secundarios — colapsados arriba */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/40">
            <div>
              <Label className="text-[10px] uppercase">Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase">Proveedor</Label>
              <Select value={proveedorMode} onValueChange={(v) => {
                setProveedorMode(v);
                if (v !== '__libre__') setProveedor('');
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecciona proveedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="directa">Compra directa / Sin proveedor</SelectItem>
                  {safeProveedores.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                  <SelectItem value="__libre__">Otro (escribir manualmente)</SelectItem>
                </SelectContent>
              </Select>
              {proveedorMode === '__libre__' && (
                <Input
                  value={proveedor}
                  onChange={e => setProveedor(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="h-8 text-xs mt-1.5"
                />
              )}
            </div>
          </div>

          {/* Líneas */}
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="rounded-xl border bg-card text-card-foreground p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Línea {idx + 1}</p>
                  {lines.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Toggle existente / nuevo */}
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => updateLine(idx, { tipo: 'existente', ingrediente: null, nuevo_nombre: '' })}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${line.tipo === 'existente' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    Existente
                  </button>
                  <button type="button"
                    onClick={() => updateLine(idx, { tipo: 'nuevo', ingrediente: null })}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${line.tipo === 'nuevo' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    Nuevo
                  </button>
                </div>

                {/* Selector */}
                {line.tipo === 'existente' ? (
                  <div>
                    <Label className="text-xs">Buscar ingrediente</Label>
                    <IngredienteAutocomplete
                      ingredientes={ingredientes}
                      value={line.ingrediente}
                      onSelect={(ing) => handleSelectExistente(idx, ing)}
                      onCreateNew={(q) => handleCreateNew(idx, q)}
                    />
                    {line.ingrediente && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Stock actual: {Number(line.ingrediente.stock_actual || 0).toLocaleString()} {line.ingrediente.unidad_base}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nombre del ingrediente</Label>
                      <Input value={line.nuevo_nombre}
                        onChange={e => updateLine(idx, { nuevo_nombre: e.target.value })}
                        placeholder="Ej: Café molido" />
                    </div>
                    <div>
                      <Label className="text-xs">Unidad base (cómo se usa)</Label>
                      <Select value={line.nuevo_unidad_base} onValueChange={v => updateLine(idx, { nuevo_unidad_base: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNIDADES_BASE.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Cantidad / unidad / costo */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Cantidad comprada</Label>
                    <Input type="number" value={line.cantidad}
                      onChange={e => updateLine(idx, { cantidad: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-xs">Unidad de compra</Label>
                    <Select value={line.unidad_compra} onValueChange={v => updateLine(idx, { unidad_compra: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Costo total ($)</Label>
                    <Input type="number" value={line.costo_total}
                      onChange={e => updateLine(idx, { costo_total: e.target.value })} placeholder="$0" />
                  </div>
                </div>

                {/* Alertas de inventario — SOLO cuando se crea ingrediente nuevo.
                    Sección colapsable para no ensuciar el flujo rápido de compra.
                    NO aparece en ingredientes existentes para no sobrescribir sus umbrales. */}
                {line.tipo === 'nuevo' && (
                  <div className="rounded-lg border border-dashed bg-muted/30 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateLine(idx, { alertasOpen: !line.alertasOpen })}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent, hsl(var(--primary)))' }} />
                        Alertas de inventario
                      </span>
                      {line.alertasOpen
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {line.alertasOpen && (
                      <div className="px-3 pb-3 pt-1 space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          Define cuándo el sistema debe avisarte que este ingrediente está bajo o crítico.
                        </p>
                        <StockMinCritInput
                          unidadBase={line.nuevo_unidad_base || 'g'}
                          valoresEnBase={{
                            stock_minimo: Number(line.stock_minimo_base) || 0,
                            stock_critico: Number(line.stock_critico_base) || 0,
                          }}
                          onChange={({ stock_minimo, stock_critico }) =>
                            updateLine(idx, {
                              stock_minimo_base: stock_minimo,
                              stock_critico_base: stock_critico,
                            })
                          }
                          compact
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Validación de compatibilidad inline + equivalencia si aplica */}
                {(() => {
                  const unidadBase = line.tipo === 'existente' ? line.ingrediente?.unidad_base : line.nuevo_unidad_base;
                  const compat = unidadBase ? validarCompatibilidad(line.unidad_compra, unidadBase) : { compatible: true };
                  const necesitaEq = requiereEquivalencia(line.unidad_compra);
                  return (
                    <>
                      {!compat.compatible && (
                        <div className="rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200">
                          {compat.mensaje}
                        </div>
                      )}
                      {necesitaEq && (
                        <div className="rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                          <Label className="text-xs">
                            ¿A cuánto equivale 1 {line.unidad_compra} en unidad base ({unidadBase || 'g/ml/pieza'})? *
                          </Label>
                          <Input type="number" value={line.piezas_por_paquete}
                            onChange={e => updateLine(idx, { piezas_por_paquete: e.target.value })}
                            placeholder={
                              unidadBase === 'g'
                                ? 'Ej: 1000 (gramos por bolsa)'
                                : unidadBase === 'ml'
                                  ? 'Ej: 20000 (ml por garrafón)'
                                  : 'Ej: 24 (piezas por caja)'
                            }
                            className="h-8" />
                          <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1">
                            {esUnidadEstandar(line.unidad_compra)
                              ? 'Esta unidad es un empaque — indica cuánto trae cada uno.'
                              : 'Esta es una unidad personalizada. Necesitamos su equivalencia para calcular costos.'}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={addLine} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> Agregar otra línea
          </Button>

          <div>
            <Label className="text-xs">Notas</Label>
            <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
          </div>

          {/* Guardar como plantilla recurrente — dark-aware */}
          <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={guardarPlantilla}
                onChange={e => setGuardarPlantilla(e.target.checked)} className="mt-1" />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-1 text-amber-900 dark:text-amber-200">
                  <Star className="w-3.5 h-3.5 text-amber-500" /> Guardar como plantilla recurrente
                </p>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
                  Para repetir esta compra rápidamente la próxima vez.
                </p>
              </div>
            </label>
            {guardarPlantilla && (
              <Input value={nombrePlantilla}
                onChange={e => setNombrePlantilla(e.target.value)}
                placeholder='Ej: "Compra semanal panadería"' className="h-9 text-sm" />
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
            <span className="text-sm font-medium">Total compra</span>
            <span className="font-heading font-black text-xl text-primary">{formatCurrency(totalCompra)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar compra'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <RepetirCompraDialog
        open={showRepetir}
        onClose={() => setShowRepetir(false)}
        onSelected={handleSelectedFromHistory}
      />
    </Dialog>
  );
}
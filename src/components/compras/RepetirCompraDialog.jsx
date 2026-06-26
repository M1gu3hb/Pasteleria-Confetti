import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Search, History, Star, Trash2, Package, ChevronDown, ChevronUp, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';
import { toast } from 'sonner';

/**
 * Dialog para elegir UNA compra anterior o plantilla recurrente.
 * Muestra detalle completo (proveedor, ingredientes, cantidades, precios, total)
 * para que el administrador entienda qué está repitiendo antes de hacerlo.
 *
 * Al seleccionar llama onSelected(payload) con líneas listas para precargar.
 * NO registra nada — el formulario padre permite revisar y editar antes de guardar.
 */
export default function RepetirCompraDialog({ open, onClose, onSelected }) {
  const [tab, setTab] = useState('historial');
  const [search, setSearch] = useState('');
  const [compras, setCompras] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [detallesPorCompra, setDetallesPorCompra] = useState({}); // compra_id → DetalleCompra[]
  const [expandedCompra, setExpandedCompra] = useState(null);
  const [expandedPlantilla, setExpandedPlantilla] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(null);

  useEffect(() => {
    if (!open) {
      // limpiar expansiones al cerrar para que no se quede estado entre aperturas
      setExpandedCompra(null);
      setExpandedPlantilla(null);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      const [comps, plants] = await Promise.all([
        base44.entities.CompraInsumo.list('-created_date', 60).catch(() => []),
        base44.entities.PlantillaCompra.filter({ activa: true }).catch(() => []),
      ]);
      if (!cancel) {
        setCompras(Array.isArray(comps) ? comps : []);
        setPlantillas(Array.isArray(plants) ? plants : []);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open]);

  const q = search.trim().toLowerCase();
  const comprasFiltered = compras.filter(c =>
    !q || (c?.proveedor_nombre || '').toLowerCase().includes(q) ||
    (c?.fecha || '').includes(q)
  );

  // Lazy-load del detalle: solo cargamos cuando el usuario expande la fila.
  const cargarDetalle = async (compraId) => {
    if (!compraId || detallesPorCompra[compraId]) return;
    setLoadingDetalle(compraId);
    try {
      const dets = await base44.entities.DetalleCompra.filter({ compra_id: compraId });
      setDetallesPorCompra(prev => ({ ...prev, [compraId]: Array.isArray(dets) ? dets : [] }));
    } catch (e) {
      setDetallesPorCompra(prev => ({ ...prev, [compraId]: [] }));
    }
    setLoadingDetalle(null);
  };

  const toggleCompra = (id) => {
    if (expandedCompra === id) {
      setExpandedCompra(null);
    } else {
      setExpandedCompra(id);
      cargarDetalle(id);
    }
  };

  const pickCompra = async (compra) => {
    // Aseguramos tener el detalle (puede no estar cargado si nunca expandió)
    let dets = detallesPorCompra[compra.id];
    if (!dets) {
      try {
        dets = await base44.entities.DetalleCompra.filter({ compra_id: compra.id });
      } catch {
        dets = [];
      }
    }
    const safeDets = Array.isArray(dets) ? dets : [];
    const lineas = safeDets.map(d => ({
      tipo: 'existente',
      ingrediente: { id: d.ingrediente_id, nombre: d.ingrediente_nombre },
      cantidad: String(d.cantidad_comprada || ''),
      unidad_compra: d.unidad_compra || 'kg',
      costo_total: String(d.costo_total || ''),
      piezas_por_paquete: '',
      nuevo_nombre: '',
      nuevo_unidad_base: 'g',
    }));
    onSelected?.({
      lineas,
      proveedor: compra.proveedor_nombre || '',
      metodoPago: compra.metodo_pago || 'efectivo',
    });
    onClose();
  };

  const pickPlantilla = (p) => {
    const lineas = (Array.isArray(p?.lineas) ? p.lineas : []).map(l => ({
      tipo: 'existente',
      ingrediente: l.ingrediente_id ? { id: l.ingrediente_id, nombre: l.ingrediente_nombre } : null,
      cantidad: String(l.cantidad || ''),
      unidad_compra: l.unidad_compra || 'kg',
      costo_total: String(l.costo_total || ''),
      piezas_por_paquete: '',
      nuevo_nombre: '',
      nuevo_unidad_base: 'g',
    }));
    onSelected?.({
      lineas,
      proveedor: p.proveedor_nombre || '',
      metodoPago: 'efectivo',
    });
    onClose();
  };

  const eliminarPlantilla = async (p, e) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar plantilla "${p.nombre}"?`)) return;
    try {
      // SOFT-DELETE para preservar referencias históricas
      await base44.entities.PlantillaCompra.update(p.id, { activa: false });
      setPlantillas(prev => prev.filter(x => x.id !== p.id));
      toast.success('Plantilla eliminada');
    } catch (err) {
      toast.error('Error: ' + (err?.message || ''));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="font-heading">Repetir compra anterior</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Selecciona una compra del historial o una plantilla. Verás el detalle completo y podrás
            editar antes de registrar.
          </p>
        </DialogHeader>

        <div className="px-5 pt-3 flex gap-2">
          <button onClick={() => setTab('historial')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 justify-center ${tab === 'historial' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <History className="w-4 h-4" /> Historial ({compras.length})
          </button>
          <button onClick={() => setTab('plantillas')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 justify-center ${tab === 'plantillas' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <Star className="w-4 h-4" /> Plantillas ({plantillas.length})
          </button>
        </div>

        {tab === 'historial' && (
          <div className="px-5 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Buscar por proveedor o fecha..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && <p className="text-center text-sm text-muted-foreground py-6">Cargando...</p>}

          {/* HISTORIAL */}
          {tab === 'historial' && !loading && comprasFiltered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Sin compras en el historial.</p>
          )}
          {tab === 'historial' && comprasFiltered.map(c => {
            const expanded = expandedCompra === c.id;
            const dets = detallesPorCompra[c.id];
            return (
              <Card key={c.id} className="overflow-hidden">
                <div
                  className="p-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer"
                  onClick={() => toggleCompra(c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                      {c.proveedor_nombre || 'Compra directa'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.fecha ? format(new Date(c.fecha), "d MMM yyyy", { locale: es }) : ''}
                      {c.usuario_nombre ? ` · ${c.usuario_nombre}` : ''}
                      {c.metodo_pago ? ` · ${c.metodo_pago}` : ''}
                    </p>
                  </div>
                  <p className="font-heading font-bold whitespace-nowrap">{formatCurrency(c.total_compra)}</p>
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>

                {expanded && (
                  <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                    {loadingDetalle === c.id && (
                      <p className="text-xs text-muted-foreground py-2">Cargando ingredientes…</p>
                    )}
                    {loadingDetalle !== c.id && Array.isArray(dets) && dets.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">
                        Esta compra no tiene detalles registrados.
                      </p>
                    )}
                    {loadingDetalle !== c.id && Array.isArray(dets) && dets.length > 0 && (
                      <>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Package className="w-3 h-3" /> {dets.length} ingrediente{dets.length === 1 ? '' : 's'}
                        </p>
                        <div className="space-y-1">
                          {dets.map(d => (
                            <div key={d.id} className="flex items-center justify-between text-xs gap-2">
                              <span className="truncate flex-1">{d.ingrediente_nombre || '—'}</span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {Number(d.cantidad_comprada || 0).toLocaleString()} {d.unidad_compra || ''}
                              </span>
                              <span className="font-medium whitespace-nowrap">
                                {formatCurrency(d.costo_total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={(e) => { e.stopPropagation(); pickCompra(c); }}
                    >
                      Usar esta compra <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}

          {/* PLANTILLAS */}
          {tab === 'plantillas' && !loading && plantillas.length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">Aún no tienes plantillas recurrentes.</p>
              <p className="text-xs text-muted-foreground mt-1">Al guardar una compra, marca "Guardar como plantilla recurrente".</p>
            </div>
          )}
          {tab === 'plantillas' && plantillas.map(p => {
            const expanded = expandedPlantilla === p.id;
            const lineas = Array.isArray(p.lineas) ? p.lineas : [];
            const total = lineas.reduce((s, l) => s + (Number(l?.costo_total) || 0), 0);
            return (
              <Card key={p.id} className="overflow-hidden">
                <div
                  className="p-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer"
                  onClick={() => setExpandedPlantilla(expanded ? null : p.id)}
                >
                  <Star className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      {p.proveedor_nombre && (
                        <span className="inline-flex items-center gap-0.5">
                          <Truck className="w-3 h-3" />{p.proveedor_nombre}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px] py-0 h-4">
                        {lineas.length} ingrediente{lineas.length === 1 ? '' : 's'}
                      </Badge>
                      {p.ultima_fecha_uso && (
                        <span>
                          Última vez: {format(new Date(p.ultima_fecha_uso), "d MMM yyyy", { locale: es })}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="font-heading font-bold whitespace-nowrap">{formatCurrency(total)}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => eliminarPlantilla(p, e)} title="Eliminar plantilla">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {expanded && (
                  <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                    {lineas.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Esta plantilla no tiene líneas guardadas.
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Package className="w-3 h-3" /> Incluye:
                        </p>
                        <div className="space-y-1">
                          {lineas.map((l, i) => (
                            <div key={i} className="flex items-center justify-between text-xs gap-2">
                              <span className="truncate flex-1">{l.ingrediente_nombre || '—'}</span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {Number(l.cantidad || 0).toLocaleString()} {l.unidad_compra || ''}
                              </span>
                              <span className="font-medium whitespace-nowrap">
                                {formatCurrency(l.costo_total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={(e) => { e.stopPropagation(); pickPlantilla(p); }}
                    >
                      Usar esta plantilla <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
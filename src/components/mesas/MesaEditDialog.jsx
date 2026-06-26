import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZONAS_MESA, FORMAS_MESA, TAMANOS_MESA, ROLES } from '@/lib/constants';
import { Trash2, AlertTriangle, UserCircle2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { colorParaUsuario } from '@/lib/asignacionMesas';

const TAMANO_KEYS = Object.keys(TAMANOS_MESA);

const SIN_ASIGNAR = '__sin__';

const empty = {
  numero: '', nombre: '', zona: 'Interior', capacidad: 4,
  forma: 'redonda', tamano: 'mediana',
  posicion_x: 120, posicion_y: 120, activo: true,
  mesero_asignado_id: '', mesero_asignado_nombre: '', mesero_asignado_color: '',
};

// Estados que indican que la mesa está en uso y NO puede eliminarse.
const ESTADOS_OCUPADA = [
  'esperando_orden', 'pedido_enviado', 'en_preparacion',
  'en_espera_entrega', 'ocupada', 'cuenta_solicitada',
];

export default function MesaEditDialog({ open, mesa, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(empty);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = !!mesa?.id;

  // Meseros activos para el selector. Solo se carga cuando el diálogo está abierto.
  const { data: meseros = [] } = useQuery({
    queryKey: ['usuarios_pos_meseros'],
    queryFn: () => base44.entities.UsuarioPOS.filter({ activo: true, rol: ROLES.WAITER }),
    initialData: [],
    enabled: open,
  });

  useEffect(() => {
    if (mesa) setForm({ ...empty, ...mesa });
    else setForm(empty);
  }, [mesa, open]);

  const meserosOrdenados = useMemo(() =>
    (Array.isArray(meseros) ? meseros : []).slice().sort((a, b) =>
      String(a?.nombre || '').localeCompare(String(b?.nombre || ''))
    ),
    [meseros]
  );

  const handleMeseroChange = (val) => {
    if (val === SIN_ASIGNAR) {
      setForm(f => ({ ...f, mesero_asignado_id: '', mesero_asignado_nombre: '', mesero_asignado_color: '' }));
      return;
    }
    const u = meserosOrdenados.find(m => m.id === val);
    if (!u) return;
    setForm(f => ({
      ...f,
      mesero_asignado_id: u.id,
      mesero_asignado_nombre: u.nombre || '',
      mesero_asignado_color: colorParaUsuario(u),
    }));
  };

  const handleSave = () => {
    if (!form.numero) return;
    onSave({
      ...form,
      numero: parseInt(form.numero) || 0,
      capacidad: parseInt(form.capacidad) || 0,
      posicion_x: parseInt(form.posicion_x) || 0,
      posicion_y: parseInt(form.posicion_y) || 0,
    });
  };

  // Detecta si la mesa está ocupada / con venta activa
  const mesaOcupada = !!mesa && (
    !!mesa.venta_activa_id ||
    ESTADOS_OCUPADA.includes(mesa.estado)
  );

  const handleDeleteClick = () => {
    if (mesaOcupada) return;
    setConfirmDelete(true);
  };

  const handleConfirmDelete = () => {
    setConfirmDelete(false);
    if (mesa?.id && typeof onDelete === 'function') {
      onDelete(mesa.id);
    }
  };

  const meseroSeleccionado = form.mesero_asignado_id || SIN_ASIGNAR;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {isEdit ? `Editar mesa ${mesa.numero}` : 'Nueva mesa'}
            </DialogTitle>
          </DialogHeader>

          {isEdit && mesaOcupada && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                Esta mesa está <strong>ocupada o con venta activa</strong>. Puedes editar sus datos,
                pero no se puede eliminar hasta que se libere.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Número *</Label>
              <Input type="number" value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Nombre visible</Label>
              <Input value={form.nombre || ''}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Opcional" />
            </div>
            <div>
              <Label className="text-xs">Zona</Label>
              <Select value={form.zona} onValueChange={v => setForm({ ...form, zona: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ZONAS_MESA.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Capacidad</Label>
              <Input type="number" value={form.capacidad}
                onChange={e => setForm({ ...form, capacidad: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Forma</Label>
              <Select value={form.forma} onValueChange={v => setForm({ ...form, forma: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_MESA.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tamaño</Label>
              <Select value={form.tamano} onValueChange={v => setForm({ ...form, tamano: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAMANO_KEYS.map(k => <SelectItem key={k} value={k}>{TAMANOS_MESA[k].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Posición X</Label>
              <Input type="number" value={form.posicion_x}
                onChange={e => setForm({ ...form, posicion_x: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Posición Y</Label>
              <Input type="number" value={form.posicion_y}
                onChange={e => setForm({ ...form, posicion_y: e.target.value })} />
            </div>

            {/* Mesero asignado (solo aplica cuando asignacion_mesas_activa = true) */}
            <div className="col-span-2">
              <Label className="text-xs flex items-center gap-1">
                <UserCircle2 className="w-3.5 h-3.5" />
                Mesero asignado
              </Label>
              <Select value={meseroSeleccionado} onValueChange={handleMeseroChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                  {meserosOrdenados.map(u => {
                    const c = u.color || colorParaUsuario(u);
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full border" style={{ background: c }} />
                          {u.nombre}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Solo aplica si "Asignación de mesas a meseros" está activa. Si está apagada, todos los meseros ven todas las mesas.
              </p>
              {form.mesero_asignado_id && form.mesero_asignado_color && (
                <div className="mt-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border bg-muted/40">
                  <span className="inline-block w-3 h-3 rounded-full border" style={{ background: form.mesero_asignado_color }} />
                  <span>{form.mesero_asignado_nombre}</span>
                </div>
              )}
            </div>

            <div className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div>
                <Label className="text-xs">Mesa activa</Label>
                <p className="text-[10px] text-muted-foreground">Si está inactiva no aparece en Mesero.</p>
              </div>
              <Switch checked={!!form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {isEdit && onDelete ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteClick}
                disabled={mesaOcupada}
                title={mesaOcupada ? 'No se puede eliminar una mesa ocupada' : 'Eliminar mesa'}
              >
                <Trash2 className="w-4 h-4 mr-1" />Eliminar
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSave}>{isEdit ? 'Guardar cambios' : 'Crear mesa'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que quieres eliminar esta mesa?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Se eliminará la mesa <strong>#{mesa?.numero}{mesa?.nombre ? ` · ${mesa.nombre}` : ''}</strong> del mapa.
              </span>
              <span className="block text-xs text-muted-foreground">
                No se borrarán ventas, registros ni historial — solo la mesa del mapa actual.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Sí, eliminar mesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
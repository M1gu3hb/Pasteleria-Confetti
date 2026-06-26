import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Truck, Plus, Pencil, Trash2, Phone, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Configuración → Operación → "Proveedores".
 *
 * CRUD básico sobre la entidad Proveedor:
 *  - Crear, editar, desactivar (soft-delete con activo:false).
 *  - Listar solo activos.
 *  - El proveedor desactivado conserva historial: las CompraInsumo pasadas
 *    siguen mostrando su nombre (snapshot en proveedor_nombre).
 *
 * No toca: Compras existentes, MovimientoInventario, costos, recetas, ventas.
 */
export default function ProveedoresSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // proveedor en edición o {} para nuevo
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores_activos'],
    queryFn: () => base44.entities.Proveedor.filter({ activo: true }),
    initialData: [],
  });

  const openNew = () => {
    setEditing({ nombre: '', contacto: '', telefono: '', correo: '', notas: '' });
    setShowForm(true);
  };
  const openEdit = (p) => {
    setEditing({ ...p });
    setShowForm(true);
  };
  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async () => {
    const nombre = String(editing?.nombre || '').trim();
    if (!nombre) { toast.error('El nombre del proveedor es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        nombre,
        contacto: String(editing.contacto || '').trim(),
        telefono: String(editing.telefono || '').trim(),
        correo: String(editing.correo || '').trim(),
        notas: String(editing.notas || '').trim(),
        activo: true,
      };
      if (editing?.id) {
        await base44.entities.Proveedor.update(editing.id, payload);
        toast.success('Proveedor actualizado');
      } else {
        await base44.entities.Proveedor.create(payload);
        toast.success('Proveedor creado');
      }
      queryClient.invalidateQueries({ queryKey: ['proveedores_activos'] });
      closeForm();
    } catch (e) {
      toast.error('Error al guardar: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  const confirmarDesactivar = async () => {
    if (!confirmDel?.id) return;
    setSaving(true);
    try {
      // SOFT-DELETE: las compras pasadas conservan proveedor_nombre como snapshot,
      // así que desactivar el proveedor NO afecta el historial financiero.
      await base44.entities.Proveedor.update(confirmDel.id, { activo: false });
      toast.success(`Proveedor "${confirmDel.nombre}" desactivado`);
      queryClient.invalidateQueries({ queryKey: ['proveedores_activos'] });
      setConfirmDel(null);
    } catch (e) {
      toast.error('Error: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" />
          Proveedores
        </CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Administra a quién le compras insumos. Los proveedores aparecen como opción al
          registrar una compra. Desactivarlos no borra el historial — las compras pasadas
          siguen mostrando el nombre.
        </p>

        <div className="space-y-2">
          {(Array.isArray(proveedores) ? proveedores : []).map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 border">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                {(p.contacto || p.telefono || p.correo) && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                    {p.contacto && <span>{p.contacto}</span>}
                    {p.telefono && (
                      <span className="inline-flex items-center gap-0.5">
                        <Phone className="w-2.5 h-2.5" />{p.telefono}
                      </span>
                    )}
                    {p.correo && (
                      <span className="inline-flex items-center gap-0.5 truncate">
                        <Mail className="w-2.5 h-2.5" />{p.correo}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Editar">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDel(p)}
                  title="Desactivar"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          {proveedores.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              Aún no hay proveedores. Agrega el primero con "Nuevo".
            </p>
          )}
        </div>
      </CardContent>

      {/* Formulario crear/editar */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) closeForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing?.id ? 'Editar proveedor' : 'Nuevo proveedor'}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nombre *</Label>
                <Input
                  value={editing.nombre || ''}
                  onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                  placeholder="Ej: Panadería San José"
                />
              </div>
              <div>
                <Label className="text-xs">Persona de contacto</Label>
                <Input
                  value={editing.contacto || ''}
                  onChange={e => setEditing({ ...editing, contacto: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input
                    value={editing.telefono || ''}
                    onChange={e => setEditing({ ...editing, telefono: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label className="text-xs">Correo</Label>
                  <Input
                    value={editing.correo || ''}
                    onChange={e => setEditing({ ...editing, correo: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Input
                  value={editing.notas || ''}
                  onChange={e => setEditing({ ...editing, notas: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !String(editing?.nombre || '').trim()}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de desactivación */}
      <AlertDialog open={!!confirmDel} onOpenChange={(v) => { if (!v) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              ¿Desactivar proveedor?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{confirmDel?.nombre}"</strong> dejará de aparecer como opción al registrar
              compras nuevas. Las compras pasadas con este proveedor se mantienen intactas en el
              historial financiero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarDesactivar} disabled={saving}>
              Sí, desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
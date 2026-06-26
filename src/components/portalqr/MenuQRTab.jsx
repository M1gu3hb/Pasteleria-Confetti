import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Upload, Trash2, ImageIcon, Edit } from 'lucide-react';
import { toast } from 'sonner';

const empty = { nombre: '', descripcion: '', imagen_url: '', orden: 0, activo: true };

/**
 * Pestaña "Menú QR": admin gestiona secciones de menú subido (imágenes).
 */
export default function MenuQRTab() {
  const queryClient = useQueryClient();
  const [editForm, setEditForm] = useState(null);
  const [uploading, setUploading] = useState(false);

  const { data: secciones = [] } = useQuery({
    queryKey: ['menu_qr_secciones'],
    queryFn: () => base44.entities.MenuQRSeccion.list('orden', 100),
    initialData: [],
  });

  const abrirNueva = () => setEditForm({ ...empty });
  const abrirEditar = (s) => setEditForm({ ...empty, ...s });

  const guardar = async () => {
    if (!editForm?.nombre?.trim()) {
      toast.error('Pon un nombre a la sección');
      return;
    }
    try {
      const payload = {
        nombre: editForm.nombre.trim(),
        descripcion: editForm.descripcion || '',
        imagen_url: editForm.imagen_url || '',
        orden: Number(editForm.orden) || 0,
        activo: editForm.activo !== false,
      };
      if (editForm.id) {
        await base44.entities.MenuQRSeccion.update(editForm.id, payload);
      } else {
        await base44.entities.MenuQRSeccion.create(payload);
      }
      queryClient.invalidateQueries({ queryKey: ['menu_qr_secciones'] });
      setEditForm(null);
      toast.success('Sección guardada');
    } catch (err) {
      console.error('[MenuQRTab] guardar:', err);
      toast.error('No se pudo guardar');
    }
  };

  const eliminar = async (s) => {
    if (!confirm(`¿Eliminar sección "${s.nombre}"?`)) return;
    try {
      await base44.entities.MenuQRSeccion.delete(s.id);
      queryClient.invalidateQueries({ queryKey: ['menu_qr_secciones'] });
      toast.success('Eliminada');
    } catch (err) {
      console.error('[MenuQRTab] eliminar:', err);
      toast.error('No se pudo eliminar');
    }
  };

  const subir = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Máximo 8 MB');
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setEditForm(prev => ({ ...prev, imagen_url: file_url }));
      toast.success('Imagen subida');
    } catch (err) {
      console.error('[MenuQRTab] subir:', err);
      toast.error('Error al subir');
    } finally {
      setUploading(false);
      try { e.target.value = ''; } catch {}
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Sube imágenes/carteles de tu menú: comidas, bebidas, postres, vinos, promos...
          </p>
        </div>
        <Button onClick={abrirNueva} className="gap-2">
          <Plus className="w-4 h-4" /> Nueva sección
        </Button>
      </div>

      {secciones.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground rounded-xl border-2 border-dashed">
          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No hay secciones de menú subidas todavía.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {secciones.map(s => (
          <div key={s.id} className="rounded-xl border bg-white overflow-hidden">
            {s.imagen_url ? (
              <img src={s.imagen_url} alt={s.nombre} className="w-full h-40 object-cover" />
            ) : (
              <div className="w-full h-40 bg-muted flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-8 h-8 opacity-40" />
              </div>
            )}
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-heading font-bold text-sm">{s.nombre}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.activo === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                  {s.activo === false ? 'Inactiva' : 'Activa'}
                </span>
              </div>
              {s.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.descripcion}</p>}
              <div className="flex gap-1 mt-2">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => abrirEditar(s)}>
                  <Edit className="w-3 h-3 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => eliminar(s)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editForm} onOpenChange={(o) => { if (!o) setEditForm(null); }}>
        <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editForm?.id ? 'Editar sección' : 'Nueva sección de menú'}</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nombre *</Label>
                <Input value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
                  placeholder="Bebidas, Postres, Vinos..." />
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Textarea value={editForm.descripcion}
                  onChange={e => setEditForm({ ...editForm, descripcion: e.target.value })}
                  placeholder="(opcional)" rows={2} />
              </div>
              <div>
                <Label className="text-xs">Imagen del menú</Label>
                {editForm.imagen_url && (
                  <img src={editForm.imagen_url} alt="preview" className="w-full max-h-48 object-contain bg-muted rounded mb-2" />
                )}
                <label className="flex items-center justify-center gap-2 h-10 px-3 border rounded-md cursor-pointer hover:bg-muted text-sm">
                  <Upload className="w-4 h-4" /> {uploading ? 'Subiendo...' : (editForm.imagen_url ? 'Cambiar imagen' : 'Subir imagen')}
                  <input type="file" accept="image/*" className="hidden" onChange={subir} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Orden</Label>
                  <Input type="number" value={editForm.orden}
                    onChange={e => setEditForm({ ...editForm, orden: e.target.value })} />
                </div>
                <div className="flex items-end gap-2">
                  <Switch checked={editForm.activo !== false}
                    onCheckedChange={(v) => setEditForm({ ...editForm, activo: v })} />
                  <span className="text-xs">{editForm.activo !== false ? 'Activa' : 'Inactiva'}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>Cancelar</Button>
            <Button onClick={guardar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound, User, Phone, Mail, Palette, Save, Layers, AlertTriangle, Store } from 'lucide-react';
import { ROLES_CONFETTI, ROLES } from '@/lib/constants';
import { useConfig } from '@/lib/ConfigContext';
import { toast } from 'sonner';
import { COCINA_GENERAL_COLOR } from '@/utils/estacionUtils';

// Paleta sugerida para colores de usuario
const COLORES = [
  '#1E5FCF', '#16A34A', '#E63946', '#9B5DE5', '#E68A33', '#0EA5B7',
  '#D946AB', '#B45309', '#3F6212', '#7C3AED', '#0369A1', '#BE185D',
];

// Sentinela para "Todas las estaciones" en el Select de estación.
const TODAS = '__todas__';

/**
 * Diálogo para crear/editar un UsuarioPOS.
 *
 * F3 — Correcciones F2:
 *  - El selector de rol YA NO muestra "Barra" (es una estación, no un rol).
 *    Usa ROLE_LABELS_SELECTABLE en lugar de ROLE_LABELS. Si un usuario
 *    legacy tiene rol='barra', al editarlo el Select mostrará el valor
 *    como vacío (porque no está en la lista); el guardado por defecto lo
 *    convertirá a 'cocina' si el admin lo cambia, o quedará intacto si no
 *    lo toca.
 *  - Se lee `estaciones_preparacion_activas` desde useConfig() (carga global)
 *    en lugar de una query propia que tardaba en hidratarse y hacía que el
 *    bloque de estación no apareciera al crear nuevo usuario.
 *  - Cuando rol=cocina y estaciones activas, EXIGE selección de estación o
 *    "Todas las estaciones". Si no hay estaciones creadas, lo advierte y
 *    bloquea el guardado.
 */
export default function UsuarioPOSDialog({ open, onClose, user, onSave }) {
  const isEdit = !!user?.id;
  const { config } = useConfig();
  const estacionesActivas = config?.estaciones_preparacion_activas === true;

  const [form, setForm] = useState({
    nombre: '', rol: 'administrador', pin: '', telefono: '', correo: '',
    color: '', activo: true,
    estacion_preparacion_id: '',
    puede_ver_todas_estaciones: false,
    sucursal_id: '', sucursal_nombre: '',
  });
  const [cambiarPin, setCambiarPin] = useState(false);
  const [nuevoPin, setNuevoPin] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [saving, setSaving] = useState(false);

  // Estaciones activas (para selector). Solo se carga cuando el diálogo está abierto
  // y estaciones están activas — no consume datos en otros flujos.
  const { data: estaciones = [] } = useQuery({
    queryKey: ['estaciones_preparacion_activas'],
    queryFn: () => base44.entities.EstacionPreparacion.filter({ activo: true }),
    initialData: [],
    enabled: open && estacionesActivas,
  });

  // Usuarios activos — para detectar duplicado de color por rol.
  const { data: usuariosAll = [] } = useQuery({
    queryKey: ['usuarios_pos_all'],
    queryFn: () => base44.entities.UsuarioPOS.filter({ activo: true }),
    initialData: [],
    enabled: open,
  });

  // Sucursales activas — para el campo "Sucursal asignada" del rol administrador.
  // Se carga solo con el diálogo abierto. isLoading se usa para el loading state.
  const { data: sucursales = [], isLoading: sucursalesLoading } = useQuery({
    queryKey: ['sucursales_activas_form_usuario'],
    queryFn: () => base44.entities.Sucursal.filter({ activa: true }),
    initialData: [],
    enabled: open,
  });
  const sucursalesArr = Array.isArray(sucursales) ? sucursales : [];

  useEffect(() => {
    if (open) {
      setForm({
        nombre: user?.nombre || '',
        // Si el rol del usuario no está en los seleccionables (ej. legacy 'barra'),
        // pre-rellenamos con el valor real para no perder dato; solo el selector
        // mostrará la lista corta.
        // Normaliza rol legacy con tilde ('dueño') al valor de código 'dueno'.
        rol: (user?.rol === 'dueño' ? 'dueno' : user?.rol) || 'administrador',
        pin: user?.pin || '',
        telefono: user?.telefono || '',
        correo: user?.correo || '',
        color: user?.color || '',
        activo: user?.activo !== false,
        estacion_preparacion_id: user?.estacion_preparacion_id || '',
        puede_ver_todas_estaciones: user?.puede_ver_todas_estaciones === true,
        sucursal_id: user?.sucursal_id || '',
        sucursal_nombre: user?.sucursal_nombre || '',
      });
      setVerPin(false);
      setCambiarPin(false);
      setNuevoPin('');
      setConfirmarPin('');
    }
  }, [open, user]);

  const esMesero = form.rol === ROLES.WAITER;
  const esCocina = form.rol === ROLES.KITCHEN;
  // Confetti: solo se crean dueño/administrador. El administrador requiere
  // una sucursal asignada; el dueño no tiene sucursal.
  const esAdminConfetti = form.rol === ROLES.ADMIN;
  const mostrarSucursal = esAdminConfetti;
  // El color se ofrece a meseros siempre, y a cocina cuando estaciones están activas.
  const mostrarColor = esMesero || (esCocina && estacionesActivas);
  // Mostrar bloque de estación solo para cocina + estaciones activas.
  const mostrarEstacion = esCocina && estacionesActivas;
  // Aviso si el rol del usuario actual es legacy 'barra' y no está en el selector.
  const esRolLegacyBarra = form.rol === 'barra';

  const estacionesArr = Array.isArray(estaciones) ? estaciones : [];

  // ¿La estación asignada actualmente está inactiva o eliminada?
  const estacionAsignadaInactiva = useMemo(() => {
    if (!mostrarEstacion) return false;
    const id = form.estacion_preparacion_id;
    if (!id) return false;
    return !estacionesArr.some((e) => e?.id === id);
  }, [mostrarEstacion, form.estacion_preparacion_id, estacionesArr]);

  // Duplicado de color entre usuarios activos del MISMO rol (mesero o cocina).
  const colorDuplicado = useMemo(() => {
    if (!mostrarColor || !form.color) return null;
    const otros = (Array.isArray(usuariosAll) ? usuariosAll : []).filter(
      (u) => u && u.id !== user?.id && u.rol === form.rol && u.color
    );
    const dup = otros.find((u) => (u.color || '').toLowerCase() === form.color.toLowerCase());
    return dup || null;
  }, [mostrarColor, form.color, form.rol, usuariosAll, user?.id]);

  const guardar = async () => {
    if (saving) return;
    if (!form.nombre?.trim()) { toast.error('El nombre es obligatorio'); return; }

    let pinFinal = form.pin;
    if (!isEdit) {
      if (!nuevoPin || nuevoPin.length !== 4 || !/^\d{4}$/.test(nuevoPin)) {
        toast.error('El PIN debe ser de 4 dígitos numéricos');
        return;
      }
      if (nuevoPin !== confirmarPin) {
        toast.error('El PIN y su confirmación no coinciden');
        return;
      }
      pinFinal = nuevoPin;
    } else if (cambiarPin) {
      if (!nuevoPin || nuevoPin.length !== 4 || !/^\d{4}$/.test(nuevoPin)) {
        toast.error('El nuevo PIN debe ser de 4 dígitos numéricos');
        return;
      }
      if (nuevoPin !== confirmarPin) {
        toast.error('El nuevo PIN y su confirmación no coinciden');
        return;
      }
      pinFinal = nuevoPin;
    }

    // F3 — Validación cocina con estaciones activas: debe tener estación o "todas".
    if (mostrarEstacion) {
      if (estacionesArr.length === 0) {
        toast.error('Aún no hay estaciones creadas. Crea al menos una en Configuración → Operación → Estaciones de preparación.');
        return;
      }
      const tieneEstacion = !!form.estacion_preparacion_id;
      const tieneTodas = form.puede_ver_todas_estaciones === true;
      if (!tieneEstacion && !tieneTodas) {
        toast.error('Selecciona una estación para este usuario de cocina o marca "Todas las estaciones".');
        return;
      }
      // Si tiene un id pero la estación ya no está activa, bloquear.
      if (tieneEstacion && estacionAsignadaInactiva) {
        toast.error('La estación asignada ya no está activa. Selecciona otra antes de guardar.');
        return;
      }
    }

    // Confetti: el administrador debe tener una sucursal asignada.
    if (mostrarSucursal) {
      if (sucursalesLoading) {
        toast.error('Espera a que carguen las sucursales.');
        return;
      }
      if (sucursalesArr.length === 0) {
        toast.error('No hay sucursales activas. Crea una en Configuración antes de asignar un administrador.');
        return;
      }
      if (!form.sucursal_id) {
        toast.error('Selecciona la sucursal asignada para este administrador.');
        return;
      }
    }

    // Bloquear duplicado de color del mismo rol (solo mesero / cocina con estaciones).
    if (colorDuplicado) {
      toast.error(
        `Este color ya está asignado a "${colorDuplicado.nombre}". Elige otro para evitar confusión visual.`
      );
      return;
    }

    setSaving(true);
    try {
      const colorFinal = mostrarColor ? (form.color || '') : '';

      // Snapshot de estación (solo si aplica).
      let estacionId = '';
      let estacionNombre = '';
      let estacionColor = '';
      let puedeTodas = false;
      if (mostrarEstacion) {
        puedeTodas = form.puede_ver_todas_estaciones === true;
        if (!puedeTodas && form.estacion_preparacion_id) {
          const est = estacionesArr.find((e) => e?.id === form.estacion_preparacion_id);
          estacionId = form.estacion_preparacion_id;
          estacionNombre = est?.nombre || '';
          estacionColor = est?.color || COCINA_GENERAL_COLOR;
        }
      }

      // Sucursal: solo el administrador la lleva. El dueño no tiene sucursal.
      const sucSel = mostrarSucursal
        ? sucursalesArr.find((s) => s?.id === form.sucursal_id)
        : null;

      const payload = {
        nombre: form.nombre.trim(),
        rol: form.rol,
        pin: pinFinal,
        telefono: form.telefono || '',
        correo: form.correo || '',
        color: colorFinal,
        activo: form.activo !== false,
        estacion_preparacion_id: estacionId,
        estacion_preparacion_nombre: estacionNombre,
        estacion_preparacion_color: estacionColor,
        puede_ver_todas_estaciones: puedeTodas,
        sucursal_id: mostrarSucursal ? (form.sucursal_id || '') : '',
        sucursal_nombre: mostrarSucursal ? (sucSel?.nombre || '') : '',
      };
      await onSave?.(payload, user);
    } finally {
      setSaving(false);
    }
  };

  // Selector de estación: maneja el valor "todas" como sentinela.
  const estacionSelectValue = (() => {
    if (form.puede_ver_todas_estaciones) return TODAS;
    return form.estacion_preparacion_id || '';
  })();

  const onEstacionChange = (v) => {
    if (v === TODAS) {
      setForm((f) => ({ ...f, estacion_preparacion_id: '', puede_ver_todas_estaciones: true }));
    } else {
      setForm((f) => ({ ...f, estacion_preparacion_id: v, puede_ver_todas_estaciones: false }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose?.(); }}>
      <DialogContent className="sm:max-w-md w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            {isEdit ? `Editar usuario · ${user?.nombre}` : 'Nuevo usuario POS'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre del usuario"
            />
          </div>

          {/* Rol — solo Dueño / Administrador en Confetti */}
          <div>
            <Label className="text-xs">Rol</Label>
            <Select
              value={form.rol}
              onValueChange={v => setForm({
                ...form,
                rol: v,
                // Limpiar estación/color (no aplican a dueño/admin).
                estacion_preparacion_id: '',
                puede_ver_todas_estaciones: false,
                color: '',
                // El dueño no tiene sucursal asignada.
                ...(v !== ROLES.ADMIN ? { sucursal_id: '', sucursal_nombre: '' } : {}),
              })}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona rol…" /></SelectTrigger>
              <SelectContent>
                {ROLES_CONFETTI.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {esRolLegacyBarra && (
              <div className="mt-2 text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  Este usuario tiene un rol antiguo <strong>"Barra"</strong>. Selecciona <strong>Dueño</strong> o <strong>Administrador</strong> para actualizarlo.
                </span>
              </div>
            )}
          </div>

          {/* Sucursal asignada — obligatoria solo para Administrador */}
          {mostrarSucursal && (
            <div className="rounded-xl border p-3 bg-muted/30 space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Store className="w-3 h-3" /> Sucursal asignada *
              </Label>
              <p className="text-[10px] text-muted-foreground">
                El administrador opera sobre esta sucursal. El dueño no necesita sucursal.
              </p>
              {sucursalesLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                  Cargando sucursales…
                </div>
              ) : sucursalesArr.length === 0 ? (
                <div className="text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>No hay sucursales activas. Crea una en Configuración antes de asignar un administrador.</span>
                </div>
              ) : (
                <Select
                  value={form.sucursal_id || ''}
                  onValueChange={(v) => {
                    const suc = sucursalesArr.find((s) => s?.id === v);
                    setForm((f) => ({ ...f, sucursal_id: v, sucursal_nombre: suc?.nombre || '' }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona sucursal…" /></SelectTrigger>
                  <SelectContent>
                    {sucursalesArr.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s?.nombre || '—'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* === F3: Estación de cocina (corregido F2) === */}
          {mostrarEstacion && (
            <div className="rounded-xl border p-3 bg-muted/30 space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Estación de cocina *
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Asigna a este usuario una estación específica o marca "Todas las estaciones"
                para que vea la vista general (administrador de cocina).
              </p>
              {estacionesArr.length === 0 ? (
                <div className="text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Aún no hay estaciones creadas. Ve a Configuración → Operación → Estaciones de preparación.
                  </span>
                </div>
              ) : (
                <Select value={estacionSelectValue} onValueChange={onEstacionChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona estación…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>
                      <span className="inline-flex items-center gap-2">
                        <Layers className="w-3 h-3" />
                        Todas las estaciones (vista general)
                      </span>
                    </SelectItem>
                    {estacionesArr.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="w-2.5 h-2.5 rounded-full border"
                            style={{ background: e?.color || COCINA_GENERAL_COLOR }}
                          />
                          {e?.nombre || '—'}
                          {e?.es_general && <span className="text-[9px] text-muted-foreground">(general)</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {estacionAsignadaInactiva && (
                <div className="text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    La estación asignada ya no está activa. Selecciona otra antes de guardar.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Color (mesero o cocina con estaciones) */}
          {mostrarColor && (
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Palette className="w-3 h-3" /> Color del usuario
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {esMesero
                  ? 'Se usa para identificar visualmente sus mesas y solicitudes.'
                  : 'Se usa para identificar visualmente a este usuario en cocina.'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {COLORES.map(c => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${form.color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={form.color || '#1E5FCF'}
                  onChange={e => setForm({ ...form, color: e.target.value })}
                  className="w-8 h-8 rounded-full border cursor-pointer p-0"
                  title="Color personalizado"
                />
                {form.color && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, color: '' })}
                    className="text-xs h-7"
                  >
                    Auto
                  </Button>
                )}
              </div>
              {colorDuplicado && (
                <div className="mt-2 text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Este color ya está asignado a <strong>{colorDuplicado.nombre}</strong>. Elige otro para evitar confusión visual.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* PIN */}
          <div className="rounded-xl border p-3 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound className="w-3 h-3" /> NIP / PIN
              </Label>
            </div>
            {/* CAMBIOS_V2 Fase 08 — se quitó "Ver NIP": el PIN es bcrypt y no se
                puede mostrar. Para cambiarlo se usa "Cambiar NIP" (RPC). */}
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">
                El NIP está cifrado y no se puede mostrar. Usa “Cambiar NIP” para asignar uno nuevo.
              </p>
            )}

            {/* Cambiar PIN */}
            {isEdit && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t">
                <Label className="text-xs">Cambiar NIP</Label>
                <Switch checked={cambiarPin} onCheckedChange={setCambiarPin} />
              </div>
            )}

            {(cambiarPin || !isEdit) && (
              <div className="space-y-2 pt-1">
                <div>
                  <Label className="text-xs">{isEdit ? 'Nuevo NIP (4 dígitos)' : 'NIP (4 dígitos) *'}</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={nuevoPin}
                    onChange={e => setNuevoPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="font-mono tracking-widest"
                  />
                </div>
                <div>
                  <Label className="text-xs">Confirmar NIP</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmarPin}
                    onChange={e => setConfirmarPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="font-mono tracking-widest"
                  />
                </div>
                {nuevoPin && confirmarPin && nuevoPin !== confirmarPin && (
                  <p className="text-xs text-red-600">Los NIP no coinciden.</p>
                )}
              </div>
            )}
          </div>

          {/* Contacto (opcional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> Teléfono <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                placeholder="Ej: 55 1234 5678"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> Correo <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                type="email"
                value={form.correo}
                onChange={e => setForm({ ...form, correo: e.target.value })}
                placeholder="usuario@ejemplo.com"
              />
            </div>
          </div>

          {/* Activo */}
          {isEdit && (
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label className="text-sm font-medium">Activo</Label>
                <p className="text-[10px] text-muted-foreground">Si está apagado, el usuario no podrá iniciar sesión.</p>
              </div>
              <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
            </div>
          )}
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
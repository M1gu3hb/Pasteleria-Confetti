import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Settings, Users, UtensilsCrossed, Plus, Trash2, AlertTriangle, Save, Palette, Cloud, Sparkles, ShieldAlert, Database, Cake } from 'lucide-react';
import PastelesConfigSection from '@/components/configuracion/PastelesConfigSection';
import DatosSection from '@/components/datos/DatosSection';
import ModoPresentacion from '@/components/configuracion/ModoPresentacion';
import ReiniciarSistemaSection from '@/components/configuracion/ReiniciarSistemaSection';
import CategoriasProductoSection from '@/components/configuracion/CategoriasProductoSection';
import { ROLE_LABELS, ZONAS_MESA } from '@/lib/constants';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { hasPermission } from '@/lib/permissions';
import IdentidadNegocio from '@/components/configuracion/IdentidadNegocio';
import UsuarioPOSDialog from '@/components/configuracion/UsuarioPOSDialog';
import { useConfig } from '@/lib/ConfigContext';
import { Pencil, Phone, Mail } from 'lucide-react';

const useIsMobile = () => {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
};

export default function Configuracion() {
  const queryClient = useQueryClient();
  const { posUser } = usePOSAuth();
  const { paquete_modo } = useConfig();
  const showMesasTab = paquete_modo === 'restaurante_pro';
  // Dueño y administrador ven las pestañas avanzadas. Acepta 'dueño' (legacy
  // con tilde) y 'dueno' (valor de código) además de 'administrador'.
  const esAdminODueno = ['dueño', 'dueno', 'administrador'].includes(posUser?.rol);
  const puedeEliminarMesas = hasPermission(posUser?.rol, 'eliminar_mesas');
  const isMobile = useIsMobile();
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // usuario en edición (null = crear nuevo)
  const [showEliminarMesas, setShowEliminarMesas] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [zonaFiltro, setZonaFiltro] = useState('Interior');
  const [editingMesa, setEditingMesa] = useState(null);
  const [showMesaDialog, setShowMesaDialog] = useState(false);

  // HOTFIX persistencia: sin initialData:[] para distinguir "primer fetch"
  // de "vacío real". placeholderData mantiene el valor previo durante el
  // refetch (evita flashes a {} entre invalidación y respuesta).
  const { data: config, isPending: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => base44.entities.ConfiguracionNegocio.list(),
    placeholderData: (prev) => prev,
    staleTime: 3000,
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios_pos'],
    queryFn: () => base44.entities.UsuarioPOS.filter({ activo: true }),
    initialData: [],
  });

  const { data: mesas = [] } = useQuery({
    queryKey: ['mesas'],
    queryFn: () => base44.entities.Mesa.list('-created_date', 500),
    initialData: [],
  });

  // HOTFIX: cfg seguro. Si la query aún no respondió, cfg queda null
  // (no {} con defaults) para que los useEffects de los hijos NO se hidraten
  // con valores fantasma y NO pisen el state real al regresar a la pantalla.
  const cfg = Array.isArray(config) && config[0] ? config[0] : null;
  const cfgListo = !!cfg?.id;

  // Datos de OPERACIÓN. NOTA: nombre_negocio NO está aquí — vive solo en Identidad.
  // Inicializamos con defaults SEGUROS (no leemos cfg aquí porque cfg puede ser
  // null en el primer render). La hidratación real ocurre en el useEffect.
  // IMPORTANTE: usamos ?? donde el valor false es válido (switches), nunca ||.
  const [bizForm, setBizForm] = useState({
    direccion: '',
    telefono: '',
    correo: '',
    iva_porcentaje: 0,
    usa_mesas: true,
    permitir_venta_sin_stock: false,
    mensaje_ticket: '¡Gracias por tu visita!',
    descargar_pdf_corte_auto: true,
    propinas_activas: true,
    propina_porcentajes_sugeridos: '5,10,15,20',
    asignacion_mesas_activa: false,
    silenciar_notificaciones_admin: true,
    portal_qr_permitir_pedidos_cliente: false,
    estaciones_preparacion_activas: false,
  });

  // Resync cuando llega cfg del backend o cuando cambia (updated_date).
  // ⛔ NO se ejecuta con cfg null/vacío → no pisa el form con strings vacíos.
  // ✅ Se vuelve a ejecutar si el backend cambia (otro tab guarda) gracias a
  //    incluir updated_date en la dependencia.
  useEffect(() => {
    if (!cfg?.id) return;
    setBizForm(f => ({
      ...f,
      direccion: cfg.direccion ?? '',
      telefono: cfg.telefono ?? '',
      correo: cfg.correo ?? '',
      iva_porcentaje: cfg.iva_porcentaje ?? 0,
      usa_mesas: cfg.usa_mesas ?? true,
      permitir_venta_sin_stock: cfg.permitir_venta_sin_stock ?? false,
      mensaje_ticket: cfg.mensaje_ticket ?? '¡Gracias por tu visita!',
      descargar_pdf_corte_auto: cfg.descargar_pdf_corte_auto ?? true,
      propinas_activas: cfg.propinas_activas ?? true,
      propina_porcentajes_sugeridos: cfg.propina_porcentajes_sugeridos ?? '5,10,15,20',
      asignacion_mesas_activa: cfg.asignacion_mesas_activa === true,
      silenciar_notificaciones_admin: cfg.silenciar_notificaciones_admin ?? true,
      portal_qr_permitir_pedidos_cliente: cfg.portal_qr_permitir_pedidos_cliente === true,
      estaciones_preparacion_activas: cfg.estaciones_preparacion_activas === true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.id, cfg?.updated_date]);

  // Estado de guardado para deshabilitar botones y mostrar loading visible.
  const [savingBiz, setSavingBiz] = useState(false);

  const saveBiz = async () => {
    if (savingBiz) return;
    // HOTFIX persistencia: bloquear guardar mientras cfg no haya llegado.
    // Si guardamos antes, mandamos los defaults del useState (todos truthy)
    // y pisamos el backend con valores fantasma. Esto causaba que el switch
    // "vuelva a prenderse" al regresar a la pantalla.
    if (!cfgListo && !configLoading) {
      // Caso "primera vez" — backend vacío. Permitimos crear con bizForm + nombre mínimo.
      setSavingBiz(true);
      try {
        await base44.entities.ConfiguracionNegocio.create({
          nombre_negocio: 'Mi Negocio',
          ...bizForm,
        });
        // Esperamos el refetch real antes de confirmar éxito (clave en móvil
        // con red lenta: antes el toast aparecía aunque la red fallara).
        await queryClient.refetchQueries({ queryKey: ['config'] });
        toast.success('Configuración guardada');
      } catch (e) {
        toast.error('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
      } finally {
        setSavingBiz(false);
      }
      return;
    }
    if (configLoading || !cfg?.id) {
      toast.error('Espera a que cargue la configuración antes de guardar');
      return;
    }
    setSavingBiz(true);
    try {
      // Solo persistimos los campos de OPERACIÓN. Identidad maneja su propio save.
      // Nunca tocamos campos de Identidad (nombre_negocio, logos, colores, etc.)
      // desde acá para no pisar lo que la pestaña Identidad haya guardado.
      await base44.entities.ConfiguracionNegocio.update(cfg.id, bizForm);
      // HOTFIX móvil: invalidate sin await NO basta — en red lenta el usuario
      // navega antes del refetch y la cache devuelve valores viejos. Esperamos
      // al refetch para garantizar que ConfigContext ya tiene los datos nuevos.
      await queryClient.refetchQueries({ queryKey: ['config'] });
      toast.success('Configuración guardada');
    } catch (e) {
      console.error('[Configuracion] saveBiz:', e);
      toast.error('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSavingBiz(false);
    }
  };

  // Crea o actualiza un UsuarioPOS desde el diálogo unificado.
  // Si cambia el color de un mesero, sincroniza los snapshots de color
  // en las mesas que tiene asignadas o que está atendiendo, para que la
  // estética se refleje inmediatamente en el mapa de mesas.
  const handleSaveUser = async (payload, prevUser) => {
    try {
      // F3 — Segunda barrera de validación (server-side defensiva).
      // Aunque el Dialog ya valida, aquí prevenimos guardados inválidos
      // por bugs futuros o por flujos alternos que llamen a handleSaveUser.
      const estacionesActivasNow = cfg?.estaciones_preparacion_activas === true;
      if (estacionesActivasNow && payload?.rol === 'cocina') {
        const tieneEstacion = !!payload?.estacion_preparacion_id;
        const tieneTodas = payload?.puede_ver_todas_estaciones === true;
        if (!tieneEstacion && !tieneTodas) {
          toast.error('No se puede guardar: este usuario de cocina necesita una estación o "Todas las estaciones".');
          return;
        }
      }

      let saved = null;
      if (prevUser?.id) {
        await base44.entities.UsuarioPOS.update(prevUser.id, payload);
        saved = { ...prevUser, ...payload };
      } else {
        saved = await base44.entities.UsuarioPOS.create({ ...payload, activo: true });
      }

      // Sincronizar color en mesas (solo si es mesero y cambió el color).
      const colorAntes = prevUser?.color || '';
      const colorDespues = payload?.color || '';
      const esMesero = payload?.rol === 'mesero';
      if (esMesero && prevUser?.id && colorAntes !== colorDespues) {
        try {
          const mesasArr = Array.isArray(mesas) ? mesas : [];
          const afectadas = mesasArr.filter(m =>
            m?.mesero_asignado_id === prevUser.id ||
            m?.atendido_por_id === prevUser.id
          );
          await Promise.all(afectadas.map(m => {
            const upd = {};
            if (m.mesero_asignado_id === prevUser.id) upd.mesero_asignado_color = colorDespues;
            if (m.atendido_por_id === prevUser.id) upd.atendido_por_color = colorDespues;
            if (Object.keys(upd).length === 0) return null;
            return base44.entities.Mesa.update(m.id, upd).catch(() => {});
          }));
        } catch (e) {
          console.warn('[Configuracion] sync color mesas:', e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['usuarios_pos'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios_pos_all'] });
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setShowUserForm(false);
      setEditingUser(null);
      toast.success(prevUser?.id ? 'Usuario actualizado' : 'Usuario creado');
    } catch (e) {
      toast.error('No se pudo guardar el usuario: ' + (e?.message || ''));
    }
  };

  const deleteUser = async (id) => {
    await base44.entities.UsuarioPOS.update(id, { activo: false });
    queryClient.invalidateQueries({ queryKey: ['usuarios_pos'] });
    toast.success('Usuario desactivado');
  };

  const handleSaveMesa = async (data) => {
    if (!data?.numero) { toast.error('El número de mesa es obligatorio'); return; }
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await base44.entities.Mesa.update(id, rest);
        toast.success(`Mesa ${data.numero} actualizada`);
      } else {
        await base44.entities.Mesa.create({ ...data, estado: data.estado || 'libre' });
        toast.success(`Mesa ${data.numero} creada`);
      }
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setShowMesaDialog(false);
      setEditingMesa(null);
    } catch (e) {
      toast.error('No se pudo guardar la mesa: ' + (e?.message || ''));
    }
  };

  const handleDeleteMesa = async (id) => {
    try {
      // Validación defensiva en backend: revisar si tiene venta activa
      const mesa = mesas.find(m => m.id === id);
      const ESTADOS_OCUPADA = [
        'esperando_orden', 'pedido_enviado', 'en_preparacion',
        'en_espera_entrega', 'ocupada', 'cuenta_solicitada',
      ];
      if (mesa && (mesa.venta_activa_id || ESTADOS_OCUPADA.includes(mesa.estado))) {
        toast.error('No se puede eliminar una mesa con venta o pedido activo. Libera la mesa primero.');
        return;
      }
      await base44.entities.Mesa.delete(id);
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      toast.success('Mesa eliminada');
      setShowMesaDialog(false);
      setEditingMesa(null);
    } catch (e) {
      toast.error('Error al eliminar la mesa: ' + (e?.message || ''));
    }
  };

  const handlePositionChange = async (id, x, y) => {
    await base44.entities.Mesa.update(id, { posicion_x: x, posicion_y: y });
    queryClient.invalidateQueries({ queryKey: ['mesas'] });
  };

  const handleReorder = async (id, nuevoOrden) => {
    await base44.entities.Mesa.update(id, { orden: nuevoOrden });
    queryClient.invalidateQueries({ queryKey: ['mesas'] });
  };

  const openNew = () => {
    const maxNum = mesas.reduce((m, x) => Math.max(m, x.numero || 0), 0);
    // Crear mesa en la zona activa (no mezclar zonas).
    const mesasZona = mesas.filter(m => (m.zona || 'Interior') === zonaFiltro);
    setEditingMesa({
      numero: maxNum + 1, nombre: '', zona: zonaFiltro,
      capacidad: 4, forma: 'redonda', tamano: 'mediana',
      posicion_x: 60 + (mesasZona.length % 8) * 90, posicion_y: 60 + Math.floor(mesasZona.length / 8) * 100,
      activo: true, estado: 'libre',
    });
    setShowMesaDialog(true);
  };

  const mesasFiltradas = mesas.filter(m => (m.zona || 'Interior') === zonaFiltro);

  const eliminarMesasDemo = async () => {
    setEliminando(true);
    try {
      const res = await base44.functions.invoke('eliminarMesasDemo', { rol: posUser?.rol });
      if (res?.data?.ok) {
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        toast.success('Mesas eliminadas correctamente. Ahora puedes crear tu mapa desde cero.');
        setShowEliminarMesas(false);
      } else {
        toast.error(res?.data?.error || 'Error al eliminar mesas');
      }
    } catch (e) {
      toast.error('Error: ' + (e.message || ''));
    }
    setEliminando(false);
  };

  // HOTFIX: skeleton durante la primera carga de cfg para evitar que el usuario
  // toque switches con valores default antes de que llegue el cfg real.
  // Si cfg nunca cargó (primera vez del negocio), igual permitimos abrir las
  // pestañas (cfgListo=false + !configLoading) — saveBiz lo trata como "create".
  if (configLoading && !cfg) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configuración" description="Ajustes del sistema MH Astral Systems" />
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm">Cargando configuración…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Ajustes del sistema MH Astral Systems" />

      <Tabs defaultValue="identidad">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="identidad"><Palette className="w-3 h-3 mr-1" />Identidad</TabsTrigger>
          <TabsTrigger value="negocio"><Settings className="w-3 h-3 mr-1" />Operación</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="w-3 h-3 mr-1" />Usuarios POS</TabsTrigger>
          <TabsTrigger value="pasteles"><Cake className="w-3 h-3 mr-1" />Pasteles</TabsTrigger>
          {/* Fase 6 — pestañas ocultas para Confetti (código conservado) */}
          {false && (
            <TabsTrigger value="datos"><Database className="w-3 h-3 mr-1" />Datos</TabsTrigger>
          )}
          {false && (
            <TabsTrigger value="presentacion"><Sparkles className="w-3 h-3 mr-1" />Presentación</TabsTrigger>
          )}
          {esAdminODueno && (
            <TabsTrigger value="mantenimiento"><ShieldAlert className="w-3 h-3 mr-1" />Mantenimiento</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="identidad">
          <IdentidadNegocio cfg={cfg} />
        </TabsContent>

        <TabsContent value="negocio">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-heading">Datos del negocio</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estos datos aparecen en tickets, PDFs y Portal QR. El nombre del negocio se edita
                en la pestaña <strong>Identidad</strong>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Dirección</Label>
                  <Input value={bizForm.direccion}
                    onChange={e => setBizForm({ ...bizForm, direccion: e.target.value })}
                    placeholder="Calle, número, colonia, ciudad" />
                </div>
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={bizForm.telefono} onChange={e => setBizForm({ ...bizForm, telefono: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Correo</Label>
                  <Input value={bizForm.correo} onChange={e => setBizForm({ ...bizForm, correo: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">IVA / Impuesto (%)</Label>
                  <Input type="number" min="0" step="0.01"
                    value={bizForm.iva_porcentaje}
                    onChange={e => setBizForm({ ...bizForm, iva_porcentaje: parseFloat(e.target.value) || 0 })}
                    placeholder="0" />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Porcentaje de IVA o impuesto. Si no manejas impuesto desglosado, déjalo en 0.
                  </p>
                </div>
                <div className="sm:col-span-2"><Label className="text-xs">Mensaje en ticket</Label><Input value={bizForm.mensaje_ticket} onChange={e => setBizForm({ ...bizForm, mensaje_ticket: e.target.value })} /></div>
              </div>
              {/* Fase 6 — campos ocultos para Confetti (código conservado) */}
              {false && (
                <>
                  <div className="flex items-center justify-between"><Label className="text-xs">Usar mesas</Label><Switch checked={bizForm.usa_mesas} onCheckedChange={v => setBizForm({ ...bizForm, usa_mesas: v })} /></div>
                  <div className="flex items-center justify-between"><Label className="text-xs">Permitir venta sin stock</Label><Switch checked={bizForm.permitir_venta_sin_stock} onCheckedChange={v => setBizForm({ ...bizForm, permitir_venta_sin_stock: v })} /></div>
                </>
              )}

              {/* === PROPINAS === Fase 6 — oculto para Confetti */}
              {false && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Propinas</p>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Activar propinas</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Si está apagado, no se preguntará propina en ningún flujo (POS, mesero, caja).
                      Las ventas no se ven afectadas. Las propinas nunca se suman a las ventas reales ni a la utilidad.
                    </p>
                  </div>
                  <Switch
                    checked={bizForm.propinas_activas !== false}
                    onCheckedChange={v => setBizForm({ ...bizForm, propinas_activas: v })}
                  />
                </div>
                {bizForm.propinas_activas !== false && (
                  <div>
                    <Label className="text-xs">Porcentajes sugeridos (separados por coma)</Label>
                    <Input
                      value={bizForm.propina_porcentajes_sugeridos}
                      onChange={e => setBizForm({ ...bizForm, propina_porcentajes_sugeridos: e.target.value })}
                      placeholder="5,10,15,20"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Hasta 6 valores. Estos aparecen como botones rápidos en el modal de propina.
                    </p>
                  </div>
                )}
              </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Abrir PDF automático al cerrar caja</Label>
                  <p className="text-[10px] text-muted-foreground">Muestra el reporte para imprimir/descargar al cerrar el corte.</p>
                </div>
                <Switch checked={bizForm.descargar_pdf_corte_auto !== false}
                  onCheckedChange={v => setBizForm({ ...bizForm, descargar_pdf_corte_auto: v })} />
              </div>

              {/* === ASIGNACIÓN DE MESAS A MESEROS === Fase 6 — oculto para Confetti */}
              {false && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Asignación de mesas y notificaciones</p>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Activar asignación de mesas a meseros</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Si está apagado, todos los meseros ven todas las mesas y la mesa muestra "Atiende: …" cuando alguien la toma.
                      Si está encendido, cada mesa tiene un mesero fijo y las solicitudes QR se rutean al mesero asignado.
                    </p>
                  </div>
                  <Switch
                    checked={bizForm.asignacion_mesas_activa === true}
                    onCheckedChange={v => setBizForm({ ...bizForm, asignacion_mesas_activa: v })}
                  />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Silenciar notificaciones del administrador</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Recomendado: encendido. El administrador no escucha sonidos ni voz; sigue viendo los badges e indicadores visuales.
                    </p>
                  </div>
                  <Switch
                    checked={bizForm.silenciar_notificaciones_admin !== false}
                    onCheckedChange={v => setBizForm({ ...bizForm, silenciar_notificaciones_admin: v })}
                  />
                </div>
              </div>
              )}

              {/* === PEDIDOS DESDE PORTAL QR (Prompt 6C) ===
                  Solo visible en Restaurante Pro. Solo activable si asignación de mesas
                  está activa. Si está apagada, el switch queda gris y se muestra aviso. */}
              {paquete_modo === 'restaurante_pro' && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-semibold">Pedidos desde Portal QR</p>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">Permitir que el comensal envíe pedidos desde el QR</Label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Si está activo, el comensal puede agregar productos a un carrito y enviar el pedido a cocina.
                        El cobro siempre se realiza en caja. Esta función solo está disponible si la <strong>asignación de mesas</strong> también está activa.
                      </p>
                    </div>
                    <Switch
                      checked={bizForm.portal_qr_permitir_pedidos_cliente === true}
                      onCheckedChange={v => setBizForm({ ...bizForm, portal_qr_permitir_pedidos_cliente: v })}
                      disabled={bizForm.asignacion_mesas_activa !== true}
                    />
                  </div>
                  {bizForm.asignacion_mesas_activa !== true && (
                    <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
                      Para permitir pedidos desde el QR, activa primero la <strong>asignación de mesas</strong>.
                    </div>
                  )}
                </div>
              )}

              <Button onClick={saveBiz} disabled={savingBiz}>
                {savingBiz ? 'Guardando…' : 'Guardar configuración'}
              </Button>
            </CardContent>
          </Card>

          {/* Categorías de productos — fuente única para Recetas, Productos, Mesero y Portal QR */}
          <div className="mt-4">
            <CategoriasProductoSection />
          </div>

        </TabsContent>

        <TabsContent value="usuarios">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-heading">Usuarios POS</CardTitle>
              <Button size="sm" onClick={() => { setEditingUser(null); setShowUserForm(true); }}>
                <Plus className="w-4 h-4 mr-1" />Nuevo usuario
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {usuarios.map(u => {
                // F2: badge de estación para usuarios de cocina cuando estaciones están activas.
                const mostrarEstacionInfo =
                  cfg?.estaciones_preparacion_activas === true && u.rol === 'cocina';
                // Dot de color visible para mesero siempre; para cocina solo si estaciones activas.
                const mostrarColorDot =
                  u.rol === 'mesero' || (u.rol === 'cocina' && cfg?.estaciones_preparacion_activas === true);
                return (
                <div key={u.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    {mostrarColorDot && (
                      <span
                        aria-hidden
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: u.color || '#94a3b8', boxShadow: u.color ? `0 0 6px ${u.color}88` : 'none' }}
                        title={u.color || 'Sin color'}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{u.nombre}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {ROLE_LABELS[u.rol]} · PIN: ••••
                      </p>
                      {/* F2: badge de estación para cocina */}
                      {mostrarEstacionInfo && (
                        <div className="mt-1">
                          {u.puede_ver_todas_estaciones ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30">
                              Todas las estaciones
                            </span>
                          ) : u.estacion_preparacion_id ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                              style={{
                                borderColor: (u.estacion_preparacion_color || '#94a3b8') + '66',
                                color: u.estacion_preparacion_color || '#475569',
                                background: (u.estacion_preparacion_color || '#94a3b8') + '15',
                              }}
                            >
                              {u.estacion_preparacion_nombre || 'Estación'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                              Sin estación
                            </span>
                          )}
                        </div>
                      )}
                      {(u.telefono || u.correo) && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                          {u.telefono && (
                            <span className="inline-flex items-center gap-0.5">
                              <Phone className="w-2.5 h-2.5" />{u.telefono}
                            </span>
                          )}
                          {u.correo && (
                            <span className="inline-flex items-center gap-0.5 truncate">
                              <Mail className="w-2.5 h-2.5" />{u.correo}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingUser(u); setShowUserForm(true); }}
                      title="Editar usuario / cambiar NIP"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteUser(u.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Desactivar usuario"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                );
              })}
              {usuarios.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin usuarios registrados</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pasteles">
          <PastelesConfigSection cfg={cfg} />
        </TabsContent>

        {/* Fase 6 — contenidos ocultos para Confetti (código conservado) */}
        {false && (
          <TabsContent value="datos">
            <DatosSection />
          </TabsContent>
        )}


        {false && (
          <TabsContent value="presentacion">
            <ModoPresentacion cfg={cfg} />
          </TabsContent>
        )}

        {esAdminODueno && (
          <TabsContent value="mantenimiento">
            <ReiniciarSistemaSection />
          </TabsContent>
        )}

      </Tabs>

      {/* User Form Dialog — crear/editar usuario POS (con NIP, contacto, color) */}
      <UsuarioPOSDialog
        open={showUserForm}
        user={editingUser}
        onClose={() => { setShowUserForm(false); setEditingUser(null); }}
        onSave={handleSaveUser}
      />

    </div>
  );
}
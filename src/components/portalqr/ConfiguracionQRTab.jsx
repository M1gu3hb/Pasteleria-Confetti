import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Pestaña "Configuración QR": activar portal, modo menú, qué botones se muestran, etc.
 */
export default function ConfiguracionQRTab({ config }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    portal_qr_activo: false,
    portal_qr_modo_menu: 'productos_pos',
    portal_qr_mostrar_precios: true,
    portal_qr_mostrar_sin_imagen: true,
    portal_qr_permitir_ordenar: true,
    portal_qr_permitir_cuenta: true,
    portal_qr_permitir_ayuda: true,
    portal_qr_mostrar_precuenta: true,
    portal_qr_permitir_propina_cliente: true,
    portal_qr_cuenta_modo: 'mesero_dispara',
    portal_qr_mensaje_bienvenida: '',
  });
  const [saving, setSaving] = useState(false);

  // HOTFIX persistencia móvil:
  // - Guard: NO hidratar hasta que cfg tenga id. Antes hidrataba con {} y
  //   pisaba los switches con defaults al guardar.
  // - ?? en vez de !==false donde el valor false es válido (mismo efecto,
  //   pero más explícito).
  // - Resync cuando cambia updated_date (otro tab/sesión guardó).
  useEffect(() => {
    if (!config?.id) return;
    setForm({
      portal_qr_activo: config.portal_qr_activo === true,
      portal_qr_modo_menu: config.portal_qr_modo_menu ?? 'productos_pos',
      portal_qr_mostrar_precios: config.portal_qr_mostrar_precios !== false,
      portal_qr_mostrar_sin_imagen: config.portal_qr_mostrar_sin_imagen !== false,
      portal_qr_permitir_ordenar: config.portal_qr_permitir_ordenar !== false,
      portal_qr_permitir_cuenta: config.portal_qr_permitir_cuenta !== false,
      portal_qr_permitir_ayuda: config.portal_qr_permitir_ayuda !== false,
      portal_qr_mostrar_precuenta: config.portal_qr_mostrar_precuenta !== false,
      portal_qr_permitir_propina_cliente: config.portal_qr_permitir_propina_cliente !== false,
      portal_qr_cuenta_modo: config.portal_qr_cuenta_modo ?? 'mesero_dispara',
      portal_qr_mensaje_bienvenida: config.portal_qr_mensaje_bienvenida ?? '¡Bienvenido! Explora nuestro menú y pídenos atención cuando quieras.',
    });
  }, [config?.id, config?.updated_date]);

  const guardar = async () => {
    if (!config?.id) {
      toast.error('Falta configuración del negocio');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await base44.entities.ConfiguracionNegocio.update(config.id, form);
      // HOTFIX CRÍTICO: la query key real del ConfigContext es 'config',
      // NO 'config_remote'. Antes invalidábamos una key que no existía y los
      // cambios del Portal QR nunca se reflejaban en el resto de la app hasta
      // recargar. Esto causaba que en móvil el usuario viera "guardado" pero
      // al volver a la pestaña los switches seguían en su valor anterior.
      // Esperamos el refetch real para confirmar antes de mostrar éxito.
      await queryClient.refetchQueries({ queryKey: ['config'] });
      toast.success('Configuración guardada');
    } catch (err) {
      console.error('[ConfiguracionQRTab] guardar:', err);
      toast.error('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, hint, children }) => (
    <div className="flex items-start justify-between gap-3 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      {/* === BLOQUE DE AYUDA — explica qué hace cada switch del Portal QR === */}
      {/* No cambia comportamiento. Solo claridad visual para el administrador. */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800/60 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
        <p className="font-bold">¿Cómo funciona el Portal QR?</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li><strong>Portal QR apagado:</strong> los QR muestran "Portal no disponible". No se puede ordenar ni pedir cuenta desde el celular.</li>
          <li><strong>Portal QR encendido + "Quiero ordenar" apagado:</strong> el cliente ve el menú pero NO puede mandar pedidos a cocina.</li>
          <li><strong>"Pedir cuenta" apagado:</strong> el cliente no solicita cuenta desde el QR; mesero/caja siguen funcionando normal.</li>
          <li><strong>"Propina desde QR" apagada:</strong> el cliente no elige propina; mesero/caja la pueden aplicar.</li>
          <li><strong>Caja, mesero y cocina siempre funcionan</strong>, esté el QR encendido o apagado.</li>
        </ul>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <Row label="Activar Portal QR"
          hint="Cuando está apagado, los QR mostrarán 'Portal no disponible'.">
          <Switch checked={form.portal_qr_activo}
            onCheckedChange={(v) => setForm({ ...form, portal_qr_activo: v })} />
        </Row>
        <Row label="Modo de menú QR"
          hint="Qué se muestra al cliente cuando escanea el QR.">
          <Select value={form.portal_qr_modo_menu}
            onValueChange={(v) => setForm({ ...form, portal_qr_modo_menu: v })}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="productos_pos">Productos del POS</SelectItem>
              <SelectItem value="menu_subido">Menú subido</SelectItem>
              <SelectItem value="mixto">Mixto</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Mostrar precios"
          hint="Si se desactiva, el menú se ve sin precios.">
          <Switch checked={form.portal_qr_mostrar_precios}
            onCheckedChange={(v) => setForm({ ...form, portal_qr_mostrar_precios: v })} />
        </Row>
        <Row label="Mostrar productos sin imagen">
          <Switch checked={form.portal_qr_mostrar_sin_imagen}
            onCheckedChange={(v) => setForm({ ...form, portal_qr_mostrar_sin_imagen: v })} />
        </Row>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-bold mb-1">Botones de atención del cliente</p>
        <p className="text-xs text-muted-foreground mb-2">Controla qué opciones aparecen al cliente cuando pide atención.</p>
        <Row label="Quiero ordenar">
          <Switch checked={form.portal_qr_permitir_ordenar}
            onCheckedChange={(v) => setForm({ ...form, portal_qr_permitir_ordenar: v })} />
        </Row>
        <Row label="Pedir cuenta">
          <Switch checked={form.portal_qr_permitir_cuenta}
            onCheckedChange={(v) => setForm({ ...form, portal_qr_permitir_cuenta: v })} />
        </Row>
        <Row label="Necesito ayuda">
          <Switch checked={form.portal_qr_permitir_ayuda}
            onCheckedChange={(v) => setForm({ ...form, portal_qr_permitir_ayuda: v })} />
        </Row>
      </div>

      {/* ===== Sección: cuenta y propina QR ===== */}
      {/* La sección de propina QR depende del switch GLOBAL de propinas
          (config.propinas_activas). Si está apagado, deshabilitamos los
          controles relacionados y mostramos el mensaje explicativo. El selector
          de "quién dispara la cuenta" siempre se puede configurar (no depende
          de propinas). */}
      {(() => {
        const propinasGlobalActivas = config?.propinas_activas !== false;
        return (
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm font-bold mb-1">Cuenta y propina desde QR</p>
            <p className="text-xs text-muted-foreground mb-2">
              Controla la experiencia del comensal al pedir cuenta. La propina nunca infla las ventas reales — siempre va separada al corte.
            </p>
            <Row
              label="¿Quién dispara la pantalla de propina del QR?"
              hint="‘Mesero dispara’ (recomendado): el QR del comensal abre la propina automáticamente cuando el mesero presiona ‘Solicitar cuenta’."
            >
              <Select value={form.portal_qr_cuenta_modo}
                onValueChange={(v) => setForm({ ...form, portal_qr_cuenta_modo: v })}>
                <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mesero_dispara">Mesero dispara (recomendado)</SelectItem>
                  <SelectItem value="cliente_solicita">Cliente solicita</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Mostrar precuenta al cliente"
              hint="Si está apagada, el cliente solo verá el subtotal sin ver el detalle de productos.">
              <Switch checked={form.portal_qr_mostrar_precuenta}
                onCheckedChange={(v) => setForm({ ...form, portal_qr_mostrar_precuenta: v })} />
            </Row>
            <Row
              label="Propina elegida por comensal desde QR"
              hint={
                propinasGlobalActivas
                  ? 'Si está apagada, no aparecen opciones de propina al cliente. La propina la maneja mesero/caja.'
                  : 'Activa “Propinas” en Configuración general para usar esta función.'
              }
            >
              <Switch
                checked={propinasGlobalActivas && form.portal_qr_permitir_propina_cliente}
                disabled={!propinasGlobalActivas}
                onCheckedChange={(v) => setForm({ ...form, portal_qr_permitir_propina_cliente: v })}
              />
            </Row>
            {!propinasGlobalActivas && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                Las propinas globales están <strong>apagadas</strong>. Mientras estén apagadas, el QR no mostrará propina al comensal aunque este switch quede activo.
              </div>
            )}
          </div>
        );
      })()}

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <Label className="text-sm font-bold">Mensaje de bienvenida</Label>
        <Textarea value={form.portal_qr_mensaje_bienvenida}
          onChange={e => setForm({ ...form, portal_qr_mensaje_bienvenida: e.target.value })}
          rows={3}
          placeholder="Mensaje que verá el cliente al escanear su QR." />
      </div>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  );
}
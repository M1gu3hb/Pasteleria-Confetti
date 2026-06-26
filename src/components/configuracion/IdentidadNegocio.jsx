import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, Save, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ColoresSistemaSection from '@/components/configuracion/ColoresSistemaSection';

/**
 * Sección "Identidad del negocio".
 *
 * IMPORTANTE — Separación de logos vs fondo:
 * - "Logo del negocio" (logo_url): se usa en login, sidebar y como fallback.
 * - "Logo en documentos / tickets" (logo_ticket_url + logo_pdf_url).
 * - "Fondo del sistema" (background_image_url): IMAGEN DE FONDO real, cover.
 * - "Logo de fondo / marca de agua" (background_logo_url): comportamiento legacy
 *   (logo pequeño centrado). Solo se usa si NO hay background_image_url.
 *
 * Opacidad del fondo: 0% a 100%.
 */
export default function IdentidadNegocio({ cfg }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    nombre_negocio: '',
    nombre_sistema: '',
    platform_brand: 'MH Astral Systems',
    logo_url: '',
    logo_ticket_url: '',
    logo_pdf_url: '',
    background_logo_url: '',
    background_image_url: '',
    background_opacity: 0.12,
    background_fit: 'cover',
    ticket_footer: '',
    pdf_footer: '',
    footer_text: '',
    colorear_importes_monetarios: true,
  });
  const [uploading, setUploading] = useState(null); // 'logo'|'ticket'|'pdf'|'bg'|'bgimage'
  const [saving, setSaving] = useState(false);

  // HOTFIX persistencia: solo hidratar cuando cfg ya viene del backend (tiene id).
  // Sin esta guarda, en el primer render cfg = {} y los || pisaban el form con
  // strings vacíos / defaults, causando que switches "se vuelvan a prender"
  // al regresar a la pantalla. Ahora si cfg aún no tiene id, el form mantiene
  // sus valores previos y se hidrata UNA sola vez cuando llega el cfg real.
  // También respondemos a cambios de updated_date (cuando el backend cambia
  // por otro tab/sesión) para no quedarnos con datos viejos.
  useEffect(() => {
    if (!cfg?.id) return; // ⛔ no pisar con {}
    setForm(f => ({
      ...f,
      nombre_negocio: cfg.nombre_negocio ?? f.nombre_negocio ?? '',
      nombre_sistema: cfg.nombre_sistema ?? f.nombre_sistema ?? '',
      platform_brand: cfg.platform_brand ?? f.platform_brand ?? 'MH Astral Systems',
      logo_url: cfg.logo_url ?? '',
      logo_ticket_url: cfg.logo_ticket_url ?? '',
      logo_pdf_url: cfg.logo_pdf_url ?? '',
      background_logo_url: cfg.background_logo_url ?? '',
      background_image_url: cfg.background_image_url ?? '',
      background_opacity: typeof cfg.background_opacity === 'number' ? cfg.background_opacity : 0.12,
      background_fit: cfg.background_fit === 'contain' ? 'contain' : 'cover',
      ticket_footer: cfg.ticket_footer ?? '',
      pdf_footer: cfg.pdf_footer ?? '',
      footer_text: cfg.footer_text ?? '',
      // ⚠ CRÍTICO: usar ?? (no ||) porque `false` es valor válido.
      // Con `|| true` un switch apagado se volvía a prender solo.
      colorear_importes_monetarios: cfg.colorear_importes_monetarios ?? true,
    }));
  }, [cfg?.id, cfg?.updated_date]);

  const handleUpload = async (e, field, key) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB');
      return;
    }
    setUploading(key);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const url = res?.file_url;
      if (url) {
        setForm(f => ({ ...f, [field]: url }));
        toast.success('Imagen cargada');
      } else {
        toast.error('No se pudo subir el archivo');
      }
    } catch (err) {
      toast.error('Error al subir: ' + (err?.message || ''));
    }
    setUploading(null);
    e.target.value = '';
  };

  const save = async () => {
    setSaving(true);
    try {
      // HOTFIX: solo enviamos los campos que ESTA sección administra.
      // Antes mandábamos `form` directo, lo cual era seguro porque form solo
      // tiene campos de Identidad — pero formalizamos el payload para evitar
      // que cualquier campo huésped accidental pise Operación. Esto garantiza
      // que guardar Identidad nunca toca asignacion_mesas_activa, propinas_activas,
      // direccion, telefono, correo, iva_porcentaje, mensaje_ticket, etc.
      const payload = {
        nombre_negocio: form.nombre_negocio,
        nombre_sistema: form.nombre_sistema,
        platform_brand: form.platform_brand,
        logo_url: form.logo_url,
        logo_ticket_url: form.logo_ticket_url,
        logo_pdf_url: form.logo_pdf_url,
        background_logo_url: form.background_logo_url,
        background_image_url: form.background_image_url,
        background_opacity: form.background_opacity,
        background_fit: form.background_fit,
        ticket_footer: form.ticket_footer,
        pdf_footer: form.pdf_footer,
        footer_text: form.footer_text,
        colorear_importes_monetarios: form.colorear_importes_monetarios,
      };
      if (cfg?.id) {
        await base44.entities.ConfiguracionNegocio.update(cfg.id, payload);
      } else {
        // Primera vez: backend vacío. Crear con nombre mínimo + campos identidad.
        await base44.entities.ConfiguracionNegocio.create({
          ...payload,
          nombre_negocio: payload.nombre_negocio || 'Mi Negocio',
        });
      }
      // HOTFIX móvil: esperamos al refetch real (no solo invalidate) para que
      // ConfigContext ya tenga los datos nuevos antes de confirmar éxito.
      // Antes con sola invalidate, en red lenta el usuario salía de la pantalla
      // antes de que el refetch terminara y veía valores viejos al volver.
      await queryClient.refetchQueries({ queryKey: ['config'] });
      toast.success('Identidad guardada correctamente');
    } catch (err) {
      console.error('[IdentidadNegocio] save:', err);
      toast.error('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
    setSaving(false);
  };

  const ImageField = ({ field, label, helper, uploadKey, preview = 'logo' }) => (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-3">
        <div className={`rounded-lg border-2 border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0 ${preview === 'wide' ? 'w-28 h-16' : 'w-16 h-16'}`}>
          {form[field] ? (
            <img
              src={form[field]}
              alt=""
              className="w-full h-full"
              style={{ objectFit: preview === 'wide' ? 'cover' : 'contain' }}
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex gap-2 flex-wrap">
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => handleUpload(e, field, uploadKey)} />
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border bg-white hover:bg-muted transition-colors ${uploading === uploadKey ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploading === uploadKey
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…</>
                  : <><Upload className="w-3.5 h-3.5" /> Subir imagen</>}
              </span>
            </label>
            {form[field] && (
              <Button type="button" variant="ghost" size="sm"
                onClick={() => setForm(f => ({ ...f, [field]: '' }))}
                className="h-8 text-xs">Quitar</Button>
            )}
          </div>
          {helper && <p className="text-[10px] text-muted-foreground">{helper}</p>}
        </div>
      </div>
    </div>
  );

  const opacityPct = Math.round((form.background_opacity || 0) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading">Identidad del negocio</CardTitle>
        <p className="text-xs text-muted-foreground">
          Personaliza nombres, logos y datos del negocio. Estos valores se usan en pantallas, tickets y PDFs.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Nombres */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nombre del negocio</Label>
            <Input value={form.nombre_negocio}
              onChange={e => setForm({ ...form, nombre_negocio: e.target.value })}
              placeholder="Mi Restaurante" />
          </div>
          <div>
            <Label className="text-xs">Nombre del sistema</Label>
            <Input value={form.nombre_sistema}
              onChange={e => setForm({ ...form, nombre_sistema: e.target.value })}
              placeholder="POS MH Astral Systems" />
          </div>
          <div>
            <Label className="text-xs">Plataforma (marca)</Label>
            <Input value={form.platform_brand}
              onChange={e => setForm({ ...form, platform_brand: e.target.value })}
              placeholder="MH Astral Systems" />
          </div>
        </div>

        {/* Logos */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-3">Logos del negocio</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageField field="logo_url" label="Logo del negocio"
              helper="Se usa en sidebar, login y como fallback de los demás"
              uploadKey="logo" />
            <ImageField field="logo_ticket_url" label="Logo en tickets"
              helper="Si está vacío, se usa el principal"
              uploadKey="ticket" />
            <ImageField field="logo_pdf_url" label="Logo en PDFs"
              helper="Cortes y reportes"
              uploadKey="pdf" />
          </div>
        </div>

        {/* Fondo del sistema */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-1">Fondo del sistema</p>
          <p className="text-xs text-muted-foreground mb-3">
            Imagen que se muestra como fondo de las pantallas del sistema.
            Si subes una imagen aquí se usará como <strong>fondo completo</strong> (cubre toda la pantalla).
            Si la dejas vacía, se usará el "Logo de fondo" como marca de agua.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageField
              field="background_image_url"
              label="Fondo del sistema (imagen completa)"
              helper="Se aplica como fondo a pantalla completa."
              uploadKey="bgimage"
              preview="wide"
            />
            <ImageField
              field="background_logo_url"
              label="Logo de fondo (marca de agua)"
              helper="Solo se usa si no hay imagen de fondo arriba."
              uploadKey="bg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <Label className="text-xs">Opacidad del fondo: {opacityPct}%</Label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={form.background_opacity}
                onChange={e => setForm({ ...form, background_opacity: parseFloat(e.target.value) })}
                className="w-full mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                0% = invisible · 100% = totalmente visible.
              </p>
            </div>
            <div>
              <Label className="text-xs">Ajuste del fondo</Label>
              <Select
                value={form.background_fit}
                onValueChange={v => setForm({ ...form, background_fit: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cubrir toda la pantalla (recomendado)</SelectItem>
                  <SelectItem value="contain">Mostrar imagen completa</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Solo aplica al "Fondo del sistema".
              </p>
            </div>
          </div>
        </div>

        {/* Datos de contacto (dirección/teléfono/correo) — viven ahora en
            Operación → Datos del negocio para evitar duplicación. */}

        {/* Colores del sistema — afectan login, sidebar, botones, tarjetas. */}
        <ColoresSistemaSection cfg={cfg} />

        {/* Footers */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-3">Pie de tickets y PDFs</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Pie del ticket térmico</Label>
              <Input value={form.ticket_footer}
                onChange={e => setForm({ ...form, ticket_footer: e.target.value })}
                placeholder="Ej: Visítanos pronto · @restaurante" />
            </div>
            <div>
              <Label className="text-xs">Pie de los PDFs</Label>
              <Input value={form.pdf_footer}
                onChange={e => setForm({ ...form, pdf_footer: e.target.value })}
                placeholder="Ej: Documento confidencial" />
            </div>
            <div>
              <Label className="text-xs">Texto legal o pie general</Label>
              <Input value={form.footer_text}
                onChange={e => setForm({ ...form, footer_text: e.target.value })}
                placeholder="Ej: RFC, dirección fiscal, etc." />
            </div>
          </div>
        </div>

        {/* Apariencia */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-3">Apariencia</p>
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <Label className="text-sm font-medium">Colorear importes monetarios</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Cuando está activado, los importes de dinero pueden usar colores de la marca o de sus tarjetas.
                Cuando está desactivado, los importes principales se muestran en negro o color neutro para una apariencia más sobria.
              </p>
            </div>
            <Switch
              checked={form.colorear_importes_monetarios}
              onCheckedChange={(v) => setForm({ ...form, colorear_importes_monetarios: v })}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Guardando…' : 'Guardar identidad'}
        </Button>
      </CardContent>
    </Card>
  );
}
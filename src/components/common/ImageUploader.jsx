import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Uploader reutilizable de imágenes para productos / recetas / menús.
 *
 * UX: drag & drop + clic para abrir explorador.
 * Internamente sube via base44.integrations.Core.UploadFile y devuelve un
 * file_url. El padre persiste ese string en su campo `imagen_url`.
 *
 * Props:
 *  - value: string | null  (URL actual)
 *  - onChange(url: string): callback al subir/quitar (vacío = quitada)
 *  - disabled?: boolean
 *  - height?: número px (default 140)
 *  - maxMB?: número (default 8)
 *  - label?: texto del botón cuando no hay imagen
 */
export default function ImageUploader({
  value,
  onChange,
  disabled = false,
  height = 140,
  maxMB = 8,
  label = 'Subir imagen',
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const procesarArchivo = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      toast.error('Solo se aceptan imágenes (JPG, PNG, WEBP).');
      return;
    }
    const maxBytes = maxMB * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(`Imagen demasiado grande. Máximo ${maxMB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const url = res?.file_url || '';
      if (!url) throw new Error('Sin URL');
      onChange?.(url);
      toast.success('Imagen subida');
    } catch (err) {
      console.error('[ImageUploader] upload:', err);
      toast.error('No se pudo subir la imagen. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = (e) => {
    const file = e.target?.files?.[0];
    procesarArchivo(file);
    try { e.target.value = ''; } catch {}
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer?.files?.[0];
    procesarArchivo(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploading) return;
    setDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const abrirSelector = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const quitar = (e) => {
    e.stopPropagation();
    onChange?.('');
  };

  // Estado con imagen — preview + acciones
  if (value) {
    return (
      <div
        className="relative w-full rounded-lg overflow-hidden border bg-muted group"
        style={{ height }}
      >
        <img src={value} alt="Vista previa" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={abrirSelector}
            disabled={disabled || uploading}
            className="px-3 py-1.5 rounded-md bg-white text-slate-900 text-xs font-semibold shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Subiendo...' : 'Cambiar'}
          </button>
          <button
            type="button"
            onClick={quitar}
            disabled={disabled || uploading}
            className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> Quitar
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
      </div>
    );
  }

  // Estado vacío — dropzone
  return (
    <div
      onClick={abrirSelector}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`relative w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all
        ${dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50'}
        ${disabled || uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      style={{ height }}
    >
      {uploading ? (
        <>
          <Loader2 className="w-7 h-7 text-primary animate-spin mb-1" />
          <p className="text-xs text-muted-foreground">Subiendo imagen…</p>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Arrastra una imagen aquí o haz clic
          </p>
          <p className="text-[10px] text-muted-foreground/70">JPG, PNG, WEBP · máx {maxMB} MB</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
        disabled={disabled || uploading}
      />
    </div>
  );
}
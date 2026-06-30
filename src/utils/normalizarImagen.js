// normalizarImagen — deja una imagen SIEMPRE derecha antes de subirla.
//
// El problema: las fotos de celular (y algunos screenshots) guardan la rotación en los
// metadatos EXIF en vez de en los píxeles. Algunos visores (PDF/html2canvas, etc.) no leen el
// EXIF y la muestran girada/de cabeza. Esto "hornea" la orientación EXIF en los píxeles y
// re-encoda la imagen DERECHA, sin EXIF, para que se vea igual en cualquier visor.
//
// Degradación segura: si el navegador no soporta la normalización (Safari viejo, etc.), o algo
// falla, devuelve el archivo ORIGINAL — nunca rompe la subida. (El display ya usa
// `image-orientation: from-image`, que respeta el EXIF al menos en el navegador.)
export async function normalizarImagen(file) {
  try {
    if (!file || typeof file !== 'object') return file;
    const tipo = String(file.type || '');
    if (!tipo.startsWith('image/')) return file; // no tocar no-imágenes
    if (tipo === 'image/svg+xml' || tipo === 'image/gif') return file; // preservar vectores/animados
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file); // fallback sin la opción
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return file; }
    // Fondo blanco por si la fuente tiene transparencia (al pasar a JPEG).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return file;
    const nombre = (file.name || 'imagen').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // ante cualquier error, subir el original
  }
}

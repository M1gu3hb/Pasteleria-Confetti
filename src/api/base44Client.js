// =====================================================================
// Shim de compatibilidad: expone el objeto `base44` que ya usa todo el POS,
// pero respaldado por Supabase (no por el SDK de Base44).
//   base44.entities.*            -> capa de adaptación sobre Postgres
//   base44.integrations.Core.UploadFile -> Supabase Storage (contrato { file_url })
//   base44.auth.*                -> stubs (el auth real del POS vive en POSAuthContext;
//                                   la sesión Supabase la maneja supabaseClient)
//   base44.functions.invoke      -> stub (las funciones de mantenimiento de Base44
//                                   no se replican aquí; ver Fase 2/4)
// Mantener este shim permite migrar la capa de datos sin tocar ~60 call-sites.
// =====================================================================
import { supabase, ensureSession } from './supabaseClient';
import { entities } from './entitiesAdapter';

const STORAGE_BUCKET = 'uploads';

async function UploadFile({ file }) {
  if (!file) throw new Error('UploadFile: archivo vacío');
  await ensureSession();
  const safeExt = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'bin';
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(`Storage: ${error.message}`);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  // Contrato idéntico al de Base44 Core.UploadFile.
  return { file_url: data.publicUrl };
}

export const base44 = {
  entities,
  integrations: { Core: { UploadFile } },
  auth: {
    me: async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user || null;
    },
    logout: async () => {
      try { await supabase.auth.signOut(); } catch { /* noop */ }
    },
    redirectToLogin: () => { /* el POS usa su propio gate (POSAuthContext) */ },
  },
  functions: {
    // Funciones de mantenimiento de Base44 (reset/limpieza). No se replican en
    // esta fase; reconstruir como SQL admin-only / Edge Function si se requieren.
    invoke: async (name) => {
      console.warn(`[base44.functions.invoke] "${name}" no disponible en la versión migrada.`);
      throw new Error(`Función "${name}" no disponible en esta versión.`);
    },
  },
};

export default base44;

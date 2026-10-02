// Edge Function: transcribir-nota-voz — identidad, autorización y lease durable
// -----------------------------------------------------------------------------
// Recibe { audioUrl } de una nota de voz ya subida al bucket `notas-voz`, la
// descarga y la transcribe con OpenAI Whisper (whisper-1, español). Devuelve
// { transcript, ok, error }.
//
// CONTRATO CON EL FRONTEND: SIN CAMBIOS.
//   src/components/pedidos/NotaVozRecorder.jsx llama
//     supabase.functions.invoke('transcribir-nota-voz', { body: { audioUrl } })
//   y sólo usa `data.transcript` (string). Si falla, conserva la transcripción
//   de Web Speech. Por eso seguimos respondiendo SIEMPRE 200: un fallo de
//   transcripción NUNCA debe bloquear el POS ni perder el audio.
//
// ENDURECIMIENTO v2 (2026-08-01):
//   1. SSRF cerrado. Antes hacía `fetch(audioUrl)` con la URL tal cual la
//      mandaba el cliente. Ahora la URL se VALIDA y además se RECONSTRUYE desde
//      cero a partir del nombre de objeto: nunca se hace fetch de la cadena
//      recibida. Sólo se puede leer https://<proyecto>.supabase.co/storage/v1/
//      object/public/notas-voz/<nombre-plano>.
//   2. MIME validado (audio/webm, audio/mp4, audio/ogg — los que produce el
//      grabador) por extensión y por Content-Type real.
//   3. Tamaño validado ANTES (Content-Length) y DURANTE (tras leer el cuerpo).
//      Límite 10 MB: el objeto real más grande hoy son 438 KB (8 notas en el
//      bucket), así que deja ~23x de margen y sigue por debajo del máximo de
//      Whisper (25 MB).
//   4. Timeouts reales con AbortController (descarga 15 s, OpenAI 60 s).
//   5. CORS acotado a los orígenes reales del proyecto (+ localhost en dev),
//      en vez de "*".
//   6. Ya NO se devuelve `detail` con el cuerpo de error de OpenAI.
//   7. Logs sin URL completa, sin JWT, sin API key y sin contenido del audio.
//
// Cuotas y caché persistentes en Postgres: identidad POS activa, propiedad del
// objeto/sucursal, un lease por archivo y máximo tres intentos. El audio ya
// guardado se conserva incluso cuando falla la transcripción opcional.
//
// Secreto requerido: OPENAI_API_KEY.
// Rollback: la v1 está en git (commit 9b36aa5, mismo path).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// ── Configuración ────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BUCKET = "notas-voz";
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (real máx. hoy: 438 KB)
const DOWNLOAD_TIMEOUT_MS = 15_000;
const OPENAI_TIMEOUT_MS = 60_000;

// MIME permitidos: exactamente lo que produce NotaVozRecorder.jsx
// (`tipo.includes('ogg') ? 'ogg' : tipo.includes('mp4') ? 'mp4' : 'webm'`).
const MIME_PERMITIDOS = new Set(["audio/webm", "audio/mp4", "audio/ogg"]);
const EXT_PERMITIDAS = new Set(["webm", "mp4", "ogg"]);

// Orígenes reales: producción, preview de rama del APK, previews de Vercel del
// mismo proyecto, y localhost sólo para desarrollo.
const ORIGENES_EXACTOS = new Set([
  "https://pasteleria-confetti.vercel.app",
  "https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app",
]);
const ORIGEN_PREVIEW = /^https:\/\/pasteleria-confetti[a-z0-9-]*\.vercel\.app$/;
const ORIGEN_LOCAL = /^http:\/\/localhost(:\d+)?$/;

function origenPermitido(origin: string | null): string | null {
  if (!origin) return null;
  if (ORIGENES_EXACTOS.has(origin)) return origin;
  if (ORIGEN_PREVIEW.test(origin)) return origin;
  if (ORIGEN_LOCAL.test(origin)) return origin;
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const permitido = origenPermitido(origin);
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (permitido) h["Access-Control-Allow-Origin"] = permitido;
  return h;
}

// Respuesta SIEMPRE 200 con la forma { transcript, ok, error } que espera el
// frontend, para conservar la degradación con gracia.
const json = (body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

const fallo = (error: string, origin: string | null) =>
  json({ transcript: "", ok: false, error }, origin);

/**
 * Valida la URL recibida y devuelve SÓLO el nombre de objeto si es aceptable.
 * Rechaza cualquier protocolo, host, proyecto, bucket o path distinto.
 * No devuelve nunca la URL original: el caller reconstruye la suya.
 */
function nombreObjetoSeguro(audioUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(audioUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;

  let esperado: URL;
  try {
    esperado = new URL(SUPABASE_URL);
  } catch {
    return null;
  }
  if (u.hostname !== esperado.hostname) return null;
  // Sin credenciales ni puerto raro embebidos.
  if (u.username || u.password || (u.port && u.port !== "443")) return null;
  // Path exacto del bucket público.
  if (!u.pathname.startsWith(PUBLIC_PREFIX)) return null;

  let nombre: string;
  try { nombre = decodeURIComponent(u.pathname.slice(PUBLIC_PREFIX.length)); } catch { return null; }
  // Nombre plano: así es como sube el POS (`${Date.now()}_${rand}.${ext}`).
  // Sin subcarpetas, sin traversal, sin vacíos.
  if (!nombre || nombre.includes("/") || nombre.includes("\\") || nombre.includes("..")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(nombre)) return null;

  const ext = (nombre.split(".").pop() || "").toLowerCase();
  if (!EXT_PERMITIDAS.has(ext)) return null;

  return nombre;
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return fallo("method_not_allowed", origin);

  if (!SUPABASE_URL) return fallo("misconfigured", origin);

  // verify_jwt=true ya rechaza en plataforma las peticiones sin JWT válido
  // (401 antes de llegar aquí). Este chequeo es defensa en profundidad.
  const authorization = req.headers.get("authorization");
  if (!authorization) return fallo("unauthorized", origin);
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey || !serviceKey) return fallo('misconfigured', origin);
  const userClient = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: identidad, error: errorIdentidad } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (errorIdentidad || !identidad?.user?.id) return fallo('unauthorized', origin);
  } catch { return fallo('identity_unavailable', origin); }

  let audioUrl = "";
  try {
    if (Number(req.headers.get('content-length')) > 4096) return fallo('bad_request', origin);
    const raw = await req.text();
    if (raw.length > 4096) return fallo('bad_request', origin);
    const body = JSON.parse(raw);
    audioUrl = String(body?.audioUrl || "");
  } catch {
    return fallo("bad_request", origin);
  }
  if (!audioUrl) return fallo("missing_audio_url", origin);

  // ORDEN DELIBERADO: la validación de la URL va ANTES de mirar OPENAI_API_KEY.
  // Así una entrada maliciosa se rechaza siempre, exista o no el secreto, y las
  // defensas anti-SSRF son verificables aunque la clave no esté configurada.
  // El contrato con el frontend no cambia: con URL válida y sin clave se sigue
  // devolviendo exactamente { transcript:"", ok:false, error:"no_key" }.
  const nombre = nombreObjetoSeguro(audioUrl);
  if (!nombre) {
    // No se registra la URL recibida (puede venir de un atacante).
    console.warn("[transcribir-nota-voz] URL rechazada por validacion de origen/bucket");
    return fallo("invalid_audio_url", origin);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return fallo("no_key", origin);
  // Database authorizes this object and holds a durable lease. A public JWT,
  // another branch's audio or a duplicate request never generates AI costs.
  let permiso, errorPermiso;
  try { ({ data: permiso, error: errorPermiso } = await userClient.rpc('solicitar_transcripcion_pos', { p_archivo: nombre })); }
  catch { return fallo('authorization_unavailable', origin); }
  if (errorPermiso || !permiso) return fallo('audio_not_authorized', origin);
  if (permiso.estado === 'completa') return json({ transcript: String(permiso.transcript || ''), ok: true }, origin);
  if (permiso.estado !== 'nueva') return fallo(`audio_${permiso.estado}`, origin);
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let completado = false;

  // URL RECONSTRUIDA: nunca se hace fetch de la cadena del cliente.
  const urlSegura = `${SUPABASE_URL.replace(/\/+$/, "")}${PUBLIC_PREFIX}${encodeURIComponent(nombre)}`;

  try {
    // 1) Descargar el audio, con timeout y tope de tamaño.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), DOWNLOAD_TIMEOUT_MS);
    let ctype = ''; let buf: Uint8Array;
    try {
      const audioRes = await fetch(urlSegura, { signal: ac.signal, redirect: "error" });
      if (!audioRes.ok) return fallo(`download_${audioRes.status}`, origin);
      ctype = (audioRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const declarado = Number(audioRes.headers.get("content-length") || "0");
      if (!MIME_PERMITIDOS.has(ctype) || (Number.isFinite(declarado) && declarado > MAX_BYTES)) {
        try { await audioRes.body?.cancel(); } catch { /* noop */ }
        return fallo(!MIME_PERMITIDOS.has(ctype) ? "invalid_mime" : "audio_too_large", origin);
      }
      const reader = audioRes.body?.getReader();
      if (!reader) return fallo("empty_audio", origin);
      const partes: Uint8Array[] = []; let total = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BYTES) { await reader.cancel(); return fallo("audio_too_large", origin); }
          partes.push(value);
        }
      } finally { reader.releaseLock(); }
      if (!total) return fallo("empty_audio", origin);
      buf = new Uint8Array(total); let offset = 0;
      for (const parte of partes) { buf.set(parte, offset); offset += parte.byteLength; }
    } finally {
      // Covers response-body reads as well as the initial fetch.
      clearTimeout(t);
    }

    const audioBlob = new Blob([buf], { type: ctype });

    // 2) Enviar a OpenAI Whisper, con timeout.
    const ext = (nombre.split(".").pop() || "webm").toLowerCase();
    const form = new FormData();
    form.append("file", audioBlob, `nota-voz.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "es");

    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), OPENAI_TIMEOUT_MS);
    let data;
    try {
      const oa = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: ac2.signal,
      });
      if (!oa.ok) {
        console.warn(`[transcribir-nota-voz] OpenAI respondió ${oa.status}`);
        return fallo(`openai_${oa.status}`, origin);
      }
      data = await oa.json();
    } finally { clearTimeout(t2); }
    const transcript = String(data?.text || '').trim();
    const { data: cacheGuardado, error: cacheError } = await admin.rpc('completar_transcripcion_pos', { p_clave: permiso.clave, p_lease: permiso.lease, p_texto: transcript, p_ok: true });
    if (cacheError || cacheGuardado !== true) return fallo('cache_unconfirmed', origin);
    completado = true;
    return json({ transcript, ok: true }, origin);
  } catch (e) {
    // Sin detalles al cliente y sin volcar la excepción completa (podría
    // contener la URL o cabeceras).
    const abortado = (e as Error)?.name === "AbortError";
    console.warn(`[transcribir-nota-voz] ${abortado ? "timeout" : "excepcion"} durante la transcripcion`);
    return fallo(abortado ? "timeout" : "exception", origin);
  } finally {
    if (!completado) {
      await admin.rpc('completar_transcripcion_pos', { p_clave: permiso.clave, p_lease: permiso.lease, p_texto: '', p_ok: false }).catch(() => {});
    }
  }
});

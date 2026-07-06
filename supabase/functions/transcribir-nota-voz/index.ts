// Edge Function: transcribir-nota-voz
// -----------------------------------------------------------------------------
// Recibe { audioUrl } de una nota de voz ya subida al bucket `notas-voz`, la
// descarga y la transcribe con OpenAI Whisper (whisper-1, español). Devuelve
// { transcript }.
//
// ADITIVA Y TOLERANTE A FALLOS (nunca rompe el flujo del cliente):
//  - Si falta el secreto OPENAI_API_KEY  -> { transcript: "", ok:false, error:"no_key" }
//  - Si el audio no se puede descargar    -> { transcript: "", ok:false, error:"download_*" }
//  - Si OpenAI falla                       -> { transcript: "", ok:false, error:"openai_*" }
// Siempre responde 200 para que el cliente degrade con gracia (audio guardado +
// transcripción a mano / la de Web Speech donde exista). No toca la BD.
//
// Secreto requerido (lo pone Miguel):
//   supabase secrets set OPENAI_API_KEY=sk-...  --project-ref ivqcxdpqxwjxfohiswqb

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ transcript: "", ok: false, error: "method_not_allowed" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ transcript: "", ok: false, error: "no_key" });

  let audioUrl = "";
  try {
    const body = await req.json();
    audioUrl = String(body?.audioUrl || "");
  } catch {
    return json({ transcript: "", ok: false, error: "bad_request" });
  }
  if (!audioUrl) return json({ transcript: "", ok: false, error: "missing_audio_url" });

  try {
    // 1) Descargar el audio (URL pública del bucket notas-voz).
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return json({ transcript: "", ok: false, error: `download_${audioRes.status}` });
    const audioBlob = await audioRes.blob();

    // 2) Enviar a OpenAI Whisper.
    const ext = (audioUrl.split("?")[0].split(".").pop() || "webm").toLowerCase();
    const form = new FormData();
    form.append("file", audioBlob, `nota-voz.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "es");

    const oa = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!oa.ok) {
      const detail = await oa.text().catch(() => "");
      return json({ transcript: "", ok: false, error: `openai_${oa.status}`, detail: detail.slice(0, 300) });
    }
    const data = await oa.json();
    return json({ transcript: String(data?.text || "").trim(), ok: true });
  } catch (e) {
    return json({ transcript: "", ok: false, error: "exception", detail: String(e).slice(0, 300) });
  }
});

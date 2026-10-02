import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const origins = new Set(["https://pasteleria-confetti.vercel.app", "https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app"]);
function response(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origins.has(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : "null", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, {});
  if (req.method !== "POST") return response(req, { ok: false }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 1024) return response(req, { ok: false }, 400);
    const body = JSON.parse(raw);
    if (!/^\d{4}$/.test(body.pin || "") || (body.usuario_id && !/^[0-9a-f-]{36}$/i.test(body.usuario_id))) return response(req, { ok: false }, 400);
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "").split(",")[0].trim();
    const { data, error } = await service.rpc("autenticar_pin_pos", { p_pin: body.pin, p_user_id: body.usuario_id || null, p_ip: /^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : "sin-ip" });
    if (error || !data?.ok) return response(req, { ok: false, espera_segundos: data?.espera_segundos || 0 });
    const { email, ...operador } = data.operador;
    if (body.modo !== "sesion") return response(req, { ok: true, operador });
    // generateLink does not send email. The one-use hash is exchanged by Auth;
    // the PIN never becomes a password and service credentials never leave here.
    const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link?.properties?.hashed_token) return response(req, { ok: false }, 503);
    return response(req, { ok: true, operador, token_hash: link.properties.hashed_token });
  } catch { return response(req, { ok: false }, 400); }
});

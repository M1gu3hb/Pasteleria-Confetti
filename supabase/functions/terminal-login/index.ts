import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const origins = new Set(["https://pasteleria-confetti.vercel.app", "https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app"]);
function response(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origins.has(origin) ? origin : "null", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, {});
  if (req.method !== "POST") return response(req, { ok: false }, 405);
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth, error } = await admin.auth.getUser(jwt);
    if (error || !auth?.user?.id) return response(req, { ok: false }, 401);
    const body = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(body.sucursal_id || "")) return response(req, { ok: false }, 400);
    const { data: perfil } = await admin.from("usuarios_pos").select("rol,activo").eq("auth_user_id", auth.user.id).maybeSingle();
    const { data: terminal } = await admin.rpc("terminal_pos_autorizada", { p_sucursal: body.sucursal_id });
    if (!perfil?.activo || perfil.rol !== "dueño" || !terminal?.email) return response(req, { ok: false }, 403);
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: terminal.email });
    if (linkError || !link?.properties?.hashed_token) return response(req, { ok: false }, 503);
    return response(req, { ok: true, token_hash: link.properties.hashed_token });
  } catch { return response(req, { ok: false }, 400); }
});

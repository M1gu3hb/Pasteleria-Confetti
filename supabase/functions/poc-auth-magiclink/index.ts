// Proof of concept retired. Session issuance belongs to pin-login only.
Deno.serve(() => new Response(JSON.stringify({ error: "endpoint_retired" }), { status: 410, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));

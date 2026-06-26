import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body?.rol !== 'administrador') {
      return Response.json({ error: 'Forbidden: solo administrador' }, { status: 403 });
    }

    let deleted = 0;
    const mesas = await base44.asServiceRole.entities.Mesa.list('-created_date', 500);
    for (const m of mesas) {
      await base44.asServiceRole.entities.Mesa.delete(m.id);
      deleted++;
    }

    return Response.json({ ok: true, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
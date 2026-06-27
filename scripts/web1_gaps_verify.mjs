// =====================================================================
// WEB-1 — Verificación de los 2 fixes (GAP 1 folio trigger, GAP 2 bucket
// web-uploads) como cliente ANON (la web pública). Las verificaciones
// privilegiadas (folio asignado, regresión, limpieza) se hacen aparte por SQL.
//
// Uso (desde pos/):  node scripts/web1_gaps_verify.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const SUC_A = '057f9ba7-b340-4060-ace3-7f1646da36fa'; // Xochimilco (prefijo A)
const log = (name, ok, extra='') => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);

(async () => {
  console.log('=== GAP 1 — folio de pedido web (anon) ===');
  // a) anon INSERT pedido web SIN folio → debe pasar (trigger asigna folio)
  const r1 = await sb.from('pedidos').insert({
    origen: 'web', estado: 'pendiente', sucursal_id: SUC_A, tipo_pedido: 'pastel_personalizado',
    cliente_nombre: 'ZZWEB1 auto', cliente_telefono: 'ZZWEB1',
  });
  log('anon INSERT pedido web sin folio pasa', !r1.error, r1.error ? r1.error.message : 'ok (folio se verifica por SQL)');

  // c) anon INSERT pedido web CON folio provisto → trigger NO debe re-foliarlo
  const r2 = await sb.from('pedidos').insert({
    origen: 'web', estado: 'pendiente', folio: 'ZZWEB1-PROVIDED', sucursal_id: SUC_A,
    tipo_pedido: 'pastel_personalizado', cliente_nombre: 'ZZWEB1 provisto', cliente_telefono: 'ZZWEB1',
  });
  log('anon INSERT pedido web con folio provisto pasa', !r2.error, r2.error ? r2.error.message : 'ok (se verifica que NO se re-folió por SQL)');

  // b) anon ejecutar siguiente_folio directo → DEBE fallar
  const r3 = await sb.rpc('siguiente_folio', { p_tipo: 'pedido_pastel', p_sucursal_id: SUC_A });
  log('anon NO puede ejecutar siguiente_folio directo', !!r3.error, r3.error ? r3.error.code || r3.error.message : 'SIN ERROR (mal)');

  console.log('\n=== GAP 2 — bucket web-uploads (anon) ===');
  const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // cabecera PNG mínima
  const path = `zzweb1-test/img_${Date.now()}.png`;
  // a) anon sube imagen pequeña a web-uploads → pasa
  const u1 = await sb.storage.from('web-uploads').upload(path, pngBytes, { contentType: 'image/png' });
  log('anon sube imagen a web-uploads', !u1.error, u1.error ? u1.error.message : path);
  // c) legible por URL pública
  if (!u1.error) {
    const { data: pub } = sb.storage.from('web-uploads').getPublicUrl(path);
    const resp = await fetch(pub.publicUrl);
    log('archivo legible por URL pública', resp.ok, `HTTP ${resp.status}`);
  } else { log('archivo legible por URL pública', false, 'no se subió'); }
  // b) anon sube al bucket uploads del POS → DEBE fallar
  const u2 = await sb.storage.from('uploads').upload(`zzweb1-test/x_${Date.now()}.png`, pngBytes, { contentType: 'image/png' });
  log('anon NO puede subir al bucket uploads (POS)', !!u2.error, u2.error ? u2.error.message : 'SIN ERROR (mal)');
  // d) no-imagen → rechazado por mime
  const u3 = await sb.storage.from('web-uploads').upload(`zzweb1-test/x_${Date.now()}.txt`, Buffer.from('hola'), { contentType: 'text/plain' });
  log('web-uploads rechaza no-imagen (mime)', !!u3.error, u3.error ? u3.error.message : 'SIN ERROR (mal)');
  // d2) >5MB → rechazado por tamaño
  const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 1);
  const u4 = await sb.storage.from('web-uploads').upload(`zzweb1-test/big_${Date.now()}.png`, big, { contentType: 'image/png' });
  log('web-uploads rechaza >5MB (tamaño)', !!u4.error, u4.error ? u4.error.message : 'SIN ERROR (mal)');

  console.log('\n=== REGRESIÓN POS — anon sigue ciego al dinero ===');
  for (const t of ['ventas', 'cortes_caja', 'pedidos']) {
    const { data, error } = await sb.from(t).select('id');
    const n = Array.isArray(data) ? data.length : 0;
    log(`anon NO ve ${t}`, n === 0, error ? 'denegado' : `filas=${n}`);
  }
  console.log('\n(Verificación de folios asignados + limpieza: por SQL/MCP.)');
})();

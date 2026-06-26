# CHANGELOG

## Sesión 2026-06-26 — Fases 0–4 (núcleo)

### Fase 0 — Reconocimiento + andamiaje (COMPLETA, auditada)
- Lectura de 8 MDs + 2 auditorías ZIP. Confirmada Opción A, matemática del dinero, 3 candados.
- Verificado líneas reales en `Caja.jsx`: corte lee `pagada` (193), fallback venta↔corte (220-246, 1441-1461), efectivo esperado (1350/1430), `handleBuscarFolioWeb` (679).
- Repo `M1gu3hb/Pasteleria-Confetti` (privado, existía vacío); push de `main` (baseline export Base44 con api_key REDACTADA) + rama `migracion/supabase`.
- Vercel team `MH Astral Systems`; Supabase staging `ivqcxdpqxwjxfohiswqb`.

### Fase 1 — Esquema unificado (COMPLETA, aplicada, auditada)
- Migración `esquema_unificado` (repo 0001): 12 tablas (lista verde), tipos uuid/numeric/timestamptz, `tipo_pedido` explícito, NOT NULL de pastel relajados (kilos default 0, fecha_entrega nullable), `created_at default now()`, vistas `catalogo_publico`/`config_publica` (sin costo), RLS anon restrictiva + RLS POS amplia temporal, `siguiente_folio` (folios atómicos por tipo+sucursal).
- Hardening (0002 grants anon mínimos, 0003 execute siguiente_folio solo authenticated, 0004 revoke execute rls_auto_enable de anon).
- Adversarial anon: anon no lee ventas/cortes; anon insert pedido estado='pagada' falla; web/pendiente pasa; catalogo_publico sin costo. Folios: PP-A-0001, CONF-A-V1, CONF-A-C001, sin colisión.

### Fase 2 — Seed maestros + port capa de datos + smoke (COMPLETA, auditada)
- PASO A seed (repo 0005 ajustes schema, 0006 seed): 3 sucursales, 8 categorías, 20 productos (incl 3 "prueba"), 33 usuarios (6 dueño/12 admin/15 caja), 1 config. 0 FK huérfanas. Correcciones vs datos vivos: rol `dueño` al CHECK; `pin` interino; `hora_inicio_dia_operativo`; campos reales de config; google_maps_url/whatsapp_numero en sucursales. 0007: extras/rellenos/precio_por_sucursal a `text` (JSON string). 0008: bucket Storage `uploads`. 0009: actor-ids a `text` (centinela 'empleado_terminal').
- PASO B port: `supabaseClient.js`, `entitiesAdapter.js`, `base44Client.js` (shim), `AuthContext` simplificado, `vite.config` sin plugin Base44, `package.json` (+supabase-js, −@base44/* −@stripe −react-leaflet −three). Eliminado `posApiClient.js` + todas sus llamadas; `app-params.js`. Descartada plantilla roja (9 páginas + componentes); 5 stubs no-op para componentes apagados que importan archivos de dinero. CANDADO 3 corregido. Build verde.
- PASO C smoke (preview local): app boota, sesión, marca real, 3 sucursales, terminal, login empleado, Caja, abrir caja (write+folio CONF-A-C003), POS catálogo, carrito, venta (CONF-A-V2 + detalle con snapshot). Bug hallado y corregido: actor-ids uuid→text (0009).
- Vercel deploy NO automatizable (sin CLI ni git-link) → pendiente import de Miguel.

### Fase 3 — Validación aritmética del dinero (COMPLETA, auditada) + PASO 0 gate
- Harness determinista (importa la función REAL `desgloseMetodosPagoExacto` + lógica VERBATIM): 27/27 OK. 7 casos (métodos+mixto, cancel/devolución fuera, abono→venta paralela, entregar saldo=0, cierre, frontera día, fallback).
- Hallazgos: (1) frontera del día = **medianoche México** no 6am (06:00 es de plantilla QR); (2) `propinas_activas` no migrado → tipsEnabled default-on → corregido (0010 false). 0011 sonidos_activos.
- **PASO 0 gate (post-auditoría):** doble conteo de `efectivo_esperado` con abono efectivo **verificado contra 18/20 cortes REALES de Base44** = quirk de Base44 → reproducido idéntico (CANDADO), bug fuera de alcance. Barrido de feature-flags: solo propinas divergía. `hora_inicio_dia_operativo` fuera de rutas de dinero.

### Fase 4 — Auth + RLS (DB+RLS HECHA y PROBADA; wiring UI PENDIENTE)
- 33 `auth.users` por operador (email `<id>@pos.confetti.local`, password `POS-<pin>`, GoTrue hashea); `auth_user_id` + `pin_hash` en usuarios_pos; **PIN plano eliminado** (0013).
- RLS scoped por rol/sucursal (0012): helpers `pos_sucursal()`/`pos_is_admin()`; dueño/admin todo, caja solo su sucursal (ventas/cortes/abonos/pedidos/gastos/detalle). Maestros broad. Vista `usuarios_login` (anon, sin pin_hash). RPC `login_pos(pin)` (0014).
- **Adversarial 17/17 PASS:** anon bloqueado; caja A no ve B; caja B solo B; dueño ve todo; 7 casos de dinero IDÉNTICOS bajo RLS estricta.
- **PENDIENTE:** wiring de la UI de auth (6 archivos) → la app no loguea por UI. Decisión de modo empleado pendiente de Miguel.

### Migraciones aplicadas en staging (repo `supabase/migrations/`)
0001 esquema_unificado · 0002 hardening_anon_grants · 0003 harden_siguiente_folio_execute · 0004 harden_rls_auto_enable_execute · 0005 ajustes_schema_datos_vivos · 0006 seed_datos_maestros · 0007 config_campos_json_string · 0008 storage_bucket_uploads · 0009 actor_ids_a_text · 0010 config_propinas_activas · 0011 config_sonidos_activos · 0012 fase4_rls_por_rol_sucursal · 0013 fase4_drop_pin_plano · 0014 fase4_login_pos_rpc.
(Nota: el seeding de `auth.users` por operador se hizo vía SQL directo, no como migración versionada — password derivado `POS-<pin>`; ver `supabase/STAGING_NOTES.md`.)

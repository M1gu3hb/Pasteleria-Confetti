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

## Sesión 2026-06-26 (cont.) — Fase 4: WIRING UI de auth (HECHO; pendiente de firma de Miguel)

Decisión de Miguel: **Opción A** (cuenta terminal por sucursal) con el modelo exacto:
terminal=localStorage; empleado sin PIN sobre la sesión terminal (scoped); administrador=PIN
que **desbloquea UI sobre la sesión terminal** (mismo alcance de sucursal); dueño=PIN que abre
**sesión global**. Trabajo en clon fresco estable `C:\Pasteleria Confetti\pos` (el scratchpad viejo
era temporal). GitHub = fuente de verdad.

### Mapeo sesión→RLS (el diseño nuevo; Base44 no tenía RLS)
- **Sesión terminal** (3 cuentas `caja`, 1 por sucursal, `pin_hash` null) → `pos_is_admin=false`,
  scoped a su sucursal. Empleado y administrador-de-esa-sucursal operan sobre ella.
- **Administrador** = `validarPin` (RPC `login_pos`, **sin** `signInWithPassword`) → desbloqueo de UI.
  Se exige que su `sucursal_id == terminal` (admin de otra sucursal NO eleva).
- **Dueño** = `loginConPin` (`login_pos` + `signInWithPassword`) → sesión global (`pos_is_admin=true`).
  Al salir, se restaura la sesión terminal (`loginTerminal`).

### Archivos wireados (solo capa auth/sesión; CANDADOS 1/2/3 y matemática intactos)
- `src/api/supabaseClient.js`: `ensureSession()` reescrito (bootstrap de sesión TERMINAL desde
  localStorage; ya NO usa la cuenta staging) + `loginTerminal()` / `validarPin()` / `loginConPin()` /
  `logoutOperador()`.
- `src/components/common/TerminalGate.jsx`: `await loginTerminal(sucursal)` antes del auto-login del
  empleado; estado de error si la sesión falla.
- `src/components/common/ModalPinAdmin.jsx`: valida por `validarPin` (login_pos) en vez de `u.pin===`.
- `src/components/common/AccesoDuenoGate.jsx` y `src/pages/ConfigurarTerminal.jsx`: dueño abre sesión
  global (`loginConPin`); corregido bug pre-existente `activarAdmin('dueno')` (string→usuario).
- `src/components/common/Sidebar.jsx`: admin = UI sobre terminal + chequeo de sucursal; dueño = sesión
  global; al salir restaura la terminal. (Quitado import muerto `ROLE_LABELS`.)
- `src/lib/AuthContext.jsx`: comentario; sigue llamando `ensureSession()` (ahora bootstrap terminal).
- `src/pages/POSLogin.jsx` (login standalone, secundario): lista desde vista `usuarios_login` +
  `loginConPin`.
- `src/lib/ConfigContext.jsx` (#7, necesario): fallback a vista `config_publica` (anon) para preservar
  el branding EXACTO en pantallas pre-login sin la sesión staging.
- `src/api/entitiesAdapter.js`: +mapeo `UsuarioLogin→usuarios_login` (lectura; aditivo).

### Backend (migración 0015)
- 3 cuentas TERMINAL: `auth.users` (email `terminal-<sucursalid>@pos.confetti.local`, password fijo
  `POS-TERMINAL-CONFETTI`) + identity + `usuarios_pos` rol caja, `pin_hash` null. Vista `usuarios_login`
  ahora excluye `pin_hash is null` (las terminales no son seleccionables).
- ⚠️ Gotcha resuelto: al insertar `auth.users` a mano, `confirmation_token/recovery_token/email_change/
  email_change_token_new` deben ir `''` (no NULL) o `signInWithPassword` da **500**. La 0015 ya los
  pone en `''`.

### Verificación
- `npm run build` verde. ESLint del set wireado limpio.
- **Smoke UI real (4/4)**, con cuentas de prueba temporales (ya borradas): (1) terminal Xochimilco →
  empleado, ve SOLO Xochimilco, Caja; (2) PIN admin Xochimilco → eleva, sesión sigue terminal, scoped a
  Xochimilco; (3) PIN admin Topilejo en terminal Xochimilco → NO eleva; (4) PIN dueño → sesión global,
  vista general, ve todas; al salir restaura la sesión terminal. Branding pre-login (anon) = Confetti
  vía `config_publica`. 0 errores de consola.
- **Adversarial RLS 25/25** (`scripts/fase4_rls_adversarial.mjs`, guardado en el repo): anon bloqueado
  en dinero; terminal A↔B aislados; WITH CHECK bloquea inserción cruzada (42501); dueño global.
- Datos de prueba limpiados → staging = solo maestros + 3 cuentas terminal (usuarios_pos=36, login=33,
  transaccional=0).

**Fase 4 NO se da por cerrada:** la firma (dinero + aislamiento RLS) la hace Miguel/su arquitecto.

## Sesión 2026-06-26 (cont. 2) — GATE de aislamiento (post-revisión de Miguel)
Miguel aprobó el wiring y pidió cerrar UN hueco + 2 verificaciones antes de firmar. Respuestas: admin=UI ✓, ConfigContext→config_publica ✓, password embebido OK staging / prod por dispositivo (cutover), /login-pos = RETIRAR.

- **GATE-1 — `/login-pos` RETIRADO.** Investigación: el único navigate era `AppLayout.jsx` (fallback que TerminalGate ya intercepta); sin links/botones → NO load-bearing. Acción: quitada la ruta + `import` en App.jsx, quitado el efecto navigate de AppLayout, quitada la entrada en usePageTitle. **Borrados** `POSLogin.jsx` + sus deps exclusivas `LoginBrandColors.jsx` y `ensureDefaultAdmin.js` (huérfanas). Quitado el mapeo `UsuarioLogin` del adapter (sin consumidor; la vista `usuarios_login` se queda). El modelo NO tiene login standalone.
- **GATE-2 — sellado de identidad admin VERIFICADO.** Todas las acciones que sellan actor (`usuario_cajero_id`, `cancelado_por_id`, `registrado_por_id`, `creado_por_id`, `usuario_id`) en Caja.jsx / POS.jsx / CancelarVentaDialog / RegistrarPagoDialog / NuevoPedidoPastel usan `posUser?.id`/`posUser?.nombre`. Al elevar admin, `posUser` = admin real → sella el **admin real** (no el centinela 'Empleado'); en modo empleado sella 'empleado_terminal' (igual que Base44). `productos` no tiene campo de actor (no sella nada). **Sin cambio de lógica.** **Bug corregido:** `_pin` viajaba en el objeto a `login()` → se filtraba a `sessionStorage`. Ahora se separa (`const {_pin, ...limpio}`) en Sidebar/AccesoDuenoGate/ConfigurarTerminal; nunca persiste.
- **GATE-3 — reproducibilidad auth.users (migración 0016).** Los 33 `auth.users` de operadores se habían creado ad-hoc. `0016_provision_auth_operadores` los provisiona idempotentemente por nombre usando los PINs ya sembrados en 0006 (mismo repo), con token-cols en ''. **NO toca filas con `auth_user_id` ya asignado → NO-OP en staging** (verificado: 36 usuarios_pos, 0 auth.users nuevos). Reproduce los operadores en DB fresca/cutover.
- **GATE-4 — adversarial 31/31** (antes 25): +6 casos del hueco resuelto. `login_pos` valida el PIN de un admin de B pero **NO escala** la sesión (sigue terminal A, `pos_is_admin=false`, `pos_sucursal=A`); admin-B sobre terminal A queda **confinado a A** (no ve B ni todas; no escribe en B = 42501). Contraste: dueño SÍ escala (intencional).

Build verde, lint del set limpio, advisors sin novedades. Datos/cuentas de prueba limpiados (transaccional=0, usuarios_pos=36, usuarios_login=33).

### Re-smoke UI del fix `_pin` (sesión cont. 2b — pedido por Miguel antes de firmar)
El strip de `_pin` tocó el flujo de elevación y no se había probado por UI. Re-corrido en el clon (dev server + 3 cuentas de prueba temporales, ya borradas):
- **(1) Empleado Xochimilco:** sesión terminal scoped, ve SOLO Xochimilco; **abrió caja** (`CONF-A-C001`, sucursal A, actor "Empleado") y **vendió** (`CONF-A-V0001`, $35, pagada, ligada al corte, scoped a A). Write real bajo la sesión terminal ✓.
- **(2) Admin Xochimilco (PIN 1111):** eleva; **sesión sigue terminal** (`pos_is_admin=false`, `pos_sucursal=A`); `posUser`=TEST_ADMIN_XOCHI (admin real). **`posUser` SIN `_pin`** (keys: id,email,nombre,rol,sucursal_id,sucursal_nombre,adminRole) ✓.
- **(3) Admin Topilejo (PIN 2222) en terminal Xochimilco:** RECHAZADO (toast "otra sucursal"), sigue empleado ✓.
- **(4) Dueño (PIN 9999):** **SÍ entra tras el strip** (usa `_pin` para `signInWithPassword`) → sesión global (`pos_is_admin=true`, cuenta dueño, no terminal), vista general (Dashboard/Pedidos/Ventas/Web/Config + "Ver otra sucursal"); `posUser`=TEST_DUENO **sin `_pin`**; al **Salir de dueño** RESTAURA la sesión terminal scoped (`pos_is_admin=false`, Xochimilco) ✓.
- 0 errores de consola. Sin cambios de código (el fix ya estaba en commit `0602bca`). Datos/cuentas de prueba limpiados.

### Migraciones aplicadas en staging (repo `supabase/migrations/`)
0001 esquema_unificado · 0002 hardening_anon_grants · 0003 harden_siguiente_folio_execute · 0004 harden_rls_auto_enable_execute · 0005 ajustes_schema_datos_vivos · 0006 seed_datos_maestros · 0007 config_campos_json_string · 0008 storage_bucket_uploads · 0009 actor_ids_a_text · 0010 config_propinas_activas · 0011 config_sonidos_activos · 0012 fase4_rls_por_rol_sucursal · 0013 fase4_drop_pin_plano · 0014 fase4_login_pos_rpc · 0015 fase4_cuentas_terminal · **0016 provision_auth_operadores**.
(Nota: el seeding de `auth.users` por operador se hizo vía SQL directo, no como migración versionada — password derivado `POS-<pin>`; ver `supabase/STAGING_NOTES.md`.)

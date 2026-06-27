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

## Sesión 2026-06-26 (cont. 3) — FASE 5: Validación de FIDELIDAD (POS migrado vs Base44 vivo)
Comparación SOLO-LECTURA contra Base44 vía su MCP (app `Pasteleria Confetti` `6a28a71350ef872d8486262b`). No es el bot (eso es al final). NO se escribió nada en Base44.

### BLOQUE A — Paridad de datos maestros: **0 diffs**
- **sucursales** 3/3 (A/B/C, activas, orden 1/2/3) idénticas.
- **categorías** 8/8 (7 activas + General inactiva; nombre/orden/activo) idénticas.
- **productos** 20/20 idénticos (nombre, precio_venta, categoria_nombre, visible_en_web, visible_en_pos, activo, sucursal_ids): incl. `prueba 1` web=false y `prueba suscursal` con 1 sucursal (Xochimilco).
- **usuarios** 33/33 idénticos (nombre, rol, sucursal, activo; pin no expuesto): 6 dueño + 12 admin + 15 caja.
- **configuracion_negocio**: todos los campos migrados idénticos — `precio_kilo_global=140`, `ratio_personas_por_kilo=7`, `hora_inicio_dia_operativo=06:00`, `propinas_activas=false`, colores #E8579A/#FFF8F4/#5C2D1E, extras (base50/oblea30/muñeca80/velas25), rellenos (8, precio_kilo 0). (Campos de plantilla restaurante/integraciones/portal_qr NO migrados = subset curado, decisión de migración; no son datos que Confetti use.)

### BLOQUE B — Paridad de pantallas/flujos (vs MD 03): todo presente y conforme
- **POS**: tabs por categoría + bucket "Otros" para huérfanos.
- **Caja**: corte lee solo `Venta estado='pagada'` (L193); cola web `tipo_pedido=productos_catalogo + origen=web + estado=pendiente + sucursal_id` (filtrada por sucursal); buscador de venta por folio; **CANDADO 3** = `handleBuscarFolioWeb` filtra por sucursal del terminal (L685-694).
- **Ventas**: cancelar/devolver vía `CancelarVentaDialog`.
- **Productos**: CRUD directo; **puente Base44 muerto** (sin `posApiClient`/`producto_pos_id`/sync — solo un comentario que lo documenta en `NuevoProductoWebDialog`).
- **PedidosPastel**: `RegistrarPagoDialog` reusado (pastel y catálogo); "Entregado" bloqueado si `saldo_pendiente>0` (`PedidoPastelDetalleDialog`).
- **Dashboard** del dueño presente. (Las 9 páginas de plantilla restaurante se descartaron en Fase 2 — no son de Confetti.)

### BLOQUE C — Spot-check de corte real línea por línea: **14/14 campos idénticos**
Harness `scripts/fase5_corte_fidelity.mjs`: recrea inputs EXACTOS de cortes reales en staging, los lee por la sesión terminal y genera el resumen con la **función real `desgloseMetodosPagoExacto`** + fórmulas verbatim del cierre (Caja.jsx:291-300, 1440), comparando contra los valores ALMACENADOS de Base44.
- **CONF-C-C073** (San Gregorio, 42 ventas pagadas + 4 abonos, **con abono efectivo**): total_efectivo 30333.69, total_tarjeta 20032.46, total_transferencia 4839.6, total_general 55205.75, numero_ventas 42, ticket_promedio 1314.42…, **efectivo_esperado 30743.69** = total_efectivo + abono efectivo (410) → **doble conteo PRESENTE e idéntico en ambos lados**.
- **CONF-A-C03358** (Xochimilco, 48 ventas pagadas + 2 abonos, sin abono efectivo): los 7 campos idénticos; efectivo_esperado 34405.4 (sin doble conteo, correcto).
- total_cancelaciones = 0 en ambos (no se computa en el cierre, igual que Base44). Datos de prueba limpiados (staging solo maestros: usuarios_pos=36, login=33, transaccional=0).

**Resultado Fase 5: el POS migrado cuadra IDÉNTICO a Base44** (maestros, pantallas y dinero del corte, incluido el quirk). Pendiente: revisión de Miguel. No se inicia la Web.

## Sesión 2026-06-27 — WEB-1: fixes de DB para la web pública (migraciones 0017/0018 en la Supabase compartida)
La web (repo aparte `M1gu3hb/Pasteleria-Confetti-web-`) se conecta a ESTA Supabase con anon key (Opción A). WEB-0 detectó 2 GAPs; se resuelven con cambios de **esquema** que viven aquí (fuente única de verdad), NO en el repo web. Decisiones de Miguel.

### 0017 — `web_pedido_folio_trigger` (GAP 1: folio de pedido web)
- Trigger `BEFORE INSERT` en `pedidos`, `WHEN (new.origen='web' AND new.folio IS NULL)`, función `set_web_pedido_folio()` **SECURITY DEFINER** (owned por postgres) → `new.folio := siguiente_folio('pedido_pastel', new.sucursal_id)`.
- `folio` SIGUE NOT NULL; anon SIGUE sin EXECUTE directo sobre `siguiente_folio` (el trigger lo llama como definer). Mismo contador atómico que el POS → sin colisión web↔POS.
- **Verificado:** anon INSERT pedido web sin folio → fila con `PP-A-0001`; con folio provisto → NO se re-folia (`ZZWEB1-PROVIDED`); anon `siguiente_folio` directo → 42501.

### 0018 — `web_uploads_bucket` (GAP 2: imagen de referencia)
- Bucket nuevo `web-uploads` (separado de `uploads` del POS): `public=true` (lectura por URL, **sin** policy SELECT → no listable), `file_size_limit=5MB`, `allowed_mime_types` solo imágenes.
- Policy `web_uploads_anon_insert`: anon INSERT **solo** en `web-uploads`. El bucket `uploads` del POS queda **authenticated-only (intacto)**.
- **Verificado:** anon sube imagen a web-uploads (legible por URL, HTTP 200); anon a `uploads` (POS) → RLS deniega; no-imagen → rechazo por mime; >5MB → rechazo por tamaño.

### Regresión POS (verificada)
anon sigue ciego a ventas/cortes/pedidos; `siguiente_folio` sigue authenticated-only; bucket `uploads` y la generación de folios del POS NO cambian. Harness `scripts/web1_gaps_verify.mjs` (11/11 anon). Datos/archivos/contadores de prueba limpiados (transaccional=0, folio_contador=0, web-uploads vacío).

### Migraciones (repo `supabase/migrations/`)
… · 0015 fase4_cuentas_terminal · 0016 provision_auth_operadores · **0017 web_pedido_folio_trigger** · **0018 web_uploads_bucket**.

## Sesión 2026-06-27 (cierre / handoff) — Fase 5 aprobada; WEB-2 NO iniciado
- **Fase 5 APROBADA por Miguel** (POS fiel a Base44). POS Fases 0-5 completas.
- Se intentó arrancar **WEB-2** (port de la capa de datos de la web) pero se **pausó por ventana de contexto** y el port parcial se **descartó** (la próxima sesión arranca WEB-2 con clon fresco del repo web). Nada de WEB-2 quedó commiteado.
- **Hallazgo nuevo (WEB-2):** la web (anon) hace INSERT en `pedidos` pero **no puede leer de vuelta el folio** (sin SELECT; probado 42501). El pedido SÍ queda con `PP-<prefijo>-####` (trigger 0017). Para mostrarlo en la pantalla Gracias: opción recomendada = RPC `crear_pedido_web(...)` SECURITY DEFINER (migración 0019, repo POS) que devuelva el folio; alternativas = Gracias sin folio, o policy anon SELECT (descartada). **→ RESUELTO en la sesión siguiente (migración 0019); ver abajo.**
- **Imágenes de la web YA re-hospedadas** en `web-uploads/assets/` (8 archivos, mismos nombres; base `…/storage/v1/object/public/web-uploads/assets/`). WEB-2 solo cambia el prefijo de URL, NO re-subir.

### Migraciones aplicadas en staging (repo `supabase/migrations/`)
0001 esquema_unificado · 0002 hardening_anon_grants · 0003 harden_siguiente_folio_execute · 0004 harden_rls_auto_enable_execute · 0005 ajustes_schema_datos_vivos · 0006 seed_datos_maestros · 0007 config_campos_json_string · 0008 storage_bucket_uploads · 0009 actor_ids_a_text · 0010 config_propinas_activas · 0011 config_sonidos_activos · 0012 fase4_rls_por_rol_sucursal · 0013 fase4_drop_pin_plano · 0014 fase4_login_pos_rpc · 0015 fase4_cuentas_terminal · **0016 provision_auth_operadores**.
(Nota: el seeding de `auth.users` por operador se hizo vía SQL directo, no como migración versionada — password derivado `POS-<pin>`; ver `supabase/STAGING_NOTES.md`.)

## Sesión 2026-06-27 (cont.) — WEB-2 sub-paso 1: 0019 RPC `crear_pedido_web` (folio-Gracias RESUELTO)
- **Decisión #22 bloqueada por Miguel (opción 1).** Migración **0019 `web_crear_pedido_rpc`** (este repo POS; el esquema vive solo aquí): función `crear_pedido_web(payload jsonb) → text` **SECURITY DEFINER** (owner postgres, `search_path=public`) que INSERTA el pedido web y **DEVUELVE el folio** en una sola llamada — reproduce el `crearPedidoPOS` de Base44 **sin api_key**. La web pasa de `insert` directo a `rpc('crear_pedido_web', {payload})` (cambio de código del envío, en el repo web, pendiente del port).
- **Candados (idénticos al WITH CHECK de `anon_insert_pedidos`):** fuerza `origen='web'`/`estado='pendiente'` (rechaza otros valores, no los "corrige"); **whitelist EXPLÍCITA** de columnas → ignora lo que no exista (`devolver_base`) y los POS-only (`folio`, financieros `total_abonado`/`saldo_pendiente`, fechas de ciclo, `creado_por_*`); valida requeridos (cliente_nombre, cliente_telefono, fecha_entrega, sucursal_id) + **sucursal existente y activa**. Folio: **reutiliza el trigger 0017** (insert con `folio` NULL + `RETURNING folio`) → un solo generador, sin duplicar lógica. anon recibe **solo EXECUTE**, sin SELECT extra (FORCE RLS off + owner postgres ⇒ la función es la superficie controlada).
- **Verificado en la Supabase compartida (como rol anon):**
  - (a) RPC pastel válido → folio `PP-A-0001` + fila `origen='web'/estado='pendiente'`, `cliente_nombre` recortado; inyección `folio:"HACK-999"`/`total_abonado:999`/`devolver_base` **ignorada**.
  - (d) RPC catálogo → folio `PP-B-0001`, `kilos=0`, productos como texto en `notas_generales`.
  - (b) anon `SELECT … FROM pedidos` directo → **42501 permission denied** (sigue ciega).
  - (c) rechazos: falta `cliente_telefono` / `estado='pagada'` / `origen='pos_interno'` → excepción clara.
  - Limpieza: filas y contador de prueba borrados → **transaccional=0, folio_contador=0**.
- **0020 `web_crear_pedido_rpc_harden`** (hardening detectado en la verificación): Supabase otorga EXECUTE a `authenticated` por default al crear funciones → `authenticated` quedaba pudiendo ejecutar la RPC (un `caja` podría crear un pedido web/pendiente para CUALQUIER sucursal vía la función DEFINER, saltándose `pos_sucursal()`). `revoke execute … from authenticated` → la RPC queda **solo anon** (= la única superficie de escritura nueva, como pidió Miguel). Patrón igual a 0003/0004. Verificado: `anon EXECUTE=true / authenticated=false / public=false`; anon sigue creando el pedido; authenticated → 42501 permission denied for function. El POS escribe `pedidos` por INSERT directo (RLS scoped), NO por esta función.
- **Regresión POS:** ningún candado/dinero tocado; 0019/0020 solo AÑADEN una función + endurecen su grant (no alteran tablas, RLS ni folios del POS). Único cambio de esquema permitido en WEB-2.
- **DETENIDO** para auditoría de Miguel antes de seguir con WEB-2 (cliente anon + adaptador → matar puente/auth → port de call-sites con NOMBRE→ID → build+smoke).

### Migraciones aplicadas en staging (actualizado)
… · 0016 provision_auth_operadores · 0017 web_pedido_folio_trigger · 0018 web_uploads_bucket · **0019 web_crear_pedido_rpc** · **0020 web_crear_pedido_rpc_harden**.

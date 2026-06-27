# DATABASE — Supabase staging `ivqcxdpqxwjxfohiswqb`

snake_case en todo. IDs `uuid` (`gen_random_uuid()`). `created_at timestamptz default now()` en todas. "enums" = `text` + CHECK.

## 12 tablas (lista verde) — columnas clave
- **sucursales**: nombre, direccion, telefono, activa, `folio_prefijo` (A/B/C, unique), orden_visual, notas, google_maps_url, whatsapp_numero.
- **usuarios_pos**: nombre, `rol` CHECK(administrador|caja|dueño|mesero|cocina|barra), `pin_hash` (bcrypt), `auth_user_id` (→auth.users), activo, color, telefono, correo, `sucursal_id`→sucursales, sucursal_nombre, permisos_extra(jsonb). **`pin` plano ELIMINADO (0013).**
- **configuracion_negocio** (1 fila): nombre_negocio, logo_url, color_primario/secundario/acento, moneda, simbolo_moneda, **precios pastel**: precio_kilo_global, precio_kilo_es_global, precio_kilo_por_sucursal(text JSON), ratio_personas_por_kilo, ratio_personas_es_global, ratio_personas_por_sucursal(text JSON), **extras_pastel/rellenos_pastel (text JSON)**, **hora_inicio_dia_operativo** ('06:00', solo plantilla QR), propinas_activas(false), sonidos_activos, paquete_modo('esencial'), usa_mesas/cocina/barra(false), mostrar_costos_a_caja, ticket fields, presentacion_password.
- **categorias_producto**: nombre, descripcion, color, icono, orden, activo.
- **productos** (ex ProductoTerminado): nombre, categoria_id→categorias_producto, categoria_nombre(snapshot), descripcion, descripcion_web, `sucursal_ids` uuid[] (vacío=global), precio_venta, imagen_url, orden, activo, visible_en_pos, visible_en_web, notas. **SIN columna de costo** (la vista pública es segura por construcción).
- **cortes_caja**: folio, tipo_corte(cierre_diario|turno), `sucursal_id`, fechas, usuario_*_id (text), totales (efectivo/tarjeta/transferencia/general/descuentos/cancelaciones), numero_ventas, ticket_promedio, **efectivo_esperado**, efectivo_contado, diferencia_efectivo, estado(abierto|cerrado|registrado).
- **ventas**: folio, `sucursal_id`, fechas, tipo_venta, cliente_nombre, cliente_id(text), usuario_cajero_id(text), estado(abierta|enviada|en_preparacion|lista|cuenta_solicitada|pagada|cancelada), subtotal/descuentos/impuestos/total, metodo_pago(efectivo|tarjeta|transferencia|mixto), monto_efectivo/tarjeta/transferencia, cambio, `corte_caja_id`→cortes_caja, tipo_cancelacion(cancelacion|devolucion), monto_devuelto, cancelado_por_id(text)/nombre, fecha_cancelacion.
- **detalle_venta**: `venta_id`→ventas (ON DELETE CASCADE), `producto_id` uuid **SIN FK** (snapshots sobreviven al hard-delete), `producto_nombre`/`precio_unitario_snapshot`/costo_unitario_snapshot (snapshots), cantidad, subtotal, notas_producto, estado_preparacion.
- **pedidos** (ex PedidoPastel): folio, sucursal_id, origen(pos_interno|web), **tipo_pedido**(pastel_personalizado|productos_catalogo), estado(pendiente|confirmado|con_anticipo|pagado|entregado|cancelado), cliente_*, requiere_entrega, fecha_entrega(date, nullable), kilos(default 0), campos de pastel/extras, total_final, total_abonado, saldo_pendiente, notas_generales (catálogo=texto), creado_por_id(text), fechas de ciclo.
- **abonos**: `pedido_id`→pedidos (NOT NULL), `sucursal_id` (del pedido), monto, metodo_pago(efectivo|tarjeta|transferencia), afecta_caja, `corte_caja_id`→cortes_caja, registrado_por_id(text), fecha_abono, notas.
- **folio_contador**: tipo, sucursal_id, prefijo, ultimo_numero. UNIQUE(tipo, sucursal_id).
- **gastos_operativos**: fecha, categoria, descripcion, monto, metodo_pago, sucursal_id, usuario_id(text), notas.

`clientes` NO existe (0 refs).

## Vistas públicas (security_invoker=false → corren como owner; el lint ERROR es falso-positivo aceptado por Miguel: exponen solo columnas curadas + filtro fijo y mantienen la tabla base cerrada a anon). **Regla: nunca SELECT *.**
- **catalogo_publico**: id, nombre, descripcion_web, precio_venta, categoria_nombre, imagen_url, sucursal_ids, orden — WHERE visible_en_web AND activo. (anon SELECT)
- **config_publica**: nombre_negocio, logo_url, color_primario, color_acento, precio_kilo_global, ratio_personas_por_kilo. (anon SELECT)
- **usuarios_login**: id, nombre, rol, sucursal_id, sucursal_nombre, color, activo (sin pin_hash) — para el selector de login. (anon SELECT) — **Fase 4 (0015): WHERE `activo AND pin_hash is not null`** → excluye las cuentas terminal (33 operadores, sin las 3 terminales).

## Funciones
- **siguiente_folio(tipo, sucursal_id)** SECURITY DEFINER — folio atómico (UPDATE...RETURNING + lock de fila). Formatos: venta `CONF-A-V#`, corte `CONF-A-C###`, pedido `PP-A-####`. (El código del POS aún genera folios vía `pedidoPastelUtils` leyendo folio_contador; cambiarlo a este RPC es opcional/Fase 4+.)
- **pos_sucursal()/pos_is_admin()** SECURITY DEFINER — mapean auth.uid()→usuarios_pos para la RLS.
- **login_pos(p_pin, p_user_id?)** SECURITY DEFINER (anon) — valida PIN vs pin_hash (bcrypt crypt), devuelve operador (sin hash). El cliente luego hace signInWithPassword.
- **crear_pedido_web(payload jsonb) → text** SECURITY DEFINER (anon, owner postgres, `search_path=public`) — **única superficie de escritura de la web** (WEB-2 / 0019). Inserta el pedido web y **devuelve el folio** (pantalla Gracias) en una sola llamada. Reaplica los candados del `WITH CHECK` de `anon_insert_pedidos` (fuerza `origen='web'`/`estado='pendiente'`), whitelist explícita de columnas, valida requeridos + sucursal activa, y reutiliza el trigger 0017 para el folio (insert con `folio` NULL + `RETURNING`). anon: solo EXECUTE, **sin SELECT** en `pedidos`. La web usa `rpc('crear_pedido_web', {payload})` en vez de `insert`.
- **rls_auto_enable()** — event trigger pre-existente (no creado por nosotros) que auto-activa RLS en tablas nuevas de public.

## RLS
- **anon (web):** SELECT en vistas + sucursales(activa)/categorias(activo); escribe pedidos vía **RPC `crear_pedido_web`** (0019), que enforce el mismo WITH CHECK(origen='web' AND estado='pendiente') de la policy `anon_insert_pedidos` (anon conserva INSERT directo en `pedidos` pero el web ya no lo usa); **sin SELECT** en pedidos; CERO en ventas/cortes/abonos/detalle/usuarios/productos/config (RLS deny + REVOKE).
- **authenticated POS (Fase 4 scoped):** tablas de dinero (ventas/cortes_caja/abonos/pedidos/gastos_operativos/detalle_venta) → `pos_is_admin() OR sucursal_id = pos_sucursal()` (detalle vía venta padre). Maestros (sucursales/categorias/productos/config/usuarios_pos/folio_contador) → broad authenticated (intencional; los WARN del advisor son esperados ahí).

## Cuentas TERMINAL (Fase 4 / 0015 — Opción A)
3 cuentas (1 por sucursal): `usuarios_pos` rol `caja`, `pin_hash` NULL, `auth_user_id` enlazado; `auth.users`
email `terminal-<sucursalid>@pos.confetti.local`, password fijo `POS-TERMINAL-CONFETTI` (= `VITE_TERMINAL_PASSWORD`).
El empleado opera sobre esta sesión (`pos_is_admin=false` → RLS la confina a su sucursal); el administrador
se queda sobre ella; el dueño abre su propia sesión global. **Gotcha:** al insertar `auth.users` a mano,
`confirmation_token/recovery_token/email_change/email_change_token_new` deben ir `''` (no NULL) o
`signInWithPassword` da **500**.

## auth.users de OPERADORES — reproducibilidad (0016)
Los 33 `auth.users` de operadores se crearon ad-hoc (no reproducibles en DB fresca). **0016
provision_auth_operadores** los provisiona idempotentemente por `nombre` con los PINs de 0006
(token-cols en ''), saltando filas con `auth_user_id` ya asignado → **NO-OP en staging**. Para
**cutover** con datos reales (Fase 6): re-sembrar el mismo patrón con los PINs del export de Base44.

## Soporte para la Web pública (WEB-1/WEB-2, migraciones 0017/0018/0019 — la web usa ESTA Supabase con anon key)
- **0017 trigger folio web:** `set_web_pedido_folio()` SECURITY DEFINER + trigger `BEFORE INSERT` en `pedidos` `WHEN (origen='web' AND folio IS NULL)` → asigna `siguiente_folio('pedido_pastel', sucursal_id)`. Permite que anon inserte pedidos web sin exponerle `siguiente_folio` ni hacer `folio` nullable. Mismo contador que el POS.
- **0018 bucket `web-uploads`:** público (lectura por URL, no listable), 5MB, solo imágenes; policy `web_uploads_anon_insert` (anon INSERT solo ahí). El bucket `uploads` del POS sigue authenticated-only.
- **0019 RPC `crear_pedido_web`:** función SECURITY DEFINER que inserta el pedido web y **devuelve el folio** (resuelve el folio-Gracias; ver Funciones arriba y DECISIONS #22). La web pasa de `insert` a `rpc`. anon recibe EXECUTE, **sin** SELECT en `pedidos`.

## Migraciones (repo `supabase/migrations/`)
0001 esquema_unificado · 0002 hardening_anon_grants · 0003 harden_siguiente_folio_execute · 0004 harden_rls_auto_enable_execute · 0005 ajustes_schema_datos_vivos · 0006 seed_datos_maestros · 0007 config_campos_json_string (jsonb→text) · 0008 storage_bucket_uploads · 0009 actor_ids_a_text · 0010 config_propinas_activas · 0011 config_sonidos_activos · 0012 fase4_rls_por_rol_sucursal · 0013 fase4_drop_pin_plano · 0014 fase4_login_pos_rpc · 0015 fase4_cuentas_terminal · 0016 provision_auth_operadores · **0017 web_pedido_folio_trigger** · **0018 web_uploads_bucket** · **0019 web_crear_pedido_rpc**.

## Quirk de doble conteo (ver BUGS_PENDING)
`efectivo_esperado = total_efectivo + abonosEfectivo`, pero la venta paralela del abono ya está en total_efectivo → cuenta el abono efectivo dos veces. **Verificado = comportamiento de Base44 (18/20 cortes reales). CANDADO: idéntico.**

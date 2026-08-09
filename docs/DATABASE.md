# DATABASE — Supabase staging `ivqcxdpqxwjxfohiswqb`

---

# Actualización 2026-08-09 — migraciones 0050 → 0061

> Todas **aplicadas en producción** (proyecto `ivqcxdpqxwjxfohiswqb`). El archivo de cada una lleva en la cabecera su causa raíz, su evidencia y su reversión exacta.

| # | Qué hace | Nota |
|---|---|---|
| `0050` | Índices para 4 FKs sin cobertura + `usuarios_pos.auth_user_id` + `(sucursal_id, estado, created_at desc)` en `cortes_caja` | El índice de `auth_user_id` **no** redujo las tuplas leídas (6 filas, una página: el planner sigue eligiendo Seq Scan). Se documenta sin maquillar |
| `0051` | **RLS InitPlan**: envuelve `pos_is_admin()` / `pos_sucursal()` en `(select …)` en las 7 policies scoped | Antes se evaluaban **por fila**. Medido: ~20 → 0.58 scans/s (**~96 % menos**). Se usó `ALTER POLICY`, nunca `DROP+CREATE`, para no dejar la tabla sin política |
| `0052` | **Índice único parcial `ux_cortes_una_caja_abierta`** | Garantiza en la base **una sola caja abierta por sucursal**. Antes sólo existía la validación read-then-create del cliente (TOCTOU). La perdedora de la carrera recibe `23505` |
| `0053` | Rate limit del PIN en `app_private` | **Superada por `0054`. No usar.** |
| `0054` | Rate limit **forward-only**: separa `precheck` / `fallo` / `exito` | Corrige dos fallos reales de `0053`: **bloqueo perpetuo** (incrementaba antes de validar, así que tras el cooldown el PIN correcto nunca llegaba a validarse) y **bucket manipulable** (`p_dispositivo` venía del cuerpo de la petición) |
| `0055` | `pin_verificar` server-side, sólo `service_role` | |
| `0056` | **Respaldo** de `cortes_caja` antes del recálculo | |
| `0057` | **Recálculo de los 10 cortes en cero** | Fórmulas validadas contra los cortes sanos (90/92 en totales, 82/82 en `diferencia_efectivo`). ⚠️ **El comentario de cabecera de este archivo declara `CONF-A-C032` y `CONF-C-C002` "de otra causa": es FALSO para `CONF-A-C032`.** El archivo **no se edita** (migración ya aplicada = registro histórico); la corrección vive aquí y en `docs/BUGS_PENDING.md` |
| `0058` | **Trigger `guard_cierre_en_cero`** (`BEFORE UPDATE` en `cortes_caja`) | Red de seguridad independiente del frontend. **ALCANCE REAL: rechaza únicamente `total_general = 0` con ventas pagadas.** ⚠️ **NO detecta la truncación PARCIAL** — ver abajo |
| `0059` | Recálculo de `CONF-A-C042` | Se rompió **un día después** del primer despliegue porque la tablet seguía con el bundle viejo |
| `0060` | **Pastelero**: política `pos_pastelero_update_pedidos` (FOR UPDATE) + trigger `trg_guard_pastelero_alcance` | Acota **columnas y transiciones**. **NO-OP para el resto de roles** |
| `0061` | **Datos**: `Abel` vuelve a `rol='dueño'`; `logo_ticket_url` vuelve al logo real | Dos correcciones de datos, no de código. Reversión exacta en la cabecera del archivo |
| `0062` | **Respaldo** `app_private.cortes_backup_20260809_fase2` (los 108 cerrados) | Sufijo `_fase2` porque `cortes_backup_20260809` ya existía. Se respaldan TODOS los cerrados, no sólo los 2 a reparar, para poder demostrar que ningún corte sano se movió |
| `0063` | **Recálculo de `CONF-A-C032` y `CONF-C-C002`** — $1,490.00 sin reflejar | **DINERO, firmado por Miguel.** Dos causas distintas, declaradas por separado: C032 = truncación PARCIAL (universo 1,008, cruzó el tope por 8); C002 = **carrera de refresco** (universo 11, la venta se cobró 48 s antes del cierre). `ticket_promedio` sin redondear, como la app. NO se toca `notas` |
| `0064` | **Trigger `guard_cierre_incompleto`** (`BEFORE UPDATE` en `cortes_caja`) | Cierra el agujero de `0058`. Ver abajo |

## Cambios de reglas de negocio en la base

### `cortes_caja`
- **`ux_cortes_una_caja_abierta`** (0052): una caja abierta por sucursal, garantizado.
- **`trg_guard_cierre_en_cero`** (0058): no se puede cerrar un corte con `total_general = 0` si tiene ventas pagadas. Mensaje al usuario:
  > *"CIERRE_EN_CERO: el corte X tiene N ventas pagadas por $Y pero se intentó cerrar con total 0. No se guardó. Actualiza la aplicación (cierra y vuelve a abrirla) e intenta de nuevo."*

  **⚠️ LÍMITE REAL DEL GUARD (corregido 2026-08-09) — léelo antes de confiar en él.** El cuerpo de la función es:

  ```sql
  if new.estado is distinct from 'cerrado' then return new; end if;
  if old.estado = 'cerrado' then return new; end if;          -- reescrituras/recálculos
  if coalesce(new.total_general, 0) <> 0 then return new; end if;   -- <<< AQUÍ
  ```

  La tercera línea significa que **cualquier total distinto de cero se acepta sin comprobar nada**. Por tanto:

  | caso | ¿lo bloquea `0058`? |
  |---|---|
  | cierre con `total_general = 0` y ventas pagadas | **Sí** |
  | cierre con total **incompleto pero > 0** (truncación **parcial**) | **NO** |
  | cierre legítimo de una caja sin ventas (`total = 0`, 0 ventas) | no lo bloquea (correcto) |
  | recálculo/reescritura de un corte ya cerrado | no lo bloquea (correcto, por `old.estado = 'cerrado'`) |

  Caso real que pasó de largo: **`CONF-A-C032`**, cerrado con $4,995 cuando lo real eran $6,415. ✅ **Reparado el
  2026-08-09** (`0063`) y ✅ **el hueco está cerrado** por `0064`.

- **`trg_guard_cierre_incompleto`** (0064): **el que sí cubre la truncación parcial.** Criterio **asimétrico**:

  ```
  RECHAZAR si   numero_ventas_cliente  <  ventas ligadas en la base
         o si   total_general_cliente  <  suma ligada en la base − 0.50
  ```

  **Por qué asimétrico y por qué TIENE que serlo:** cuando dispara, la base ve **sólo las ventas ya ligadas**. En
  `handleCerrarCaja` el orden es: contar en servidor → **UPDATE del corte** → y *sólo después* ligar las ventas "en
  tránsito" (CANDADO 1). Así que el cliente **puede traer MÁS** que la base (legítimo) pero **nunca MENOS** (eso es
  truncación). Un guard simétrico bloquearía cierres buenos, que es el peor resultado posible.

  **Margen:** el recuento **sin margen** (entero exacto; desvío medido sobre los 108 cortes: **0**). El total con
  **0.50**, sólo para ruido de coma flotante entre el `sum` de JavaScript y el de Postgres (desvío medido: **0.00**).
  La venta más barata del histórico es **$1.00**, así que 0.50 no puede enmascarar ni un ticket.

  **`NULL` falla CERRADO** (`coalesce(..., -1)`, no `, 0`): si el NULL se tratara como cero, un cierre sin totales
  pasaría por "caja vacía" — el mismo modo de fallo que `Number(null) === 0`.

  **Convive con `0058`, no lo sustituye.** Lo subsume, pero se deja el viejo para que el rollback sea una línea
  (`drop trigger trg_guard_cierre_incompleto on cortes_caja;`) sin quedarse sin protección. Si disparan los dos, gana
  el mensaje de `0058` (orden alfabético).

  **Los dos mensajes empiezan por un MARCADOR** (`CIERRE_EN_CERO` / `CIERRE_INCOMPLETO`). El frontend
  (`src/lib/cierreBloqueado.js`) los reconoce **por marcador, nunca por SQLSTATE**, y muestra un aviso con
  instrucciones. Comprobado que el marcador sobrevive la cadena completa: trigger → PostgREST (`code 23514`, mensaje
  literal íntegro) → `entitiesAdapter` (antepone `[cortes_caja] `) → `catch`.

  **Nota sobre el mensaje al usuario:** *"Actualiza la aplicación (cierra y vuelve a abrirla)"* **no se puede cumplir
  desde el APK** mientras su `server.url` apunte a un preview congelado. Ahí el guard produce un **bloqueo sin
  salida**, no una recuperación.

### `pedidos`
Cuatro políticas activas:
| Política | Cmd | Regla |
|---|---|---|
| `pos_scope_pedidos` | ALL | `pos_is_admin() OR sucursal_id = pos_sucursal()` |
| `anon_insert_pedidos` | INSERT (anon) | `origen='web' AND estado='pendiente'` |
| `pos_pastelero_select_pedidos` | SELECT | `pos_is_pastelero()` |
| **`pos_pastelero_update_pedidos`** | UPDATE | `pos_is_pastelero()` — **nueva (0060)** |

Más el trigger **`trg_guard_pastelero_alcance`**, que para el pastelero (y **sólo** para él) permite cambiar únicamente `nota_voz_transcripcion`, `estado`, `fecha_confirmacion` y `fecha_entrega_real`, con estas transiciones:
- `pendiente → confirmado`
- `→ entregado` **sólo sin saldo pendiente** (misma precedencia que la pantalla: `saldo_pendiente` y, si fuera null, `resta`)
- las fechas **sólo se sellan en su transición**

> **Dato real que importa:** `saldo_pendiente` es `NOT NULL DEFAULT 0`, y hay **68 pedidos** con `saldo_pendiente = 0` y `resta > 0` (saldados por abonos, con el campo legacy sin actualizar). Esos **sí** se pueden entregar, igual que hoy en pantalla.

### El rol se guarda CON TILDE
`usuarios_pos.rol` usa **`'dueño'`**. El código compara contra `'dueno'` y normaliza en casi todos los sitios. **`ModalPinAdmin.jsx` es el único que exige la tilde**: normalizar el dato dejaría al dueño fuera del sistema. Normaliza en el código, nunca en la base.

## Cómo verificar sin alterar datos

Patrón usado en toda esta etapa (`scripts/pastelero_alcance_evidencia.sql`): un bloque `DO` que hace `set local role authenticated`, fija `request.jwt.claims` con el `auth_user_id` de la identidad a probar, ejecuta las escrituras de prueba acumulando el resultado en una variable, y **termina en `RAISE EXCEPTION`**, lo que **revierte la transacción entera**. Después se comprueba que no quedó rastro.

---

snake_case en todo. IDs `uuid` (`gen_random_uuid()`). `created_at timestamptz default now()` en todas. "enums" = `text` + CHECK.

> **APK Android (2026-07-09): la BD NO se tocó.** El proyecto APK (rama `apk/capacitor`) **no agregó ni cambió ninguna tabla, columna, RPC, RLS, vista ni migración**. El APK lee la MISMA Supabase que el POS web (mismo anon key + RLS). Los ajustes de impresora/cajón/formato-corte son **LOCALES por dispositivo** (localStorage `confetti_printer_cfg`), NO viven en la BD compartida. La matemática del dinero (cortes/ventas/abonos/efectivo esperado) quedó **intacta** (solo cambió CÓMO se imprime, no QUÉ se calcula).

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
- **crear_pedido_web(payload jsonb) → text** SECURITY DEFINER (anon, owner postgres, `search_path=public`) — **única superficie de escritura de la web** (WEB-2 / 0019). Inserta el pedido web y **devuelve el folio** (pantalla Gracias) en una sola llamada. Reaplica los candados del `WITH CHECK` de `anon_insert_pedidos` (fuerza `origen='web'`/`estado='pendiente'`), acota `tipo_pedido` a sus 2 valores válidos, whitelist explícita de columnas, valida requeridos + sucursal activa, y reutiliza el trigger 0017 para el folio (insert con `folio` NULL + `RETURNING`). **Sella `creado_por_nombre='Web Confetti'` como constante server-side (0021; NO del payload → no inyectable)** — señal operativa que el POS usa para distinguir pedidos web. anon: solo EXECUTE, **sin SELECT** en `pedidos`; **authenticated NO ejecuta** (revocado en 0020). La web usa `rpc('crear_pedido_web', {payload})` en vez de `insert`.
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
- **0020 hardening de la RPC:** `revoke execute … from authenticated` (Supabase otorga EXECUTE a `authenticated` por default al crear funciones). La RPC queda ejecutable **solo por anon**; el POS escribe `pedidos` por INSERT directo con su RLS scoped, no por esta función. Patrón igual a 0003/0004.
- **0021 sello del creador:** `create or replace` de la RPC que SELLA `creado_por_nombre='Web Confetti'` (constante, no del payload → no inyectable), restaurando la fidelidad con Base44 (el POS distingue los pedidos web por ese campo). Preserva los grants de 0020 (sigue anon-only; reafirmados en la migración).

## Migraciones (repo `supabase/migrations/`)
0001 esquema_unificado · 0002 hardening_anon_grants · 0003 harden_siguiente_folio_execute · 0004 harden_rls_auto_enable_execute · 0005 ajustes_schema_datos_vivos · 0006 seed_datos_maestros · 0007 config_campos_json_string (jsonb→text) · 0008 storage_bucket_uploads · 0009 actor_ids_a_text · 0010 config_propinas_activas · 0011 config_sonidos_activos · 0012 fase4_rls_por_rol_sucursal · 0013 fase4_drop_pin_plano · 0014 fase4_login_pos_rpc · 0015 fase4_cuentas_terminal · 0016 provision_auth_operadores · **0017 web_pedido_folio_trigger** · **0018 web_uploads_bucket** · **0019 web_crear_pedido_rpc** · **0020 web_crear_pedido_rpc_harden** · **0021 web_crear_pedido_rpc_sello_creador**.

## Quirk de doble conteo (ver BUGS_PENDING)
`efectivo_esperado = total_efectivo + abonosEfectivo`, pero la venta paralela del abono ya está en total_efectivo → cuenta el abono efectivo dos veces. **Verificado = comportamiento de Base44 (18/20 cortes reales). CANDADO: idéntico.**

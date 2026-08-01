# Auditoría POS Confetti — 2026-08-01

Proyecto Supabase: `ivqcxdpqxwjxfohiswqb` (Postgres 17.6.1, us-east-1).
Rama de producción: `migracion/supabase` (Vercel `pasteleria-confetti`).
Estado: **sistema VIVO** — última venta registrada durante la auditoría: `2026-08-01 15:44 UTC`.

> Alcance ejecutado en esta sesión: **Fase 0 (preparación) y Fase 1 (auditoría independiente) completas**,
> más dos cambios de base de datos aditivos y reversibles (0050, 0051).
> Las fases que cambian autorización, Auth, Storage o el frontend quedan **especificadas y NO aplicadas**.
> Motivo en §6.

---

## 0. Hallazgo previo que condiciona todo: el repositorio

`main` (y el import base del repo) es el **export de Base44**, sin una sola referencia a Supabase.
El POS real que corre en producción vive en la rama **`migracion/supabase`** (122 commits), junto con
`supabase/migrations/` y `docs/`. La rama `apk/capacitor` es la misma base envuelta en Capacitor.

Consecuencia operativa: el APK Android carga la **web viva** desde Vercel (`capacitor.config.ts` →
`server.url`). Cualquier cambio de frontend llega a las tablets en la siguiente recarga, sin reinstalar.
Esto es exactamente lo que hace peligroso tocar Auth sin coordinar despliegue.

---

## 1. Matriz de hallazgos

### 1.1 Consumo y volumen

| Hallazgo | Veredicto | Evidencia |
|---|---|---|
| ~2.88M transacciones | **Confirmado** | `pg_stat_database` = 2,890,122 |
| Sin deadlocks | **Confirmado** | `deadlocks = 0` |
| Caché ~99.999% | **Confirmado** | 99.9992% (`blks_hit` 183,344,278 / `blks_read` 1,532) |
| 7 usuarios Auth | **Confirmado** | `auth.users` = 7 |
| 3 sucursales / 6 usuarios POS | **Confirmado** | `sucursales`=3, `usuarios_pos`=6 |
| 38,954 temporales ≈ 68.7 GB | **Confirmado el contador / REFUTADO como problema actual** | ver §1.2 |

### 1.2 Los 68.7 GB de temporales — **refutado como causa aplicativa**

El contador existe (`pg_stat_database`: 39,007 archivos / 64 GB), pero **no lo produce el POS**:

1. `pg_stat_database.stats_reset` = **2026-05-22**, que es *anterior* a la creación del proyecto
   (**2026-06-26**). Ese contador no describe la carga actual de esta base.
2. En `pg_stat_statements` (reset 2026-06-26), **ninguna** consulta de la aplicación ha escrito un
   solo bloque temporal. Las únicas entradas con `temp_blks_written > 0` son consultas de
   *introspección/auditoría* (incluidas las mías de hoy), cada una con `calls = 1`, ~2,029 bloques
   totales ≈ 16 MB.

Las consultas calientes (`cortes_caja`, `ventas`, `pedidos`) tienen `temp_blks_written = 0`.
**No hay que subir `work_mem` ni perseguir spills.** No requiere acción.

### 1.3 Polling y consultas

Todas las cifras confirmadas contra `pg_stat_statements` (ventana desde 2026-06-26):

| Consulta | Reclamado | Medido | Veredicto |
|---|---|---|---|
| `cortes_caja` select \* order created_at desc limit 50 | >583,000 | **584,029** | Confirmado |
| `ventas` por estado | >261,000 | 156,409 + 105,176 = **261,585** | Confirmado |
| `pedidos` por sucursal | >77,000 | **77,831** | Confirmado |
| `pedidos` por estado | >51,000 | **51,420** | Confirmado |
| Respuesta ~47.6 KB sin comprimir | Confirmado (plausible) | `select *` de 50 filas de `cortes_caja` | Confirmado |

`cortes_caja` consume **4,137 s de CPU de base** (69 minutos) — es, por mucho, la consulta más cara
del sistema.

**Causa raíz (código):** `src/lib/useCajaAbierta.js` y `src/lib/useCorteAtrasado.js` llaman
`base44.entities.CorteCaja.list('-created_date', 50)`. En `src/api/entitiesAdapter.js`, `list()`
emite siempre `select('*')` y **no aplica ningún filtro por sucursal** — trae las 50 últimas filas
globales y filtra en el cliente.

**Causa raíz (frecuencia):** ambos hooks usan `refetchInterval: 8000` sobre la *misma* queryKey.
React Query registra un temporizador **por observador**, y hay 6 puntos de montaje
(`POS.jsx`, `Caja.jsx` ×2, `Dashboard.jsx`, `PedidosPastel.jsx`, `NuevoPedidoPastel.jsx`,
`PedidoPastelDetalleDialog.jsx`). Con 3–4 observadores montados el intervalo efectivo cae a ~2 s.
**Esto confirma el reporte de "cada dos segundos" como el pico, no como el promedio.**

### 1.4 Seguridad Auth/PIN — **cadena de ataque completa, confirmada**

Verificado paso a paso:

1. `login_pos` (`SECURITY DEFINER`) devuelve el correo como
   **`lower(usuarios_pos.id::text) || '@pos.confetti.local'`** — derivado del UUID. Confirmado en `prosrc`.
2. La vista **`usuarios_login` es `SELECT` para `anon`** y expone `id`, `nombre`, **`rol`**, `sucursal_id`.
3. `src/api/supabaseClient.js` construye la contraseña como **`` `POS-${pin}` ``** (`loginConPin`).
4. La contraseña de las cuentas terminal está **embebida en el bundle**:
   `VITE_TERMINAL_PASSWORD || 'POS-TERMINAL-CONFETTI'`, con correo `terminal-<sucursal_uuid>@pos.confetti.local`.

**Por lo tanto un atacante NO necesita `login_pos`:** lee los UUID en `usuarios_login` sin autenticarse,
deriva el correo, y prueba `POS-0000` … `POS-9999` **directamente contra `/auth/v1/token`**.
Son **10,000 combinaciones** contra un endpoint que el RPC no controla.

> **Confirmado el punto que el encargo pedía no dar por bueno:** poner rate limit sólo en `login_pos`
> es demostrablemente inútil. El límite tiene que vivir en la ruta que entrega la sesión, o hay que
> eliminar la credencial derivada.

Además, el `rol` expuesto a `anon` permite **elegir directamente al dueño** como objetivo.

Sesiones (confirmadas exactamente): 191 sesiones · 184 en 30 días · 1,637 refresh tokens ·
191 sin revocar. Consistente con `persistSession: true` + tablets que nunca cierran sesión.

### 1.5 RLS y autorización — confirmado

Seis tablas con política `ALL` para `authenticated`, `USING true` **y** `WITH CHECK true`:
`usuarios_pos`, `productos`, `categorias_producto`, `configuracion_negocio`, `sucursales`, `folio_contador`.

Y `authenticated` tiene `SELECT, INSERT, UPDATE, DELETE` sobre **todas** ellas
(`information_schema.role_table_grants`).

Combinado, un empleado autenticado (o cualquiera que obtenga un JWT por §1.4) puede vía REST:

- **Escalar a dueño**: `PATCH /rest/v1/usuarios_pos?id=eq.<suyo>` con `{"rol":"dueño"}`.
- Cambiar el `pin_hash` o el `auth_user_id` de otro usuario.
- Alterar precios (`productos`) y configuración del negocio.
- **Manipular `folio_contador`** (colisión de folios fiscales).

> No se ejecutó ninguna escritura de prueba contra datos reales. El veredicto sale del análisis de
> políticas + grants, que es concluyente: `USING true` + `UPDATE` concedido = escritura permitida.

Vistas: las tres (`usuarios_login`, `catalogo_publico`, `config_publica`) son `security_invoker=false`,
es decir, **corren como `postgres` y saltan la RLS**. El advisor las marca como ERROR.

### 1.6 Storage — confirmado, con un matiz

| Bucket | Público | Límite tamaño | MIME | Veredicto |
|---|---|---|---|---|
| `uploads` | sí | **ninguno** | **ninguno** | Confirmado |
| `web-uploads` | sí | 5 MB | **sí restringido** a 7 tipos de imagen | **Parcialmente refutado** — el reporte decía "sin restricción MIME"; sí la hay |
| `notas-voz` | sí | **ninguno** | **ninguno** | Confirmado |

Políticas críticas:
- `notas_voz_public_read` para el rol **`public`** → cualquiera lista y descarga **todas** las notas de voz.
- `notas_voz_auth_delete` con `USING (bucket_id = 'notas-voz')` → **cualquier autenticado borra audios ajenos**.
- `uploads_auth_update` → cualquier autenticado **sobrescribe cualquier archivo** del bucket.
- `web_uploads_anon_insert` → carga anónima sin vínculo a ningún pedido (sí acotada por MIME y 5 MB).

`cacheControl: '3600'` está fijado en `src/api/base44Client.js` (`UploadFile`) — confirma el `max-age=3600`
de todos los objetos y explica la re-descarga en visitas siguientes.

### 1.7 Edge Function `transcribir-nota-voz` — confirmado en todos los puntos

`verify_jwt = true` (correcto, ya estaba). Todo lo demás falla:

- **SSRF**: hace `await fetch(audioUrl)` con la URL **tal cual la manda el cliente**. Sin allowlist de
  host, proyecto, bucket ni path. Permite escanear destinos internos; el código distingue
  `download_<status>` frente a excepción, lo que la convierte en un **oráculo SSRF ciego**.
- Sin validación de MIME, sin límite de tamaño, sin `AbortController` ni timeout.
- Sin rate limit → **abuso de costo directo** contra `OPENAI_API_KEY` (Whisper se factura por minuto).
- CORS `Access-Control-Allow-Origin: *`.
- Devuelve `detail: <cuerpo de error de OpenAI>` (300 chars) al cliente.
- No valida rol ni usuario más allá de que el JWT exista — y por §1.4 un JWT es obtenible.

### 1.8 Índices

FKs sin índice confirmadas: `abonos.sucursal_id`, `folio_contador.sucursal_id`,
`gastos_operativos.sucursal_id`, `usuarios_pos.sucursal_id`. `usuarios_pos.auth_user_id` tampoco tenía.
Idempotencia sí está bien cubierta: `ux_ventas_idempotency_key` (parcial, único) — 1,221 usos.

---

## 2. La causa raíz de los 62.5M de scans (y por qué el índice NO era la respuesta)

`usuarios_pos` tiene **6 filas** y acumulaba **62,535,100 seq_scan / 411,345,739 tuplas leídas**.

Contra 1,173,845 peticiones REST (`set_config` de PostgREST), eso da **~53 llamadas a los helpers por
petición**. Si se evaluaran una vez por statement serían 1–2. **Se evaluaban por fila.**

Mecanismo: `pos_is_admin()`, `pos_sucursal()` y `pos_is_pastelero()` son `STABLE` — pero una llamada
`STABLE` **sin argumentos no se pliega en tiempo de plan**; el ejecutor la evalúa fila a fila. Como cada
helper hace `select ... from usuarios_pos where auth_user_id = auth.uid()`, cada fila de
`ventas`/`pedidos`/`cortes_caja` disparaba un scan completo de `usuarios_pos`.

**Resultado medido y honesto sobre el índice:** crear `idx_usuarios_pos_auth_user_id` **no arregla esto**.
`EXPLAIN (ANALYZE, BUFFERS)` tras crearlo sigue mostrando `Seq Scan` — 6 filas caben en una página y el
seq scan (2 buffers) es más barato que el índice. El índice queda por higiene, pero **la corrección real
es envolver en `(select ...)`** (migración 0051), que convierte la llamada en InitPlan: 1 vez por statement.

---

## 3. Cambios APLICADOS en esta sesión

Ambos aditivos, reversibles, sin cambio de comportamiento visible ni de autorización.

### `0050_indices_fk_y_auth_user_id.sql`
Índices para las 4 FKs sin cobertura + `usuarios_pos.auth_user_id` + un índice
`(sucursal_id, estado, created_at desc)` sobre `cortes_caja` que deja lista la consulta mínima de la Fase 5.
**Rollback:** `DROP INDEX <nombre>;`

### `0051_rls_initplan_wrap_helpers.sql`
`ALTER POLICY` sobre las 7 políticas *scoped* (`ventas`, `pedidos`, `cortes_caja`, `abonos`,
`gastos_operativos`, `detalle_venta`, `pos_pastelero_select_pedidos`) para envolver los helpers en
`(select ...)`.

- Se usó `ALTER POLICY`, no `DROP`+`CREATE`: **la tabla nunca queda sin política**.
- **Equivalencia semántica**: el booleano es idéntico; los helpers sólo dependen de `auth.uid()`,
  constante dentro del statement. No cambia quién ve ni quién escribe qué.
- **No se tocaron** las políticas `USING true`: eso es autorización real y va en su propia fase.
- **Rollback:** repetir los `ALTER POLICY` sin los `(select ...)`.

**Medición sobre tráfico real de producción** (`seq_scan` de `usuarios_pos`):

| | Tasa |
|---|---|
| Antes | ~15–19 scans/segundo |
| Después | **0.62 scans/segundo** (29 scans en 47 s) |

Reducción ≈ **96%** en la carga de RLS, sin tocar el frontend.

---

## 4. Lo que NO se aplicó, y por qué

Todo lo siguiente cambia **autorización, Auth, Storage o comportamiento del frontend**. En un POS vivo,
con 3 sucursales vendiendo hoy y tablets que recargan la web desde Vercel, aplicarlo sin poder ejecutar
la app ni validar en tablet arriesga exactamente lo que el encargo prohíbe: que el personal no pueda
vender o tenga que volver a iniciar sesión.

Además `CLAUDE.md` del propio repo lo exige: *"al terminar cada [fase] DETENERSE y reportar; esperar luz
verde de Miguel"*, y *"la matemática del dinero y el aislamiento RLS NO se auto-certifican… los firma Miguel"*.

### 4.1 Auth/PIN (Fase 3) — **la más urgente, y la más delicada de desplegar**

El PIN sigue siendo de 4 dígitos y la UI no cambia. Lo que hay que eliminar es la **credencial derivada**.

Diseño propuesto (requiere decisión, porque afecta el despliegue):
1. Sustituir la contraseña `POS-<pin>` y `POS-TERMINAL-CONFETTI` por **secretos de alta entropía por
   usuario/terminal**, generados en servidor y **nunca** presentes en el bundle.
2. El PIN deja de ser credencial de Auth: pasa a validarse en un RPC que, si acierta, **emite la sesión**
   (vía Edge Function con `service_role`, que sí puede firmar). El cliente nunca ve el secreto.
3. Rate limit + cooldown en **esa** ruta (no en `login_pos`), por usuario+dispositivo+IP, con reinicio en
   éxito y sin bloqueo permanente.
4. Revocar `EXECUTE` de `login_pos` a `anon`, y quitar `rol` de `usuarios_login` (o restringir la vista).

> **Riesgo de despliegue que exige coordinación:** las tablets cargan la web viva. Web y APK deben pasar
> al esquema nuevo de forma solapada (aceptar ambos durante la transición) o las tablets quedan fuera
> **durante el servicio**. Es el punto que más conviene hacer en ventana de cierre.

### 4.2 RLS `USING true` (Fase 4)
Sustituir las 6 políticas por rol/sucursal y `REVOKE` del DML directo donde deba usarse RPC
(`folio_contador` sobre todo). Requiere fijar antes la matriz de permisos real de
empleado / pastelero / administrador / dueño y **probarla en la app**, porque `entitiesAdapter` escribe
directo a tablas en muchos call-sites.

### 4.3 Storage (Fase 8)
`notas-voz` a privado + signed URLs + límite MIME/tamaño + borrado sólo del propietario;
`uploads` con MIME y tamaño; `web-uploads` con ruta generada en servidor. Conservando todos los objetos.
Requiere tocar `base44Client.UploadFile` y los puntos de reproducción/transcripción.

### 4.4 Edge Function (Fase 9)
Allowlist estricta de host/proyecto/bucket/path, validación de MIME y tamaño, `AbortController`,
rate limit por usuario, CORS acotado, y dejar de devolver `detail` de OpenAI. Es autocontenida y de
bajo riesgo — **es la mejor candidata para el siguiente paso**.

### 4.5 Caja / polling (Fase 5)
Consulta mínima (`sucursal + estado='abierto' + limit 1`, columnas justas), consulta aparte para cortes
de días anteriores, **una sola** suscripción Realtime por sucursal, y quitar el `refetchInterval: 8000`
duplicado. El índice que lo soporta **ya está creado** (0050).
Ojo: `CANDADO 1` del repo prohíbe tocar el fallback venta↔corte de `Caja.jsx`.

### 4.6 Imágenes (Fase 7)
`cacheControl` largo + `immutable` con rutas versionadas, en vez de `3600`. Es de bajo riesgo, pero
conviene ir junto con el cambio de `UploadFile` de la Fase 8.

---

## 5. Fases del encargo que no pudieron ejecutarse

- **Fase 2 (baseline visual, capturas, req/min, tiempo de arranque)**: requiere ejecutar la app contra
  producción y un dispositivo/tablet. No hay `.env` con credenciales en el entorno ni acceso a la tablet.
- **Fase 12 (E2E, smoke en tablet, regresión visual)**: misma razón.
- `npm test` no existe en `package.json` (sólo `dev`, `build`, `lint`, `typecheck`, `preview`);
  **no hay suite de pruebas** que ejecutar. Sí existen scripts de verificación puntuales en `scripts/`.

---

## 6. Estado y siguiente paso recomendado

Aplicado y verificado: **0050**, **0051** (≈96% menos carga de RLS, cero cambios de experiencia).

Orden recomendado, de menor a mayor riesgo:
1. **Edge Function** (autocontenida, sin impacto en el flujo del personal).
2. **Storage** `notas-voz` + `uploads` (+ `cacheControl` de imágenes).
3. **Caja/polling** (el 95% de reducción en `cortes_caja`) — con validación en tablet.
4. **RLS `USING true`** — con matriz de permisos firmada.
5. **Auth/PIN** — en ventana de cierre, con esquema de transición solapado.

**Ninguno de los cambios aplicados hoy altera la experiencia del personal:** no cambian pantallas, pasos,
textos, el PIN de 4 dígitos, ni obligan a volver a iniciar sesión. Son índices y una reescritura
semánticamente equivalente de expresiones RLS.

---

## 7. Fase 9 — Edge Function `transcribir-nota-voz` ENDURECIDA (aplicada)

Desplegada **versión 3**, `verify_jwt=true` conservado. Contrato con el frontend intacto:
`{ audioUrl }` → `{ transcript, ok, error }`, siempre HTTP 200, degradación con gracia.
`NotaVozRecorder.jsx` **no se tocó**.

### Hallazgo nuevo durante las pruebas
**`OPENAI_API_KEY` no está configurada en el proyecto.** La función respondía `no_key` antes de
cualquier otra cosa: la transcripción con Whisper **nunca ha funcionado en producción**; el POS
siempre cayó a la transcripción de Web Speech (que es la base y sí funciona en Chrome/Android).
Esto hace que este despliegue sea de **riesgo cero hoy** — y que el endurecimiento ya esté puesto
para cuando Miguel configure el secreto.

### Cambios
| # | Antes | Ahora |
|---|---|---|
| SSRF | `fetch(audioUrl)` con la URL del cliente | URL validada **y reconstruida** desde el nombre de objeto; nunca se hace fetch de la cadena recibida |
| MIME | ninguno | `audio/webm`, `audio/mp4`, `audio/ogg` — por extensión **y** por `Content-Type` real |
| Tamaño | ninguno | 10 MB, validado por `Content-Length` y tras leer el cuerpo (máx. real hoy: 438 KB) |
| Timeout | ninguno | `AbortController`: 15 s descarga, 60 s OpenAI |
| CORS | `*` | allowlist: producción, preview del APK, previews `pasteleria-confetti*.vercel.app`, `localhost` en dev |
| Errores OpenAI | devolvía `detail` (300 chars) | sólo `openai_<status>` |
| Logs | podían incluir la URL | mensajes fijos, sin URL, JWT, API key ni audio |

Orden deliberado: la validación de URL corre **antes** de mirar `OPENAI_API_KEY`, para que la entrada
maliciosa se rechace exista o no el secreto (y para que las defensas sean verificables).

### Evidencia de pruebas (contra la función desplegada)
- **14/14** vectores rechazados con `invalid_audio_url`: metadata de AWS (`169.254.169.254`),
  `localhost`, host externo, host con sufijo (`...supabase.co.evil.com`), **otro proyecto Supabase**,
  otro bucket (`uploads`), path `authenticated`, traversal, extensión `.exe`, credenciales embebidas,
  puerto 22, `http`, `file://`, `gopher://`.
- **2/2** audios reales existentes aceptados por la validación (llegan a `no_key`). No se modificó ni
  borró ningún objeto.
- JWT ausente → **401** en plataforma. JWT inválido → **401**.
- CORS: 4 orígenes legítimos reciben `Access-Control-Allow-Origin`; 3 atacantes (`evil.com`,
  otro proyecto Vercel, sufijo `...vercel.app.evil.com`) quedan **sin cabecera** → bloqueados.
- Logs posteriores: sólo método/status/endpoint. Sin URL, JWT, API key ni contenido de audio.
- `npm run build` → **exit 0**. `npm run lint` → 39 errores, **todos preexistentes** en `src/`
  (imports sin usar); toqué **0 archivos** de `src/`.

### Rollback
Redesplegar la v1, que está íntegra en git: `git show 9b36aa5:supabase/functions/transcribir-nota-voz/index.ts`.

### PENDIENTE DE APROBACIÓN — rate limit (no implementado a propósito)
Un contador en memoria sería falso: el runtime de Edge Functions escala a varias instancias y pierde
el estado en arranques en frío. Un atacante lo evade sin esfuerzo. Requiere persistencia.

Propuesta (requiere crear **una** tabla nueva → me detengo aquí como se pidió):

```sql
-- esquema privado, NO expuesto por PostgREST
create schema if not exists rl;
create table rl.edge_rate (
  clave      text        not null,   -- p.ej. 'transcribir:'||auth_uid
  ventana    timestamptz not null,   -- inicio del bucket (p.ej. truncado a minuto)
  intentos   int         not null default 1,
  primary key (clave, ventana)
);
```
La función la consultaría con `service_role` mediante un RPC `rl.consumir(clave, limite, ventana)`
que incrementa y devuelve si se excedió. Límite sugerido: **10 transcripciones / usuario / hora**
(hoy hay 8 notas de voz en total en el bucket, así que es holgadísimo).
Alternativa sin tabla: rate limit por IP en el borde (Cloudflare/Vercel), fuera de Supabase.

> Nota relevante: `verify_jwt=true` significa "JWT válido del proyecto", **no** "usuario autenticado".
> La propia clave `anon` (que está en el bundle por diseño) es un JWT válido. Por eso el rate limit
> importa: sin él, cualquiera con la anon key puede invocar la función. El endurecimiento de arriba
> ya elimina el SSRF y acota el gasto por llamada, pero no el número de llamadas.

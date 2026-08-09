# PROJECT_CONTEXT.md — POS Pastelería Confetti

> **Fuente principal de transferencia.** Si vas a continuar este proyecto en otra sesión, otra cuenta u otra IA, lee ESTE archivo completo, luego `CLAUDE.md`, luego `HANDOFF.md` (lo más reciente), y después `docs/`.
>
> **Última actualización:** 2026-08-09 (Fase 0) · commit `04bd33c` + este commit de docs · rama `migracion/supabase`

---

## 1. Objetivo del proyecto

Punto de venta interno de **Pastelería Confetti** (Ciudad de México, 3 sucursales). Se migró desde Base44 a infraestructura propia — **React (Vite) en Vercel + Supabase (Postgres, Auth, RLS, Storage)** — **sin cambiar el comportamiento** que el dueño ya tenía aprobado.

Lo usa **personal no técnico y de edad**, sobre **tablets**, todos los días. La consigna permanente es que **la experiencia visible no cambie**: nada de pantallas nuevas, pasos nuevos, contraseñas nuevas ni re-logins. El PIN sigue siendo de **4 dígitos**.

Resuelve: cobrar, llevar pedidos de pastel personalizado, controlar caja (apertura, cortes, cierres) y sacar tickets/PDF, con **aislamiento por sucursal**.

## 2. Estado actual (honesto)

**EN PRODUCCIÓN Y OPERANDO.** No es staging. Abel y su personal venden con esto hoy.

**Qué funciona:**
- Venta, cobro (efectivo/tarjeta/transferencia/mixto), pedidos de pastel, abonos, cortes y cierre de caja.
- Aislamiento por sucursal vía RLS. Roles: `caja` (terminal), `administrador`, `dueño`, `pastelero`.
- Cierre de caja **protegido en tres capas** contra el bug de los **ceros** — ojo: **sólo contra el caso `total = 0`**; la truncación **parcial** sigue sin cubrir (ver §8 y §10).
- Rol `pastelero` con permiso acotado para editar la nota y avanzar estados (migración `0060`).
- APK Android (Capacitor) con impresión ESC/POS nativa — **pero apuntando a la rama equivocada**, ver §11.

**Qué está incompleto:**
- El árbol de rutas **no tiene ErrorBoundary**: cualquier excepción en render deja la app en blanco.
- Varias comparaciones de rol **no normalizan la tilde** (`dueño` vs `dueno`) y dejan al dueño sin funciones sueltas.
- Bloques de la auditoría nunca abiertos: políticas `USING true`, vistas `security_invoker=false`, Storage/imágenes, cutover de Auth, limpieza de la fachada Base44.

**Qué está roto / bloqueado:**
- **El APK de las tablets carga el preview de `apk/capacitor`, 20 commits por detrás de producción.** Por ahí no llega ninguna corrección de frontend. **Es lo más urgente.** No es un riesgo latente: verificado en navegador el 2026-08-09, por ese canal Xochimilco ve **$0.00 y 0 tickets** con 17 ventas reales y **no puede cerrar caja** (el trigger `0058` rechaza el cierre en cero y el mensaje "actualiza la aplicación" no puede cumplirse desde el APK). Ver `HANDOFF.md` §4.
- **P0 DINERO ABIERTO — truncación PARCIAL sin detectar ni reparar.** `CONF-A-C032` tiene **$1,420 sin reflejar** y estaba mal clasificado como "descuadre de otra causa". El trigger `0058` **no** lo habría impedido: sólo rechaza `total_general = 0`. Ver `docs/BUGS_PENDING.md`.
- **La suite `scripts/cierre_caja_verify.mjs` excluye ese folio por nombre**, así que **da verde encima del dinero no reflejado**. Se corrige en la Fase 2.4.

**Lo que se hizo entre 2026-08-01 y 2026-08-09:** ver `HANDOFF.md` §2 y `docs/CHANGELOG.md`.

## 3. Stack técnico

- **Frontend:** React 18 + Vite 6 + Tailwind 3 + React Router 6 + **React Query 5**. JavaScript (no TypeScript en el front; hay `jsconfig` y `tsc` corre en modo checkJS, con errores preexistentes).
- **Datos/Auth/RLS/Storage:** **Supabase**, proyecto **`ivqcxdpqxwjxfohiswqb`** (us-east-1, PostgreSQL 17.6).
- **Hosting:** **Vercel**, proyecto `pasteleria-confetti`, equipo `team_pSE0TmK8p4NCa4co6nf8XTGq`. **Rama de producción: `migracion/supabase`.** Cualquier otra rama sale como preview.
- **PWA:** `vite-plugin-pwa` con `registerType: 'autoUpdate'`, `skipWaiting`, `clientsClaim`. Precachea **sólo el shell**; **todo lo de `*.supabase.co` es `NetworkOnly`** (nunca se cachean datos: datos viejos = descuadre de dinero).
- **APK:** Capacitor 8 + plugin nativo propio sobre DantSu ESCPOS.
- **Edge Functions (Deno):** `transcribir-nota-voz` (Whisper), `pin-login`, `poc-auth-magiclink` (pendiente de borrar).

## 4. Arquitectura general

Una sola base Supabase sirve al POS y a la web pública, separadas por **RLS**. El puente a Base44 **ya no existe**.

**Sesiones (importante y poco intuitivo):**
- La **terminal** (tablet) abre una sesión Supabase propia: `terminal-<sucursal_id>@pos.confetti.local`. Esa sesión está **acotada a su sucursal** por RLS.
- El **administrador** valida su PIN y **NO cambia la sesión**: sigue sobre la de la terminal (hereda su sucursal). Sólo se eleva la UI.
- El **dueño** y el **pastelero** SÍ abren una **sesión global** (`loginConPin` → `signInWithPassword`), porque necesitan ver todas las sucursales.
- Al salir de dueño/pastelero **hay que restaurar la sesión de la terminal** o la tablet queda autenticada con la identidad equivocada.

**Sucursal efectiva** (`TerminalContext.sucursalEfectiva`) — de aquí salen casi todos los bugs de rol:

| modo | sucursal efectiva |
|---|---|
| empleado | la de la terminal |
| administrador | la suya (que es la de su terminal) |
| **dueño** | la que elija en pantalla, o **`null`** (vista general) |
| **pastelero** | **`null`** (ve las 3) |

**Capa de datos:** `src/api/entitiesAdapter.js` conserva el contrato `base44.entities.*` (filtros estilo Mongo `$in/$ne/$gte/$lte`, alias `created_date → created_at`, whitelist de columnas por tabla). **No es un find-replace y el whitelist no se toca a la ligera.**

## 5. Módulos principales

| Módulo | Qué hace |
|---|---|
| **Caja** (`src/pages/Caja.jsx`, ~2.200 líneas) | Cobro, apertura/cierre de caja, cortes. **Aquí viven los CANDADOS y la matemática del dinero.** |
| **POS / Punto de venta** | Venta directa y venta libre. |
| **Pedidos de Pastel** | Pedidos personalizados y de catálogo web, abonos, estados, nota de voz. |
| **Dashboard** | Resumen por sucursal o **vista general** (dueño, sin sucursal). |
| **Ventas / Registros** | Historial y limpieza. |
| **Configuración** | **Sólo dueño.** Identidad, operación, usuarios POS, precios/rellenos/extras de pastel, mantenimiento. Es donde Abel configura todo. |
| **Web Pública** | Catálogo y pedidos desde la web (repo aparte, misma base). |

## 6. Entidades y base de datos

12 tablas. Detalle completo en **`docs/DATABASE.md`**.

`sucursales`, `usuarios_pos`, `configuracion_negocio`, `productos`, `categorias_producto`, **`ventas`**, `detalle_venta`, **`cortes_caja`**, **`pedidos`**, `abonos`, `folio_contador`, `gastos_operativos`.

**Las tres que tocan dinero y hay que tratar con cuidado:**
- **`ventas`** — el corte lee SÓLO `estado='pagada'`. Cancelar/devolver excluye por construcción.
- **`cortes_caja`** — apertura/cierre. Protegida por el índice único `ux_cortes_una_caja_abierta` (0052) y el trigger `guard_cierre_en_cero` (0058), **que sólo rechaza `total_general = 0`** — no cubre la truncación parcial.
- **`pedidos`** — pedidos de pastel. Políticas: `pos_scope_pedidos` (ALL), `pos_pastelero_select_pedidos` (SELECT), `pos_pastelero_update_pedidos` (UPDATE, 0060) + trigger `trg_guard_pastelero_alcance`.

**Ojo con el rol:** en la base se guarda **`dueño` CON TILDE**. El código compara contra `dueno` SIN tilde y normaliza… **en casi todos los sitios**. `ModalPinAdmin.jsx` es el **único** que exige la tilde: si alguien "normaliza" el dato en la base, **el dueño se queda fuera del sistema**.

## 7. Mapeo de archivos importantes

Detalle en **`docs/FILE_MAP.md`**. Los que no se rompen:

| Archivo | Para qué | Riesgo |
|---|---|---|
| `src/pages/Caja.jsx` | CANDADOS 1/2/3 + matemática del dinero | **Máximo** |
| `src/lib/ventasCorte.js` | Ventas del corte: acotada, ordenada y **paginada**. Existe porque PostgREST corta en 1.000 filas | **Máximo** |
| `src/api/entitiesAdapter.js` | Contrato `base44.entities.*` → Supabase | Alto |
| `src/api/supabaseClient.js` | Sesiones: `ensureSession`, `loginTerminal`, `validarPin`, `loginConPin`, `logoutOperador` | Alto |
| `src/lib/TerminalContext.jsx` | `adminMode`, `adminRole`, **`sucursalEfectiva`** | Alto |
| `src/lib/useCajaAbierta.js` | Fuente única de "¿hay caja abierta?" | Alto |
| `src/lib/cajaRefresco.js` | Un solo temporizador por sucursal. **Aquí estuvo el `Illegal invocation`** | Alto |
| `src/lib/cajaEstado.js` | Consultas de caja abierta / último cierre. **Las listas de columnas deben incluir `sucursal_id`** | Alto |
| `src/components/common/Sidebar.jsx` | Menú por rol + entrada/salida de admin/dueño. Se renderiza en TODAS las pantallas: si revienta, la app entera se apaga | Alto |
| `src/components/pedidos/PedidoPastelDetalleDialog.jsx` | Detalle del pedido; relee la fila fresca (arreglo de "la nota no se guarda") | Medio |
| `supabase/migrations/` | 0001→**0061** | **Máximo** |

## 8. Flujos críticos

**Cobro → corte.** Se cobra → `ventas` con `estado='pagada'` y `corte_caja_id` del corte abierto. El resumen del corte toma las ventas del corte (o, en tránsito, las pagadas tras la apertura y de la misma sucursal — **CANDADO 1**). Al cerrar: se **cuenta en el servidor** y se compara; si no cuadra o no se puede verificar, **no se cierra** (falla cerrada). Y la base rechaza un cierre en cero con ventas (trigger `0058`). **Límite conocido:** `0058` sólo mira el caso `total_general = 0`; un total **incompleto pero distinto de cero** (truncación parcial) pasa sin comprobación. Blindarlo es la Fase 2.3.

**Día operativo.** Empieza a la **medianoche de América/Mexico_City** (UTC-6 fijo). **CANDADO 2. No son las 06:00.**

**Abono a un pedido.** Crea `Abono` (sucursal del pedido) + una **venta paralela** `pagada` en el corte abierto de la sucursal de la terminal. `efectivo_esperado = total_efectivo + abonosEfectivo` — **hay doble conteo, y es un quirk de Base44 reproducido a propósito**: es CANDADO, no se "arregla".

**Entregar un pedido.** Exige `saldo_pendiente = 0`. La pantalla lo impide y, para el pastelero, el trigger también.

**Entrar como dueño.** PIN → `validarPin` (RPC `login_pos`, server-side) → `loginConPin` abre sesión global → `activarAdmin` → `sucursalEfectiva` pasa a `null` → vista general.

## 9. Decisiones tomadas

Registro completo en **`docs/DECISIONS.md`**. Las de esta etapa:

| Fecha | Decisión | Razón |
|---|---|---|
| 2026-08-01 | RLS: envolver los helpers en `(select ...)` en vez de reescribir policies | InitPlan: 1 evaluación por statement en vez de por fila. ~96 % menos scans, sin cambiar quién ve qué |
| 2026-08-01 | Rate limit **forward-only** (`0054` en vez de editar `0053`) | `0053` causaba bloqueo perpetuo; no se edita una migración ya aplicada |
| 2026-08-08 | Proteger el cierre en **tres capas** en vez de sólo arreglar la consulta | Las tablets tardan en recargar; la capa de base protege al bundle viejo. **Matiz 2026-08-09:** la capa de base sólo cubre `total = 0`, no la truncación parcial |
| ~~2026-08-08~~ | ~~**No** tocar los descuadres preexistentes (`CONF-A-C032`, `CONF-C-C002`)~~ **REVOCADA 2026-08-09 (D-23)** | La premisa era **falsa**: `CONF-A-C032` es el **mismo** bug de truncación, en forma parcial. Ver `docs/DECISIONS.md` D-23 y D-30 |
| 2026-08-09 | Usar el criterio **causal** (ventana de 1.000 **por sucursal**) para clasificar cortes, nunca el proxy "N más antiguas del corte" | El proxy coincide en `CONF-A-C032` por casualidad y da **falsos positivos** en cortes pequeños: barrer 111 cortes con él habría "reparado" cortes sanos, o sea metido dinero mal |
| 2026-08-09 | Adelantar `apk/capacitor` hasta producción (fast-forward) antes que repuntar `server.url` | Es la única de las dos que **no toca producción**, no exige keystore ni reinstalar tablets, y es reversible en un comando. Repuntar `server.url` queda para la Fase 7 |
| 2026-08-09 | Arreglar "la nota no se guarda" **en el diálogo**, no en los 3 call-sites | Un solo punto; la queryKey cuelga de `pedidos_pastel` y hereda las invalidaciones existentes |
| 2026-08-09 | Pastelero: permiso por **política + trigger de alcance**, no por columnas | RLS no distingue columnas y el POS usa un único rol de base (`authenticated`) |
| 2026-08-09 | `0061` cambia el rol de Abel a `dueño` en vez de reactivar `ADMIN_1234` | Es el usuario que el personal usa y cuyo PIN conocen |

## 10. Bugs pendientes

Lista viva y priorizada en **`docs/BUGS_PENDING.md`**; resumen ejecutivo en **`HANDOFF.md` §5**. Encabezan:

1. **APK apuntando a la rama equivocada** (impacto: Abel no recibe ninguna corrección; Xochimilco **no puede cerrar caja** desde el APK). **Urgente.**
2. **P0 DINERO — truncación PARCIAL**: no la detecta ni el frontend ni el trigger `0058`; `CONF-A-C032` con **$1,420 sin reflejar**, sin reparar. Y la suite lo excluye por nombre, así que da verde. **P0.**
3. **Sin ErrorBoundary** en el árbol de rutas (impacto: cualquier throw = app en blanco). **Alta.**
3. **Sesión colgada al recargar** la tablet tras usar dueño/pastelero. **Alta.**
4. **Comparaciones de rol sin normalizar la tilde** (dueño sin menú radial, sin borrar cortes, rol en blanco). **Media.**
5. `CorteAutoDownloader` empareja ventas sólo por ventana de tiempo. **Media.**

## 11. Riesgos

- **Es producción con dinero real y personal no técnico.** Un despliegue malo deja 3 sucursales sin cobrar.
- **Las tablets no se actualizan solas del todo:** hay service worker, pero la pantalla cargada sigue con el JS viejo. Ya provocó una recaída (`CONF-A-C042`).
- **El APK es un canal de despliegue paralelo** y hoy está desincronizado: es el riesgo activo más grande.
- **Deuda de calidad:** `lint` 39 errores y `typecheck` 1249 son **línea base histórica**, no cero. Un error nuevo se esconde con facilidad; por eso se comparan **contra la línea base**.
- **Dobles en las pruebas:** ya se colaron dos bugs graves porque los tests inyectaban dobles que no imitaban la restricción real.
- La api_key vieja de Base44 (`847df…`) **sigue viva** en la app de Abel. Rotarla es tarea de Miguel.

## 12. Próximos pasos

**Plan de reparación integral aprobado por Miguel el 2026-08-09** (fases 0→7, deteniéndose y reportando al final de cada una). Detalle en `HANDOFF.md` §10.

**Urgente**
1. **Fase 1 — Desbloquear el canal del APK**: fast-forward `migracion/supabase` → `apk/capacitor`. **No toca producción** (`apk/capacitor` no tiene commits propios). Reversible con `--force-with-lease` a `9b36aa5`.
2. **Fase 2 — P0 dinero, truncación PARCIAL**: barrido causal de los 111 cortes cerrados → reparación con respaldo → extender el trigger para rechazar también la truncación parcial → quitar la exclusión de la suite.
3. Confirmar con Abel que ya ve los cambios (**reiniciar la app**; si usa APK, hasta el punto 1 no verá nada).

**Importante**
3. Envolver el árbol de rutas en `ErrorBoundary` (ya existe el componente, nadie lo usa).
4. Arreglar la sesión colgada al recargar (`TerminalGate` / `ensureSession`).
5. Normalizar la tilde en los sitios que dejan al dueño sin funciones — **sin tocar `ModalPinAdmin`, que exige la tilde a propósito**.

**Después**
6. `CorteAutoDownloader`: filtrar por sucursal y corte.
7. Acotar los `filter()` sin límite del adaptador.
8. Bloques nunca abiertos: `USING true`, vistas `security_invoker`, Storage, cutover de Auth, borrar `poc-auth-magiclink`.

**Ideas futuras**
9. Realtime para el estado de caja (ya escrito y **desactivado**: la publicación `supabase_realtime` está vacía).
10. Enrolamiento de terminales por dispositivo.

## 13. Prompts útiles

En **`docs/PROMPTS.md`**. Incluye el **prompt de arranque para una sesión nueva** y el patrón de **verificación con transacción revertida**.

## 14. Cosas que NO se deben romper

- **CANDADO 1** — fallback venta↔corte en `Caja.jsx`. Bit a bit.
- **CANDADO 2** — día operativo = medianoche América/Mexico_City. **No 06:00.**
- **CANDADO 3** — `handleBuscarFolioWeb` filtra por la sucursal del terminal (ya corregido).
- **El doble conteo de `efectivo_esperado`** con abono en efectivo: es quirk de Base44 **reproducido a propósito**.
- **El PIN de 4 dígitos** y el flujo de acceso tal cual. Sin CAPTCHA, sin pasos nuevos.
- **`ModalPinAdmin` exige `'dueño'` CON TILDE.** No "normalices" el rol en la base.
- **`logo_ticket_url`** manda sobre `logo_url` en los tickets. Si se ve una foto rara, es un dato, no un bug de código.
- **El navegador queda byte-por-byte igual** en todo lo del APK: lo nativo va detrás de `Capacitor.isNativePlatform()`.
- **La matemática del dinero y el aislamiento RLS los firma Miguel.** Se entrega evidencia; no se autocertifican.

## 15. Última actualización

**2026-08-09 (Fase 0)** — corrección de la documentación que declaraba sano algo que no lo estaba. Se corrigió en
`HANDOFF.md`, este archivo, `CLAUDE.md`, `docs/{BUGS_PENDING,DATABASE,NEXT_STEPS,CHANGELOG,DECISIONS,ARCHITECTURE,
INCIDENTE_CIERRE_EN_CERO_2026-08-08}.md`:
`CONF-A-C032` es la **misma** truncación en forma **parcial** (no "otra causa") y sigue **sin reparar** ($1,420);
`0058` **sólo** cubre `total_general = 0`; la causa raíz es la ventana de 1.000 **acotada a la sucursal**, y el proxy
"N más antiguas del corte" **da falsos positivos**; `apk/capacitor` **no tiene commits propios** (la dirección que hay
que hacer no es la que prohíbe `CLAUDE.md`); son **20** commits de retraso; Abel **no** es un dueño global.
Sin cambios de código de aplicación. Regla nueva en `CLAUDE.md`: **exclusiones por nombre en tests**.

**Histórico — 2026-08-09** — commit `3a90e3c` en `migracion/supabase`.

Resumen: se cerró el P0 del **cierre de caja en cero** (3 capas + recálculo de 11 cortes), el bug de **la nota que no se guardaba**, el permiso del **pastelero** (`0060`), la restauración del **rol de dueño y el logo del ticket** (`0061`), y una **regresión propia** que dejaba la app **en blanco** al entrar como dueño (`Illegal invocation` en `cajaRefresco`). Se corrigieron además `Number(null) === 0` en las guardas anti-ceros, fugas entre sucursales en `useCajaAbierta`, la sesión no restaurada al salir de dueño/pastelero, el pedido fantasma en el diálogo y `COLS_CIERRE` sin `sucursal_id`.

Archivos tocados: `src/lib/{ventasCorte,cajaEstado,cajaRefresco,useCajaAbierta,useCorteAtrasado}.js`, `src/pages/{Caja,PedidosPastel}.jsx`, `src/components/common/Sidebar.jsx`, `src/components/pedidos/PedidoPastelDetalleDialog.jsx`, `src/api/entitiesAdapter.js`, `supabase/migrations/0050→0061`, `supabase/functions/transcribir-nota-voz/index.ts`, `scripts/*`, `docs/*`, `HANDOFF.md`.

# HANDOFF.md — Traspaso de sesión (POS Pastelería Confetti)

> **Léeme COMPLETO antes de tocar nada.** Este archivo existe para que otra sesión, otra cuenta u otra IA continúe exactamente desde donde se quedó la anterior, sin preguntarle contexto a Miguel.
>
> - **Última actualización:** 2026-08-09
> - **Escribió:** sesión de Claude Code en la nube (sin navegador con salida a internet)
> - **Commit desplegado a producción al cerrar:** `3a90e3c` en la rama `migracion/supabase`
> - **Estado del sistema:** **EN PRODUCCIÓN Y OPERANDO HOY.** 3 sucursales, tablets, personal no técnico. No es staging. Cada error se cobra en dinero real.

---

## 0. Lo primero que tienes que saber

1. Esto **no es un proyecto nuevo ni un staging**. Abel (el dueño de la pastelería) y su personal están vendiendo con esto **ahora mismo**. Un despliegue malo deja a tres sucursales sin cobrar.
2. La sesión anterior **arregló bugs graves de dinero** y, en el camino, **introdujo y luego arregló una regresión que dejaba la app en blanco**. Los detalles están abajo, sin adornos.
3. **Lo único importante que quedó pendiente y bloqueado es el APK.** Las tablets del POS usan un **APK Android**, y ese APK NO apunta a producción. Ver §4.
4. La sesión anterior **no podía usar un navegador con salida a internet**. Por eso Miguel abrió una sesión nueva. Si tú sí puedes navegar, léete §7: hay un truco montado que sí funcionó y te ahorra horas.

---

## 1. Reglas que NO puedes romper

Están completas en **`CLAUDE.md`** (raíz). Resumen de las que más duelen si se rompen:

- **Los 3 CANDADOS** (fallback venta↔corte, medianoche México, `handleBuscarFolioWeb`). No se "mejoran".
- **La matemática del dinero y el aislamiento RLS NO se autocertifican.** Se entrega evidencia; **los firma Miguel**.
- **No alteres datos reales para probar.** Usa transacciones revertidas (`DO $$ ... RAISE`), como en `scripts/pastelero_alcance_evidencia.sql`.
- **Rama de trabajo/producción: `migracion/supabase`.** No `main`. Vercel despliega producción desde esa rama.
- **El PIN sigue siendo de 4 dígitos.** No añadir pasos, pantallas, CAPTCHA ni re-logins: el personal es de edad y no técnico.
- **Proceso por fases:** al cerrar una, DETENERSE y reportar; esperar luz verde de Miguel.

---

## 2. Qué se hizo en la sesión anterior (2026-08-01 → 2026-08-09)

Orden cronológico. Todo está en `docs/CHANGELOG.md` con el detalle largo.

### 2.1 Endurecimiento y rendimiento (2026-08-01)
- **Edge Function `transcribir-nota-voz` v3**: se cerró un **SSRF** (antes hacía `fetch(audioUrl)` con la URL del cliente; ahora valida y **reconstruye** la URL), MIME y tamaño validados, timeouts reales, CORS con allowlist, sin filtrar el error de OpenAI. Contrato con el frontend intacto.
- **Migración `0051` (RLS InitPlan)**: las policies llamaban `pos_is_admin()` / `pos_sucursal()` "desnudos" y el ejecutor los evaluaba **por fila**. Envueltos en `(select ...)`. Medido en producción: **~20 → 0.58 scans/s (~96 % menos)**.
- **`0050`** índices de FKs. **`0052`** índice único parcial: **una sola caja abierta por sucursal, garantizado por la base**.
- **`0053` → `0054`** rate limit del PIN, persistente y forward-only. `0054` corrige dos fallos reales de `0053`: **bloqueo perpetuo** (incrementaba antes de validar) y **bucket manipulable por el cliente**.
- **`0055`** `pin_verificar` server-side.

### 2.2 P0 DINERO — el cierre de caja guardaba CEROS (2026-07-30 → 2026-08-08)
- **Síntoma:** se cobraba normal, pero al cerrar caja el corte guardaba `total_general = 0`. **11 cortes afectados.**
- **Causa raíz:** el resumen se calculaba con `Venta.filter({estado:'pagada'})` — **sin límite, sin ORDER BY y sin filtro por corte**. PostgREST corta en **1.000 filas** y, sin orden, devolvía **las 1.000 más antiguas**. Cuando Xochimilco superó las 1.000 ventas pagadas (**2026-07-30 01:08:55**, instante exacto verificado con `content-range: 0-999/1290`), las ventas del día dejaron de venir.
- **No lo causó la auditoría:** el primer corte roto es del 2026-07-30, **dos días antes** de la primera migración de la sesión.
- **Arreglo en TRES capas independientes:**
  1. `src/lib/ventasCorte.js` (nuevo): consulta acotada al corte **en PostgreSQL**, ordenada y **paginada** hasta agotar.
  2. `Caja.jsx`: antes de escribir, **cuenta las ventas en el servidor** y compara. **Falla CERRADA**.
  3. **`0058`**: trigger `BEFORE UPDATE` que **rechaza** cerrar un corte con total 0 teniendo ventas pagadas. Independiente del frontend — es lo único que protege a una tablet con bundle viejo.
- **Reparación de datos:** `0056` respaldo → `0057` (10 cortes) → `0059` (`CONF-A-C042`).
- **Descuadres PREEXISTENTES declarados y NO tocados** (otra causa, anteriores): `CONF-A-C032`, `CONF-C-C002`.

### 2.3 La nota de los pedidos "nunca se guardaba"
- **La escritura SIEMPRE llegó a la base.** Lo que fallaba era la pantalla: los **tres** sitios que abren `PedidoPastelDetalleDialog` le pasaban una **instantánea congelada** en su propio `useState`, así que tras guardar seguía mostrando la nota vieja y el botón no se apagaba.
- **Arreglo en un solo punto:** el diálogo relee la fila fresca (queryKey bajo `['pedidos_pastel']`, que heredan los `invalidateQueries` existentes) y el textarea se resincroniza al **cambiar de pedido**.
- **Verificado contra la base con las 7 identidades** que operan el POS (3 terminales de caja, 2 administradores, dueño, pastelero): **1 fila y releído OK en las 7**.

### 2.4 El pastelero no podía escribir (migración `0060`)
- `pos_scope_pedidos` exige `pos_is_admin() OR sucursal_id = pos_sucursal()`; el pastelero tiene `sucursal_id = NULL`, así que esa igualdad da **NULL, no TRUE**. Origen: `0037_rol_pastelero.sql` (**2026-06-30**, commit `17a3210`).
- **`0060`**: política `FOR UPDATE` sólo para el pastelero + trigger `trg_guard_pastelero_alcance` que acota **columnas y transiciones** (nota; `pendiente→confirmado`; `→entregado` sólo sin saldo). **NO-OP para el resto de roles.**
- Evidencia: `scripts/pastelero_alcance_evidencia.sql` **12/12** en transacciones revertidas; `scripts/pastelero_alcance_verify.mjs` **31/31**.

### 2.5 Se restauró el rol de dueño y el logo del ticket (`0061`)
- **Desaparecieron Configuración, el cambio de sucursal y el panel de dueño.** Causa: el `2026-08-08 16:04:50` ADMIN_1234 (rol `dueño`) inició sesión y **106 s después** se creó el usuario **"Abel" con rol `administrador`** y PIN 1234; ADMIN_1234 quedó `activo=false` y su PIN dejó de ser 1234. El menú usa `ver_configuracion: [ROLES.OWNER]`, así que con rol administrador esas secciones no salen.
- **No fue la auditoría**: la primera migración de ese día se aplicó a las 16:43, **37 min después**, y ninguna migración `0050–0061` escribe en `usuarios_pos`.
- **`0061`**: "Abel" vuelve a `rol = 'dueño'`; y `logo_ticket_url` vuelve al logo real (apuntaba a un **JPEG de 5712×4284 con EXIF de iPhone**, una foto de una gelatina del mostrador subida el 2026-07-13).

### 2.6 P0 — PANTALLA EN BLANCO del dueño (regresión introducida y arreglada aquí)
- **Fue culpa de la sesión anterior.** El refactor de polling de caja (`0c7ec71`) guardaba `clearInterval` como propiedad de un objeto y lo llamaba como método: `r.clearIntervalFn(r.timer)` → `this = r` → **`TypeError: Illegal invocation`** en Chrome (WebIDL exige que el receptor sea `window`).
- Ocurría en la **limpieza de un `useEffect`**, y una excepción ahí hace que **React desmonte la app entera** → `#root` vacío.
- **Sólo lo pisaban dueño y pastelero**, porque son los únicos cuya sucursal efectiva es `null`, y eso es lo que cambia la dependencia del efecto.
- Arreglo: envolver los nativos en flechas. Prueba nueva que **imita el binding de Chrome** y **falla con el código viejo**.
- **Verificado en un navegador real** (ver §7), no por lectura de código.

### 2.7 Otros arreglos de la revisión
- `Number(null)` es **0**, no `NaN`: las dos guardas anti-ceros que se habían escrito **no defendían nada**. Corregido comprobando el valor **crudo** (`typeof count === 'number'`).
- Fugas entre sucursales en `useCajaAbierta` (`placeholderData` y la memoria de sesión servían datos de la sucursal anterior). Corregido.
- `Sidebar`: `loginTerminal()` no lanza, devuelve `{ok:false}`, y se ignoraba → la tablet quedaba autenticada con la sesión global mientras la UI decía "Empleado". Corregido.
- `PedidoPastelDetalleDialog`: `pedidoFresco || pedidoProp` mostraba un pedido **fantasma** cuando la fila ya no existía. Corregido.
- `COLS_CIERRE` no pedía `sucursal_id`, así que la guarda anti-fuga del último cierre era siempre falsa. Corregido (`3a90e3c`).

---

## 3. Estado de producción al cerrar la sesión

| Cosa | Estado |
|---|---|
| Rama de producción | `migracion/supabase` @ **`3a90e3c`** |
| Vercel | `target: production`, READY, alias `pasteleria-confetti.vercel.app` |
| Cortes cerrados en cero con ventas reales | **0** |
| Ventas huérfanas | **0** |
| Trigger `trg_guard_cierre_en_cero` (0058) | activo |
| Política + trigger del pastelero (0060) | activos |
| Abel | `rol = dueño`, `activo = true`, PIN 1234 |
| Logo del ticket | el real (PNG 1254×1254) |
| Migraciones aplicadas | hasta **`0061`** |
| `vite build` | verde |
| lint | 39 errores = **línea base sin cambios** (no son nuevos) |
| typecheck | 1249 = **línea base** (el proyecto no compila TS limpio y nunca lo hizo) |
| Suites | `cierre_caja` 24/24 · `pedido_nota` 11/11 · `fase1_caja_estado` 12+181+11+5 · `fase1_caja_refresco` 19/19 · `pastelero_alcance` 31/31 |

---

## 4. 🚨 LO PRIMERO QUE TIENES QUE ATENDER: el APK

**Las tablets del POS usan un APK Android (Capacitor), no el navegador.**

El APK carga la web viva desde una URL fija que está **baked** en `capacitor.config.ts` de la rama `apk/capacitor`:

```
server.url = https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app
```

Eso es el **preview de la rama `apk/capacitor`**, y esa rama está **18 commits por detrás** de producción:

```
apk/capacitor      = 9b36aa5  "chore(apk): version 1.1.1"
preview del APK sirve  assets/index-DG-XAF7m.js
producción sirve       assets/index-DOafkEZU.js   (otro bundle, el bueno)
```

**Consecuencias reales:**
- Por el APK **no ha llegado NINGUNA corrección de frontend** de estos días: ni el arreglo del cierre en cero, ni el de la nota, ni el del dueño.
- **Quien opere desde el APK todavía tiene el bug del cierre en cero en el frontend.** Lo único que lo protege es el trigger `0058` de la base.
- Los cambios de **datos** (rol de dueño, logo del ticket) sí le llegan, porque viven en la base.

**Lo que hay que decidir con Miguel (NO lo hagas por tu cuenta, es un merge a producción):**
1. Poner `apk/capacitor` a la altura de `migracion/supabase`, o
2. Repuntar el `server.url` del APK a producción y regenerar el APK, o
3. Ambas.

`CLAUDE.md` dice explícitamente: **no fusionar `apk/capacitor` → `migracion/supabase` ni repuntar a producción sin OK explícito de Miguel.** Pregúntaselo antes.

**Además:** aunque se despliegue, **las tablets tienen que recargar** para tomar el bundle nuevo (hay un service worker PWA con `autoUpdate`, pero la pantalla ya cargada sigue con el JS viejo en memoria). Eso ya causó una recaída real: `CONF-A-C042` se rompió **un día después** del primer despliegue porque la tablet seguía con el bundle viejo.

---

## 5. Bugs confirmados que quedan abiertos

Detalle y prioridad en **`docs/BUGS_PENDING.md`**. Los que salieron de la auditoría de esta sesión y **sobrevivieron a la verificación adversarial**:

| # | Dónde | Qué pasa | Sev. |
|---|---|---|---|
| 1 | `src/App.jsx` | **El árbol de rutas NO está envuelto en ningún ErrorBoundary.** `ErrorBoundary.jsx` existe y **no lo importa nadie**. Cualquier throw en render deja TODA la app en blanco. Es el amplificador que convirtió el bug del dueño en un apagón total. | **Alta** |
| 2 | `MobileAdminRadialMenu.jsx:189` | El menú radial de tablet compara el rol **sin normalizar la tilde**: el dueño se queda sin él. | Media |
| 3 | `Registros.jsx:48` | `isAdmin` compara sólo contra `'administrador'`: **el dueño no puede eliminar cortes**. | Media |
| 4 | `Configuracion.jsx:470` | `ROLE_LABELS` no tiene la clave con tilde: el rol de Abel sale **en blanco** en Usuarios POS. | Baja |
| 5 | `LimpiarSeccionButton.jsx:40` | Mismo problema de tilde: botón oculto para el dueño. | Baja |
| 6 | `ReiniciarSistemaSection.jsx:31` | Vive en una ruta `soloDueno` pero exige rol `'administrador'` → **inalcanzable por diseño**. | Baja |
| 7 | `ModalPinAdmin.jsx:18` | ⚠️ **AVISO, no bug:** es el **único** punto que exige la tilde (`ROLES_ADMIN = ['dueño', ...]`). Si alguien "normaliza" el rol en la base a `dueno`, **el dueño se queda fuera del sistema**. | — |
| 8 | `Sidebar.jsx:292` | `SidebarContent` se declara **dentro** del componente: remonta todo el subárbol en cada render (y borra el PIN a medio teclear). | Media |
| 9 | `AccesoDuenoGate.jsx:46` | Pasa el objeto **con `_pin`** a `activarAdmin`: el PIN queda vivo en `TerminalContext.adminUser`. | Media |
| 10 | `TerminalGate.jsx:88` / `supabaseClient.js:84` | Tras recargar la tablet, la sesión Supabase puede seguir siendo la **global del dueño** mientras la UI dice "Modo empleado"; y `ensureSession()` puede degradar en silencio la sesión del dueño a la de una sola sucursal. | Alta |
| 11 | `CorteAutoDownloader.jsx` | El PDF empareja ventas **sólo por ventana de tiempo**, sin filtrar por sucursal ni `corte_caja_id`. | Media |
| 12 | `entitiesAdapter.js` | Quedan `filter()` sin límite (mismo patrón que truncó el corte). Hoy ninguno alimenta la matemática del dinero. | Media |

**Bloques de la auditoría original que nunca se abrieron:** políticas `USING true` (6), vistas con `security_invoker=false` (3), Storage/imágenes, cutover de Auth (gated en `MIGUEL_OK_AUTH_TABLETS`), renombrar la fachada Base44, borrar la función `poc-auth-magiclink`.

---

## 6. Lección aprendida (léela, te va a pasar)

**Dos bugs graves se escaparon por el mismo motivo: las pruebas probaban el arnés, no el código.**

1. El test de paginación abstraía el `count` del servidor en un **booleano** `countFiable`, así que nunca evaluó la expresión real y no vio que `Number(null) === 0`.
2. El test del temporizador **inyectaba** `setInterval`/`clearInterval` como funciones normales de JS, a las que el `this` les da igual, así que nunca tocó los nativos del navegador y no vio el `Illegal invocation`.

**Regla práctica:** si vas a inyectar un doble, el test tiene que ejercitar **también** el camino real, o el doble tiene que imitar la restricción real (por ejemplo, comprobar el receptor como hace Chrome). Los dos tests ya están corregidos así y **se comprobó que fallan contra el código viejo**.

---

## 7. Cómo verificar el POS en un navegador de verdad (esto sí funcionó)

La sesión anterior **no podía navegar a internet** desde Chromium. La solución que sí funcionó, y que te recomiendo reutilizar:

1. **Espeja el build de producción en local** (descarga `index.html` + los assets de `pasteleria-confetti.vercel.app`).
2. **Sírvelo en `127.0.0.1`** con un servidor estático mínimo y fallback SPA a `index.html`. Localhost está en `no_proxy`, así que el navegador sí lo alcanza.
3. **Puentea Supabase con `page.route()`**: intercepta `**://*.supabase.co/**` y reenvía con el `fetch` de Node (Node sí sale por el proxy del agente). Así el navegador habla con la base **real** sin salir a internet.
4. Siembra `localStorage.confetti_terminal` para simular una tablet configurada:
   ```js
   { sucursal_id: '057f9ba7-b340-4060-ace3-7f1646da36fa',
     sucursal_nombre: 'Xochimilco / Principal', folio_prefijo: 'A' }
   ```
5. Interactúa: botón "Modo administrador" → teclea el PIN → observa. Mide `document.getElementById('root').childElementCount`: **0 = pantalla en blanco**.

Con eso se localizó el crash **hasta la posición exacta del bundle minificado** (`index-CJXYsjlc.js:696:132011`) y se confirmó el arreglo.

**Si tú SÍ puedes navegar a internet**, todo esto es más fácil: ve directo a `https://pasteleria-confetti.vercel.app` y repite el flujo. Pero **no inicies sesión con el PIN real más de lo necesario** y **no toques dinero** (no abras/cierres caja, no cobres).

---

## 8. Accesos y datos que vas a necesitar

- **Supabase (MCP):** proyecto **`ivqcxdpqxwjxfohiswqb`**. Con `execute_sql` y `apply_migration`.
- **Vercel (MCP):** equipo `team_pSE0TmK8p4NCa4co6nf8XTGq`, proyecto `pasteleria-confetti`. La rama de producción es `migracion/supabase`.
- **GitHub:** `M1gu3hb/Pasteleria-Confetti`.
- **Sucursales:**
  - Xochimilco / Principal `057f9ba7-b340-4060-ace3-7f1646da36fa` (prefijo A)
  - Topilejo `161185fa-adda-42cd-9568-b1d66dad5737`
  - San Gregorio `07c59ab6-f5ef-4a3f-8d02-2d820f6ef1f8`
- **Usuarios POS** (`usuarios_pos`): Abel (`dueño`, PIN 1234), "Xochimilco sucursal" (`administrador`), Pastelero (`pastelero`), ADMIN_1234 (`dueño`, **desactivado**), 3 cuentas de terminal (`caja`, inactivas como usuario pero con cuenta auth).
- **Cuentas auth:** operadores `<usuarios_pos.id>@pos.confetti.local` con password `POS-<pin>`; terminales `terminal-<sucursal_id>@pos.confetti.local`.

⚠️ **No publiques ni escribas en el repo** la `service_role`, el `token_hash`, ni la api_key vieja de Base44 (`847df…`, que sigue viva en la app de Abel y **rotarla es tarea de Miguel**).

---

## 9. Cómo verificar sin romper nada

- **Contra la base:** transacciones **revertidas**. Patrón probado:
  ```sql
  do $$ declare r text := ''; begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"<auth_user_id>","role":"authenticated"}', true);
    -- ... update/insert de prueba, acumulando el resultado en r ...
    reset role;
    raise exception '%', r;   -- el RAISE aborta y REVIERTE todo
  end $$;
  ```
  Después **comprueba** que no quedó rastro (`select count(*) ... where <marca de prueba>`).
- **Suites** (todas sin credenciales, la parte de integración se omite sola):
  ```
  node scripts/cierre_caja_verify.mjs
  node scripts/pedido_nota_verify.mjs
  node scripts/fase1_caja_estado_verify.mjs
  node scripts/fase1_caja_refresco_verify.mjs
  node scripts/pastelero_alcance_verify.mjs
  node scripts/pastelero_alcance_evidencia.sql   # este es SQL: pégalo en Supabase
  ```
- **Antes de desplegar:** `npm run build` (debe salir 0), `npm run lint` (**39 = línea base**), `npm run typecheck` (**1249 = línea base**). Ojo: lint y typecheck **no están en cero** y nunca lo estuvieron; lo que importa es que **no suban**.
- **Después de desplegar:** confirma en Vercel que el deployment es `target: "production"` y **descarga el bundle servido** para comprobar que trae el cambio. Los hashes de los assets sirven para saber si producción ya sirve lo nuevo.

---

## 10. Próximo paso recomendado

**Resolver el APK** (§4), porque es lo que impide que Abel vea cualquier corrección. Pregúntale a Miguel cuál de las tres opciones quiere antes de tocar la rama `apk/capacitor`.

Después, por orden: el **ErrorBoundary** del árbol de rutas (§5 #1), la **sesión colgada al recargar** (§5 #10) y los **bugs de la tilde** que dejan al dueño sin funciones (§5 #2, #3).

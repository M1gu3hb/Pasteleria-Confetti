# HANDOFF.md — Traspaso de sesión (POS Pastelería Confetti)

> **Léeme COMPLETO antes de tocar nada.** Este archivo existe para que otra sesión, otra cuenta u otra IA continúe exactamente desde donde se quedó la anterior, sin preguntarle contexto a Miguel.
>
> - **Última actualización:** 2026-08-09 (Fase 0 — corrección de documentación)
> - **Escribió:** sesión de Claude Code local **con navegador**, revisando lo que dejó la sesión en la nube
> - **Commit desplegado a producción:** `04bd33c` en la rama `migracion/supabase` (+ este commit de docs)
> - **Estado del sistema:** **EN PRODUCCIÓN Y OPERANDO HOY.** 3 sucursales, tablets, personal no técnico. No es staging. Cada error se cobra en dinero real.
>
> ### ⚠️ Correcciones aplicadas el 2026-08-09 a lo que decía este mismo archivo
> La versión anterior de este HANDOFF, del `docs/CHANGELOG.md`, de `BUGS_PENDING.md`, de `DECISIONS.md` (D-23) y
> del comentario de la migración `0057` **declaraba sano algo que no lo estaba**. Corregido en §2.2, §3 y §4:
>
> 1. **`CONF-A-C032` NO es "un descuadre preexistente de otra causa".** Es **el mismo bug de truncación, en su
>    forma PARCIAL**, y **sigue sin reparar** ($1,420 no reflejados). Ver §2.2.
> 2. **El trigger `0058` sólo rechaza `total_general = 0`.** **No** detecta la truncación **parcial**. Se describía
>    como una red más ancha de lo que es.
> 3. **La causa raíz es la ventana de 1.000 filas ACOTADA A LA SUCURSAL**, no una ventana global. Importa: el
>    criterio equivocado "las N más antiguas del corte" es un proxy que produce **falsos positivos**, y barrer los
>    111 cortes con él habría "reparado" cortes sanos — es decir, habría metido dinero mal.
> 4. **`apk/capacitor` no tiene commits propios**: lo que hace falta es **producción → `apk/capacitor`**, que **no**
>    es la dirección que `CLAUDE.md` prohíbe. Ver §4.
> 5. Menores: **no se cita un número de commits de retraso** — la doc decía 18, eran 20, y al día siguiente eran 21;
>    lo estable es que `apk/capacitor` es **ancestro estricto**. Abel tiene `sucursal_id` = Xochimilco (**no** es un dueño
>    global); y **no se citan hashes de bundle** (el `index-DOafkEZU.js` que citaba este archivo **nunca** fue el de
>    `3a90e3c`: ese commit servía `index-B5y-Tcrd.js`). **Cita commits, no hashes de bundle.**

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
- **⚠️ PRECISIÓN DE LA CAUSA (corregida 2026-08-09): la ventana de 1.000 filas está ACOTADA A LA SUCURSAL**, porque la RLS (`pos_scope_ventas`) ya filtra por `sucursal_id` para una terminal. No es una ventana global sobre toda la tabla. Comprobado sobre `CONF-A-C032` con los tres modelos posibles:

  | modelo de ventana | ventas | suma |
  |---|---|---|
  | **GUARDADO** en `cortes_caja` | 23 | **$4,995.00** |
  | REAL (todas las del corte) | 31 | $6,415.00 |
  | **ventana acotada a la SUCURSAL (causal)** | **23** | **$4,995.00** ← reproduce exacto |
  | ventana GLOBAL (sin filtro de sucursal) | 0 | $0.00 ← no reproduce |
  | proxy "las N más antiguas del corte" | 23 | $4,995.00 ← coincide **aquí**, pero es un proxy |

  **Por qué importa:** el proxy coincide en este caso porque las ventas del corte son contiguas en el tiempo, pero **puede dar falsos positivos en cortes pequeños**. Cualquier barrido de reparación debe usar el criterio **causal** (ventana por sucursal). Barrer con el proxy habría "reparado" cortes sanos.
- **No lo causó la auditoría:** el primer corte roto es del 2026-07-30, **dos días antes** de la primera migración de la sesión.
- **Arreglo en TRES capas independientes:**
  1. `src/lib/ventasCorte.js` (nuevo): consulta acotada al corte **en PostgreSQL**, ordenada y **paginada** hasta agotar.
  2. `Caja.jsx`: antes de escribir, **cuenta las ventas en el servidor** y compara. **Falla CERRADA**.
  3. **`0058`**: trigger `BEFORE UPDATE` que **rechaza** cerrar un corte con total **exactamente 0** teniendo ventas pagadas. Independiente del frontend.
- **⚠️ ALCANCE REAL DE `0058` (corregido 2026-08-09): sólo cubre `total_general = 0`.** El código de `guard_cierre_en_cero()` hace `if coalesce(new.total_general,0) <> 0 then return new;` — es decir, **cualquier total distinto de cero pasa sin comprobar nada**. La **truncación PARCIAL** (el cliente trae menos ventas de las que hay) **no la detecta**. Describirlo como "la red que protege a una tablet con bundle viejo" es **falso para el caso parcial**. Ver el P0 abierto en `docs/BUGS_PENDING.md`.
- **Reparación de datos:** `0056` respaldo → `0057` (10 cortes) → `0059` (`CONF-A-C042`).
- **⚠️ CORREGIDO 2026-08-09 — `CONF-A-C032` NO es "de otra causa" y NO está reparado.** Es la **misma truncación, en forma parcial**: de sus 31 ventas, las 23 que caen dentro de la ventana de 1.000 de Xochimilco suman **exactamente $4,995.00** (= el `total_general` guardado) y su recuento es **exactamente 23** (= el `numero_ventas` guardado); las 8 que quedan fuera suman **exactamente $1,420.00** (= el descuadre). La coincidencia es exacta en las dos magnitudes a la vez: no es casualidad. **Dinero no reflejado: $1,420.00.** Pendiente de reparar (Fase 2).
- **`CONF-C-C002` (San Gregorio, 2026-07-06, $370 guardado vs $440 real, 2 vs 3 ventas): causa AÚN NO DEMOSTRADA.** La hipótesis es que **no** puede ser truncación, porque San Gregorio nunca ha superado las 1.000 ventas pagadas (hoy tiene 499). **Es una hipótesis, no un hecho**: hay que probarla en la Fase 2.1 antes de clasificarlo. No repetir el error de declararlo "de otra causa" sin evidencia.

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
| Rama de producción | `migracion/supabase` @ **`04bd33c`** (+ el commit de docs de la Fase 0) |
| Vercel | `target: production`, READY, alias `pasteleria-confetti.vercel.app` |
| Cortes cerrados **en cero** con ventas reales | **0** ✔ |
| Cortes con truncación **PARCIAL** sin reparar | **⚠️ al menos 1 — `CONF-A-C032`, $1,420 no reflejados.** Barrido completo de los 111 cortes: pendiente (Fase 2.1) |
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

Eso es el **preview de la rama `apk/capacitor`**, y esa rama es **ancestro estricto** de producción: se quedó en
`9b36aa5` (2026-07-13) y producción ha seguido avanzando.

```
apk/capacitor      = 9b36aa5   "chore(apk): version 1.1.1"   (2026-07-13)
migracion/supabase = va por delante; compruébalo, no lo cites de memoria:
  git rev-list --count origin/apk/capacitor..origin/migracion/supabase
```

> **No escribas el número de commits de retraso en la documentación.** Cambia con cada commit y envejece mal (llegó a
> decir 18 cuando eran 20, y 20 cuando eran 21). Lo que **sí** es estable y es lo que importa: **`apk/capacitor` es
> ancestro estricto de `migracion/supabase`** — sin commits propios — así que el fast-forward es limpio. Verifícalo
> con `git log origin/migracion/supabase..origin/apk/capacitor` (vacío = ancestro estricto).

> **No cites hashes de bundle en esta documentación.** La versión anterior de este archivo decía que producción
> servía `index-DOafkEZU.js`; se comprobó en vivo que `3a90e3c` servía `index-B5y-Tcrd.js`. Los hashes caducan y
> confunden. **Cita commits.**

**Consecuencias reales — verificadas en navegador el 2026-08-09, no deducidas:**
- Por el APK **no ha llegado NINGUNA corrección de frontend** de estos días: ni el arreglo del cierre en cero, ni el de la nota, ni el del dueño.
- **No es un riesgo latente: está fallando AHORA.** Cargando el canal del APK contra el corte real abierto de Xochimilco (`CONF-A-C044`), la pestaña **Resumen muestra `EFECTIVO $0.00` y `TICKETS 0`** cuando lo real son **17 ventas y $5,735**. La consulta que emite ese bundle es literalmente `ventas?select=*&estado=eq.pagada` — **sin orden, sin límite y sin filtro por corte**.
- **Consecuencia operativa: desde el APK, Xochimilco NO PUEDE CERRAR CAJA.** El resumen da 0 → el trigger `0058` rechaza el cierre → el cajero lee *"Actualiza la aplicación (cierra y vuelve a abrirla)"*, instrucción que **en el APK no puede funcionar**, porque el APK apunta a un preview congelado. Es un **bloqueo**, no una degradación.
- **Topilejo (587 ventas) y San Gregorio (499) siguen por debajo de 1.000**, así que desde el APK cierran bien **por ahora**. Se romperán solas al cruzar el umbral, sin que nadie toque nada.
- Los cambios de **datos** (rol de dueño, logo del ticket) sí le llegan, porque viven en la base.
- El APK **no tiene** la regresión de la pantalla en blanco: esa se introdujo en agosto (`0c7ec71`) y el bundle del APK es de julio. No le falta ese arreglo; nunca tuvo ese bug.

**⚠️ CORRECCIÓN IMPORTANTE (2026-08-09) sobre lo que `CLAUDE.md` prohíbe.**
`apk/capacitor` **no tiene ni un commit propio**: es **ancestro estricto** de `migracion/supabase`
(`git log origin/migracion/supabase..origin/apk/capacitor` → vacío). Y `capacitor.config.ts` ya existe también en
producción, idéntico. Por lo tanto:

- Lo que `CLAUDE.md` prohíbe es **`apk/capacitor` → `migracion/supabase`** (meter la rama del APK en producción).
- Lo que hace falta aquí es lo **contrario**: **`migracion/supabase` → `apk/capacitor`**, un **fast-forward puro** que
  **no toca producción ni un byte**. Es otra operación y otro riesgo. No las confundas.

### 🔒 REGLA PERMANENTE (no es una nota: es una regla)

**`apk/capacitor` se mantiene sincronizada con `migracion/supabase` mientras quede UNA sola tablet con un APK viejo.**

Los APKs **ya instalados** llevan `server.url` **baked en el binario**. El 2026-08-09 se abrieron como ZIP los **12
APKs** del repositorio y se leyó su `assets/capacitor.config.json`: **los 12**, desde el primero (2026-07-09, v1.0)
hasta el publicado (v1.1.1), apuntan al **alias de rama**. Ninguno a producción.

Por tanto, **repuntar `server.url` en la Fase 7 sólo arregla los APKs nuevos.** Toda tablet que conserve un APK viejo
seguirá cargando el alias de rama para siempre. Si se abandona `apk/capacitor`, esas tablets se vuelven a congelar —
exactamente el mecanismo que produjo el desastre del cierre en cero.

**Regla operativa: todo push a `migracion/supabase` va seguido de un fast-forward a `apk/capacitor`.**
Comprobación: `git log origin/apk/capacitor..origin/migracion/supabase` debe salir **vacío**.
Se puede dejar de sincronizar **sólo** cuando se verifique, tablet por tablet, que ninguna conserva un APK viejo.

**Opciones (la decisión sigue siendo de Miguel):**
1. **Fast-forward de `apk/capacitor` hasta producción.** El alias de rama de Vercel sigue siempre al último commit de
   la rama, así que el APK ya instalado empieza a cargar el bundle corregido **sin reinstalar, sin re-firmar y sin
   tocar las tablets por USB**. Reversible con `git push --force-with-lease origin 9b36aa5:apk/capacitor`.
2. **Repuntar `server.url` a producción y regenerar el APK.** Es la solución correcta a largo plazo (se acaba el canal
   preview alimentando tablets reales), pero exige el **keystore de Miguel**, republicar el instalador (cambia el
   SHA-256) y **reinstalar físicamente en las 3 tablets**. No arregla nada hoy.
3. **Ambas, en ese orden** (1 ahora, 2 en la próxima visita a sitio). **Es la elegida.**

**Además:** aunque se despliegue, **las tablets tienen que recargar** para tomar el bundle nuevo (hay un service worker PWA con `autoUpdate`, pero la pantalla ya cargada sigue con el JS viejo en memoria). Eso ya causó una recaída real: `CONF-A-C042` se rompió **un día después** del primer despliegue porque la tablet seguía con el bundle viejo.

---

## 4-bis. Circuito WEB pública → POS: AUDITADO Y SANO (2026-08-09)

Miguel tenía la duda —fundada— de que el circuito de pedidos de la web se hubiera roto con todo el movimiento de
estos días. **No está roto.** Auditado el 2026-08-09 por Miguel, con evidencia:

| Comprobación | Resultado |
|---|---|
| `pasteleria-confetti.com` | HTTP **200** |
| Backend del bundle de la web | **`ivqcxdpqxwjxfohiswqb`** — el mismo que el POS |
| Objetos que usa | `crear_pedido_web`, `catalogo_publico`, `config_publica`, bucket `web-uploads` |
| Alta de pedido **como rol `anon`**, en transacción **revertida** | Folio **`PP-A-0185`** asignado, fila creada, `estado='pendiente'`, `creado_por_nombre='Web Confetti'` |
| Residuo tras revertir | **0**. El contador de folios vuelve a **184** (usa `UPDATE … RETURNING`, no una secuencia, así que revierte limpio) |
| ¿Lo ve el POS? | **Sí**: la terminal de Xochimilco ve **11 pedidos web, 5 pendientes** |
| Imágenes de referencia | responden **200 `image/jpeg`** |

**Conclusión: el circuito web → POS funciona de punta a punta.** No requiere ninguna acción.
*Detalle importante para el futuro:* el contador de folios usa `UPDATE … RETURNING` en vez de una secuencia, lo que
lo hace **revertible** — por eso se puede probar el alta de un pedido sin dejar rastro. Con una secuencia no sería así.

---

## 5. Bugs confirmados que quedan abiertos

Detalle y prioridad en **`docs/BUGS_PENDING.md`**. Los que salieron de la auditoría de esta sesión y **sobrevivieron a la verificación adversarial**:

**P0 añadidos el 2026-08-09** (no estaban en la lista porque la documentación los daba por cerrados):

| # | Dónde | Qué pasa | Sev. |
|---|---|---|---|
| **P0-A** | `guard_cierre_en_cero()` (0058) + `Caja.jsx` | **La truncación PARCIAL no la detecta nadie.** `0058` sólo rechaza `total_general = 0`; un total “creíble pero incompleto” se guarda sin comprobar. Caso probado: `CONF-A-C032`, **$1,420 sin reflejar**, aún sin reparar. | **P0** |
| **P0-B** | `scripts/cierre_caja_verify.mjs:124` | **La suite oculta el agujero.** `const CONOCIDOS = new Set(['CONF-A-C032','CONF-C-C002'])` cuenta esos folios como “cuadran”, así que la comprobación de integración **da verde encima de dinero no reflejado**. La justificación (“de otra causa”) nunca se verificó y era falsa. | **P0** |

Resto de hallazgos abiertos:

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
- **Usuarios POS** (`usuarios_pos`): Abel (`dueño`, PIN 1234, **`sucursal_id` = Xochimilco — NO es un dueño global**), "Xochimilco sucursal" (`administrador`), Pastelero (`pastelero`, `sucursal_id = NULL`), ADMIN_1234 (`dueño`, **desactivado**, `sucursal_id = NULL`), 3 cuentas de terminal (`caja`, inactivas como usuario pero con cuenta auth).
  - **Ojo:** que Abel tenga sucursal **no** le quita alcance global de RLS — `pos_is_admin()` devuelve `true` para `dueño` y esa rama de la política ya no mira `sucursal_id`. Lo que sí cambia es la **sucursal efectiva de la UI**. La versión anterior de este archivo lo describía como dueño global; no lo es en la tabla.
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
- **Después de desplegar:** confirma en Vercel que el deployment es `target: "production"`, que su `githubCommitSha` es **el commit que acabas de subir**, y **descarga el bundle servido** para comprobar que trae el cambio (busca dentro un marcador del código nuevo, p. ej. `[ventas_corte]`). **En la documentación cita el commit, no el hash del bundle**: el hash caduca al siguiente build y ya provocó una afirmación falsa en este archivo.
  - Dato útil comprobado el 2026-08-09: **un commit de sólo documentación produce un `dist` byte-idéntico** — `3a90e3c` y `04bd33c` sirven el mismo `index-B5y-Tcrd.js` y un `sw.js` idéntico. Publicar documentación **no** dispara actualización en las tablets.

---

## 10. Próximo paso recomendado

**Plan de reparación integral aprobado por Miguel el 2026-08-09.** Fases, en este orden, deteniéndose y reportando
al final de cada una:

| Fase | Qué | Estado |
|---|---|---|
| **0** | Documentación veraz (este commit) | ✅ hecha |
| **1** | **Desbloquear el canal del APK** — fast-forward `migracion/supabase` → `apk/capacitor` (§4, opción 1) | ⏳ siguiente |
| **2** | **P0 dinero — truncación PARCIAL**: barrido causal de los 111 cortes → reparación → blindaje del trigger → pruebas | pendiente |
| **3** | **SEG-2** — `pin_hash` legible por cualquier terminal | pendiente (**lo firma Miguel**) |
| **4** | **Bug #10** — sesión de dueño viva bajo la UI de "Modo empleado" | pendiente |
| **5** | ErrorBoundary + funciones perdidas del dueño (tildes, Sidebar, `_pin`) | pendiente |
| **6** | Reauditoría integral y paso a producción | pendiente |
| **7** | **APK definitivo** — repuntar `server.url` a producción, compilar sin firmar, **firma Miguel**, publicar | pendiente |

**Rama de trabajo:** `fix/reparacion-integral`, en el worktree `C:/Pasteleria Confetti/pos-fix`.
**No tocar** `fix/auditoria-codex` (blindaje diferido, con cambios sin commitear) ni el worktree `pos-apk`.

**Fuera de este plan** (no abrir sin pedirlo): cutover de Auth, enrolamiento de terminales, las 6 políticas
`USING true` restantes y las 3 vistas `security_invoker=false` (SEG-2 sí entra, en Fase 3), Storage/imágenes,
renombrar la fachada Base44, borrar `poc-auth-magiclink`, `CorteAutoDownloader` y los `filter()` sin límite del
adaptador.

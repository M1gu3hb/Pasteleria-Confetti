# BUGS_PENDING / riesgos conocidos

---

# 🔴 ABIERTOS AL 2026-08-09 (auditoría multiagente con verificación adversarial)

> Todos los de abajo **sobrevivieron** a un pase de refutación: un agente independiente intentó demostrar que eran falsos y no pudo. Los que sí se refutaron están al final, para que nadie los persiga otra vez.
> Contexto completo en `HANDOFF.md`.

## 🚨 P0 — Truncación PARCIAL del resumen del corte: nadie la detecta, y hay dinero sin reflejar
> **Abierto el 2026-08-09.** Estaba **cerrado por error** en la documentación: `CONF-A-C032` figuraba como
> "descuadre preexistente de otra causa" en `HANDOFF.md`, `PROJECT_CONTEXT.md`, `docs/CHANGELOG.md`,
> `docs/DECISIONS.md` (D-23), `docs/INCIDENTE_CIERRE_EN_CERO_2026-08-08.md` y el comentario de la migración `0057`.
> **Era falso.**

- **Impacto (dinero real):** un corte puede cerrarse con un total **creíble pero incompleto** y nadie lo impide.
  Caso confirmado: **`CONF-A-C032` (Xochimilco, cerrado 2026-07-30) — $1,420.00 sin reflejar. NO reparado.**
- **Causa:** la misma de siempre — `Venta.filter({estado:'pagada'})` sin orden, sin límite y sin filtro por corte, con
  PostgREST cortando en 1.000 filas — pero en su forma **parcial**: cuando **una parte** de las ventas del corte cae
  dentro de la ventana y otra fuera. Ocurre justo **el día en que la sucursal cruza las 1.000 ventas pagadas**.
- **Evidencia (SQL de solo lectura, reproducible):** de las 31 ventas de `CONF-A-C032`, las **23** que caen dentro de la
  ventana de 1.000 **de Xochimilco** suman **exactamente $4,995.00** — que es **el `total_general` guardado** — y su
  recuento es **exactamente 23**, que es **el `numero_ventas` guardado**. Las 8 restantes suman **exactamente
  $1,420.00**, que es el descuadre. Las dos magnitudes coinciden a la vez: no es casualidad.

  | modelo de ventana | ventas | suma | ¿reproduce? |
  |---|---|---|---|
  | **GUARDADO** en `cortes_caja` | 23 | $4,995.00 | — |
  | REAL (todas las del corte) | 31 | $6,415.00 | — |
  | **acotada a la SUCURSAL (causal)** | 23 | $4,995.00 | **sí, exacto** |
  | GLOBAL (sin filtro de sucursal) | 0 | $0.00 | no |
  | proxy "N más antiguas del corte" | 23 | $4,995.00 | coincide **aquí**, pero es proxy |

- **⚠️ Por qué el trigger `0058` NO lo protege:** `guard_cierre_en_cero()` hace
  `if coalesce(new.total_general,0) <> 0 then return new;` — **cualquier total distinto de cero pasa sin comprobar
  nada**. `0058` sólo cubre el caso `total = 0`. La documentación lo describía como una red más ancha de lo que es.
- **⚠️ Por qué el frontend arreglado tampoco basta para los cortes ya cerrados:** `ventasCorte.js` impide que vuelva a
  ocurrir en cortes nuevos, pero **no repara** los ya guardados.
- **Archivos/objetos:** `supabase/migrations/0058_guard_cierre_en_cero.sql` (función `guard_cierre_en_cero`),
  `src/pages/Caja.jsx` (guarda del cierre), `src/lib/ventasCorte.js`.
- **⚠️ Criterio obligatorio para cualquier barrido de reparación:** usar el criterio **causal** (ventana de 1.000
  **por sucursal**), **nunca** el proxy "las N más antiguas del corte". El proxy coincide en este caso por casualidad —
  las ventas del corte son contiguas en el tiempo — y **da falsos positivos en cortes pequeños**. Barrer los 111
  cortes con el proxy habría "reparado" cortes sanos, es decir, **metido dinero mal**.
- **Prioridad:** **P0**. **Estado:** abierto. Barrido completo de los 111 cortes cerrados: **pendiente (Fase 2.1)**.
  Reparación y blindaje: Fases 2.2 y 2.3. **La reparación de dinero la firma Miguel.**

## 🚨 P0 — La suite de verificación oculta el agujero (da verde sobre dinero no reflejado)
- **Impacto:** `scripts/cierre_caja_verify.mjs` **cuenta como "cuadran"** los folios que excluye, así que la
  comprobación de integración **pasa en verde encima de $1,420 no reflejados**. Es peor que no tener test: da una
  garantía que no existe.
- **Causa:** `scripts/cierre_caja_verify.mjs:124`
  ```js
  // Descuadres PREEXISTENTES, anteriores a este incidente y de otra causa.
  const CONOCIDOS = new Set(['CONF-A-C032', 'CONF-C-C002']);
  ...
  else if (CONOCIDOS.has(c.folio)) { cuadran++; preexistentes.push(c.folio); }
  ```
  El test **sí imprimía** la exclusión, pero la justificación (*"de otra causa"*) **nunca se verificó** y era falsa.
- **Archivos:** `scripts/cierre_caja_verify.mjs`.
- **Arreglo:** quitar la exclusión y **dejar que el test FALLE** hasta que el corte esté reparado (Fase 2.4).
- **Regla derivada, ya en `CLAUDE.md`:** ninguna prueba puede excluir un caso por nombre sin justificación
  **verificada y fechada**; y una exclusión sin evidencia verificada **se trata como fallo**.
- **Prioridad:** **P0**. **Estado:** abierto (Fase 2.4).

## 🚨 P0 — El APK de las tablets apunta a la rama equivocada
- **Impacto:** las tablets **no reciben ninguna corrección de frontend**. **No es un riesgo latente: está fallando
  ahora.** Verificado en navegador el 2026-08-09 contra el corte real abierto `CONF-A-C044`: por el canal del APK la
  pestaña Resumen muestra **`EFECTIVO $0.00` y `TICKETS 0`** cuando lo real son **17 ventas y $5,735**.
  - **Consecuencia operativa: desde el APK, Xochimilco NO PUEDE CERRAR CAJA.** El resumen da 0 → el trigger `0058`
    rechaza el cierre → el cajero lee *"Actualiza la aplicación (cierra y vuelve a abrirla)"*, que **en el APK no
    puede funcionar** porque apunta a un preview congelado.
  - **Topilejo (587) y San Gregorio (499)** siguen por debajo de 1.000 ventas pagadas: desde el APK cierran bien
    **por ahora**, y se romperán solas al cruzar el umbral.
- **Causa:** `capacitor.config.ts` (presente en **ambas** ramas, idéntico) tiene `server.url` = preview de la rama
  `apk/capacitor`, y esa rama se quedó en `9b36aa5` (2026-07-13) mientras producción siguió avanzando.
  *No se citan ni hashes de bundle ni número de commits de retraso: ambos caducan y ambos ya provocaron
  afirmaciones falsas en esta documentación. Lo estable es que `apk/capacitor` es **ancestro estricto**.*
- **Dato que cambia el riesgo:** `apk/capacitor` **no tiene ni un commit propio** — es **ancestro estricto** de
  producción (`git log origin/migracion/supabase..origin/apk/capacitor` → vacío). Por tanto **`migracion/supabase` →
  `apk/capacitor` es un fast-forward puro que NO toca producción**. Lo que `CLAUDE.md` prohíbe es la dirección
  contraria. No confundirlas.
- **Archivos:** `capacitor.config.ts`.
- **Prioridad:** máxima. **Estado:** abierto, **requiere OK de Miguel**. Fase 1 = fast-forward; Fase 7 = repuntar
  `server.url` a producción (necesita keystore de Miguel y visita a sitio).

## 🟠 POR CLASIFICAR — `CONF-C-C002`: descuadre real, causa AÚN NO DEMOSTRADA
- **Hecho comprobado:** San Gregorio, cerrado 2026-07-06. `total_general` guardado **$370** con **2** ventas; lo real
  son **3** ventas por **$440**. Descuadre: **$70**.
- **Hipótesis (NO probada):** no puede ser truncación, porque San Gregorio nunca ha superado las 1.000 ventas pagadas
  (hoy tiene **499**). El segundo camino conocido al mismo síntoma es
  `Array.isArray(ventasHoy) ? ventasHoy : []`, que trata igual "no hay ventas" y "no cargó".
- **⚠️ Por qué está aquí y no clasificado:** la documentación anterior lo declaró "de otra causa" **sin demostrarlo**,
  igual que a `CONF-A-C032` — y en ese caso la afirmación era falsa. **No repetir el error.** Se clasifica en la
  Fase 2.1, con evidencia, o no se clasifica.
- **Prioridad:** media (importe pequeño), pero **bloquea** poder afirmar que el barrido está completo.
- **Estado:** abierto, pendiente de demostración.

## 🟠 ALTA — El árbol de rutas no está envuelto en ErrorBoundary
- **Impacto:** cualquier excepción durante el render deja **toda la app en blanco**, sin mensaje. Es el amplificador que convirtió el `Illegal invocation` en un apagón total en las 3 sucursales.
- **Causa:** `src/components/common/ErrorBoundary.jsx` existe y **no lo importa nadie**. `App.jsx` monta las rutas sin protección.
- **Archivos:** `src/App.jsx`, `src/components/common/ErrorBoundary.jsx` (y `SafeBoundary.jsx`).
- **Arreglo propuesto:** envolver el `AppLayout`/árbol de rutas con `ErrorBoundary` y una pantalla de fallo con botón de recarga. **Aditivo, sin tocar lógica.**
- **Prioridad:** alta. **Estado:** abierto.

## 🟠 ALTA — Sesión colgada al recargar tras usar dueño/pastelero
- **Impacto:** tras recargar la tablet, la sesión Supabase puede seguir siendo la **global** (dueño/pastelero) mientras la interfaz dice "Modo empleado". La sucursal para RLS no es la que la pantalla muestra. Y desde `0060` esa sesión colgada **puede escribir** en pedidos.
- **Causa:** `TerminalGate` sólo hace auto-login de la terminal **si no hay `posUser`**; y `ensureSession()` puede degradar en silencio la sesión del dueño a la de una terminal.
- **Archivos:** `src/components/common/TerminalGate.jsx:88`, `src/api/supabaseClient.js:84`.
- **Prioridad:** alta. **Estado:** abierto. (En la misma familia se arregló ya `Sidebar.handleSalirAdmin`, que no restauraba la sesión al salir del pastelero.)

## 🟡 MEDIA — Comparaciones de rol sin normalizar la tilde
En la base el rol es **`dueño` CON TILDE**; el código compara contra `dueno`. Casi todo normaliza, pero estos no:

| Archivo | Consecuencia |
|---|---|
| `src/components/common/MobileAdminRadialMenu.jsx:189` | El **menú radial de tablet no le sale al dueño** |
| `src/pages/Registros.jsx:48` | El **dueño no puede eliminar cortes** (`isAdmin` compara sólo contra `'administrador'`) |
| `src/components/registros/LimpiarSeccionButton.jsx:40` | Botón "Limpiar sección" oculto para el dueño |
| `src/pages/Configuracion.jsx:470` | `ROLE_LABELS` sin la clave con tilde → el rol de Abel sale **en blanco** en Usuarios POS |
| `src/components/configuracion/ReiniciarSistemaSection.jsx:31` | Vive en ruta `soloDueno` pero exige rol `'administrador'` → **inalcanzable por diseño** |

> ⚠️ **AVISO CRÍTICO, no lo toques a lo bruto:** `src/components/common/ModalPinAdmin.jsx:18` (`ROLES_ADMIN = ['dueño', ...]`) es el **ÚNICO** punto que **exige la tilde**. Si alguien "normaliza" el rol en la base a `dueno`, **el dueño se queda fuera del sistema**. Normaliza en el código, **nunca en el dato**.

**Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — `SidebarContent` se declara dentro de `Sidebar`
- **Impacto:** React lo trata como un componente nuevo en cada render y **remonta todo el subárbol**, incluido el modal del PIN: puede **borrar el PIN a medio teclear**.
- **Archivos:** `src/components/common/Sidebar.jsx:292`.
- **Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — El PIN del dueño queda vivo en memoria
- **Impacto:** `AccesoDuenoGate` pasa a `activarAdmin` el objeto **con `_pin`**, así que el PIN en claro queda dentro de `TerminalContext.adminUser`. (`handleAdminSuccess` del Sidebar sí lo limpia; este camino no.)
- **Archivos:** `src/components/common/AccesoDuenoGate.jsx:46`.
- **Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — `CorteAutoDownloader` empareja ventas sólo por ventana de tiempo
- **Impacto:** el PDF del corte no filtra por sucursal ni por `corte_caja_id`. Con una sola sucursal es correcto; con varias abiertas a la vez puede mezclar. Es la misma familia del incidente de los ceros.
- **Archivos:** `src/components/caja/CorteAutoDownloader.jsx`.
- **Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — `filter()` sin límite en el adaptador
- **Impacto:** mismo patrón que truncó el corte (PostgREST corta en 1.000 filas). Hoy **ninguno alimenta la matemática del dinero**, pero conviene acotarlos antes de que un histórico crezca.
- **Archivos:** `src/api/entitiesAdapter.js` y sus call-sites.
- **Prioridad:** media. **Estado:** abierto.

## 🟢 BAJA — `CambiarSucursalDialog` marca dos opciones activas
- En "Vista general" el diálogo marca **dos** opciones como activas a la vez y miente sobre lo que el dueño está viendo.
- **Archivos:** `src/components/common/CambiarSucursalDialog.jsx:55`. **Estado:** abierto.

## 🟢 BAJA — CORS del Edge Function
- `ORIGEN_PREVIEW` es una regex más permisiva de lo necesario en `supabase/functions/transcribir-nota-voz/index.ts`. **Estado:** abierto.

---

## ✅ REFUTADOS en la verificación adversarial — NO los persigas

- **`AppLayout.jsx:29` `if (!posUser) return null`** — el código existe, pero la línea es **inalcanzable** como estado observable: `TerminalGate` ya muestra su propio spinner antes.
- **`COLS_CIERRE` sin `sucursal_id` "hace que `fondoEsperado` caiga a 0"** — la observación era cierta (la guarda era siempre falsa) pero **la consecuencia de dinero no se sostiene**. Se arregló igual (commit `3a90e3c`) porque la guarda debe hacer lo que dice.
- **`Dashboard.jsx` desreferencia nula con `sucursalEfectiva=null`** — verificado limpio, no ocurre.
- **`useCajaAbierta` "borra la memoria de sesión en cada render" con `sucId` null** — los hechos son ciertos, la atribución causal no.
- **"Algún sitio lee el rol de la metadata del JWT"** — descartado: nadie lo hace.

---

## 📌 Bloques de la auditoría 2026-08-01 que NUNCA se abrieron

- 6 políticas con `USING true` y 3 vistas con `security_invoker=false`, grants y endurecimiento de RPCs.
- Storage / imágenes / caché.
- Endurecimiento adicional del Edge Function de audio (`getUser` + rate limit).
- Renombrar la fachada Base44.
- **Borrar la Edge Function `poc-auth-magiclink`** (el MCP no tiene herramienta de borrado; hay que hacerlo por dashboard o CLI).
- Cutover de Auth a `generateLink`+`verifyOtp` (gated en `MIGUEL_OK_AUTH_TABLETS`) y enrolamiento de terminales.

---

## RESUELTO (2026-08-09) — el rol `pastelero` NO podía ESCRIBIR en pedidos
Verificado en vivo: con la sesión del pastelero se **leían** 229 pedidos, pero cualquier `UPDATE`
afectaba **0 filas**.
- **Origen:** `0037_rol_pastelero.sql` (**2026-06-30**, commit `17a3210`). Su propio comentario decía
  *"Solo lectura: no toca INSERT/UPDATE/DELETE (esos siguen bajo `pos_scope_pedidos`)"* — la
  suposición falla porque el pastelero tiene `sucursal_id = NULL`, así que `sucursal_id = pos_sucursal()`
  evalúa a NULL (no a true) y la política de escritura nunca lo dejaba pasar.
- **Resuelto** por la migración `0060` (política `FOR UPDATE` + trigger de alcance: nota y avance de
  estado; nada de dinero). Aplicada en Supabase; **el frontend sigue en la rama de trabajo**, así que
  en producción todavía no cambia nada visible. Evidencia: `scripts/pastelero_alcance_evidencia.sql`
  (12/12, transacciones revertidas) y `scripts/pastelero_alcance_verify.mjs` (31/31).
- **Falta:** que Miguel firme el cambio de RLS y dé luz verde al despliegue del frontend.

## ABIERTO (2026-08-09) — hallazgos de revisión aún sin cerrar
- `CorteAutoDownloader.jsx` empareja las ventas del PDF **sólo por ventana de tiempo**, sin filtrar por
  sucursal ni por `corte_caja_id`. En una sucursal es correcto; con varias abiertas a la vez puede
  mezclar. No causó el incidente de los ceros, pero es la misma familia de fallo.
- Llamadas `filter()` sin límite en `entitiesAdapter.js` (mismo patrón que truncó el corte). Ninguna
  alimenta hoy la matemática del dinero, pero conviene acotarlas antes de que un histórico crezca.
- CORS del Edge Function: `ORIGEN_PREVIEW` es una regex más permisiva de lo necesario.

> **Actualización de auditoría independiente (2026-07-10):** la afirmación histórica siguiente de “SIN bugs de código” queda **superada**. `CAMBIOS_V2/REPORTES/AUDITORIA_INDEPENDIENTE_POS_APK_2026-07-10.md` documenta, sin modificar código ni datos reales, hallazgos críticos de RLS/folios, hallazgos altos de concurrencia de dinero, soporte incompleto 58/80 mm y APK release sin firma. Pendiente de revisión y firma de Miguel; la auditoría no propuso ni aplicó correcciones.
>
> **Corrección por fases (2026-07-10):**
> - **FASE A — 58/80 mm en venta y pastel: RESUELTA en código** (rama `apk/capacitor`, no toca dinero/RLS). Antes, `imprimirTicketNativo` rasterizaba SIEMPRE a 576 px (80 mm) ignorando `config.ancho_impresora`; el corte térmico sí honraba 58/80. Ahora `print.js` pasa `getPaperWidth()` al dispatcher y `printTicket.js` usa un helper único `anchoRaster` (58→384 px, 80→576 px) compartido por venta/pastel y corte. Evidencia: `release/muestras/{venta,pastel}_{58,80}.png` (58 = 384 px exactos, contenido completo sin recorte). Builds verdes (vite + gradlew `assembleRelease`). Navegador byte-por-byte igual. Llega al dispositivo con el deploy de Vercel de la preview (server.url), no requiere APK nuevo.
> - Fases B (folios atómicos) / C, F, G (concurrencia de dinero) / D (RLS 0042): PREPARAR con evidencia + **firma de Miguel**; una a la vez.

## APK Android (2026-07-09) — SIN bugs de código; pendientes = pruebas físicas EN SITIO
El proyecto APK (rama `apk/capacitor`) compila verde (vite + gradlew assembleRelease), APK firmado, navegador intacto, dinero/RLS sin tocar. **No hay bugs de código abiertos.** Lo que falta se valida CON el hardware en la visita (Camino A):
- **Impresora Easytime 80mm:** confirmar conexión (probar USB; si no, Ethernet + IP). Ajuste posible en sitio: el `class="7"` de `res/xml/device_filter.xml` si la impresora enumera con otra clase/VID-PID.
- **WebView de la Higole (Android 12):** riesgo de System WebView viejo → layout roto. Fix: actualizar "Android System WebView" + Chrome (ver `LEEME_instalacion.txt`).
- **Cajón:** no se sabe si el de Abel es electrónico. Probar `usb_trigger` (VID/PID del disparador USB-serial se lee en sitio) → `kick_impresora` → `ninguno` (manual).
- **Emoji 🚚** del bloque de entrega: se dibujó en Chrome de escritorio (muestra), pero el WebView de la tablet PODRÍA no dibujarlo con html2canvas. Decisión de Miguel: se queda; si en sitio se pierde, cambiar por texto "ENTREGA A DOMICILIO".

## FLAGS del run nocturno 2026-06-28 (para revisión de Miguel)
- **(voz) Verificación manual del micrófono — FASE 4.** La grabación (`getUserMedia`/
  `MediaRecorder`) y la transcripción en vivo (`SpeechRecognition` es-MX) NO se pudieron
  ejercitar headless. Probar manualmente: grabar hablando en el form de pastel, confirmar
  transcripción + subida + reproducción en la card. (La subida a Storage YA está probada:
  blob 200 + lectura pública 200.) Solo en navegadores Chromium/Edge hay transcripción.
- **(devolución) `efectivo_esperado` puede quedar NEGATIVO — FASE 3 #4.** Un corte cuya
  única actividad es una devolución de anticipo en efectivo cierra con `efectivo_esperado`
  negativo (p. ej. −$100). Es matemáticamente correcto (la fórmula no incluye el fondo de
  apertura), pero si Miguel prefiere ver `fondo − devuelto`, es otra decisión (no se tocó
  la fórmula del candado). Ver REPORTES/02.
- **(mesas) ✅ RESUELTO (cierre de cabos, REPORTES/07).** Diagnóstico: el color-sync de
  `saveUser` era mesero-only (`if (esMesero && …)`) y Confetti no tiene meseros → nunca
  corría. Se eliminó el color-sync + la query `mesas` + todos los handlers/estado muertos
  + imports muertos. `saveUser` (crear/editar usuario) verificado EN VIVO. 0 referencias
  residuales. (Los switches de config `usa_mesas`/asignación se conservaron: no son el
  mapa muerto.)
- **(estaciones) ✅ RESUELTO (cierre de cabos).** `EstacionesAyuda.jsx` borrado (Miguel
  autorizó; 0 referencias).
- **(notas-voz blob) ✅ RESUELTO (cierre de cabos).** Migración **0028** añadió la policy
  DELETE faltante en `notas-voz`; el objeto de prueba de 9 bytes se borró. Bucket vacío.
- **(web) WF1/WI2/I5 no tocados.** El run fue del repo POS; la limpieza menor de la web e
  I5 (URL Base44 en "Ver web pública", espera dominio) siguen pendientes (post-cutover).

## (l) ✅ RESUELTO (FASE 3 A-FIX) — `pago` con rezago (useEffect) → desglose por método viejo al confirmar rápido
- **Qué fue:** `MetodoPagoSelector` emitía el `pago` (metodo + montos por método) al padre vía `useEffect → onChange` (asíncrono). Si se cambiaba el monto/total y se confirmaba ANTES de que el efecto propagara, el padre usaba un `pago` VIEJO → la venta/abono quedaban con `monto_efectivo/tarjeta/transferencia` del total anterior. **Reproducido:** un abono de $50 con dialog pre-llenado a saldo $370 → `monto_efectivo=370` (en vez de 50). Money-crítico (desglose por método mal → corte mal).
- **Resolución:** `MetodoPagoSelector` pasó a **CONTROLADO** (el padre es dueño de `metodo` y `montos`; computa `construirPago` SÍNCRONO cada render; sin useEffect/onChange de pago). `PaymentModal` y `RegistrarPagoDialog` adaptados. Verificado: confirm inmediato tras cambiar el monto → desglose correcto (abono $50 → monto_efectivo=50).

## (k) ✅ RESUELTO (FASE 3 A-FIX, Opción A de Miguel) — Abono MIXTO no entraba a los buckets de método
- **Qué:** el `Abono` guarda `metodo_pago` + `monto` (sin desglose por método). `Caja.jsx:266-271` calcula `abonosEfectivo/Tarjeta/Transferencia` filtrando por `metodo_pago` EXACTO → un abono `metodo_pago='mixto'` aporta **$0** a los tres buckets y a `abonosTotal`.
- **(a) efectivo_esperado** = `totalEfectivo + abonosEfectivo` (`Caja.jsx:1236` y `1316`): la porción EFECTIVO de un abono mixto **NO se doble-cuenta**, mientras que un abono efectivo ÚNICO **sí** (candado del doble conteo). **Verificado en vivo:** corte con 1 abono efectivo único $50 + 3 abonos mixtos (efectivo 90+30=120) → `total_efectivo=170`, **`efectivo_esperado=220`** (=170 + abonosEfectivo 50). El $120 efectivo de los mixtos no se dobló; el $50 single sí → inconsistente (mismo $ efectivo tratado distinto según si el abono fue mixto o único).
- **(b) ResumenDelDia** (`196-228`): la card "Pagos de pedidos de pastel" se muestra solo si `abonosTotal>0` y desglosa por bucket → un abono mixto **no aparece** (o el card subreporta el total de abonos). Verificado: corte con un solo abono mixto → card OCULTA.
- **Importante:** el mixto del corte sí cuadra por método (el desglose lee `monto_efectivo/tarjeta/transferencia` de la **venta paralela**, no del abono). El problema es SOLO `efectivo_esperado` (doble conteo) y el display del card de abonos.
- **Opciones (decisión de Miguel; NO tocado):**
  - **A (recomendada): consistencia con el candado.** Que la porción por método del abono mixto entre a los buckets — guardando `monto_efectivo/tarjeta/transferencia` en `abonos` (migración + `RegistrarPagoDialog` los setea; el más limpio) o derivándola de la venta paralela. Así el efectivo del mixto se trata IGUAL que cualquier abono efectivo (se dobla, consistente) y se muestra en el Resumen. Recomendada porque el candado existe para que TODO abono efectivo se dable-cuente igual; tratar dos abonos con el mismo $ efectivo distinto es confuso.
  - **B:** dejar el mixto fuera del doble conteo (mixto = "más correcto") y arreglar SOLO el display para que el abono no desaparezca del Resumen. Deja la inconsistencia de fondo (single dobla, mixto no).
  - El doble conteo es CANDADO (fidelidad Base44, que el bot validó); Base44 nunca tuvo abonos mixtos.
- **RESOLUCIÓN (Opción A, aprobada por Miguel):** migración **0025** añade `monto_efectivo/tarjeta/transferencia` a `abonos` (+ backfill desde metodo_pago; 0 filas en staging limpio, en prod single-método el CASE las cubre); `RegistrarPagoDialog` setea el desglose del abono desde `construirPago` (mismo split de la venta paralela); `Caja.jsx:266-271` ahora SUMA esas columnas (no filtra por metodo_pago). `efectivo_esperado` (1236/1316) NO se tocó: sigue `totalEfectivo + abonosEfectivo`, pero ahora `abonosEfectivo` incluye el efectivo del mixto → el quirk del doble conteo se MANTIENE pero CONSISTENTE. **Verificado en vivo:** regresión single-método idéntica (corte solo-efectivo $50 → efectivo_esperado $100, igual que antes); consistencia mixto (corte single $50 + mixtos $120 ef → efectivo_esperado **$340**, antes $220); la card "Pagos de pedidos de pastel" ahora muestra las porciones del mixto (Efectivo $170/Total $250); totales por método y etiquetas del PDF sin cambio.

## (i) ✅ RESUELTO (FASE 3 A) — Venta paralela de ANTICIPO sin `DetalleVenta` (`producto_id: ''` en `uuid NOT NULL`)
- **Qué fue:** `RegistrarPagoDialog.jsx` (y `Caja.handleCobrarPedidoWeb`/`CobrarPedidoWebDialog`) creaban el `DetalleVenta` de la venta paralela con `producto_id: ''` y la columna `detalle_venta.producto_id` es `uuid NOT NULL` → `invalid input syntax for type uuid: ""` → la línea NO se creaba (el dinero entraba al corte pero la línea no salía en el ticket/PDF). Afectaba TODO anticipo (POS+web). Destapado al hacer cobrables los pedidos web (FASE 3 #1).
- **Resolución (Opción A de Miguel):** migración **0023** `detalle_venta_producto_id_nullable` (producto_id → `uuid NULL`; sin FK, datos existentes intactos) + las dos creaciones de línea ahora usan `producto_id: null` con concepto en `producto_nombre` (`Anticipo pedido [folio]` en RegistrarPagoDialog; nombre del producto parseado en handleCobrarPedidoWeb). Modelo ya snapshot-first (el ticket/corte usan `producto_nombre`, no lookup). Consumidores verificados que toleran null: `CorteTicket.jsx:52` (key `producto_id || producto_nombre`), joins de receta (no machean → costo 0), `DescuentoInventarioVenta` (no mapeado). Ventas de mostrador normales (con producto_id real) intactas.
- **Verificado en vivo (FASE 3 B/C):** anticipo a pedido web → SIN error de uuid; `DetalleVenta` creado con `producto_id=null` + `Anticipo pedido PP-B-0001` $150; **la línea aparece en el PDF del corte** (`CONF-B-V0001 · 21:31 · Anticipo pedido PP-B-0001 ×1 · $150.00 · Efectivo`); el dinero entra al corte (Resumen $150) y al dashboard (Ventas hoy, con corte abierto).

## (j) ✅ RESUELTO (FASE 3, cierre de #2) — Findability del pedido de CATÁLOGO en cualquier estado activo
- **Qué fue:** los pedidos de **catálogo** solo aparecían en la cola **Caja → Pedidos** filtrada a `estado='pendiente'`; tras el 1er anticipo (`con_anticipo`) salían de la cola y, al no vivir en "Pedidos de Pastel", quedaban difíciles de re-encontrar para 2º anticipo/liquidar/entregar. (El buscador por folio sí los encontraba — no filtra estado —, pero requería conocer el folio.)
- **Resolución (`Caja.jsx`):** la query de la cola pasa de `estado:'pendiente'` a `estado:{$nin:['entregado','cancelado']}` (todos los activos, por exclusión). La lista se separa en **dos grupos**: "Pendientes de cobro" (manejan la notificación de "nuevo": beep + badge pulsante, vía `pedidosWebPendientes`) y "En proceso — con anticipo / por entregar". La notificación de pedidos NUEVOS sigue solo sobre `pendiente` (no molesta con los en proceso). El pastel NO se tocó.
- **Verificado en vivo (ciclo completo de un catálogo):** pendiente→1er anticipo (pasa a "En proceso", saldo baja, **no se pierde**)→2º anticipo→liquidación (pagado, saldo 0, sigue visible "por entregar")→**Entregado** (habilitado al saldo 0)→sale de la lista. 3 abonos/3 ventas/3 líneas (todas `producto_id` null) = $300, todo al corte. **#2 CERRADO.**

## (g) CORTE DE TURNO — **BOTÓN FANTASMA de Base44 (NO es bug)** — decisión de Miguel
- **Decisión de Miguel (2026-06-27):** Confetti **NO usa cortes de turno**. Abel opera **solo con CIERRE DIARIO por sucursal**. El "Corte de turno" es un **elemento fantasma** heredado de la plantilla Base44, igual que mesas/propinas/restaurante. **NO es un bug a arreglar.**
- **Qué pasa técnicamente (para la auditoría de fantasmas):** si alguien lo pulsara, `handleCorteTurno` (`Caja.jsx:1341-1365`) hace `CorteCaja.create({...})` **sin `sucursal_id`**, y la RLS `pos_scope_cortes` (`pos_is_admin() OR sucursal_id = pos_sucursal()`) rechaza la fila (`new row violates row-level security policy for table "cortes_caja"`). El cierre diario sí setea `sucursal_id`, por eso funciona. Además inserta columnas inexistentes en el esquema migrado (`corte_padre_id`, `total_propinas`, `propinas_por_mesero`).
- **Acción:** **post-cutover** — en la auditoría de fantasmas con el sistema vivo, Miguel decide si se **quita el botón** o se deja muerto. NO se toca durante la migración. El **bot NO ejercita corte de turno** en las pruebas largas (no es operación real de Abel).
- **Origen:** detectado por `Bot pruebas/bot-pruebas/bot-corte-turno.mjs` (reclasificado de 🐛 a fantasma por decisión de Miguel). Ver también auditoría de fantasmas en `MEJORAS_POST_CUTOVER.md` #5.

## (a) Doble conteo de `efectivo_esperado` con abonos en efectivo — quirk de Base44
- **Qué:** `efectivo_esperado = total_efectivo + abonosEfectivo` (`Caja.jsx:1440`), pero la **venta paralela** que crea cada abono (`RegistrarPagoDialog.jsx`, `monto_efectivo=m`, `corte_caja_id=caja`) ya está dentro de `total_efectivo`. → el efectivo de un abono se cuenta **dos veces**.
- **Verificación:** contra 20 cortes cerrados REALES de Base44 con abono efectivo → **18/20 coinciden EXACTO** con la fórmula (ii) (doble). Base44 SÍ doble-cuenta.
- **Estado:** **CANDADO — reproducido idéntico. NO se arregla en la migración** (romperlo violaría la paridad con Base44 que valida el bot en Fase 5).
- **Acción:** **bug de Base44 FUERA de alcance.** Decidir con Miguel si se corrige **post-cutover** (decisión de negocio). Documentar para el dueño.

## (b) 2/20 cortes reales con abono efectivo y `total_efectivo=0`
- **Qué:** `CONF-A-C087` y `CONF-B-C04299` tienen `efectivo_esperado=0` y `total_efectivo=0` pese a tener un abono efectivo vinculado por `corte_caja_id`.
- **Hipótesis:** edge de asociación abono↔corte (corte cerrado sin recompute, o abono vinculado tras el cierre, o corte de prueba vacío). No contradice (a) (los 18 con totales reales sí doble-cuentan).
- **Acción:** **verificar en el bot (Fase 5)** con datos a volumen; si reaparece, revisar el momento de asociación del abono al corte.

## (c) Imágenes hospedadas en `media.base44.com` / `base44.app`
- **Qué:** `productos.imagen_url` y `configuracion_negocio.logo_url` apuntan a `media.base44.com/.../...png` y `base44.app/...`. **Mueren cuando se apague Base44.**
- **Acción (cutover):** re-hospedar imágenes del POS en Supabase Storage (bucket `uploads`) o Vercel y reescribir las URLs. No urgente en staging (Base44 sigue vivo).
- **Web:** las 8 imágenes de marca/arte de la **web** YA se re-hospedaron en `web-uploads/assets/` (esta sesión). Falta solo el cambio de prefijo de URL en el código web (parte de WEB-2).

## (d) Fase 4 (auth) + Fase 5 (fidelidad): HECHAS y APROBADAS por Miguel
- **Qué fue:** la UI de auth no consumía las sesiones reales. **Resuelto:** Opción A (cuentas terminal), admin=desbloqueo de UI sobre la sesión terminal, dueño=sesión global; `/login-pos` retirado (era hueco de aislamiento).
- **Estado:** build verde, smoke UI 4/4, **adversarial 31/31**, Fase 5 fidelidad (maestros 0 diffs, corte 14/14). **POS Fases 0-5 completas y firmadas.** Ver CHANGELOG.

## (f) Folio en pantalla Gracias del web — ✅ RESUELTO (migración 0019)
- **Qué fue:** anon hace INSERT en `pedidos` pero **no puede leer de vuelta el folio** (sin SELECT; 42501). La fila SÍ queda con `PP-<prefijo>-####` (trigger 0017). La pantalla Gracias quiere mostrarlo.
- **Resolución (Miguel, opción 1):** migración **0019 `web_crear_pedido_rpc`** — RPC `crear_pedido_web(payload jsonb) → text` SECURITY DEFINER que inserta y **devuelve el folio**; el web usa `rpc` en vez de `insert`. Candados del WITH CHECK anon reaplicados, whitelist de columnas, reutiliza el trigger 0017. anon: solo EXECUTE, sin SELECT. Verificado y aplicado a la Supabase compartida. Ver `DECISIONS.md` #22, `DATABASE.md` y `CHANGELOG.md`.

## (e) `uploads` bucket permite listar (advisor WARN)
- Política SELECT pública amplia → clientes pueden listar archivos. Bajo riesgo (imágenes de catálogo públicas). Opcional: restringir a acceso por URL en hardening posterior.

## (g) 🔴 Fotos de producto del catálogo web en `media.base44.com` — BLOQUEANTE DE CUTOVER (Flag WEB-2)
- **Qué:** la web pública muestra las fotos de producto desde **`productos.imagen_url`**, que apunta a **`media.base44.com`** (CDN de Base44). Detectado en el smoke del port WEB-2 (catálogo: 16 imágenes servidas por el CDN de Base44).
- **Riesgo:** cargan hoy solo porque Base44 sigue vivo. **Al apagar Base44, el catálogo público pierde las fotos.**
- **Acción (antes del cutover, decisión de timing de Miguel):** re-hospedar esas imágenes en Supabase Storage y actualizar `productos.imagen_url`. Es migración de **datos del POS** (no del repo web; los 8 assets de marca de la web ya se re-hospedaron). NO ejecutada aún. Ver `NEXT_STEPS.md` (CUTOVER).

## (h) Imágenes de prueba residuales en `web-uploads/pedidos/` (smokes WEB-2/WEB-3)
- 2 objetos de prueba: `db92b1c3-…png` (93 B, WEB-2) y `74aa34e2-…png` (110 B, WEB-3). No listables (bucket sin SELECT anon), solo accesibles por URL exacta.
- No se pudieron borrar sin `service_role`/Storage API (el trigger `storage.protect_delete()` bloquea el DELETE por SQL; **no se tocó RLS ni el trigger**). **Borrar por el Storage dashboard.** (Cada smoke con subida de imagen deja un objeto en `pedidos/`.)

## Notas de cutover (recordatorio)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con folios históricos).
- Los 3 productos "prueba" ("prueba 1", "prueba 2", "prueba suscursal") NO van al catálogo real de Abel.
- Eliminar la cuenta `staging-pos@confetti.local` cuando el login real esté wireado.
- Rotar la api_key Base44 `847df…`.
- **Re-hospedar fotos de producto (`productos.imagen_url`) fuera de `media.base44.com`** — ver (g), bloqueante.

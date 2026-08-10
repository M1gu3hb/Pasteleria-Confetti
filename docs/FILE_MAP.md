# FILE_MAP — archivos del port y qué NO romper

---

# Actualización 2026-08-09 — archivos nuevos y modificados

## Archivos NUEVOS de esta etapa

| Ruta | Propósito | Qué contiene | Riesgo al modificarlo |
|---|---|---|---|
| `src/lib/ventasCorte.js` | **Ventas del corte abierto**, acotadas y completas | `fetchVentasDelCorte` (filtra por corte **en PostgreSQL**, ordena y **pagina** hasta agotar) y `contarVentasDelCorte` (cuenta en el servidor; devuelve `null` si no es verificable) | **MÁXIMO — es dinero.** Existe porque PostgREST corta en 1.000 filas y eso guardó 11 cortes en cero. No quites el orden, el paginado ni el `null` de "no verificable" |
| `src/lib/cajaEstado.js` | Consultas de estado de caja | `fetchCajaAbierta`, `fetchUltimoCierre` (filtradas en PostgreSQL, `LIMIT 1`, columnas mínimas) y `suscribirRealtimeCaja` **escrita y DESACTIVADA** | Alto. **Las dos listas de columnas DEBEN incluir `sucursal_id`**: las guardas anti-fuga de `useCajaAbierta` comparan ese campo |
| `src/lib/cajaRefresco.js` | **Un solo temporizador** de respaldo por sucursal, con refcount | `registrarRefrescoCaja`, `invalidarSoloCajaAbierta` (exact), `invalidarCajaCompleta` (prefijo), las queryKeys | Alto. **Aquí estuvo el `Illegal invocation`** que dejaba la app en blanco: los nativos `setInterval`/`clearInterval` van **envueltos en flechas**, nunca guardados como propiedad y llamados como método |
| `supabase/migrations/0050…0064` | Índices, RLS InitPlan, unicidad de caja, rate limit, recálculos, triggers, pastelero, datos | — | **MÁXIMO** |
| `src/lib/cierreBloqueado.js` | Reconoce que **la base** rechazó el cierre (no un fallo cualquiera) | `MARCADORES_GUARD_CIERRE` + `cierreBloqueadoPorLaBase(err)` | Usa `includes`, **no `startsWith`**: el adaptador antepone `[cortes_caja] ` al mensaje. Sin esto, el aviso de `0058`/`0064` no llega al cajero |
| `src/native/avancePapel.js` | **Avanza el papel antes de cortar** | `bytesAvancePapel(dots)` → `ESC J n` en trozos de 255, tope `MAX_AVANCE_DOTS` | Es el arreglo del bug de Abel. `cutPaper()` de DantSu **no avanza papel** |
| `scripts/dinero_estado_cobro_verify.mjs` | Estado que sobrevive de un cobro al siguiente (doble cobro, spinner infinito, método pegado, mixto sin cuadrar) | 26 casos; **16 FAIL contra el código viejo** | Acepta `SRC_DIR=<dir>` para correrla contra otro árbol |
| `scripts/cierre_bloqueado_verify.mjs` | Que el mensaje del guard llegue al cajero, sin SQLSTATE en pantalla | 25 casos (5 FAIL contra el viejo) | — |
| `scripts/impresion_avance_corte_verify.mjs` | Avance de papel antes del corte | 25 casos (8 FAIL contra el viejo) | — |
| `scripts/impresion_corte_botones_verify.mjs` | Botones del corte: «Listo» alcanzable y guardas de reentrada | 14 casos (12 FAIL contra el viejo) | — |
| `scripts/impresion_banco.mjs` | **Banco de impresión sin impresora**: binarización, bandas, `GS v 0`, `ESC J`, `GS V 1`, comparación **pixel a pixel** y escritor PNG | 44 casos, **con control negativo** | Spec sacada del **bytecode** de DantSu 3.4.0, no de su documentación. Su batería sólo corre **si se invoca directamente** (`ES_PRINCIPAL`): otras suites lo **importan** para reusar `construirFlujo`/`decodificarFlujo`. No le quites la guarda o el import matará a quien lo importe con su `process.exit` |
| `scripts/ticket_pastel_base_limpia_verify.mjs` | El aviso "FAVOR DE DEVOLVER LA BASE LIMPIA" del ticket de pastel | 23 casos (7 FAIL contra el viejo): posición, `.ticket-printable`, estilos en línea, condiciones, **sha256 del contenido** de los otros 5 tickets, y la geometría del corte con los bytes reales | Los 5 hashes se comparan sobre el contenido **normalizado a LF**: con los bytes crudos fallaban por CRLF vs LF, que es un discriminador falso |
| `scripts/cierre_caja_verify.mjs` | Verifica la guarda anti-ceros y el paginado | 24 casos + integración opcional | — |
| `scripts/pedido_nota_verify.mjs` | Verifica que la nota se guarda y que no hay pedido fantasma | 11 casos + integración que escribe y **restaura** | — |
| `scripts/fase1_caja_estado_verify.mjs` | Equivalencia del refactor de caja, borde de medianoche MX, fugas entre sucursales, columnas requeridas | 12 + 181 + 11 + 5 | — |
| `scripts/fase1_caja_refresco_verify.mjs` | Temporizador único, refcount, y **regresión WebIDL** (`Illegal invocation`) | 19 | — |
| `scripts/pastelero_alcance_verify.mjs` | Alcance del pastelero y coherencia botones↔base | 31 | — |
| `scripts/pastelero_alcance_evidencia.sql` | Evidencia contra la base **en transacciones revertidas** | 12 comprobaciones | Pégalo en el editor SQL de Supabase |
| `HANDOFF.md` | **Traspaso de sesión** | Todo lo de esta etapa, el estado real y lo que falta | Manténlo al día |

## Archivos MODIFICADOS que conviene conocer

| Ruta | Qué cambió | Qué NO romper |
|---|---|---|
| `src/components/pedidos/TicketPastelConfetti.jsx` | **Es EL ÚNICO ticket de pastel, y el que se imprime** (lo monta `PedidoPastelDetalleDialog`, al que llegan tanto la lista de pedidos como el botón de `NuevoPedidoPastel`). Lleva el aviso "FAVOR DE DEVOLVER LA BASE LIMPIA" al final del todo | Todo el layout va **en línea**: el iframe térmico no carga Tailwind. *Hasta el 2026-08-09 convivía con `TicketPedidoPastel.jsx`, un fósil que no renderizaba nadie y donde estaba escrito el aviso — por eso parecía hecho y no salía. **Eliminado.** Si alguien lo resucita, que sea a sabiendas* |
| `src/pages/Caja.jsx` | La consulta de ventas del corte pasa por `ventasCorte.js`; guarda **falla-cerrada** antes de cerrar; manejo de `23505` al abrir caja; el `catch` del cierre distingue "la base lo rechazó" y muestra instrucciones; **`limpiarCamposCobro()`** llamado desde las dos puertas al cobro; **guarda de que el mixto sume el total** | **CANDADOS 1/2/3 y la matemática del dinero siguen intactos.** La guarda del mixto **sólo lee**: las tres líneas del reparto automático (`mEfec = totalACobrar`, etc.) están verificadas **byte a byte** por la suite. `limpiarCamposCobro` repone los mismos valores que el `useState` inicial: si le quitas `setMetodoPago('efectivo')`, vuelve el cobro registrado con el método del ticket anterior |
| `src/pages/NuevoPedidoPastel.jsx` | `guardandoRef` síncrona + el botón se **desarma** tras crear el pedido (`!editId && !!pedidoGuardado?.id`) y cambia a "Pedido guardado ✓" | **Es dinero.** Sin esto, un segundo toque crea otro pedido, otro folio y **otro abono con otra venta paralela**: el anticipo se cobra dos veces. **La base no lo para** (`ventas.folio` no es único). `limpiar()` es lo que lo re-arma |
| `src/components/common/TerminalGate.jsx` | El `autoLoginRef` se **suelta** cuando desaparece `posUser` | Sin eso el ref es un latch de por vida (el componente **nunca se desmonta**) y la tablet se queda en un spinner infinito, sin cobrar, hasta recargar |
| `src/components/cortes/CorteAutoDownloader.jsx` | El botón «Listo» sale del bloque `{!done && …}` (era **inalcanzable**), `onDone` se llama tras descargar, guarda de reentrada síncrona | Si «Listo» vuelve dentro de `!done`, el PDF del **2.º corte y siguientes** deja de descargarse **en silencio** |
| `src/components/cortes/CorteViewerDialog.jsx` | Guarda de reentrada compartida (`ocupadoRef`) en imprimir **y** descargar; el botón Imprimir se deshabilita también con `downloading` | La descarga tiene que **poner** la guarda, no sólo leerla |
| `src/native/printTicket.js` | `ejecutarYcortarSiempre`: raster → **avance de papel** → corte, cada uno en su `try` | La garantía de corte de la FASE 4 no puede depender de que el avance funcione |
| `src/lib/pdfDownload.js` | `printPDFBlob` devuelve promesa (resuelve tras `iframe.print()`, rechaza si nada funciona, failsafe de 15 s) y `printNodeAsPDF` la espera | Sin el failsafe, un `onload` que no dispara deja el botón muerto para siempre |
| `src/lib/useCajaAbierta.js` | Consulta filtrada, un solo temporizador, y **guardas anti-fuga por sucursal** en `placeholderData` y en la memoria de sesión | Al cambiar de sucursal el estado debe quedar en `unknown` ("Verificando…"), **nunca** servir la caja de otra sucursal |
| `src/lib/useCorteAtrasado.js` | Deriva de `useCajaAbierta` (sin consulta ni temporizador propios) + comprobación explícita de sucursal | **CANDADO 2**: la lógica de medianoche México es idéntica |
| `src/components/pedidos/PedidoPastelDetalleDialog.jsx` | Relee la fila **fresca** (arreglo de "la nota no se guarda"); textarea se resincroniza al cambiar de pedido; ya no muestra pedidos fantasma; botones del pastelero | La queryKey cuelga de `['pedidos_pastel']` **a propósito**: hereda los `invalidateQueries` que ya existían |
| `src/components/common/Sidebar.jsx` | Restaura la sesión de la terminal al salir **de dueño Y de pastelero**, y aborta si no puede | `SidebarContent` sigue declarado **dentro** del componente: es un bug pendiente |
| `src/api/entitiesAdapter.js` | Propaga el SQLSTATE de forma **aditiva** (mismo `message` de siempre) | El whitelist de columnas por tabla |
| `src/pages/PedidosPastel.jsx` | Comentarios del alcance del pastelero | "Nuevo pedido" sigue oculto para el pastelero: la `0060` es **sólo** `FOR UPDATE` |
| `supabase/functions/transcribir-nota-voz/index.ts` | v3 endurecida (SSRF cerrado, MIME, tamaño, timeouts, CORS) | El contrato con el frontend: **siempre 200** con `{transcript, ok, error}` |

---

## APK Android (Capacitor) — nuevos / tocados (rama `apk/capacitor`)
> Regla: lo nativo va detrás de `Capacitor.isNativePlatform()`; el navegador queda igual.
- **`capacitor.config.ts`** — appId `com.mhastral.confettipos`, `server.url` = preview de rama, allowNavigation, cleartext. *No romper:* NO apuntar a producción durante el piloto.
- **`android/`** — proyecto Gradle. `android/app/src/main/java/com/mhastral/confettipos/ConfettiPrinterPlugin.java` = plugin nativo (USB/TCP, imagen raster, corte, cajón USB-serial); `MainActivity.java` lo registra + refuerzos (orientación/keep-screen-on/back). `AndroidManifest.xml` + `res/xml/device_filter.xml` = permiso USB persistente. `app/build.gradle` = deps DantSu + usb-serial-for-android (JitPack). *No romper:* `android/local.properties` (sdk.dir) y `android/keystore` NO se commitean.
- **`src/native/confettiPrinter.js`** — API JS del plugin (registerPlugin), cada método tras `isNativePlatform()`.
- **`src/native/printTicket.js`** — dispatcher nativo: `imprimirTicketNativo` (imagen/texto), `renderTicketA576(node, ancho)`, `imprimirCorteTermico`, `asegurarConexionImpresora`. Reusa el nodo del ticket del DOM (no rediseña).
- **`src/native/printerConfig.js`** — config LOCAL (localStorage): conexion/ip/puerto/modo/metodoCajon/formatoCorte. *No romper:* es POR DISPOSITIVO, NO Supabase compartido.
- **`src/native/cajon.js`** — `abrirCajon(metodo)`: ninguno/usb_trigger/kick_impresora.
- **`src/lib/print.js`** — se AÑADIÓ una rama nativa aditiva al inicio de `printDocument` (si `isNativePlatform()` → dispatcher). *No romper:* `printTicketViaIframe` (rama navegador) es IDÉNTICA a antes.
- **`src/components/tickets/CorteTicketTermico.jsx`** — corte de caja en 1 columna para térmico; reusa los MISMOS `corte.*` + helpers que `CorteTicket`. *No romper:* NO recalcula números (deben ser idénticos al PDF).
- **`src/components/cortes/CorteViewerDialog.jsx`** — `handlePrintCashCut` ramifica por `formatoCorte` (termico+nativo → imagen; si no → `printNodeAsPDF` intacto). El corte térmico solo se monta en el APK.
- **`src/components/configuracion/ImpresoraCajonAppSection.jsx`** — UI Config→Operación para seleccionar/probar impresora/cajón/corte; funcional solo en APK, deshabilitada en navegador. Montada en `Configuracion.jsx` (la sección de ancho `ImpresoraTermicaSection` NO se tocó).
- **`src/components/tickets/PreCuentaTicket.jsx`** (Arreglo #1) — los 4 separadores `border dashed` se pasaron a divs `<Linea>` dedicados (html2canvas los tachaba al rasterizar). *Mismo diseño visual*, solo estructura DOM.

## Capa de datos
### `src/api/supabaseClient.js`
Cliente Supabase + auth (Fase 4 HECHA): `ensureSession()` bootstrapea la sesión **TERMINAL** desde localStorage (ya NO la cuenta staging) + `loginTerminal(sucursalId)` / `validarPin(pin,userId?)` (RPC, sin signin, para admin) / `loginConPin(pin,userId?)` (RPC + signin, para dueño) / `logoutOperador()`. **No romper:** `ensureSession()` lo llama el adapter antes de cada query (debe auto-resolver la sesión correcta).

### `src/api/entitiesAdapter.js` ⚠️ CRÍTICO
Replica el contrato `base44.entities.X.filter/list/get/create/update/delete/bulkCreate` sobre Supabase.
- `TABLE_MAP`: PascalCase→tabla. `COLUMNS`: **whitelist por tabla** (descarta campos de Base44 que no existen → evita "column does not exist"). **Si agregas una columna a una tabla, AGRÉGALA al whitelist** o los writes la ignorarán.
- Traduce filtros Mongo: `$in→in`, `$ne→neq`, `$gte/$lte/$gt/$lt`, `$exists`. `created_date`/`updated_date` → alias de `created_at` (lectura) y mapeo en sort.
- Entidades fuera del map (lista roja) → stub no-op ([]/null). **No romper estos contratos** o se rompe el dinero.

### `src/api/base44Client.js`
Shim `base44`: `entities` (del adapter) + `integrations.Core.UploadFile`→Supabase Storage (**preserva `{ file_url }`**) + `auth` stubs + `functions.invoke` stub (rechaza). **No romper** el contrato `{file_url}`.

## Dinero / candados
### `src/pages/Caja.jsx` (~2249 líneas) ⚠️ ARCHIVO DE DINERO
- **CANDADO 1**: `resumen` (223-309), filtro venta↔corte 240-250 (núcleo 242, fallback 245-246); cierre 1406-1464 (asociación 1451-1461). Idéntico.
- Corte lee `Venta.filter({estado:'pagada'})` (193). `efectivo_esperado = totalEfectivo + abonosEfectivo` (1440).
- **CANDADO 3** (corregido): `handleBuscarFolioWeb` (679) filtra por `sucursalEfectiva.sucursal_id`.
- **NO cambiar la lógica.** Solo se redirige la fuente de datos (vía adapter). Si partes el archivo, preserva comportamiento.

### `src/lib/useCorteAtrasado.js`
- **CANDADO 2**: `obtenerInicioDiaMexico` (21-31) = medianoche México (UTC-6). Verbatim. No tocar.

### `src/components/pedidos/RegistrarPagoDialog.jsx`
- Abono (55-141): crea `Abono` (sucursal del pedido) + `Venta` paralela `pagada` (corte abierto, sucursal del terminal, monto_<metodo>=m) + `DetalleVenta`; recalcula total_abonado/saldo_pendiente; estado pagado/con_anticipo. **Ojo:** la venta paralela alimenta el quirk de doble conteo (ver BUGS). Idéntico a Base44.

### `src/utils/tipsUtils.js`
- `desgloseMetodosPagoExacto` (función REAL usada por el resumen). `tipsEnabled` default-on si `propinas_activas` undefined → por eso se migró `propinas_activas=false`.

## Auth (Fase 4 — WIREADO; pendiente de firma)
> `POSLogin.jsx` / ruta `/login-pos` **RETIRADOS** (hueco de aislamiento). También borrados `LoginBrandColors.jsx` y `ensureDefaultAdmin.js` (deps exclusivas). El modelo NO tiene login standalone.
### `src/components/common/TerminalGate.jsx`
Auto-login de "Empleado" virtual; ahora `await loginTerminal(terminal.sucursal_id)` (sesión terminal scoped) **antes** de `login(...)`; estado de error si falla.
### `src/components/common/ModalPinAdmin.jsx`
Valida PIN vía `validarPin` (RPC `login_pos`, **sin** abrir sesión). Devuelve el operador + `_pin` (transitorio).
### `src/components/common/AccesoDuenoGate.jsx` + `src/pages/ConfigurarTerminal.jsx`
Dueño: `loginConPin(_pin, id)` → sesión global. **Separan `_pin`** antes de `login()` (no persiste).
### `src/components/common/Sidebar.jsx` ⚠️ candado-sensible
Elevación: administrador = `activarAdmin` sobre la sesión terminal (exige `sucursal==terminal`, sin signin); dueño = `loginConPin` (global) y al salir `loginTerminal` (restaura scoped). Separa `_pin`.
### `src/lib/ConfigContext.jsx`
`queryFn` cae a la vista `config_publica` (anon) si la tabla no es legible sin sesión → branding pre-login.
### `src/lib/AuthContext.jsx`
Llama `ensureSession()` al montar (bootstrap terminal). `useAuth` con interfaz estable; `isAuthenticated:true`.
### `src/lib/POSAuthContext.jsx`
`posUser` en sessionStorage (identidad de UI; = admin real al elevar). `login(user)`/`logout()`. La sesión Supabase es aparte (supabaseClient).

## Config / build
- `vite.config.js`: sin `@base44/vite-plugin`; alias `@`→`./src` (lo daba el plugin; **no quitarlo**).
- `package.json`: +`@supabase/supabase-js`; sin `@base44/*`, `@stripe/*`, `react-leaflet`, `three`.
- `.env` (gitignored): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, **VITE_TERMINAL_PASSWORD** (cuentas terminal), VITE_STAGING_AUTH_EMAIL/PASSWORD (legado). Ver `.env.example` y `supabase/STAGING_NOTES.md`.
- `.claude/launch.json`: dev server (vite) para el preview MCP.

## SQL
- `supabase/migrations/0001-0016` — ver DATABASE.md / CHANGELOG.md.
- `scripts/fase4_rls_adversarial.mjs` — harness adversarial de RLS (31/31). Requiere datos sembrados + cuentas de prueba (ver CHANGELOG).
- `supabase/STAGING_NOTES.md` — cuenta de staging + env vars Vercel + modelo auth por operador.

# Lector de códigos nativo (APK 1.3.0) — arquitectura, compatibilidad y evidencia
Fecha: 6 de noviembre de 2026, hora de CDMX. Rama `apk/capacitor`.

## Dictamen
- **Implementado y probado en software y en el framework Android 12 emulado.** Con el APK 1.3.0, la terminal identifica el lector USB-HID vinculado por su `InputDevice`, consume sus teclas antes del IME y del WebView, y las entrega al mismo parser JS que ya usaba la ruta web. Un lector en su configuración de fábrica (teclado HID + Enter) funciona **sin programar F9**.
- **No está autorizado para uso real todavía.** Faltan: (1) firmar el APK con la llave de Miguel e instalarlo como actualización en la terminal de Abel; (2) la prueba física con el lector comprado y la impresora conectados a la vez (lista mínima al final); (3) cargar códigos en el catálogo (al 6 de noviembre, consulta de solo lectura: 43 productos activos, 0 con código). No se probó hardware físico en esta entrega.
- **Sin el APK nuevo, nada cambia de comportamiento:** la web publicada detecta que el plugin no existe (`apk_anterior`) y sigue con la ruta web de siempre y sus ajustes. Publicar en Vercel no instala Java.

## Qué resuelve
| Problema de la auditoría del 5-nov | Solución |
|---|---|
| keydown web no identifica el dispositivo ni detecta desconexión | Plugin `ConfettiScanner`: cada `KeyEvent` trae su `InputDevice`; conexión/desconexión por `InputManager.InputDeviceListener`. |
| El perfil recomendado exigía F9 + código + Enter | Con lector vinculado el prefijo es opcional (F9 o F7 aceptados sólo desde ese lector). |
| El perfil sin prefijo podía escribir en búsquedas/importes | Las teclas del lector vinculado se consumen en `dispatchKeyEventPreIme` (ConfettiWebView) y `Activity.dispatchKeyEvent`: nunca llegan a campos ni botones. |
| "Recibí caracteres" ≠ "lector conectado" | Estado del dispositivo sólo desde Android (`conectado/desconectado/ambiguo`); recepción de lectura y producto encontrado se muestran por separado. |
| "Detectar impresoras USB" dejaba elegir un lector | Clasificación por interfaces USB + teclados que Android reconoce; lectores/teclados HID deshabilitados. Térmicas de clase propietaria (0xFF + bulk OUT) siguen elegibles y ahora tienen transporte propio. |
| PNG/PDF requiere ConfettiFiles | Incluido en 1.3.0 (ya estaba en el código 1.2.0, nunca distribuido). |

## Arquitectura
```
Lector USB-HID ──► Android InputReader ──► KeyEvent(deviceId)
                                            │
             ConfettiWebView.dispatchKeyEventPreIme  (antes del IME)
             MainActivity.dispatchKeyEvent           (respaldo si el WebView no tiene foco)
                                            │
                              ConfettiScannerPlugin.interceptar()
                ┌─────────────── ¿lector vinculado, inequívoco y JS activo? ───────────────┐
                │ no: la tecla sigue su camino normal (teclado humano, táctil, sistema)     │
                │ sí: se consume; ScannerCore la agrupa hasta Enter / corte                  │
                └──────────────► evento 'lectura' {seq, gen, teclas[{k,t,r}], fin, dispositivo}
                                            │
                    scannerCapture (JS) ── mismo barcodeFrame (modo nativo) ── useBarcodeScanner/cola
                                            │
                     POS: buscar_producto_codigo_pos ─► +1 pieza   (Configuración: diagnóstico sin escrituras)
```
- **Un solo parser.** El nativo es un "tubo": decide de qué dispositivo viene la tecla y la agrupa; las reglas de validez (caracteres, tiempo entre teclas, F9/F7, tecla sostenida, Enter doble, Tab, Esc) siguen en `barcodeFrame.js` y se corrigen por Vercel.
- **Una sola ruta por lectura.** Mientras el estado nativo dice `capturando=true`, el parser web (keydown) queda pasivo; el lector vinculado no genera keydown porque se consume en nativo. Prueba: `web_keys_ignored_while_native_captures`.
- **Generación (gen).** Cada cambio de dueño/pantalla, sucursal, cajero, caja, ajustes o pérdida de foco incrementa `gen` en JS y se envía al nativo. Un lote que empezó con otra `gen` se descarta; si no traía Enter, su cola queda en cuarentena hasta el siguiente Enter. El puente reenvía la `gen` más reciente cuando `iniciar()` termina (carrera detectada y corregida por `scanner_native_verify`).
- **Cortes de lote nativos:** `enter`, `tiempo` (inactividad = tiempo máximo entre teclas + 100 ms), `desconexion`, `pausa`, `invalidado`, `limite` (256 teclas), `vinculacion`. Desconexión no deja cuarentena (no puede llegar cola de un dispositivo retirado); los demás sí. Una trama en cuarentena nunca agrega productos, así que no bloquea el cobro.
- **Cliente activo.** El nativo sólo captura después de `iniciar({protocolo:1})` del JS en esa carga de página. Al recargar el WebView se desactiva (listener registrado después de `Bridge.Builder.create()`, que reemplaza la lista: defecto encontrado por la prueba Robolectric y corregido). Si una web sin este soporte llegara a cargarse, el lector vuelve a comportarse como teclado.

## Identidad, vinculación y casos difíciles
- Paso explícito: Configuración → Escáner → **Vincular lector** → escanear **tres veces el mismo código impreso**. Durante el paso (máx. 3 min, cancelado al salir de la pantalla) se capturan los teclados externos físicos; nunca el táctil (virtual) ni botones internos. La velocidad de escritura no decide nada.
- Se vincula el dispositivo que produjo tres lecturas válidas seguidas e idénticas. Se guarda `vendorId + productId + nombre` (+ descriptor informativo) en SharedPreferences con `commit()` y relectura; el éxito sólo se muestra cuando el nativo confirma vínculo guardado y dispositivo conectado.
- `deviceId` no es identidad: al reconectar con otro id, se reconoce por identidad. Prueba Robolectric: reconexión id 7 → 23.
- **Indistinguibles:** si hay más de un dispositivo conectado con la misma identidad, estado `ambiguo` y no se captura ninguno; vincular se rechaza (`AMBIGUO`). Sin VID/PID (0:0) se rechaza (`IDENTIDAD_INSUFICIENTE`).
- **Límite conocido:** un teclado de otra marca que informe exactamente el mismo VID, PID y nombre que el lector sería tratado como el lector cuando este no esté conectado. Es improbable y queda documentado.
- Teclas de sistema (atrás, inicio, volumen, encendido, multimedia) nunca se consumen, aunque vengan del lector.
- No se abren ni reclaman interfaces USB: sólo se observan eventos de entrada que Android ya entrega a la app. La impresora no se toca.

## Comportamiento definido
| Situación | Resultado |
|---|---|
| APK < 1.3.0 o navegador | `disponible:false` (`apk_anterior`/`navegador`); ruta web y ajustes de siempre. |
| APK 1.3.0 sin vincular | Igual que hoy (ruta web). Pantalla ofrece Vincular lector. |
| Lector vinculado conectado | Captura nativa; F9 no necesario; POS muestra "Lector vinculado conectado." |
| Desconexión durante lectura | Lote `desconexion` descartado; aviso "Lector vinculado desconectado: revise el cable USB." (evidencia de Android). Ruta web vuelve a estar activa. |
| Reconexión (otro deviceId) | Captura automática otra vez; la siguiente lectura completa funciona. |
| Reinicio de app/terminal | Vínculo persistente; la captura vuelve cuando la web llama `iniciar()`. |
| Pago, diálogo, caja cerrada, otra pantalla | La lectura se consume y se ignora: no escribe, no agrega, no confirma. |
| Dos dispositivos idénticos | `ambiguo`: no se captura; aviso en POS y Configuración. |
| Lector desactivado en Ajustes avanzados | Las lecturas se consumen y se ignoran (no escriben basura en campos). |

## Dispositivos y protocolos soportados
| Modo / dispositivo | Estado |
|---|---|
| USB-HID modo teclado + Enter (CR) al final, prefijo ninguno/F9/F7 | **Soportado** (probado en software y framework emulado; falta prueba física). |
| Terminador Tab u otro distinto de Enter | No soportado: la lectura se rechaza con mensaje. |
| USB CDC/COM (serie), HID POS, SNAPI/OPOS, lectores con controlador | No soportados. |
| Bluetooth en modo teclado (HID) | Misma ruta (`InputDevice` externo), **no probado**. |
| Steren COM-595 | Manual V5.0: USB-HID y CR por defecto, F7 opcional, Code 128 → compatible por protocolo sin reprogramarlo. **Sin prueba física.** |
| Vorago BCS-201 | Ficha: USB alámbrico y Code 128; HID y terminador no documentados. La vinculación lo comprobará (si no envía Enter, la pantalla lo dice). **Sin certificación.** |
| Zebra DS2208 USB | Manual: USB Keyboard HID y Enter programables (de fábrica HID + Enter) → compatible; F9 no necesario. Más caro; no es requisito. |
- El idioma del teclado físico en Android debe coincidir con el del lector (EE. UU. por defecto en los lectores). Dígitos y letras coinciden en es/EE. UU.; símbolos como `-` pueden cambiar. Los códigos CF del POS y EAN/UPC son alfanuméricos/numéricos.
- Un lector láser necesita código impreso; la etiqueta de prueba se imprime desde la misma pantalla.

## Selector de impresora
- APK 1.3.0: `listarDispositivosUSB` añade `tipo` (`impresora`, `propietaria`, `lector_teclado`, `otro`) y `seleccionable`. `conectarUSB` nunca abre un dispositivo no seleccionable: si la elección guardada es un lector, usa la impresora conectada y lo avisa (mismo patrón que "elegida no conectada").
- APK anterior: la web sólo habilita dispositivos con interfaz de clase impresora; esa versión imprime con DantSu 3.4.0, cuyo `findPrinterInterface` sólo acepta clase 7, así que nada que funcionara queda excluido.
- La impresora de clase 7 sigue exactamente por `UsbConnection` de DantSu. `UsbBulkConnection` sólo se usa para clase propietaria 0xFF (antes nunca podía imprimir); no se probó con una impresora física de ese tipo.
- Tickets: sin cambios en componentes de ticket, `print.js`, `confettiPrinter.js` ni `colaImpresion.js`. `printTicket.js` sólo muestra el mensaje exacto del aviso de impresora.

## APK 1.3.0
- `versionCode 5`, `versionName 1.3.0`, mismo `applicationId com.mhastral.confettipos`, mismo `server.url` (alias de `apk/capacitor`).
- Compilado en este entorno: `app-release` **sin firmar**, alineado (`zipalign -c` OK), SHA-256 `e347e050b2d9050f8fa52414fefc5ed35cfad17d5b0cd3392b41d9ed3ab6c29d` (compilado desde el árbol de este commit; el registro del commit está en CHANGELOG).
- No se generó ni se usó ninguna llave. **Debe firmarse con la llave del APK instalado**; con otra llave Android exige desinstalar y se perderían sesión, ajustes locales e intenciones de cobro.
- Firmar (Miguel): `apksigner sign --ks <su-keystore> --ks-key-alias <su-alias> --out ConfettiPOS-1.3.0.apk ConfettiPOS-1.3.0-vc5-release-SIN-FIRMAR.apk` y `apksigner verify --print-certs ConfettiPOS-1.3.0.apk`; comparar el certificado con el del APK 1.1.x guardado. Alternativa: Android Studio → Build → Generate Signed APK sobre esta rama.
- Instalar como actualización (abrir el APK en la terminal o `adb install -r`). **Si Android dice que hay conflicto de firma, detenerse: no desinstalar.**
- Recompilar: `npx vite build && npx cap sync android`, luego `./gradlew assembleRelease` (requiere Android SDK 36).

## Pruebas y evidencia
### Software (Node/Chromium, servicios sintéticos)
- `npm run build`: exit 0 (lint 0 errores, 557 diagnósticos de tipos históricos y ninguno nuevo, todas las suites de calidad).
- `scanner_native_verify` (en `test:barcodes`): 12/12. Contra `a447a91` (`--baseline`): 10 fallan; pasan sólo la invariante de F7 web y el clasificador nuevo.
- `scanner_native_browser`: 15/15 con POS, cobro real del arnés, vinculación y selector de impresora; con `CONFETTI_QA_NATIVE_BASELINE=1` (código de `a447a91`) fallan 15/15.
- Repetidas y verdes: scanner_config_browser 11/11, scanner_config_visibility_browser, barcodes_browser_verify, barcodes_reauditoria_browser, barcodes_segunda_auditoria_browser 4/4, barcodes_auditoria_profunda_browser 15/15, ticket_abonado_verify 40/0, ticket_pastel_base_limpia_verify 21/0, impresion_avance_corte_verify 25/0, impresion_banco 44/0, fase4_raster_bandas_sim, barcodes_decode_verify (ZXing: PNG 1000/384/576 y 14 etiquetas PDF).
### Emulación Android (JVM; framework Android 12 / API 31 de Robolectric)
- `./gradlew testReleaseUnitTest testDebugUnitTest`: 35 pruebas, 0 fallos.
- `ScannerCoreTest` (20): HID+Enter, tres disparos, teclado humano/virtual/interno, sistema, reconexión, desconexión, id reutilizado, ambigüedad, gen, inactividad, Enter doble, tecla sostenida, límite, vinculación, recarga.
- `ConfettiScannerActivityTest` (4): `MainActivity` real con Bridge de Capacitor, layout sustituido y plugins; lector y teclado como `InputDevice`; teclas por `dispatchKeyEvent` y por pre-IME; vinculación, persistencia, reconexión con otro id, ambigüedad, reinicio de actividad, recarga del WebView, protocolo incompatible, inactividad.
- `ConfettiScannerAndroidTest` (3) y `UsbClasificacionTest` (7).
- Defectos encontrados por esta emulación y corregidos: listener de recarga perdido; `load()` que podía abortar el registro del plugin; teclas de sistema dependientes sólo de `isSystem()`.
- No hubo emulador Android completo (sin KVM en el contenedor): no se ejecutó el WebView real ni un kernel con USB.
### Hardware físico
- **No realizado.** Sin terminal, lector ni impresora en este entorno.

## Lista mínima de comprobaciones físicas (Miguel)
1. Firmar con su llave, instalar como actualización y confirmar en Ajustes → Apps que la versión es 1.3.0 sin pérdida de sesión ni ajustes de impresora.
2. Conectar impresora y lector a la vez. Configuración → Operación → Impresora y cajón → Detectar impresoras USB: el lector aparece deshabilitado como "Lector o teclado: no es impresora"; la impresora sigue elegida. Probar impresión.
3. Configuración → Escáner → Vincular lector → tres lecturas de la etiqueta de prueba impresa → "Lector vinculado y guardado en esta terminal".
4. Nueva venta: un producto con código; el mismo tres veces (3 piezas); con el cursor en Buscar producto el texto no cambia; con el cobro abierto la lectura no escribe en el importe ni cobra.
5. Desconectar el lector: aparece "Lector vinculado desconectado"; reconectarlo y escanear de nuevo.
6. Cerrar la app por completo y abrirla: escanear sin volver a vincular.
7. Imprimir un ticket de venta y uno de pastel y compararlos con los actuales (logo, total, abonos, saldo, entrega, corte).
8. Si se ofrecerá: Descargar PNG/PDF de una etiqueta.
Cualquier fallo mantiene la entrega pendiente.

## Archivos
Android: `ConfettiScannerPlugin.java`, `scanner/ScannerCore.java`, `scanner/UsbClasificacion.java`, `ConfettiWebView.java`, `res/layout/capacitor_bridge_layout_main.xml`, `UsbBulkConnection.java`, `MainActivity.java`, `ConfettiPrinterPlugin.java`, `app/build.gradle`, pruebas en `app/src/test/`.
Web: `src/native/confettiScanner.js`, `src/native/confettiScannerPlugin.js`, `src/native/printerSelection.js`, `src/lib/scannerCapture.js`, `src/lib/barcodeFrame.js`, `src/lib/scannerPairing.js`, `src/lib/barcodes.js`, `src/components/barcodes/useNativeScanner.js`, `src/components/configuracion/EscanerCodigosSection.jsx`, `src/components/configuracion/ImpresoraCajonAppSection.jsx`, `src/pages/POS.jsx`.
Pruebas: `scripts/scanner_native_verify.mjs`, `scripts/scanner_native_browser.mjs`, opción nativa de `scripts/barcodes_browser_fixture.mjs`.
Guía para Abel: `docs/GUIA_ABEL_ESCANER.md`.

# Auditoría independiente y configuración de escáner — 2026-11-02

Base de diagnóstico: `189b580fd10d1cf98a7b7175c184781608b6579a`, consultada en Git remoto; producción y apk/capacitor coincidían al iniciar. El checkout inicial del entorno era el import Base44 de main: se cambió al checkout de producción limpio antes de evaluar. No confundir sus fallos antiguos con esta auditoría.

## Diagnóstico acumulado antes de modificar implementación

| ID | Gravedad | Archivo / causa | Reproducción y consecuencia |
|---|---|---|---|
| S01 | Alta | barcodeFrame.js procesa F9 antes de event.repeat | F9, ABC, F9 con repeat=true, 0012345, Enter consulta 0012345: se acepta un sufijo. Reproducido ejecutando el motor anterior. |
| S02 | Alta | useBarcodeScanner.js destruye parser/listener al desmontarse | Iniciar F9 + ABC, salir y volver a venta, terminar con 0012345 + Enter; un parser nuevo acepta el sufijo en otra pantalla. El motor aislado reproduce la pérdida; requiere regresión adicional en navegación real. |
| S03 | Alta | BarcodeProductPanel.jsx usa entrada normal y Enter directo, sin el parser de venta | En el formulario real: F9, BAD, esperar 400 ms, 0012345, Enter envía asignar_codigo_producto_pos con BAD0012345. Reproducido con fixture aislado Chromium; no escrituras reales. |
| S04 | Media, funcionalidad ausente | No existen ajustes locales ni diagnóstico compartido | No se puede desactivar por tablet, ajustar tiempos ni comprobar tres lecturas sin operar el catálogo. Se añade dentro de Configuración conservando permisos. |

Primera pasada: lectura de contratos/documentación vigente, generación/reservas SQL, lector/cola/contexto, carrito/recuperación, panel, PDF/PNG, dispatcher térmico y fuente Android. La suite existente test:barcodes pasó antes de reparar; no cubría S01–S03. Segunda pasada: foco, modales, terminadores, cambio de pantalla/configuración y ausencia de hardware; se consolidó la lista anterior antes de editar implementación. Las rondas posteriores y su evidencia se registran más abajo; aprobar suites antiguas no cierra por sí solo estos hallazgos.

## Acceso y límites iniciales

La política de red bloqueó developer.chrome.com, developer.android.com, api.github.com, Vercel y Supabase con CONNECT 403. Se guardaron destinos en el borrador de red, sin afirmar aplicación de esos cambios. No existen bindings de Supabase/Vercel en el entorno inspeccionado; no se solicitan contraseñas ni se imprime autenticación. Git remoto sí funciona mediante proxy existente.

Se consultaron fuentes oficiales alojadas en GitHub, permitidas por la política: README vigente de WHATWG/WICG WebHID, fuente publicada de la guía Chrome WebHID y AOSP InputManager/InputDevice. WebHID excluye Android y WebView; colecciones de teclado están protegidas en Chrome. La presencia de navigator.hid/usb no identifica un escáner. Android InputManager puede enumerar fuentes y observar altas/bajas pasivamente; nombre/vendor/product pueden faltar y SOURCE_KEYBOARD no demuestra que sea lector. Un plugin pasivo nuevo necesitaría compilar, firmar e instalar otro APK. No reclamar interfaces USB ni usar el plugin de impresora para detectar lectores. No se añade puente nativo sin poder verificar su binario.

Fuentes consultadas:
- https://developer.chrome.com/docs/capabilities/hid (fuente oficial: https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/articles/hid/index.md).
- https://github.com/whatwg/hid y https://github.com/WICG/webhid/blob/main/README.md (estado de Android/WebView).
- https://developer.android.com/develop/connectivity/usb/host (página directa bloqueada; no se afirma haberla descargado).
- https://github.com/aosp-mirror/platform_frameworks_base/blob/master/core/java/android/hardware/input/InputManager.java
- https://github.com/aosp-mirror/platform_frameworks_base/blob/master/core/java/android/view/InputDevice.java

## Implementación y reauditoría

S01: F9 con autorepeat se consume sin reiniciar el buffer; un segundo disparo completo deliberado sigue contando. S02: scannerCapture conserva un único parser por documento, instalado desde App y compartido por rutas/consumidores; desmontar o cambiar propietario invalida la lectura sin liberar su sufijo. También invalida foco, visibilidad, apertura/cierre de diálogos y ajustes, y descarta consultas pendientes. S03: las lecturas F9 del panel usan ese mismo parser y tiempo máximo; una entrada manual permanece manual y se valida completa al guardarse. S04: sección local dentro de Configuración → Operación, bajo los permisos existentes, con guardado explícito, perfil, tiempo, restauración, ayuda y diagnóstico aislado.

La primera configuración conserva el modo compatible anterior y lo explica; no cambia silenciosamente lectores en uso. La recomendada explícita exige F9 + Enter, 250 ms. Enter es el único terminador admitido; Tab/atajos/tiempos interrumpidos ponen en cuarentena el resto. Desactivar no borra productos ni desactiva venta táctil. Una trama F9 ya reconocida sigue consumiéndose hasta su fin aunque se desactive, para que su cola no escriba en importes. Código incompleto no se transforma en otro código por recorte.

Persistencia: clave local versionada confetti_scanner_v1, sin Supabase, por instalación/origen (Chrome y alias APK tienen almacenes distintos). Configuración corrupta desactiva el lector y pide restaurar; almacenamiento denegado no muestra éxito de guardado. Guardar cambia la configuración efectiva de todos los consumidores locales y descarta lectura/consultas anteriores. Una edición todavía sin guardar no modifica el motor. Configuración de impresora no se toca.

Diagnóstico: no importa servicios de catálogo/pago ni asigna códigos; comparte parser con ventas. CFDIAG0001 no pertenece al formato generado CF + ocho cifras y el RPC normal prohíbe asignar libremente prefijos CF. La etiqueta se imprime por printBarcodeLabel, igual que las etiquetas de catálogo. Se ven código completo, longitud, prefijo, Enter y mayor intervalo. Historial limitado a 30 eventos, Enter doble/tecla sostenida/evento repetido señalados. Tres tramas iguales se cuentan como tres: dos tramas completas que duplique el hardware son indistinguibles de dos disparos, por lo que no se deduplican por contenido/tiempo. Una declaración de prueba física requiere intervención explícita de la persona, no se persiste y no identifica hardware. isTrusted no prueba origen físico (la automatización de navegador también lo puede producir).

Segunda pasada de implementación: inicio de app sin visitar POS, cambios de configuración durante trama y durante consulta, desactivación dentro de campo, navegación, pérdida/recuperación de pago, etiqueta diagnóstica y persistencia. Se corrigió durante desarrollo la instalación inicial del motor y se comprobó que no captura teclado manual sin propietario. No se identificaron otros defectos funcionales distintos de S01–S04 en esta pasada; no significa ausencia universal de fallos.

## Uso por una empleada

1. Abrir Configuración → Operación → Escáner de códigos de barras.
2. Conectar el lector/receptor (o enlazar Bluetooth en Android) y usar su manual para modo teclado, F9 antes del código y Enter después. El POS no programa el hardware.
3. Pulsar Restaurar configuración recomendada y Guardar ajustes del escáner.
4. Abrir Probar escáner, tocar Zona de prueba y hacer tres disparos sobre la misma etiqueta. Deben aparecer tres lecturas completas con el código entero. No se vende nada en esta prueba.
5. Si falla, revisar el mensaje, alimentación, idioma, prefijo/terminador y tiempos. Repetir desde F9; Esc cancela. Terminar prueba y volver a Nueva venta.

## Compatibilidad y evidencia

| Entorno / dispositivo | Soporte implementado | Automatizado | Prueba física / límites |
|---|---|---|---|
| Chrome de escritorio + USB HID teclado | Tramas F9 + Enter, ajustes y diagnóstico; también modo compatible anterior | Chromium real: parser, foco/importes, ráfagas, repetición, navegación, catálogo y pagos sintéticos | No realizada; requiere lector/modelo/manual, verificar idioma y una trama por disparo |
| Receptor inalámbrico USB en modo teclado | Mismo recorrido de teclado; el receptor no prueba enlace con el lector | Mismo motor, sin simular enlace inalámbrico | Reconexión, batería, alcance y buffer del receptor pendientes |
| Bluetooth en modo teclado | Entrada de teclas del SO; emparejamiento desde el SO | Motor común; no se simula descubrimiento Bluetooth | Emparejamiento/reconexión y teclado Android pendientes |
| Chrome Android / APK WebView existente | Código web usa keydown estándar; no reclama interfaces USB ni impresora | Misma interfaz a 360 px y fixtures con borde nativo de impresión simulado | No hay tablet/APK instalado accesible; F9 entregada al WebView, OTG, reconexión y papel requieren prueba en sitio |
| WebHID / WebUSB como detector universal | No implementado ni prometido: API presente no significa lector accesible, teclado protegido; WebHID no está en Android/WebView | Se verifica que UI no afirma conexión por API/lecturas | Ninguna afirmación de conectado, desconectado o permiso denegado sin observación real |
| Android InputManager nativo | Investigación: enumera fuentes/altas/bajas sin apropiarse USB; no identifica por sí solo escáner frente a teclado | No se añadió plugin ni se atribuye una prueba Java a Chromium | Un futuro puente pasivo requiere APK nuevo compilado, firmado con clave existente e instalado; después validación física |
| Serie, propietario, controlador especial, modo incompatible | No compatible por esta ruta genérica; requiere integración específica | No implementado | Hace falta modelo/protocolo/documentación verificable |

Esta entrega del escáner no modifica Java ni exige APK nuevo para sus ajustes/diagnóstico web. El puente ConfettiFiles ya documentado sigue necesitando un APK nuevo para guardar PNG/PDF dentro de versiones que no lo tengan. No se modifica server.url ni se usa el canal web para aparentar instalación nativa. No se dispone del binario realmente instalado: no se certifica su identidad por leer sólo capacitor.config.ts.

## Pruebas ejecutadas

- Antes de reparar: test:barcodes verde; motores anteriores reprodujeron reinicio por F9 sostenido y pérdida de origen; formulario Chromium anterior envió BAD0012345 después de pausa de 400 ms.
- scanner_config_verify: configuración persistente, valores crudos inválidos, almacenamiento denegado, autorepeat, propietario/configuración, una escucha y evento idéntico. --baseline carga el motor 189b580 y falla por aceptar el sufijo 0012345.
- scanner_config_browser con CONFETTI_QA_SCANNER_BASELINE=1 CASES=S01,S02,S03: las tres regresiones fallan contra los componentes originales. La comparación usa Git, sin modificar el checkout ni acceder a producción.
- Suites anteriores: barcodes_browser_verify, barcodes_reauditoria_browser, barcodes_segunda_auditoria_browser y barcodes_auditoria_profunda_browser. Conservan componentes reales y prueban recuperación antes/después de commit, recarga, caja cerrada, intento malformado, rechazo definitivo y borrador ajeno, con exactamente los parámetros originales. No son cobros reales.
- Pruebas del motor/SQL/cola siguen en test:barcodes y la nueva suite local entra en la misma puerta de build. No se cambió deuda de tipos, scripts previos ni validaciones para volver verde una regresión.
- Incidencias del arnés: la barra de navegación del fixture quedaba cubierta por POS; se elevó sólo esa barra. La primera ejecución mezcló el formulario de pago real con la suite que espera un diálogo simulado; se corrigió la invocación y se repitió. Un locator de diagnóstico esperaba rol region ausente: se añadió el rol accesible. No se cuentan como hallazgos previos ni como pruebas aprobadas hasta repetir.

Los resultados finales de build, decoder y publicación se consignan al cierre de esta sesión, después de ejecutar sus verificaciones. No hay nuevas migraciones ni cambios a Caja, efectivoEsperado, impresión nativa, RPC financieras o permisos SQL. La verificación de la base viva permanece separada de la ejecución de las migraciones en PGlite.

## Cierre local y bloqueo externo

Build final: `npm run build` terminó con exit 0, incluyendo lint cero, puerta de tipos sin nuevos diagnósticos (597 históricos) y todas las suites quality. La suite nueva de navegador pasó sus nueve casos (S01/S02/S03, guardado/recarga/inválidos/restauración/desactivación, diagnóstico/tres tramas, cambio durante lectura, cola de lectura desactivada, respuesta demorada tras cambio y formulario de pago). Las cuatro suites anteriores de navegador pasaron, incluidos los 15 casos de la auditoría profunda. ZXing independiente decodificó PNG a 1000/384/576 px y las 14 etiquetas de las dos páginas carta. Ninguna de estas pruebas constituye prueba física. No se ejecutaron scripts de auditoría viva que requieren .env/credenciales del negocio.

El 2 de noviembre el estado aplicado del entorno aún mostraba cero dominios personalizados, cero secretos y cero variables de servicio. No se pudieron comprobar Supabase, deployments Vercel, target production ni bytes servidos. Se guardó en el borrador la red necesaria y requisitos VERCEL_TOKEN/SUPABASE_ACCESS_TOKEN para consultas autorizadas; sólo ingresar valores en configuración segura. Guardar el borrador no los aplica ni publica la app. Se actualizaron también las instrucciones del entorno, que antes correspondían a main/Base44.

Entrega local en rama `feat/configuracion-escaner-20261102`, basada en la rama operativa. La publicación operacional de esta entrega permanece bloqueada hasta contar con acceso de verificación: no se avanzan producción ni APK sin las comprobaciones exigidas. Ambas ramas estaban sincronizadas al iniciar; la consulta Git permite volver a verificarlo, pero no prueba qué bundle sirve Vercel ni qué tablet lo cargó. Este registro no da por aplicado ningún SQL adicional (no hay migración en esta entrega).

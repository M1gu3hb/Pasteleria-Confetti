# FILE_MAP — contratos vigentes

## Pedidos anteriores y paginación

src/pages/PedidosPastel.jsx: vistas y navegación obvia; src/lib/pedidosAnteriores.js: lector validado y contador Actuales de Sidebar; src/utils/situacionPedido.js: etiquetas; PedidoPastelCard/DetalleDialog/RegistrarPagoDialog: tarjetas y retiro de entrega manual de personalizados. CorteHistorialList/CortesRecientesDashboard: historial compartido; Registros/useListaPaginada/Ventas: cargar más y alcance. Nueva migración listar_pedidos_pastel_pos. scripts/pedidos_anteriores_sql_verify.mjs, pedidos_historial_cliente_verify.mjs e historial_integracion_verify.mjs integran quality/build. historial_browser_fixture.mjs genera sólo una prueba aislada con datos sintéticos y sin conexión al negocio; no se incorpora al build.

Revisado el 2026-10-17.

Evidencia: evidenciaFinanciera.js, EvidenciaPagoDialog.jsx, migración evidencia_financiera_pos y suites evidencia_financiera/evidencia_cliente. Dinero: operacion_pedido_tx y migraciones operativas; historial: historial_operativo_pos; reimpresión: cargarTicketVenta/TicketViewerDialog; impresión: colaImpresion/printTicket; importación: importacionesDisponibles/importExecutors; conciliación: EstadoConciliacion; web: envioPedidoWeb y ambos formularios. Suites: operacion_*, autoridad_*, recuperacion_auth, pendientes_sql, pendientes_cliente, voz_edge; puerta de build: calidad_types_verify con fixtures/typecheck_deuda_conocida.json.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](FILE_MAP_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

- src/lib/barcodeCore.js: tramas, cola y carrito inmutable.
- src/lib/barcodes.js: límite RPC, errores y timeout de consulta.
- src/lib/barcodeLabels.js / barcodeExport.js: Code128 vectorial, PNG, PDF carta e impresión/exportación.
- src/components/barcodes/: panel, imagen, PDF y hook de teclado.
- android/app/src/main/java/com/mhastral/confettipos/ConfettiFilesPlugin.java: ACTION_CREATE_DOCUMENT sólo PNG/PDF.

## Reauditoría de etiquetas y escáner

Las etiquetas térmicas reutilizan el dispatcher de tickets de venta: una sola entrada en cola y el mismo ciclo de conexión, avance, corte y desconexión. Nunca anidar encolarImpresion con conImpresora (que ya encola): interbloquea toda impresión. En navegador usan printDocument térmico 58/80; el PDF por lotes conserva carta. Un código requiere gráfico aunque los tickets estén en modo texto.

Escaneo conserva precios por snapshot: un precio nuevo crea otra línea; contexto de consultas incluye sucursal, cajero y corte. Asignación valida el código completo (sin recortarlo). Para aislar el lector de campos monetarios/búsqueda configurar F9 como prefijo y Enter como terminador; sin prefijo, HID se comporta como un teclado común. El soporte se prueba con el formulario de pago real, la configuración física se verifica en sitio. Endurecimiento SQL verifica alcance anterior/destino y NULL en arreglos. Registro de hallazgos y pruebas: docs/REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md.

## Tramas completas y etiquetas vigentes

El lector conserva su parser al cambiar de modo/sucursal/cajero/corte. Una trama parcial mantiene su contexto original y su final se descarta si éste cambió; Escape cancela y F9 abre una trama nueva. Cobro/orden móvil/venta libre esperan también la trama en curso, además de RPC pendientes. F9 limpia el campo de asignación para impedir concatenar otra etiqueta con texto anterior. PDF verifica códigos y nombres vigentes antes de descargar; una modificación exige regenerar, sin reasignar desde exportación. Respuestas RPC rechazan precios vacíos/booleanos y alcances de tipo incorrecto. Evidencia y reproducción: docs/SEGUNDA_REAUDITORIA_BARRAS_2026-11-01.md.

- src/lib/barcodeFrame.js: estado de trama compartido con el hook, origen estable y descarte por transición.
- scripts/barcodes_frames_verify.mjs: motor real; forma parte del build.
- scripts/barcodes_segunda_auditoria_browser.mjs: cuatro regresiones de esta ronda y comparación con la revisión anterior.

## Auditoría profunda de barras

- src/lib/recuperarVentaPendiente.js: recuperar sólo la solicitud durable válida del cajero/sucursal.
- scripts/barcodes_auditoria_profunda_browser.mjs: regresiones acumulativas, comparación con versión anterior y cobro simulado antes/después de commit/recarga.
- scripts/barcodes_profunda_modelo_verify.mjs: casos negativos de identidad, controles y reloj; admite --baseline.
- scripts/barcodes_profunda_matriz_verify.mjs: modelo independiente con semilla configurable SEED.
- supabase/migrations/*_codigo_canonico.sql: normalización sin alterar identidad interna.
- docs/AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md: ocho hallazgos, reparaciones, rondas, pruebas y límites.

## Configuración y diagnóstico del escáner

- src/lib/scannerConfig.js: ajustes versionados locales, validación, eventos y persistencia.
- src/lib/scannerCapture.js: único listener/parser, arbitraje, timeout y cuarentena entre rutas.
- src/components/barcodes/useBarcodeCapture.js y useScannerSettings.js: suscripción React compartida.
- src/components/configuracion/EscanerCodigosSection.jsx: ajustes, prueba sin datos y ayuda en Operación.
- scripts/scanner_config_verify.mjs: persistencia/motor/cambios/negativa con versión anterior; integrado en test:barcodes.
- scripts/scanner_config_browser.mjs: pantallas y teclado Chromium reales, servicios sintéticos; comparación S01–S03 anterior.
- docs/AUDITORIA_CONFIG_ESCANER_2026-11-02.md: hallazgos, evidencia, matriz y límites.


## Integración de configuración del lector

scripts/scanner_config_browser.mjs incluye assignment_focus y assignment_focus_tail para selección de producto y cancelación de tramas entre campos. Ver AUDITORIA_CONFIG_ESCANER_2026-11-02.md.


- scripts/scanner_config_visibility_browser.mjs: Configuración/ruta/Tabs/escáner reales; pestaña, enlace directo, roles y diagnóstico. BASELINE=1 comprueba la ausencia de pestaña en dade1cc.
- docs/ACCESO_ESCANER_2026-11-03.md: revisión por sección no encontrada, publicación y límites del diagnóstico sin pantalla del dispositivo.

- vercel.json: build y fallback SPA a index.html para navegación directa y recarga de BrowserRouter.


## Lector nativo (APK 1.3.0)

Android: ConfettiScannerPlugin.java, scanner/ScannerCore.java, scanner/UsbClasificacion.java, ConfettiWebView.java, res/layout/capacitor_bridge_layout_main.xml (sustituye al de Capacitor), UsbBulkConnection.java; pruebas JVM/Robolectric en android/app/src/test. Web: src/native/confettiScanner.js (puente), confettiScannerPlugin.js (frontera mockeable), printerSelection.js; src/lib/scannerPairing.js; src/components/barcodes/useNativeScanner.js. Pruebas: scripts/scanner_native_verify.mjs (en test:barcodes) y scripts/scanner_native_browser.mjs (CONFETTI_QA_NATIVE_SCANNER en barcodes_browser_fixture).

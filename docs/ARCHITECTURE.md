# ARCHITECTURE — contratos vigentes

## Lectura paginada de pedidos

listar_pedidos_pastel_pos ejecuta clasificación, filtros y orden fecha/hora/ID en el servidor bajo RLS. useInfiniteQuery carga 50 pedidos por página, cursor ligado a sucursal/vista/filtros y límite de creación. No es el snapshot financiero: es una lista viva; editar fecha/hora/pago durante la navegación puede modificar la posición y el refresco vuelve a recorrer las páginas. Los informes financieros conservan historial_operativo_pos y sus garantías. Las lecturas fallidas se muestran, nunca se presentan como historial completo. Actuales y Anteriores conservan polling de 15 s; Historial completo no repite automáticamente todas las páginas cargadas cada 15 s. El badge Sidebar consulta la misma RPC en Actuales con límite 1 y utiliza el total completo, compartiendo el prefijo de invalidación de pagos.

CorteHistorialList se comparte en Caja/Dashboard y pagina por offset hasta página vacía (el servidor puede reducir el tamaño). Registros conserva Cargar más al buscar sin coincidencias en las páginas cargadas. Un cambio de sucursal oculta inmediatamente listas y detalles previos; Registros también filtra los gastos por sucursal antes de informes y exportación. Ventas sigue leyendo todo por páginas para calcular totales completos; Cargar más sólo dosifica tarjetas. No afirmar que esto elimina todo coste de consultar muchos años.

Revisado el 2026-10-17.

El cliente usa adapters sobre tablas/RPC. Escrituras financieras son servidor/transacción; lecturas financieras completas son snapshots con RLS. Pedido web usa intención/hash/cuota en app_private; voces usan autorización de objeto y lease antes de IA. Impresión nativa comparte una cola completa con cajón y cortes. Storage público aún exige fase de lectores firmados antes de privatizar.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](ARCHITECTURE_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

## Reauditoría de etiquetas y escáner

Las etiquetas térmicas reutilizan el dispatcher de tickets de venta: una sola entrada en cola y el mismo ciclo de conexión, avance, corte y desconexión. Nunca anidar encolarImpresion con conImpresora (que ya encola): interbloquea toda impresión. En navegador usan printDocument térmico 58/80; el PDF por lotes conserva carta. Un código requiere gráfico aunque los tickets estén en modo texto.

Escaneo conserva precios por snapshot: un precio nuevo crea otra línea; contexto de consultas incluye sucursal, cajero y corte. Asignación valida el código completo (sin recortarlo). Para aislar el lector de campos monetarios/búsqueda configurar F9 como prefijo y Enter como terminador; sin prefijo, HID se comporta como un teclado común. El soporte se prueba con el formulario de pago real, la configuración física se verifica en sitio. Endurecimiento SQL verifica alcance anterior/destino y NULL en arreglos. Registro de hallazgos y pruebas: docs/REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md.

## Tramas completas y etiquetas vigentes

El lector conserva su parser al cambiar de modo/sucursal/cajero/corte. Una trama parcial mantiene su contexto original y su final se descarta si éste cambió; Escape cancela y F9 abre una trama nueva. Cobro/orden móvil/venta libre esperan también la trama en curso, además de RPC pendientes. F9 limpia el campo de asignación para impedir concatenar otra etiqueta con texto anterior. PDF verifica códigos y nombres vigentes antes de descargar; una modificación exige regenerar, sin reasignar desde exportación. Respuestas RPC rechazan precios vacíos/booleanos y alcances de tipo incorrecto. Evidencia y reproducción: docs/SEGUNDA_REAUDITORIA_BARRAS_2026-11-01.md.

## Alcance de orden e intención durable

POS guarda items y scope de sucursal/cajero juntos. Un scope distinto bloquea editar/agregar/cobrar sin descartar la orden. Recuperación explícita valida RPC/contexto y reutiliza intencionOperacion/intencionPersistente: pago/detalle/clave originales, ticket canónico y conservación de borradores ajenos. No ejecuta efectos del legado restaurante usando el carrito nuevo. BarcodeProductPanel relee después de invalidar consultas; sincronizar nombre no reinicia asignación. Tramas tienen reloj monótono y cuarentena de controles conocidos. Detalle: AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md.

## Motor de escáner local compartido

scannerCapture mantiene el parser por documento desde App y arbitra consumidores de venta, asignación y diagnóstico. Cambiar propietario, foco/modal, visibilidad o ajustes invalida tramas sin convertir su cola en otra lectura. useBarcodeScanner conserva la cola de consultas de venta y la limpia al invalidar. scannerConfig versiona ajustes por localStorage/origen, sin base compartida; fallo de lectura desactiva, fallo de escritura se informa. Diagnóstico importa sólo render/impresión y motor, sin servicios financieros/catálogo. No se reclaman interfaces de teclado ni se añaden plugins Android.


## Integración de configuración del lector

scannerCapture resuelve el propietario entre consumidores activos por inputRef === document.activeElement; sin un campo enfocado conserva el propietario activo. El cambio de foco sincroniza propietario e invalida tramas, sin convertir su cola en otra asignación. Ver AUDITORIA_CONFIG_ESCANER_2026-11-02.md.


## Acceso a la configuración del escáner

El panel tiene pestaña Escáner junto a Operación; /configuracion?seccion=escaner permite abrirlo directamente tras acceso de dueño. No duplicarlo al final de Operación ni ampliar permisos de la ruta. Ver ACCESO_ESCANER_2026-11-03.md para prueba de la pantalla completa y límites de comprobación de dispositivos.

El despliegue Vite requiere la reescritura SPA de vercel.json hacia /index.html para enlaces directos/recargas de las rutas internas. Verificar /configuracion?seccion=escaner y assets/SW en vivo, además del HTML raíz. Las guardias React y RLS de Supabase siguen aplicándose.


## Lector nativo (APK 1.3.0)

Teclas del lector vinculado: `ConfettiWebView.dispatchKeyEventPreIme` / `MainActivity.dispatchKeyEvent` → `ConfettiScannerPlugin` (identidad por `InputDevice`, `ScannerCore` agrupa hasta Enter o corte) → evento `lectura` con `gen` → `scannerCapture` → `barcodeFrame` en modo nativo → cola de `useBarcodeScanner`. Parser web pasivo mientras `capturando`. Vinculación en SharedPreferences del APK; ajustes de perfil/tiempo siguen en localStorage. Impresora: `UsbClasificacion` decide qué es seleccionable; clase 7 por DantSu, 0xFF por `UsbBulkConnection`. Ver docs/LECTOR_NATIVO_ESCANER_2026-11-06.md.

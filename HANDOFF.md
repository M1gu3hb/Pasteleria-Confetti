# HANDOFF — contratos vigentes

## Pedidos anteriores e historial (2026-10-17)

Personalizados no ofrece Entregado ni la pregunta al liquidar. La fecha de entrega se conserva. La vista del servidor exige saldo conocido liquidado y dos días de margen desde la entrega (calendario CDMX); comienza Anteriores en la fecha mayor entre entrega + 2 y pago completo. Tras 30 días pasa al Historial completo. Son clasificaciones de lectura, nunca borrados ni cambios de estado/fecha real. Los antiguos Entregados también se clasifican por saldo/fecha. Cancelados siguen consultables en Historial.

Sucursal en RPC, RLS, cache, respuesta y detalle. Dueño/pastelero conservan alcance global deliberado; terminal/administrador sólo su sucursal. Buscar abre Historial completo conservando sucursal. Pedidos/Caja/Dashboard/Registros ofrecen Cargar más con nombre explícito; Ventas limita tarjetas sin truncar totales. Ver docs/AUDITORIA_PEDIDOS_HISTORIAL_2026-10-17.md y npm run test:historial.

El contador del menú usa la misma RPC/vista Actuales (página de una fila y total completo); se invalida con pagos/ediciones. Actuales/Anteriores se refrescan cada 15 s; Historial completo sólo al consultarlo, invalidarlo o reconectar. Registros descarta gastos en caché de otra sucursal antes de informes/exportación. Reauditoría e integración: scripts/historial_integracion_verify.mjs.

## Horario y WhatsApp

compararEntregaPedidos y coincideHorarioEntrega viven en src/utils/horarioPedidos.js. La pantalla mantiene consulta/cache por sucursal; ahora filtra y pagina en el servidor. WhatsApp usa precio_base histórico, no los rangos actuales. No corregir horas AM/PM ni bases históricas por suposición. Ejecutar npm run test:pedidos y build; verificar el alias de la APK, no sólo producción. Ver docs/AUDITORIA_HORARIOS_WHATSAPP_2026-10-11.md.

Revisado el 2026-10-17.

Antes de continuar: leer CLAUDE.md y el informe de reauditoría. Mantener los tres candados de Caja (selección venta/corte, medianoche CDMX y buscador web por sucursal) y efectivoEsperado. Las limpiezas de importaciones no modifican esas reglas. Verificar base y canales antes de actuar, nunca inferir despliegue por documentación.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [docs/REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](docs/REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](docs/REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](HANDOFF_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

## Reauditoría de etiquetas y escáner

Las etiquetas térmicas reutilizan el dispatcher de tickets de venta: una sola entrada en cola y el mismo ciclo de conexión, avance, corte y desconexión. Nunca anidar encolarImpresion con conImpresora (que ya encola): interbloquea toda impresión. En navegador usan printDocument térmico 58/80; el PDF por lotes conserva carta. Un código requiere gráfico aunque los tickets estén en modo texto.

Escaneo conserva precios por snapshot: un precio nuevo crea otra línea; contexto de consultas incluye sucursal, cajero y corte. Asignación valida el código completo (sin recortarlo). Para aislar el lector de campos monetarios/búsqueda configurar F9 como prefijo y Enter como terminador; sin prefijo, HID se comporta como un teclado común. El soporte se prueba con el formulario de pago real, la configuración física se verifica en sitio. Endurecimiento SQL verifica alcance anterior/destino y NULL en arreglos. Registro de hallazgos y pruebas: docs/REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md.

## Tramas completas y etiquetas vigentes

El lector conserva su parser al cambiar de modo/sucursal/cajero/corte. Una trama parcial mantiene su contexto original y su final se descarta si éste cambió; Escape cancela y F9 abre una trama nueva. Cobro/orden móvil/venta libre esperan también la trama en curso, además de RPC pendientes. F9 limpia el campo de asignación para impedir concatenar otra etiqueta con texto anterior. PDF verifica códigos y nombres vigentes antes de descargar; una modificación exige regenerar, sin reasignar desde exportación. Respuestas RPC rechazan precios vacíos/booleanos y alcances de tipo incorrecto. Evidencia y reproducción: docs/SEGUNDA_REAUDITORIA_BARRAS_2026-11-01.md.

## Recuperación y auditoría profunda de barras

Antes de otro cobro, resolver la intención local pendiente mediante Recuperar cobro pendiente. Nunca descartar la clave/pago/detalle originales ni reemplazarlos por el carrito actual. La orden conserva su sucursal/cajero. BarcodeProductPanel relee tras asignación y conserva borrador ante cambio sólo de nombre. Lector usa performance.now(), cuarentena de controles F9 y caracteres canónicos. Tres migraciones de códigos, incluida codigo_canonico, son parte de la suite SQL. Ver docs/AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md; comprobar versión/migraciones/canales en vivo. La prueba física y firma del APK de guardado siguen requiriendo dispositivo.

## Configuración local del escáner

Usar scannerConfig/scannerCapture y useBarcodeCapture, no listeners nuevos por pantalla. El motor vive desde App, conserva cuarentena al navegar y tiene un único propietario entre venta, asignación y diagnóstico. No cambiar ajustes de otras tablets: clave local versionada y origen independiente para Chrome/APK. Perfil recomendado F9 + Enter; modo compatible anterior explícitamente conservado. Los cambios de ajustes invalidan también consultas pendientes. Diagnóstico nunca escribe catálogo ni dinero, no detecta hardware y no certifica una prueba física por eventos isTrusted. Ver docs/AUDITORIA_CONFIG_ESCANER_2026-11-02.md para regresiones y cómo comprobar publicación pendiente/viva.


## Integración de configuración del lector

Revisión de integración: conservar selección de propietario por input enfocado en scannerCapture y cuarentena al cambiar foco. Regresiones assignment_focus y assignment_focus_tail en scanner_config_browser. Consultar los refs y Vercel en vivo para el estado de entrega, no el bloqueo histórico del entorno anterior. Ver docs/AUDITORIA_CONFIG_ESCANER_2026-11-02.md.


## Acceso a la configuración del escáner

El panel tiene pestaña Escáner junto a Operación; /configuracion?seccion=escaner permite abrirlo directamente tras acceso de dueño. No duplicarlo al final de Operación ni ampliar permisos de la ruta. Ver docs/ACCESO_ESCANER_2026-11-03.md para prueba de la pantalla completa y límites de comprobación de dispositivos.

El despliegue Vite requiere la reescritura SPA de vercel.json hacia /index.html para enlaces directos/recargas de las rutas internas. Verificar /configuracion?seccion=escaner y assets/SW en vivo, además del HTML raíz. Las guardias React y RLS de Supabase siguen aplicándose.


## Lector nativo del APK 1.3.0

APK 1.3.0 añade `ConfettiScanner`: el lector USB-HID vinculado en Configuración → Escáner (tres lecturas del mismo código impreso) se captura por `InputDevice` antes del IME/WebView y llega al mismo parser JS; sin F9. APK anteriores y navegador siguen en la ruta web (`disponible:false`). Selector de impresora excluye lectores/teclados HID. El APK se compila sin firmar en este repo: firmar con la llave de Miguel e instalar como actualización (nunca desinstalar). Estado vivo: versión instalada en la terminal (Ajustes → Apps), canal `apk/capacitor` en Vercel y catálogo con `select count(*) filter (where activo and codigo_barras is null) from productos`. Arquitectura, compatibilidad, pruebas y lista física en docs/LECTOR_NATIVO_ESCANER_2026-11-06.md; guía para Abel en docs/GUIA_ABEL_ESCANER.md.


## Aviso de actualización del APK

Las terminales con APK muestran «Actualización pendiente» cuando `public/apk/actualizacion.json` anuncia una versión publicada más nueva que la instalada (APK sin `ConfettiApp` = 1.1.1). APK viejo descarga por Chrome desde `raw.githubusercontent.com`; 1.3.0+ instala desde la app tras verificar firma, versión y huella. Publicar exige APK firmado por Miguel y `scripts/publicar_apk.mjs`. Estado vivo: `git show origin/apk/capacitor:public/apk/actualizacion.json`. Procedimiento y límites: docs/ACTUALIZACION_APK.md.

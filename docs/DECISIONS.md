# DECISIONS — contratos vigentes

## Historial operativo sin entrega manual

Por instrucción de Miguel/Abel se retira Entregado en personalizados. No se inventa entrega física: pagado + fecha pasada sólo organiza la lista. Se eligen dos días de margen y treinta días en Anteriores, contados desde que se cumplen las dos condiciones (pago tardío no desaparece directamente). Sin fecha o saldo conocido no se archiva automáticamente. El archivo definitivo es consultable y buscable, sin borrar pedidos. Catálogo conserva su acción manual en Caja para no romper ese flujo distinto.

Revisado el 2026-10-17.

La evidencia de las cuatro cancelaciones se reconstruye desde el POS; no se exige un comprobante externo como requisito. Los cortes ya excluyen esas ventas: no se duplica la salida en caja. Los motivos de San Gregorio describen duplicación, por lo que no se asume una devolución física. No se revocan todas las sesiones técnicas para resolver sesiones humanas. No se privatizan audios/imágenes antes de desplegar lectores compatibles. Importaciones sin respaldo real se ocultan/rechazan. Cuotas de abuso limitan nuevas intenciones por ventana, no almacenamiento/historial. No se usa audit fix --force para saltar de router ni se declara deuda de tipos resuelta.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](DECISIONS_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

## Reauditoría de etiquetas y escáner

Las etiquetas térmicas reutilizan el dispatcher de tickets de venta: una sola entrada en cola y el mismo ciclo de conexión, avance, corte y desconexión. Nunca anidar encolarImpresion con conImpresora (que ya encola): interbloquea toda impresión. En navegador usan printDocument térmico 58/80; el PDF por lotes conserva carta. Un código requiere gráfico aunque los tickets estén en modo texto.

Escaneo conserva precios por snapshot: un precio nuevo crea otra línea; contexto de consultas incluye sucursal, cajero y corte. Asignación valida el código completo (sin recortarlo). Para aislar el lector de campos monetarios/búsqueda configurar F9 como prefijo y Enter como terminador; sin prefijo, HID se comporta como un teclado común. El soporte se prueba con el formulario de pago real, la configuración física se verifica en sitio. Endurecimiento SQL verifica alcance anterior/destino y NULL en arreglos. Registro de hallazgos y pruebas: docs/REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md.

## Tramas completas y etiquetas vigentes

El lector conserva su parser al cambiar de modo/sucursal/cajero/corte. Una trama parcial mantiene su contexto original y su final se descarta si éste cambió; Escape cancela y F9 abre una trama nueva. Cobro/orden móvil/venta libre esperan también la trama en curso, además de RPC pendientes. F9 limpia el campo de asignación para impedir concatenar otra etiqueta con texto anterior. PDF verifica códigos y nombres vigentes antes de descargar; una modificación exige regenerar, sin reasignar desde exportación. Respuestas RPC rechazan precios vacíos/booleanos y alcances de tipo incorrecto. Evidencia y reproducción: docs/SEGUNDA_REAUDITORIA_BARRAS_2026-11-01.md.

## Recuperar antes de continuar la venta

No usar otro carrito para provocar recuperación implícita de un intento anterior. Se expone recuperación explícita con la misma intención durable, bloqueando nuevo cobro/edición. El carrito queda ligado a sucursal/cajero; no se vacía por cambiar contexto. Fuentes PDF: rasterizar sólo nombres no codificables por Helvetica y conservar barras vectoriales. No agregar dependencias de fuentes. Ver AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md.

## Diagnóstico de lector sin falsas conexiones

Conservar el comportamiento de lectores existentes hasta cambio explícito; recomendar F9 + Enter por su aislamiento de importes. Sólo Enter está implementado como terminador; no ofrecer opciones ficticias. Un parser por documento preserva cuarentena al navegar y evita listeners de asignación divergentes. No deduplicar tramas completas por código/tiempo: tres disparos deliberados deben contar tres. Detección física no disponible sin API fiable; WebHID/WebUSB presentes no demuestran conexión. No añadir plugin nativo no verificable ni tocar el transporte de impresora. Informe: AUDITORIA_CONFIG_ESCANER_2026-11-02.md.

# PROJECT_CONTEXT — contratos vigentes

## Pedidos anteriores e historial (2026-10-17)

Personalizados no ofrece Entregado ni la pregunta al liquidar. La fecha de entrega se conserva. La vista del servidor exige saldo conocido liquidado y dos días de margen desde la entrega (calendario CDMX); comienza Anteriores en la fecha mayor entre entrega + 2 y pago completo. Tras 30 días pasa al Historial completo. Son clasificaciones de lectura, nunca borrados ni cambios de estado/fecha real. Los antiguos Entregados también se clasifican por saldo/fecha. Cancelados siguen consultables en Historial.

Sucursal en RPC, RLS, cache, respuesta y detalle. Dueño/pastelero conservan alcance global deliberado; terminal/administrador sólo su sucursal. Buscar abre Historial completo conservando sucursal. Pedidos/Caja/Dashboard/Registros ofrecen Cargar más con nombre explícito; Ventas limita tarjetas sin truncar totales. Ver docs/AUDITORIA_PEDIDOS_HISTORIAL_2026-10-17.md y npm run test:historial.

El contador del menú usa la misma RPC/vista Actuales (página de una fila y total completo); se invalida con pagos/ediciones. Actuales/Anteriores se refrescan cada 15 s; Historial completo sólo al consultarlo, invalidarlo o reconectar. Registros descarta gastos en caché de otra sucursal antes de informes/exportación. Reauditoría e integración: scripts/historial_integracion_verify.mjs.

## Pedidos personalizados

Orden por fecha y hora local, con hora ausente al final de su día y desempate por ID. La fila Horario de accesos rápidos filtra horarios; búsqueda limpia filtros, pero conserva sucursal. WhatsApp incluye la base guardada y su devolución con base limpia, sin sumarla otra vez al total. El ticket visual/impresión conserva su componente. Pruebas: npm run test:pedidos.

Revisado el 2026-10-17.

POS Confetti opera dinero real en tres sucursales, con React/Vite, Supabase y Vercel. El APK carga el alias de apk/capacitor. Prioridad: cobros, abonos, comprobantes y aislamiento por sucursal. Este archivo registra mecanismos; las versiones vivas se consultan en los servicios.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [docs/REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](docs/REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](docs/REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](PROJECT_CONTEXT_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

## Reauditoría de etiquetas y escáner

Las etiquetas térmicas reutilizan el dispatcher de tickets de venta: una sola entrada en cola y el mismo ciclo de conexión, avance, corte y desconexión. Nunca anidar encolarImpresion con conImpresora (que ya encola): interbloquea toda impresión. En navegador usan printDocument térmico 58/80; el PDF por lotes conserva carta. Un código requiere gráfico aunque los tickets estén en modo texto.

Escaneo conserva precios por snapshot: un precio nuevo crea otra línea; contexto de consultas incluye sucursal, cajero y corte. Asignación valida el código completo (sin recortarlo). Para aislar el lector de campos monetarios/búsqueda configurar F9 como prefijo y Enter como terminador; sin prefijo, HID se comporta como un teclado común. El soporte se prueba con el formulario de pago real, la configuración física se verifica en sitio. Endurecimiento SQL verifica alcance anterior/destino y NULL en arreglos. Registro de hallazgos y pruebas: docs/REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md.

## Tramas completas y etiquetas vigentes

El lector conserva su parser al cambiar de modo/sucursal/cajero/corte. Una trama parcial mantiene su contexto original y su final se descarta si éste cambió; Escape cancela y F9 abre una trama nueva. Cobro/orden móvil/venta libre esperan también la trama en curso, además de RPC pendientes. F9 limpia el campo de asignación para impedir concatenar otra etiqueta con texto anterior. PDF verifica códigos y nombres vigentes antes de descargar; una modificación exige regenerar, sin reasignar desde exportación. Respuestas RPC rechazan precios vacíos/booleanos y alcances de tipo incorrecto. Evidencia y reproducción: docs/SEGUNDA_REAUDITORIA_BARRAS_2026-11-01.md.

## Orden y cobro durante escaneo

Carrito ligado a sucursal/cajero; cambiar contexto conserva la orden pero bloquea operarla hasta regresar o limpiar. Con intención de venta pendiente no se limpia ni edita: Recuperar cobro pendiente reenvía el intento exacto y muestra el ticket del servidor, incluso tras recarga o cierre de caja. Un borrador ajeno se conserva. Normalizar códigos sólo recorta relleno exterior en servicio/SQL; lector y asignación visual exigen código canónico. Nombres Unicode del PDF se renderizan con la fuente del navegador cuando Helvetica no los codifica. Ver docs/AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md.

## Escáner por dispositivo

Configuración → Operación ofrece ajustes locales, F9 + Enter recomendado, guardado/restauración, tutorial y diagnóstico sin ventas/asignaciones. Se preserva explícitamente el modo existente al no haber configuración guardada. scannerCapture mantiene un parser por documento entre pantallas y descarta colas anteriores al cambiar contexto/ajustes. Lectura correcta no significa dispositivo conectado; prueba física sólo declarada por persona y no persistida. No hay plugin nuevo de detección. Evidencia/límites: docs/AUDITORIA_CONFIG_ESCANER_2026-11-02.md.


## Integración de configuración del lector

La captura compartida elige el producto de asignación por el campo enfocado. Abrir más de una tarjeta no debe enviar el código a otra; un cambio de foco descarta la trama parcial. Ver docs/AUDITORIA_CONFIG_ESCANER_2026-11-02.md.

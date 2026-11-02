# DATABASE — contratos vigentes

## Consulta de pedidos anteriores

Nueva migración 20261017181425_pedidos_anteriores_historial_lectura.sql, creada con CLI. Sólo agrega listar_pedidos_pastel_pos(uuid,text,jsonb,integer,jsonb), STABLE SECURITY INVOKER, search_path vacío; execute sólo authenticated. Mantiene RLS. Rechaza sesión ausente/deshabilitada y sucursal ajena; el rol administrador no es dueño global. No agrega cron/TTL/DELETE, columnas ni escrituras. Fecha CDMX y clasificación derivada de saldo, entrega y fecha_pago_completo. JSON devuelve pedidos, total, hoy, conteos y cursor. Historial contiene todos los personalizados permitidos, incluidos cancelados y entregados antiguos.

Revisado el 2026-10-17.

Bitácora: app_private.eventos_financieros_pos (RLS sin grants cliente), auditar_finanzas_pos y snapshot_financiero_pos; historial_evidencia_pos exige dueño y cursor. Las funciones base de operación/conciliación quedan privadas, llamadas sólo por envolturas controladas. Nuevas funciones: guard_venta_confirmada y conciliacion_operativa_pos (sólo dueño activo); crear_pedido_web_idempotente y wrapper legado; solicitar_transcripcion_pos (Auth POS), completar_transcripcion_pos (sólo servicio). Tablas privadas con RLS sin acceso cliente: intenciones_pedido_web, cuotas_pedido_web, transcripciones_voz y cuotas_voz. No tocar migraciones aplicadas; cambios futuros mediante nueva migración CLI. Comparar hash SQL desplegado con archivo versionado.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](DATABASE_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

Implementación: productos.codigo_barras/codigo_origen, índice único parcial y trigger de reservas privadas app_private.codigos_producto_reservados (sin FK que borre la reserva). Secuencia interna + bloqueo transaccional en asignar_codigo_producto_pos. buscar_producto_codigo_pos es invoker y valida sesión/sucursal/activo/visible; sólo authenticated. Sin writes en tablas financieras. Las APIs de catálogo ordinarias no admiten escribir estos campos: asignación por RPC.

## Endurecimiento de asignación de códigos

La migración adicional endurecer_codigos_barras reemplaza trigger/RPC conservando grants: verifica sucursal anterior y nueva, y trata NULL en sucursal_ids como ausencia de autorización. No reescribe códigos ni registros financieros. No editar la migración original ya aplicada. Ver REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md.

## Identidad canónica del código

Migración codigo_canonico reemplaza sólo normalizar_codigo_producto: recorta relleno exterior y conserva espacios/controles internos, que las validaciones existentes rechazan. No actualiza productos ni tablas financieras ni elimina reservas. Las migraciones aplicadas se comprueban en supabase_migrations.schema_migrations y por MD5 de statements frente al archivo. Ver AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md.

Registro histórico de esta entrega: migración 20261102062408_codigo_canonico, SQL de 584 bytes y MD5 dccd674e7530fe7677519bf54a34bf32 contrastados con statements de Supabase.

## Configuración de escáner

La sección de escáner usa localStorage por dispositivo/origen; no introduce tablas, RPC, migraciones ni escrituras de diagnóstico. Unicidad, reservas y operaciones de dinero conservan las migraciones anteriores. Validar SQL en PGlite no acredita que esté aplicado en el proyecto vivo.

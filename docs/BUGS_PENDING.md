# BUGS_PENDING — contratos vigentes

## Historial auditado

Retirada entrega manual de personalizados y truncación de Caja a 100; clasificación sin borrar datos, búsqueda histórica y carga incremental. No equivale a garantía de retención eterna: respaldo, ensayo de restauración, capacidad/plan y validación física de tablets continúan pendientes. La lista de pedidos es viva (ediciones concurrentes pueden cambiar orden entre páginas); un refresco la recorre de nuevo. Ventas carga datos completos del alcance, por lo que consultar años puede requerir una optimización posterior. TypeScript POS conserva 597 diagnósticos históricos, sin nuevos; web 23.

Revisado el 2026-10-17.

Pendientes vigentes: conciliación del libro de cuatro pedidos cuyos pagos y cancelaciones sí están documentados en el POS ($1,700), con motivos que distinguen devolución de posible duplicado; lectores firmados/privacidad F18; validación física y configuración/firma APK F19; deuda TypeScript POS 597/web 23 y protección administrativa F23; dos avisos moderados del router F24; respaldo/restauración/alertas externas F26. F05–F14 y autoridad F01–F04/F16 tienen reparación y evidencia en informes, sin certificar papel, efectivo físico o todos los dispositivos.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](BUGS_PENDING_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Verificación física de códigos de barras

Probar lector HID con Enter y una trama por disparo, reconexión USB/Bluetooth y impresión 58/80 mm en Higole. Compilar, firmar con la clave existente e instalar APK 1.2.0 para guardado nativo; plugin fuente presente, binario no certificado en este entorno. Las versiones anteriores descargan PNG/PDF desde Chrome/computadora y muestran un error explícito al intentar guardarlos dentro del APK. No confundir que el escaneo agiliza registrar con impedir físicamente una venta fuera del sistema.

Reauditoría de códigos: interbloqueo de impresión por cola anidada, formato térmico, precio antiguo, truncación de códigos y alcance SQL corregidos; ver REAUDITORIA_CODIGOS_BARRAS_2026-11-01.md. Validar lector físico F9+Enter y tickets/etiquetas en la misma impresora. Guardado Java sigue pendiente de compilación/firma/instalación; no marcarlo certificado por deploy web.

Segunda reauditoría: corregidos C01–C05 (lectura parcial durante cobro/cambio de contexto, PDF antiguo, asignación concatenada y respuesta RPC incoherente). Ver SEGUNDA_REAUDITORIA_BARRAS_2026-11-01.md. La prueba física con F9+Enter y el binario nativo de guardado siguen siendo pendientes, no una promesa de “cero errores”.

Auditoría profunda: R01–R08 reparados (identidad con espacios, borrador perdido, respuesta antigua, carrito fuera de contexto, recuperación, controles F9, reloj y Unicode PDF); reproducción y cierre en AUDITORIA_PROFUNDA_BARRAS_2026-11-02.md. No quedan fallos reproducibles de esa lista pendientes en software. Continúan prueba física, recarga en tablets y APK firmado para guardado nativo. Un intento local malformado requiere revisión conservando el dispositivo; no borrarlo para desbloquear cobros.

## Alcance de configuración del escáner

S01–S03 (F9 sostenido, sufijo tras navegar y asignación interrumpida) tienen corrección y regresiones negativas/positivas; S04 agrega ajustes/diagnóstico antes ausentes. No se presenta como certificación de hardware: siguen pendientes lector/modelo, OTG/Bluetooth, tablet instalada y papel/impresora. El entorno de esta auditoría no tenía acceso autorizado a APIs de Supabase/Vercel; no inferir publicación ni esquema vivo de los informes anteriores. Consultar registro fechado AUDITORIA_CONFIG_ESCANER_2026-11-02.md y comprobar servicios/canales antes de desplegar.


## Integración de configuración del lector

S05 corregido: varias asignaciones abiertas podían enviar el código al producto de otra tarjeta. Pruebas de foco y fragmento cruzado en scanner_config_browser; prueba física sigue pendiente. Ver AUDITORIA_CONFIG_ESCANER_2026-11-02.md.

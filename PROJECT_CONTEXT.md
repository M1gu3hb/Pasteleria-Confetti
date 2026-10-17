# PROJECT_CONTEXT — contratos vigentes

## Pedidos anteriores e historial (2026-10-17)

Personalizados no ofrece Entregado ni la pregunta al liquidar. La fecha de entrega se conserva. La vista del servidor exige saldo conocido liquidado y dos días de margen desde la entrega (calendario CDMX); comienza Anteriores en la fecha mayor entre entrega + 2 y pago completo. Tras 30 días pasa al Historial completo. Son clasificaciones de lectura, nunca borrados ni cambios de estado/fecha real. Los antiguos Entregados también se clasifican por saldo/fecha. Cancelados siguen consultables en Historial.

Sucursal en RPC, RLS, cache, respuesta y detalle. Dueño/pastelero conservan alcance global deliberado; terminal/administrador sólo su sucursal. Buscar abre Historial completo conservando sucursal. Pedidos/Caja/Dashboard/Registros ofrecen Cargar más con nombre explícito; Ventas limita tarjetas sin truncar totales. Ver docs/AUDITORIA_PEDIDOS_HISTORIAL_2026-10-17.md y npm run test:historial.

## Pedidos personalizados

Orden por fecha y hora local, con hora ausente al final de su día y desempate por ID. La cuarta fila de accesos rápidos filtra horarios; búsqueda limpia filtros, pero conserva sucursal. WhatsApp incluye la base guardada y su devolución con base limpia, sin sumarla otra vez al total. El ticket visual/impresión conserva su componente. Pruebas: npm run test:pedidos.

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

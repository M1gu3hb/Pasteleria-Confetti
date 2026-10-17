# ARCHITECTURE — contratos vigentes

## Lectura paginada de pedidos

listar_pedidos_pastel_pos ejecuta clasificación, filtros y orden fecha/hora/ID en el servidor bajo RLS. useInfiniteQuery carga 50 pedidos por página, cursor ligado a sucursal/vista/filtros y límite de creación. No es el snapshot financiero: es una lista viva; editar fecha/hora/pago durante la navegación puede modificar la posición y el refresco vuelve a recorrer las páginas. Los informes financieros conservan historial_operativo_pos y sus garantías. Las lecturas fallidas se muestran, nunca se presentan como historial completo.

CorteHistorialList se comparte en Caja/Dashboard y pagina por offset hasta página vacía (el servidor puede reducir el tamaño). Registros conserva Cargar más al buscar sin coincidencias en las páginas cargadas. Un cambio de sucursal oculta inmediatamente listas y detalles previos. Ventas sigue leyendo todo por páginas para calcular totales completos; Cargar más sólo dosifica tarjetas. No afirmar que esto elimina todo coste de consultar muchos años.

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

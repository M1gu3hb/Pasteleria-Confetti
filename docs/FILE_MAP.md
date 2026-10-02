# FILE_MAP — contratos vigentes

Revisado el 2026-10-02.

Dinero: operacion_pedido_tx y migraciones operativas; historial: historial_operativo_pos; reimpresión: cargarTicketVenta/TicketViewerDialog; impresión: colaImpresion/printTicket; importación: importacionesDisponibles/importExecutors; conciliación: EstadoConciliacion; web: envioPedidoWeb y ambos formularios. Suites: operacion_*, autoridad_*, recuperacion_auth, pendientes_sql, pendientes_cliente, voz_edge; puerta de build: calidad_types_verify con fixtures/typecheck_deuda_conocida.json.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](FILE_MAP_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

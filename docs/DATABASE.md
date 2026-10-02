# DATABASE — contratos vigentes

Revisado el 2026-10-02.

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

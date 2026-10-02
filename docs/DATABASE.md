# DATABASE — contratos vigentes

Revisado el 2026-10-02.

Nuevas funciones: guard_venta_confirmada y conciliacion_operativa_pos (sólo dueño activo); crear_pedido_web_idempotente y wrapper legado; solicitar_transcripcion_pos (Auth POS), completar_transcripcion_pos (sólo servicio). Tablas privadas con RLS sin acceso cliente: intenciones_pedido_web, cuotas_pedido_web, transcripciones_voz y cuotas_voz. No tocar migraciones aplicadas; cambios futuros mediante nueva migración CLI. Comparar hash SQL desplegado con archivo versionado.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](DATABASE_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

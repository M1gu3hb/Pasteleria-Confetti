# BUGS_PENDING — contratos vigentes

Revisado el 2026-10-02.

Pendientes vigentes: cuatro cancelaciones por $1,700 con ausencia de abonos negativos; lectores firmados/privacidad F18; validación física y configuración/firma APK F19; deuda TypeScript POS 677/web 23 y protección administrativa F23; dos avisos moderados del router F24; respaldo/restauración/alertas externas F26. F05–F14 y autoridad F01–F04/F16 tienen reparación y evidencia en informes, sin certificar papel, efectivo físico o todos los dispositivos.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](BUGS_PENDING_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

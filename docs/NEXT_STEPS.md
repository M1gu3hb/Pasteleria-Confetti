# NEXT_STEPS — contratos vigentes

Revisado el 2026-10-02.

Orden operativo siguiente: obtener comprobantes de las cuatro cancelaciones; verificar versión cargada/ticket/papel/cajón en cada sucursal sin generar cobros ficticios; instrumentar alertas externas y ensayar restauración integral; desplegar lectores firmados antes de privatizar Storage; abordar deuda de tipos y actualización mayor del router. Una nueva sesión debe repetir lecturas vivas de versiones/permisos. No recrear ingresos antiguos ni reabrir cortes sin conciliación.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](NEXT_STEPS_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

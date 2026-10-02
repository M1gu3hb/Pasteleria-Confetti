# Reauditoría y cierre de pendientes — Confetti, 2026-10-02

Esta revisión contrasta la reparación operativa y de autoridad de las dos rondas anteriores con código, pruebas de fallos y lecturas reales. La implementación adicional está preparada y probada; el registro final de despliegue se añade después de verificar GitHub, Supabase y Vercel. No se afirma que esta preparación ya esté desplegada.

## Reparaciones verificadas y ampliadas

| Hallazgo | Evidencia y alcance |
|---|---|
| F05–F09 | Las RPC de creación, abono, devolución, folio y cierre conservan transacciones, intención persistente, bloqueo de pedido/corte y saldo derivado. Se volvió a probar interrupción después de cada escritura, reintento, edición de precio, devolución y rechazo de cortes cerrados; también con la nueva protección de ventas confirmadas instalada. |
| F10–F14 | Consultas canónicas por corte/sucursal, historial completo, paginación global, comprobante persistente y calendario CDMX. Fixtures de 60,001 ventas, caps y fronteras N−1/N/N+1. Las sumas/detalles de cortes y efectivoEsperado conservan sus contratos. |
| F01–F04/F16 | Autoridad efectiva, último dueño, sesiones humanas activas frente a terminales técnicas, PIN con cuota durable y rechazo de INSERT público directo. Suites de autorización repetidas; sin nueva rotación de credenciales ni revocación masiva de terminales. No atribuye forensemente la desactivación histórica de Abel a una persona. |
| F17 | Pedidos web con UUID y payload original guardados antes de escribir; recuperación tras recarga/respuesta perdida, hash en servidor y cuotas compartidas por RPC nueva y legado. Voz exige usuario Auth real y permiso del objeto; lease, caché y cuota en Postgres, completados sólo por servicio. |
| F18, parcial | Se impide sobreescribir/eliminar audio desde clientes; nuevas subidas requieren sesión POS válida y propietario. Bucket de voz limita nuevas subidas a 10 MiB/audio. La confidencialidad de URLs públicas sigue pendiente de lectores firmados y actualización comprobada de tablets. No se borró ni recomprimió ningún archivo. |
| F20 | Cola FIFO para el trabajo nativo completo, incluidos conexión, envío, avance, corte y desconexión; ticket/config capturados antes de esperar. Fallo de conexión limpia y no bloquea trabajos posteriores. Sin prueba física de impresora o cajón. |
| F21 | Se conserva el aislamiento de consultas del historial. El visor de venta ahora exige lectura actual y todos los detalles; muestra errores y no permite imprimir un ticket vacío, ajeno o con subtotal discordante. Respuestas antiguas no reemplazan el ticket actual; doble toque produce una impresión. |
| F22 | Escrituras de entidades sin tabla fallan explícitamente. Importación visible limitada a productos y reporte de fallos/éxitos parciales real. Exportación ofrece sólo tablas disponibles; CSV no se presenta como respaldo/restauración completa. |
| F23, parcial | `npm run build` ejecuta lint, comparación de diagnósticos y regresiones antes de Vite. Lint llega a cero en su alcance configurado; TypeScript bruto aún falla por deuda existente: POS 677 y web 23. La puerta compara código/mensaje/ancla/multiplicidad de cada diagnóstico, no sólo el total. Se probó que rechaza un error nuevo inyectado. No equivale a eliminar esa deuda ni a protección administrativa de ramas. |
| F24, parcial | Actualizaciones compatibles mediante npm, sin force ni salto mayor del router. Se retiró react-quill, sin consumidores en código. Avisos POS 27→2 y web 18→2; quedan dos moderados del router en cada repo. Ninguno alto/crítico en el audit final. |
| F25 | 20 controles reales de los dos formularios tienen nombre accesible; etiquetas asociadas, IDs únicos, foto/notas/búsqueda nombradas, selector con estado expandido y documento en español. Prueba AST sobre JSX. No se certifica WCAG completa con esta revisión. |
| F26, parcial | Conciliación de saldos y vínculos visible al dueño, con fallo explícito y comprobación periódica mientras el dashboard está abierto. No sustituye alertas externas, auditoría contable ni un ensayo de restauración de Postgres/Auth/Storage. |

## Riesgos adicionales cerrados

Una venta positiva ya pagada o cancelada no puede perderse mediante DELETE ni cambiar importes, folio, sucursal o corte desde una sesión de cliente. No puede reabrirse. La cancelación conserva el pago original, exige motivo y valida el importe devuelto. Se preserva el saneamiento de tickets vacíos. Correcciones históricas privilegiadas requieren revisión contable; no se aplicó ninguna en esta ronda.

La respuesta perdida de un pedido web se recupera con su intención y datos originales, aunque el formulario se edite o se recargue. Confirmación, sucursal, fecha y WhatsApp provienen del envío confirmado. Si no se puede guardar la intención localmente, no se envía. Una consulta fallida nunca se traduce en éxito. Navegadores anteriores a esta versión usan la RPC de compatibilidad con la misma cuota, pero necesitan recargar para adquirir la recuperación UUID del cliente nuevo.

Las cuotas no son límites de almacenamiento ni ventanas del historial: pedidos públicos nuevos, 120/minuto global y 20/hora/teléfono; voz, 600 intentos/hora global y 120/hora/identidad Auth, máximo tres intentos por versión del objeto y lease de dos minutos. Repeticiones confirmadas/caché no consumen cupo. Puede requerirse ajuste con tráfico real; no constituye defensa absoluta contra abuso distribuido. Un timeout del proveedor de IA puede dejar coste externo incierto; la caché reduce y acota reintentos, no promete exactamente una facturación externa.

## Pruebas y límites del método

`npm run build` de ambos repositorios y las suites nuevas ejecutan código real de RPC en PGlite con pgcrypto/RLS, handlers/React/Edge en harnesses aislados y comprobantes renderizados. No se crearon pedidos, cobros, gastos ni cierres ficticios en producción. Los tests locales no reemplazan la validación física ni demuestran todas las intercalaciones de dos conexiones a Postgres: el bloqueo transaccional se revisa en el SQL desplegado y se conserva el ensayo concurrente de la reparación anterior.

Testigos contra código anterior: dos conexiones de impresora se solapaban; reintentar la creación web tras respuesta perdida creaba dos pedidos; la Edge anterior aceptaba una cabecera de autorización sin comprobar identidad/propiedad antes de llamar al proveedor; el SQL anterior permitía reescribir el total de una venta cobrada. Las pruebas nuevas rechazan esos casos. La prueba vieja de base limpia deja de congelar el hash del visor, cuyo comportamiento cambiado se ejecuta ahora; los diseños de tickets mantienen sus verificaciones.

La puerta de publicación respeta la deuda de tipos contrastada contra la versión publicada; no se usaron @ts-ignore ni se apagó checkJs. Debe revisarse cada futura modificación del archivo de deuda. Las pruebas conservan casos históricos en vez de excluirlos silenciosamente.

## Conciliación histórica que requiere comprobantes

| Pedido | Venta cancelada | Abono positivo | Estado del pedido | Abonos negativos registrados |
|---|---|---:|---|---:|
| PP-A-0212 | CONF-A-V1767 | $500 efectivo | con_anticipo | 0 |
| PP-A-0292 | CONF-A-V2696 | $640 tarjeta | pagado | 0 |
| PP-C-0006 | CONF-C-V0172 | $280 efectivo | cancelado | 0 |
| PP-C-0007 | CONF-C-V0173 | $280 efectivo | cancelado | 0 |

Total $1,700. Las ventas tienen metadatos de devolución, pero no hay abono negativo que documente esa salida en el libro del pedido. Esto no prueba si se devolvió físicamente el dinero. No se recrearon ingresos ni se descontaron saldos a ciegas. Se necesita recibo de cobro/devolución, fecha, método y sucursal/corte para decidir una corrección compensatoria auditada. Esos casos permanecen visibles para el dueño.

## Pendientes que esta publicación no certifica

- F18: lectores con URLs firmadas, despliegue/reload de consumidores y después privacidad de buckets. La política de lectura pública por URL permanece por compatibilidad.
- F19: binario APK instalado, firma/origen permitido y actualización física de cada dispositivo. Sincronizar Git/Vercel no prueba que una pestaña/tablet abierta recargó, ni que la impresora imprimió papel correcto.
- F23: eliminar 677/23 diagnósticos antiguos; verificar protección de ramas desde una cuenta con permiso administrativo. La conexión GitHub de esta sesión no tiene administración.
- F24: migración mayor del router con pruebas de navegación. Los avisos moderados incluyen redirección por barras invertidas e hidratación SSR; la aplicación actual es Vite cliente, sin SSR, pero no se elimina el aviso por esa observación.
- F26: restauración integral ensayada, alertas externas, retención y conciliación de efectivo real. La existencia de un plan de Supabase no demuestra un respaldo restaurable.
- Inventario de dispositivos/sesiones humanas: los registros Auth no equivalen a tablets ni a intrusiones. Las sesiones humanas desactivadas ya no obtienen permisos POS; no se revocaron dispositivos válidos sin identificarlos.

## Publicación y recuperación

Tres migraciones nuevas versionadas antes de aplicarlas: proteger_ventas_confirmadas, pedidos_web_idempotentes, voz_autorizada_y_deduplicada. Edge transcribir-nota-voz conserva verify_jwt=true y fallback opcional. Se despliega base/Edge antes del cliente; el contrato web anterior sigue disponible. Se avanza producción/APK sin force al mismo commit. Si falla una publicación, se detiene el avance de ramas y se registra el estado; no se revierte el libro de dinero ni se hacen migraciones destructivas.

Evidencia final de versiones, hashes SQL y comprobaciones posteriores: se añade al cerrar el despliegue; la preparación anterior no sustituye esa verificación.

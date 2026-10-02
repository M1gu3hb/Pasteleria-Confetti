# Reauditoría y cierre de pendientes — Confetti, 2026-10-02

Esta revisión contrasta la reparación operativa y de autoridad de las dos rondas anteriores con código, pruebas de fallos y lecturas reales. Las correcciones operativas están aplicadas y verificadas en GitHub, Supabase y los tres canales servidos. La tabla final registra el snapshot de esa comprobación; las versiones vivas se vuelven a consultar en los servicios.

## Reparaciones verificadas y ampliadas

| Hallazgo | Evidencia y alcance |
|---|---|
| F05–F09 | Las RPC de creación, abono, devolución, folio y cierre conservan transacciones, intención persistente, bloqueo de pedido/corte y saldo derivado. Se volvió a probar interrupción después de cada escritura, reintento, edición de precio, devolución y rechazo de cortes cerrados; también con la nueva protección de ventas confirmadas instalada. |
| F10–F14 | Consultas canónicas por corte/sucursal, historial completo, paginación global, comprobante persistente y calendario CDMX. Fixtures de 60,001 ventas, caps y fronteras N−1/N/N+1. Las sumas/detalles de cortes y efectivoEsperado conservan sus contratos. |
| F01–F04/F16 | Autoridad efectiva, último dueño, sesiones humanas activas frente a terminales técnicas, PIN con cuota durable y rechazo de INSERT público directo. Suites de autorización repetidas; sin nueva rotación de credenciales ni revocación masiva de terminales. No atribuye forensemente la desactivación histórica de Abel a una persona. |
| F17, parcial | Pedidos web con UUID y payload original guardados antes de escribir; recuperación tras recarga/respuesta perdida, hash en servidor y cuotas compartidas por RPC nueva y legado. Voz exige usuario Auth real y permiso del objeto; lease, caché y cuota en Postgres, completados sólo por servicio. |
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

## Anticipos históricos sin movimiento de caja

La comprobación posterior identificó PP-A-0029 ($1,000), PP-A-0031 ($400), PP-C-0001 ($100) y PP-C-0002 ($500): `afecta_caja=false`, corte nulo y nota de backfill explícita. No son ventas faltantes de una operación actual. Se conserva y muestra su conteo sin generar ingreso ni excluir folios del test; la regla es flag falso y ausencia de corte. Los flags nulos o un corte asociado siguen detectándose como enlace por revisar. Son distintos de los casos de cancelación siguientes. Prueba aislada: registro histórico contado como tal; convertirlo a movimiento de caja activa la alerta.

## Conciliación histórica — conclusión corregida por revisión posterior

| Pedido | Venta cancelada | Abono positivo | Estado del pedido | Abonos negativos registrados |
|---|---|---:|---|---:|
| PP-A-0212 | CONF-A-V1767 | $500 efectivo | con_anticipo | 0 |
| PP-A-0292 | CONF-A-V2696 | $640 tarjeta | pagado | 0 |
| PP-C-0006 | CONF-C-V0172 | $280 efectivo | cancelado | 0 |
| PP-C-0007 | CONF-C-V0173 | $280 efectivo | cancelado | 0 |

Total $1,700. Las ventas tienen metadatos de devolución, pero no hay abono negativo que documente esa salida en el libro del pedido. Esto no prueba si se devolvió físicamente el dinero. No se recrearon ingresos ni se descontaron saldos a ciegas. Corrección de la conclusión de esta ronda: el POS conserva precisamente fecha, método, corte, motivo e importe de cancelación. La revisión posterior reconstruye la evidencia interna en REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md; no exige recibos externos. No debe duplicarse una salida en los cortes, que ya excluyen esas ventas.

## Pendientes que esta publicación no certifica

- F17: subida anónima directa a web-uploads sigue limitada por tamaño/MIME, pero no queda vinculada a una intención/cuota del pedido. Requiere flujo de subida autorizado y control de abuso antes de retirar el contrato de imágenes público. No se afirma que la cuota de pedidos limite esa API de Storage.
- F18: lectores con URLs firmadas, despliegue/reload de consumidores y después privacidad de buckets. La política de lectura pública por URL permanece por compatibilidad.
- F19: binario APK instalado, firma/origen permitido y actualización física de cada dispositivo. Sincronizar Git/Vercel no prueba que una pestaña/tablet abierta recargó, ni que la impresora imprimió papel correcto.
- F23: eliminar 677/23 diagnósticos antiguos; verificar protección de ramas desde una cuenta con permiso administrativo. La conexión GitHub de esta sesión no tiene administración.
- F24: migración mayor del router con pruebas de navegación. Los avisos moderados incluyen redirección por barras invertidas e hidratación SSR; la aplicación actual es Vite cliente, sin SSR, pero no se elimina el aviso por esa observación.
- F26: restauración integral ensayada, alertas externas, retención y conciliación de efectivo real. La existencia de un plan de Supabase no demuestra un respaldo restaurable.
- Inventario de dispositivos/sesiones humanas: los registros Auth no equivalen a tablets ni a intrusiones. Las sesiones humanas desactivadas ya no obtienen permisos POS; no se revocaron dispositivos válidos sin identificarlos.

## Publicación y recuperación

Cuatro migraciones nuevas versionadas antes de aplicarlas: proteger_ventas_confirmadas, pedidos_web_idempotentes, voz_autorizada_y_deduplicada y distinguir_abonos_historicos_conciliacion. Edge transcribir-nota-voz conserva verify_jwt=true y fallback opcional. Se despliega base/Edge antes del cliente; el contrato web anterior sigue disponible. Se avanza producción/APK sin force al mismo commit. Si falla una publicación, se detiene el avance de ramas y se registra el estado; no se revierte el libro de dinero ni se hacen migraciones destructivas.

## Evidencia posterior al despliegue (2026-10-02, 21:22–21:34 UTC)

- Código POS/APK: f70e6df6edbc887878f8089baf421a628a1996f0; ambos refs iguales y avance sin force. Deployments READY: producción dpl_HRGaGAdU45qc4y68TvyiKHpEnhwQ, APK dpl_HdZT4RMKjjzouF72sLxsC92NN39i.
- Web: 3d9dabe46119b59ba71fd851a1420bc613744177; READY dpl_DNHpsHm4xZzqPuctGR9f7vSuAnkj. Los commits de cierre posteriores sólo añaden evidencia/configuración del build; consultar sus refs actuales para la versión viva.
- HTTP 200 de producción, alias APK y www.pasteleria-confetti.com; POS/APK sirven `/assets/index-Kp38hSGR.js`, byte idéntico. Web sirve `/assets/index-Bdqk0nNU.js`, idioma es y RPC/recuperación presentes.
- Lectura SQL con snapshot repetible y rol authenticated del dueño: saldos_inconsistentes=0, enlaces_inconsistentes=0, ventas_corte_cruzadas=0, abonos_sin_venta=0; abonos_historicos_sin_venta=4, pagos_con_venta_cancelada=4. La revisión posterior reconstruye su evidencia interna; sigue separada la conciliación del libro frente a la entrega física de dinero.
- 6,398 ventas pagadas en el snapshot de 21:22; cero tickets positivos con detalles ausentes/subtotal discordante. El volumen puede crecer con la operación real.
- Un dueño activo y tres terminales enroladas. Anonymous INSERT pedidos=false; leer cuotas/intenciones privadas=false. Solicitar voz como anon=false; completar voz como anon/auth=false y servicio=true.
- Edge transcribir-nota-voz ACTIVE v4, verify_jwt=true. Contenido descargado de la función exactamente igual al versionado; SHA256 ddbf9211db79fbac29596d515e8ca7498362b54d137f516a46e08d9751b67479.
- 72 blobs POS + 14 web contrastados por SHA1 Git antes de publicar; adenda de cuatro archivos contrastada igualmente. SQL desplegado coincide por MD5 con los archivos versionados de la tabla siguiente.
- Build local PASS con la puerta nueva, pruebas de operación/autoridad/pendientes y ocho suites existentes. Se configura explícitamente `buildCommand: npm run build` en vercel.json de ambos repositorios, según la [referencia oficial](https://vercel.com/docs/project-configuration/vercel-json#buildcommand), para exigir prebuild en publicaciones.
- La conexión Vercel devolvió Tool get_deployment_build_logs not found y get_project INVALID_ARGUMENT. Por ello no se presentan logs remotos como evidencia leída; se verificaron estados READY, commit, HTTP y contenido servido. El comando de publicación se fija en configuración versionada.

| Archivo CLI | Versión aplicada | MD5 SQL exacto |
|---|---|---|
| 20261002203034_proteger_ventas_confirmadas.sql | 20261002212031 | 42ebdaed6ec638b45adf1ebb2dde8666 |
| 20261002203037_pedidos_web_idempotentes.sql | 20261002212045 | b98cf0c823fad313c5f5ae5a39a7220e |
| 20261002203039_voz_autorizada_y_deduplicada.sql | 20261002212100 | 20f158788a50244d7151d15d2c8ebc81 |
| 20261002212424_distinguir_abonos_historicos_conciliacion.sql | 20261002212739 | 828285785943f787f7f2f1582dc5c637 |

## Avisos de plataforma que permanecen

Los advisors no están a cero. Diez tablas privadas con RLS/sin policy son intencionalmente inaccesibles al cliente; tres vistas definer (`catalogo_publico`, `config_publica`, `usuarios_login`) exponen columnas públicas comprobadas, sin PIN/hash/identidad Auth/dinero. Los warnings de RPC definer requieren conservar grants y validaciones de rol; no prueban por sí mismos un bypass. Sigue pendiente la protección de contraseñas filtradas de Auth. Performance conserva dos FK privadas sin índice, tres respaldos históricos sin PK, índices redundantes/uso no observado y políticas permisivas múltiples. No se eliminaron respaldos ni índices sólo por un aviso.

Referencias de remediación de Supabase:

- [RLS sin policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Vistas definer](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
- [RPC anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [RPC authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [FK sin índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [políticas múltiples](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) e [índices duplicados](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)

El audit de dependencias refleja package-lock de cliente/build, no certifica binarios Android, hardware o dependencias remotas de la Edge.


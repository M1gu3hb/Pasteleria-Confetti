# Reauditoría de dinero y evidencia — Confetti, 2026-10-02

## Resultado de la reconstrucción de $1,700

El POS conserva cuatro cobros y cuatro cancelaciones de sus ventas. La conclusión anterior de exigir comprobantes externos era incompleta: la evidencia debía reconstruirse desde el propio sistema. No se crean ingresos ni devoluciones nuevas para subsanar la documentación.

| Pedido original | Venta cancelada | Abono | Corte | Cancelación registrada | Otros pedidos del mismo cliente y sucursal, ±2 días |
|---|---|---:|---|---|---|
| PP-A-0212 | CONF-A-V1767 | $500 efectivo | CONF-A-C055 | Devolución $500; motivo «Anita»; nombre registrado Abel; 2026-08-20 11:17:52 CDMX | PP-A-0213 se creó a las 11:20:19 con total $780 y abono $500, venta CONF-A-V1768 pagada |
| PP-A-0292 | CONF-A-V2696 | $640 tarjeta | CONF-A-C075 | Devolución $640; motivo «Ya no lo suizo»; nombre registrado Abel; 2026-09-13 15:20:13 CDMX | PP-A-0293 se creó a las 15:24:41, total y pago $940, venta CONF-A-V2700 pagada |
| PP-C-0006 | CONF-C-V0172 | $280 efectivo | CONF-C-C013 | Tipo devolución $280, motivo «Se marco dos veces»; nombre registrado ADMIN_1234 | PP-C-0005 entregado; total $780, pagos $280 + $500. El pedido 0006 se canceló con motivo «Lo puso triple» |
| PP-C-0007 | CONF-C-V0173 | $280 efectivo | CONF-C-C013 | Tipo devolución $280, motivo «Se marco dos veces»; nombre registrado ADMIN_1234 | Mismo PP-C-0005. El pedido 0007 se canceló con motivo «Lo puso triples» |

Los tres cortes excluyen las ventas canceladas: sus totales guardados reproducen exactamente todas las ventas pagadas ligadas al corte (consulta completa, sin ventana ni límite de filas).

| Corte | Total de ventas pagadas guardado y recalculado | Efectivo pagado | Gastos | Efectivo esperado guardado |
|---|---:|---:|---:|---:|
| CONF-A-C055 | $8,310 | $6,345 | $920 | $5,425 |
| CONF-A-C075 | $13,110 | $11,790 | $4,430 | $7,360 |
| CONF-C-C013 | $3,520 | $3,520 | $250 | $3,270 |

No son cuatro cobros sin venta: sus ventas existen y se cancelaron. Los pedidos conservaron los abonos positivos sin compensación en su libro. San Gregorio documenta una captura triple y el pedido válido conserva sus pagos completos. En Xochimilco hay pedidos posteriores y pagos nuevos del mismo cliente; la proximidad por sí sola no prueba sustitución formal. La falta de bitácora histórica impide identificar al humano detrás de una sesión compartida o demostrar la entrega física de dinero. El nombre registrado es evidencia del campo, no autenticación retrospectiva.

La reparación no solicita recibos externos ni modifica los importes históricos a ciegas. No añade abonos negativos al cajón: duplicaría una salida ya excluida del corte. El libro de los cuatro originales permanece como evidencia, con protección contra nuevas operaciones hasta su conciliación interna.

Los cuatro anticipos históricos por $2,000 con afecta_caja=false y corte nulo son otro conjunto. Se mantienen separados y contados; no se confunden con estas cancelaciones.

## Defectos adicionales encontrados y reparados

1. **Segunda devolución sobre un pago cuya venta ya se canceló.** La RPC anterior podía devolver otra vez el abono reconocido en el pedido. Testigo real en base aislada: recibo cancelado por $100, RPC anterior vuelve a generar devolución de $100. La envoltura nueva bloquea nuevos cobros y devoluciones de ese pedido y la transición a entregado; conserva recuperación idempotente de una intención ya confirmada. Comparte el orden de bloqueo intención → corte → pedido.
2. **Evidencia de cancelación mutable.** Una sesión podía reemplazar motivo, tipo, importe devuelto, fecha o nombre de una cancelación, mientras el corte seguía abierto. Se congelan esos campos; una cancelación nueva recibe fecha del servidor y, en sesión humana activa, identidad del perfil autenticado. En terminal se conserva la identidad declarada y se registra separadamente la identidad Auth real del dispositivo.
3. **Detalle de un ticket cancelado mutable.** La protección anterior sólo cubría pagadas. Se extiende a canceladas y conserva estado de preparación/notas operativas permitidos. No cambia diseño de tickets ni la fórmula del efectivo.
4. **Intención y fecha del cobro editables.** Se protegen idempotency_key, intencion_datos, created_at, fecha_apertura e identidad original del cajero en tickets confirmados positivos. No se modifica una venta cobrada para resolver una edición comercial.
5. **Pedido eliminable desde cliente.** Se revoca DELETE de pedidos al rol authenticated; ningún consumidor operativo requiere ese borrado. La cancelación conserva su registro.
6. **Ausencia de bitácora financiera del servidor.** Eventos de ventas, detalles, pedidos, abonos, cortes y gastos registran anterior/posterior, transacción, fecha del servidor, sucursal/corte/vínculos e identidad Auth. Son parte de la misma transacción: si falla el registro, el dinero tampoco se confirma. El registro privado rechaza UPDATE/DELETE/TRUNCATE y no otorga acceso de tabla a clientes o servicio; la consulta es sólo de dueño activo. Administradores SQL pueden deshabilitar triggers: no es una garantía contra un superusuario ni reemplaza un respaldo externo.

La observación inicial copia el estado financiero existente de las seis tablas, sin nombres/teléfonos/direcciones de clientes ni URLs de medios. Se identifica como OBSERVADO: no simula eventos ni fechas de cobro históricos. El payload de intención se conserva protegido en la venta; la bitácora registra su huella, sin duplicar datos privados de ese payload.

## Evidencia disponible dentro del POS

Dashboard del dueño → pagos con cancelación registrada → Ver e imprimir evidencia. Consulta de nuevo los datos del servidor; incluye folios, importe, método, fechas CDMX, corte, motivo, nombre registrado, estado/saldo del pedido y pedidos cercanos, junto a la bitácora completa de ese pedido y sus ventas/detalles vinculados.

La impresión se marca reconstruida desde registros del POS. No se presenta como un cobro nuevo ni como prueba de una devolución física. Se bloquea cuando falla la consulta, falta una página o no está renderizado su propio comprobante; doble toque imprime una vez. El navegador y el APK usan el servicio existente, sin modificar otros diseños ni efectivoEsperado. No se certifica papel/impresora física desde este entorno.

La bitácora se pagina por ID descendente con límite superior y cursor explícitos. Las páginas nuevas no desplazan a las antiguas; se rechazan repetición, falta de cursor y lectura parcial. El límite de 100 por respuesta es paginación, no un límite de historial ni de pedidos. No equivale a una transacción de snapshot que abarque varias peticiones HTTP: un evento pendiente de commit al capturar el límite puede no verse en ese recorrido; actualizar obtiene un recorrido nuevo.

## Pruebas

- SQL efectivo en PGlite/pgcrypto con fixtures de autoridad/RLS y migraciones completas. Testigos contra las funciones anteriores: modificación de evidencia/detalle cancelado y devolución duplicada.
- RPC nueva de crear/abonar/devolver, reintentos, vínculos de comprobante y aislamiento de bitácora. Fallo inyectado del registro revierte negocio e intención. Corrección privilegiada queda registrada con anterior/posterior. Más de 200 eventos se recorren sin repetir/omitir IDs del límite capturado.
- Cliente real: lectura completa/cursor, pérdida de conexión, página repetida/incompleta, importes null/NaN, CDMX; comprobante React renderizado con escape de motivos; diálogo bloquea errores y doble toque, comunica error de impresión. Importes ausentes no se convierten en cero.
- Build de ambos repositorios repite las regresiones anteriores. La suite SQL de pendientes incluye esta nueva migración; el build POS exige test:evidencia. Tipos antiguos siguen siendo deuda (677 POS/23 web); la puerta impide diagnósticos nuevos.

No se hacen cobros, pedidos ni cierres ficticios en producción. La evidencia posterior a publicación se añade al final tras consultar los servicios.

## Límites pendientes

La reconstrucción y la protección no fabrican el evento histórico que el sistema no capturó. Sigue pendiente conciliar formalmente el libro de los cuatro pedidos originales con los pedidos válidos, preservando referencia y reversibilidad, sin duplicar caja. También siguen pendientes restauración integral/alertas externas, lectores firmados y abuso de subidas anónimas, actualización física del APK/impresora, deuda de tipos, migración del router y protección administrativa de ramas. No se declara la auditoría integral cerrada por esta ronda.

## Comprobación posterior a publicación — 2026-10-02, 23:03–23:09 UTC

- Migración versionada primero en aab08ed015957cf0f9c6a60669d70f23fe40628a; aplicada como 20261002230338_evidencia_financiera_pos. MD5 del SQL desplegado y archivo: 0ac86ad9feb6e129b36377c66422420f. No se editó una migración anterior.
- Lectura real como dueño authenticated: saldos_inconsistentes=0, enlaces_inconsistentes=0, ventas_corte_cruzadas=0, abonos_sin_venta=0. Cuatro históricos no caja y cuatro pagos cancelados permanecen explícitos.
- Se contrastaron antes/después todos los campos de los cuatro pedidos, las cuatro ventas y los tres cortes: idénticos. La migración no registró ingresos ni devoluciones y no alteró esos saldos.
- Observación inicial: 16,685 registros financieros — ventas 6,416; detalles 7,987; pedidos 511; abonos 672; cortes 270; gastos 829. Cada observación lleva fecha de captura, no fecha histórica inventada. La primera consulta no encontró aún eventos de operación posteriores; no se simula un cobro para generar evidencia.
- Privilegios efectivos: authenticated SELECT de bitácora=false; servicio UPDATE=false; authenticated DELETE pedidos=false; anon EXECUTE historial=false; authenticated EXECUTE base privada=false. Dueño obtiene cuatro observaciones enlazadas de PP-A-0212 mediante la RPC autorizada.
- Producción READY dpl_HHJGGxNjProa6ks99ifX6L2yDMkj; APK READY dpl_3oXPatEpfdgXh8DDX8as1nBv9dFh; staging READY dpl_4jA1H1wDdnf9yB7XVEENHmsE5TvB, todos del commit anterior. HTTP200 producción/APK y mismo index-D2m7OyV6.js, contenido byte idéntico (2,396,252 caracteres), con historial_evidencia_pos, comprobante y mensaje de conciliación presentes. El cierre posterior sólo mejora explicación al empleado y documenta resultados; se vuelven a verificar sus versiones vivas.
- Web sin cambios de código en esta ronda: build con puerta de calidad aprobado; HTTP200, index-Bdqk0nNU.js. Las pruebas de idempotencia/formularios anteriores siguen aprobadas.
- POS build con calidad/regresiones/evidencia aprobado, sin diagnósticos TypeScript nuevos. Ticket abonado 40/40, base limpia 21/21, bloqueo de cierre 25/25 y avance/corte 25/25. Las ramas avanzaron sin force y sin modificar Caja/efectivoEsperado ni diseños anteriores.

Advisors consultados tras DDL: siguen avisos de vistas definer, permisos de funciones, protección de contraseñas, tablas privadas con RLS sin policy, FK/índices/PK de respaldos, políticas múltiples y configuración de conexiones Auth. No se borraron respaldos ni se declaran cero avisos.

Referencias de remediación: [RLS privada](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [vistas](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [índices/FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [conexiones Auth](https://supabase.com/docs/guides/deployment/going-into-prod).

## Estado de documentación

CLAUDE.md, PROJECT_CONTEXT.md, HANDOFF.md, CHANGELOG.md, DATABASE.md, FILE_MAP.md, BUGS_PENDING.md, NEXT_STEPS.md, DECISIONS.md y ARCHITECTURE.md actualizados. README deja de dirigir a Base44.

Próximo paso recomendado: conciliar los cuatro originales mediante la evidencia interna y los pedidos válidos relacionados, con una corrección explícita del libro que no vuelva a afectar caja.

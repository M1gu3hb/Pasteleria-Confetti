# Reparación operativa Confetti — 2026-10-02

Autorización: Miguel solicitó corregir primero los fallos que afectan la operación de las tres sucursales, empezando por abonos/saldos. Esta entrega aborda F05–F14; F01–F04 y F16 (identidad/permisos/entrada pública) requieren la segunda ronda. No representa cierre de toda la auditoría integral.

## Qué cambia

| Hallazgo | Reparación | Validación |
|---|---|---|
| F05 | Crear pedido con anticipo, pagar y registrar venta/detalle/abono se ejecutan en una transacción. Abono enlazado a su venta y registro privado de intención. | Fallo después de cada escritura: cero registros parciales; respuesta perdida, recarga y doble toque conservan una operación. |
| F06 | Edición de total deriva saldo en PostgreSQL del libro y crédito histórico reconocido; no elimina pagos. | Anticipo, cambio de precio, sobrepago y crédito histórico sin nuevas entradas de caja. |
| F07 | Devolución neta por método y cancelación atómicas, bajo bloqueo del pedido. | Dos solicitudes concurrentes y reintento producen una devolución, nunca más que lo recibido. |
| F08 | Reservas y generación de folios en servidor, contador bloqueado e índices únicos por sucursal. | Sesiones simultáneas; V9999→V10000 y C999→C1000 sin truncar numeración. |
| F09 | Todas las escrituras financieras bloquean el corte; cierre verifica totales bajo ese mismo bloqueo. Se impiden cambios de cliente en cortes cerrados. | PostgreSQL 17 nativo: si cierre gana, cobro se rechaza; si cobro gana, cierre con resumen anterior se rechaza y puede reintentarse. |
| F10 | Visor, descarga automática y térmico comparten datos_corte_pos por corte/sucursal; devuelven datos completos o error. Ambos comprobantes listan devoluciones de anticipos. | Dos sucursales con fechas superpuestas; IDs exclusivos por corte; render real de ambos componentes. |
| F11 | Agregados de dinero en servidor; listAll/filterAll con cursor, conteo verificado antes/después y fin solo con página vacía. Pedidos y badge sin umbral dependiente del API. | N−1/N/N+1 para 200/500/1000/5000/10000, caps de 73/1000; mutación detectada; resumen/corte con 60001 ventas. |
| F12 | list admite offset igual que filter; orden con ID estable, deduplicación y aislamiento de consultas al cambiar sucursal. | Páginas globales/sucursal distintas, todos los IDs alcanzables. |
| F13 | Intención persistida antes de solicitar venta; servidor compara contenido y devuelve cabecera/detalles canónicos. Ticket usa respuesta guardada, con aviso de recuperación. | Cambiar carrito después de respuesta perdida no cambia ticket confirmado ni genera otro ingreso. |
| F14 | Calendario CDMX explícito para consultas y fechas mostradas en reporte. | Personalizado, hoy y año en CDMX/UTC/Los Ángeles/Tokio. |

## Saldos históricos y conciliación

Se respaldan los valores anteriores en app_private.reparacion_saldos_20261001. Los cinco ajustes se condicionan a que total comercial, componentes y pagos sigan coincidiendo con la revalidación; una diferencia aborta la migración. No se cambian totales, abonos ni cortes para hacer estos ajustes.

| Folio | Total guardado | Crédito reconocido | Saldo anterior | Saldo aritmético |
|---|---:|---:|---:|---:|
| PP-A-0074 | 1090 | 500 | 440 | 590 |
| PP-A-0133 | 2370 | 500 | 1720 | 1870 |
| PP-A-0175 | 1450 | 0 | 1300 | 1450 |
| PP-A-0185 | 470 | 200 | 440 | 270 |
| PP-A-0203 | 1250 | 100 | 330 | 1150 |

Corrección de la auditoría original: los cuatro abonos por $1700 tienen ventas paralelas CANCELADAS (PP-A-0292 $640, PP-A-0212 $500, PP-C-0006 $280, PP-C-0007 $280). Su ausencia entre ventas pagadas no demuestra venta faltante. Se vinculan pares históricos inequívocos, incluidos cancelados, sin recrear ni reactivar ingresos. Queda pendiente confirmar los motivos y comprobantes originales de esas cancelaciones antes de cualquier compensación contable. El servidor ahora impide cancelar una venta de abono independientemente del pedido.

Créditos reconocidos anteriores al libro se conservan en credito_historico. No se insertan cobros/ventas ficticios. Una devolución que incluya crédito sin método original documentado se rechaza para conciliación explícita, evitando sacar dinero sin evidencia del método.

## Pruebas reproducibles

`npm ci && npm run test:operacion` ejecuta PostgreSQL embebido aislado y pruebas del código real del cliente. Fixture mínima contiene tablas/constraints/guardas de la base revisada, sin clientes ni credenciales. Fallos se inyectan después de cada escritura, incluida la intención final. Adicionalmente se probaron sesiones concurrentes en PostgreSQL 17 del proyecto, exclusivamente en confetti_validacion_20261002, esquema revocado y no expuesto al API; su creación y eliminación tienen SQL versionado. No hubo ventas, pedidos, pagos, devoluciones ni aperturas ficticias en public.

Build del POS: código 0. Lint conserva sus 38 errores previos. Typecheck se compara con 1253 diagnósticos iniciales; consultar evidencia de publicación para el conteo final. Pruebas antiguas de ticket se actualizaron por traslado de pago al servidor, inclusión de devolución y guardas de error; huellas históricas desactualizadas se alinean con la base de código verificada. Se mantienen pruebas de efectivo/cierre/avance de impresión.

## Despliegue y recuperación

SQL nuevo aditivo generado con Supabase CLI, versionado en GitHub antes de aplicar; migraciones anteriores intactas. Ambas ramas operativas deben avanzar al mismo commit: migracion/supabase (producción) y apk/capacitor (alias remoto embebido en APKs). No se cambia server.url ni binarios. La PWA recibe el nuevo shell; JavaScript abierto no se transforma durante un cobro. Si aparece ACTUALIZAR_POS, cerrar y abrir la app después de concluir cualquier operación incierta; no hubo escrituras parciales. Recuperar el intento pendiente desde el mismo dispositivo, sin borrar datos del navegador.

Reversión: no regresar al cliente antiguo que escribe pagos separados ni retirar el libro. Ante un problema publicar una corrección compatible; conservar crédito/abonos/intenciones/backups. Ajustes manuales de cortes cerrados exigen corrección contable documentada, sin reescribir el corte desde el cliente.

## Límites y trabajo siguiente

La prueba de impresora/cajón/tablet física no se realizó: se comprobó código, render, transacciones y canal remoto. Auth/usuarios (incluida protección de Abel/último dueño), acceso público F16 y los medios restantes F15/F17–F26 siguen en la auditoría general. F21 se reduce en listas/consultas y errores de comprobantes; no se certifica cada pantalla ajena a esta entrega. Exportaciones de Registros de una lista incremental dicen «Exportar cargados» mientras exista otra página; el conteo exportado siempre es explícito. La exportación de Datos es un conjunto de CSV de entidades implementadas, no respaldo completo restaurable de Supabase/Auth/Storage.

Consultar estado vivo en GitHub, Vercel y schema_migrations. Este documento describe mecanismos y pruebas; la publicación efectiva se registra por separado al terminar la verificación remota.

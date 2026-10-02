# Plan de reparación operativa — autorización de Miguel, 2026-10-01

Primera ronda: F05–F14 y tickets. Auth/usuarios (F01–F04) se reservan para la segunda ronda.

| Orden | Fallo y archivos | Corrección | Evidencia para cerrar |
|---|---|---|---|
| 1 | F05/F06: registrarPagoPedido, NuevoPedidoPastel, RegistrarPagoDialog, pedidos/abonos | Pago e ingreso contable en una transacción; saldo derivado; preservar anticipo histórico; clave persistente | Fallo en cada escritura revierte todo; respuesta perdida y doble pago; edición antes/después de pagar; ticket usa saldo actual |
| 2 | F07: devolucionAnticipo | Devolución neta y cancelación atómicas, deduplicadas | Reintentos y dos devoluciones nunca superan el neto recibido |
| 3 | F08/F09: pedidoPastelUtils, RPC de venta, cortes | Folios en servidor; unicidad; bloqueo del corte compartido; cierre valida operaciones completas | Concurrencia real, ambos órdenes venta/cierre y contador único |
| 4 | F10: CorteAutoDownloader/CorteViewerDialog | Fuente común de ventas, gastos y detalle por corte y sucursal; errores visibles | Dos sucursales simultáneas, automático/manual/térmico contienen los mismos IDs |
| 5 | F11/F12: adaptador, Dashboard, Caja, Registros, exportación | Paginación completa, estable, independiente del límite API | 199/200/201, 499/500/501, 999/1000/1001 y cap API inferior |
| 6 | F13/F14: POS, crearVentaDirecta, useResumenPeriodo | Intención persistente vinculada al contenido y resultado; rango de calendario CDMX | Recarga y respuesta perdida no duplican; cambio de carrito no reutiliza una intención; límites de medianoche |

## Datos históricos

Revalidar antes de escribir. Respaldar estados financieros anteriores y registrar la razón. No crear otro abono para corregir una venta paralela faltante. No considerar la ausencia de una venta identificable por texto como prueba suficiente para reconstruir ingresos. Conservar los anticipos históricos sin libro de abonos como crédito separado, sin ingresarlos de nuevo en caja.

Cinco saldos revalidados no cumplen total menos importe reconocido. Se verificó el total comercial contra sus componentes; corregir únicamente si los valores y el libro siguen coincidiendo al aplicar. Los otros cuatro abonos tienen ventas canceladas asociadas: no reconstruir otro ingreso. Conciliar motivo y comprobantes originales antes de corregir esos eventos.

## Publicación y reversión

Probar en base aislada y build del POS. Comparar lint/typecheck contra su línea base. Migraciones aditivas, SQL exacto versionado; no editar migraciones anteriores. Publicar migracion/supabase y avanzar apk/capacitor al mismo commit sin forzar. Verificar ambos despliegues. No modificar server.url, binarios ni flujo de PIN. Conservar los candados de Caja y la fórmula efectivoEsperadoDeResumen.

Este plan describe trabajo autorizado; las comprobaciones no ejecutan ventas, pagos ni devoluciones ficticias en producción. El registro de reparación documentará qué quedó desplegado y qué sigue pendiente, sin declarar pruebas físicas no realizadas.

Implementación y evidencia: `REGISTRO_REPARACION_OPERATIVA_2026-10-02.md`.

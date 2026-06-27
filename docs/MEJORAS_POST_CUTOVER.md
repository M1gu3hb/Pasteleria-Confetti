# MEJORAS POST-CUTOVER — Pastelería Confetti

> Cosas que **NO** son parte de la migración (regla: migrar IDÉNTICO a Base44 primero, mejorar después). Se evalúan con Miguel **después** del cutover. NO se hacen a media migración.

| # | Mejora | Por qué post-cutover (no es fidelidad) | Origen |
|---|---|---|---|
| 1 | **Desglose de descuentos monetarios en el corte/PDF** (listar cada venta con su descuento $, no solo el total neto) | Base44 **tampoco** lo desglosaba — el corte muestra el total neto y solo `DescuentoInventarioVenta` (insumos). Mostrarlo sería NUEVO. | PASO 1 del bot (comparación CorteTicket baseline vs migrado) |
| 2 | **Doble conteo de `efectivo_esperado`** con abono efectivo | Quirk de Base44 (verificado vs cortes reales). Arreglarlo rompería la paridad; es decisión de negocio. El oráculo del bot lo ESPERA. | DECISIONS #9 |
| 3 | **Notas de voz** (alertas habladas del POS) | Feature de plataforma, no de Confetti; no afecta el dinero. | Inventario de features |
| 4 | **Control de catálogo** (gestión avanzada del catálogo web) | Mejora de gestión, no fidelidad. | Inventario de features |
| 5 | **Auditoría de elementos "fantasma" de Base44** | Campos/entidades de plantilla Base44 sin uso real (p. ej. `total_cancelaciones`/`total_descuentos` almacenados pero NO mostrados en ninguna pantalla; mesas/propinas/restaurante apagados). Limpieza, no fidelidad. | Migración (stubs no-op) + PASO 1 |
| 6 | **`ConfigContext` re-fetch al cambiar de sesión** | Tras el login del terminal, ConfigContext sigue con el fallback anon `config_publica` (sin `propinas_activas`) hasta un reload; `tipsEnabled` da true y el cobro abriría el `PropinaDialog` (stub no-op). **NO urgente:** propinas están off y un reload tras login lo resuelve (el bot lo hace). Revisar si conviene que ConfigContext re-fetche `configuracion_negocio` al detectar sesión. | PASO 2 del bot (iteración en vivo) |
| 7 | **Cobro de pedidos web de catálogo desconectado (incluye MIXTO)** | `CobrarPedidoWebDialog` (cobro por `total_final`, único con método **mixto**) está **huérfano en baseline(origin/main) Y migrado**: `abrirCobroPedidoWeb` (Caja.jsx:550) se define pero **nunca se invoca**; `pedidoWebACobrar` solo se pone a null. Además el pedido de catálogo nace con `saldo_pendiente=0` (≠ `total_final`), así que `RegistrarPagoDialog` (basado en saldo) tampoco lo cobra. **Resultado:** el pedido web de catálogo no es cobrable por la UI conectada, y el método **mixto no es alcanzable en ningún flujo** (venta directa=3 métodos, RegistrarPagoDialog=3). **NO es regresión** (idéntico a Base44). Miguel: confirmar cómo cobra Abel estos pedidos hoy, o conectar `CobrarPedidoWebDialog` como mejora. | Flujo MIXTO del bot (iteración en vivo + diff con baseline) |

## Nota sobre #1 y #5 (del PASO 1 del bot)
- **Cancelaciones SÍ se muestran** línea por línea en el PDF del corte migrado (folio·tipo·productos·motivo·usuario·reembolso), idéntico a Base44 → **eso es fidelidad y ya está**, no es mejora.
- El **campo agregado** `total_cancelaciones`/`total_descuentos` (que el migrado no puebla) **no se muestra en ninguna pantalla/PDF** de Base44 ni del migrado → no afecta lo que ve Abel. Si algún día se quiere persistir el agregado, va aquí (#5).

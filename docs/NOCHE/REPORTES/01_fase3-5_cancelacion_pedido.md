# Reporte — Fase 3 #5 · Tipo/motivo de cancelación de pedido

**Fecha:** 2026-06-28 (run nocturno)
**Commit:** (ver final)

## Objetivo
Dar a la cancelación de un pedido el MISMO trato que a una venta: en vez de un
`confirm()` nativo sin rastro, un diálogo con **tipo (cancelacion|devolucion) +
motivo OBLIGATORIO + sello (quién/cuándo)**. SIN movimiento de dinero (el dinero
de la devolución del anticipo es #4). Aplica a pedido de pastel **y** de catálogo.

## Diagnóstico
- `pedidos` NO tenía ninguna columna de cancelación (query a `information_schema`).
- `ventas` ya tiene el set completo: `tipo_cancelacion, motivo_cancelacion,
  cancelado_por_id/nombre, fecha_cancelacion, monto_devuelto`.
- DOS puntos cancelaban un pedido con `confirm()`/`window.confirm()` sin tipo/motivo/sello:
  1. `PedidoPastelDetalleDialog.jsx:211` → `cambiarEstado('cancelado')` (pastel **y** catálogo, mismo detalle).
  2. `Caja.jsx:544 handleCancelarPedidoWeb` → `update(estado:'cancelado')` (catálogo web en la cola de Caja).
- `CancelarVentaDialog` recibe el `modo` por prop (la venta se cancela desde la
  sección Ventas). Para el pedido el tipo se elige DENTRO del diálogo.

## Cambios
- **Migración `0026_pedidos_cancelacion.sql`** (idempotente, aplicada): `pedidos` +=
  `tipo_cancelacion, motivo_cancelacion, cancelado_por_id, cancelado_por_nombre,
  fecha_cancelacion` (text/timestamptz) y `monto_devuelto numeric default 0`
  (esta última es el gancho de #4). Verificado: 6 columnas presentes.
- **`src/api/entitiesAdapter.js`**: whitelist de `pedidos` += las 6 columnas (si no,
  el update las descarta).
- **`src/components/pedidos/CancelarPedidoDialog.jsx`** (NUEVO): espejo de
  `CancelarVentaDialog` con selector de tipo. Motivo obligatorio + sello
  `cancelado_por_*` + `fecha_cancelacion`. Ruta SIN dinero (#5): cancelación, o
  devolución sin anticipo (monto 0) → `estado='cancelado'` + sello. Ruta DINERO
  (#4): devolución CON anticipo delega al gancho `onDevolverAnticipo(...)`; si no se
  inyecta, bloquea esa ruta (no mueve dinero a medias) con aviso en el diálogo.
- **`PedidoPastelDetalleDialog.jsx`**: el botón "Cancelar pedido" abre el diálogo
  (antes `confirm()`). Sin `onDevolverAnticipo` (se conecta en #4).
- **`Caja.jsx`**: `handleCancelarPedidoWeb` ahora abre el diálogo (antes
  `window.confirm`); render del `CancelarPedidoDialog` en la cola web.

## Verificación en vivo (BD + consola + build)
- `vite build` → exit 0.
- Pedido web SIN anticipo `PP-B-0001` (total_abonado=0). Detalle → "Cancelar pedido"
  → diálogo abre con selector (Cancelación / Devolución) + motivo. Tipo=cancelación,
  motivo escrito, confirmar.
- **BD tras confirmar:** `estado='cancelado'`, `tipo_cancelacion='cancelacion'`,
  `motivo_cancelacion='Cliente desistió del pedido (prueba #5)'`,
  `cancelado_por_nombre='Empleado'`, `fecha_cancelacion` no nula, `monto_devuelto=0`.
- Salió de la cola/lista activa (0 cards con el folio; no aparece en la vista).
- Consola POS sin errores. Staging dejado pristino (0 pedidos/ventas/abonos/cortes).

## Auto-auditoría
- **VEREDICTO: 🟢**
- **¿Cumple el objetivo?** Sí: el pedido se cancela con tipo+motivo+sello (igual que
  una venta), por diálogo (no `confirm()`), en pastel y catálogo (mismo detalle) y en
  la cola web de Caja. Flujo completo correcto para la ruta SIN dinero.
- **Verificado en vivo:** BD (sello completo), salida de cola, build, consola.
- **Candados:** intactos. Candado 5 (cancelar = cambio de estado, no borrado) ✓.
  No se tocó la matemática de caja/abonos/ventas → `efectivo_esperado`/buckets sin
  cambio (regresión de dinero estructuralmente intacta; la regresión viva
  obligatoria se ejecuta en #4, que sí toca dinero).
- **Decisiones / FLAGS:**
  - 🔸 La ruta **devolución CON anticipo** queda **bloqueada en #5** (gancho
    `onDevolverAnticipo` no inyectado) — se habilita en #4. El diálogo lo avisa.
  - 🔸 `monto_devuelto` se añadió ya en 0026 (lo usa #4) para no re-migrar.
- **Riesgos:** ninguno nuevo; cambio aislado a la cancelación de pedidos.

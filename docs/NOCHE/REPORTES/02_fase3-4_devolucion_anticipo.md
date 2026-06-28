# Reporte — Fase 3 #4 · Devolución de anticipo (DINERO) · ⚠️ ALTA PRIORIDAD

**Fecha:** 2026-06-28 (run nocturno)
**Commit:** (ver final) — *aparte, reversible solo*

> ⚠️ **REVISAR PRIMERO EN LA MAÑANA.** Es el cambio que mueve dinero. Lee la
> "Decisión de mecanismo" y la "Matemática / FLAGS".

## Objetivo
Al cancelar un pedido como **devolución** que ya tuvo anticipo (cobrado en un corte),
devolver ese dinero de forma transparente: avisar el monto, registrarlo saliendo del
corte ABIERTO actual, con nota, sin tocar el/los corte(s) viejo(s). Igual que devolver
una venta. Exige caja abierta.

## Diagnóstico del mecanismo de venta-devolución (cómo registra el dinero de vuelta)
- `CancelarVentaDialog` NO crea un registro nuevo: pone la venta en `estado='cancelada'`
  + `monto_devuelto` + sello. 
- El corte lee `ventasHoy = Venta.filter({estado:'pagada'})`. Al pasar a `'cancelada'`,
  la venta **sale del filtro** → su monto deja de contar en el resumen → baja
  `efectivo_esperado` (= `totalEfectivo + abonosEfectivo`). El dinero "sale" por
  EXCLUSIÓN, **una sola vez** (las ventas no tienen doble conteo; solo los abonos).
- Un corte CERRADO guarda totales **snapshot** (no se recalculan): cancelar una venta
  vieja NO altera el corte cerrado.

## Por qué un pedido NO puede usar el mismo flip
El anticipo entró como **Venta paralela** en el corte del día del cobro (a menudo ya
CERRADO). Voltear esa venta a 'cancelada' (a) no se ve en el corte ABIERTO de hoy, y
(b) tocaría datos del corte viejo. La devolución debe verse HOY.

## ⚠️ Decisión de mecanismo (criterio propio — FLAG FUERTE)
El desglose de métodos del corte (`desgloseMetodosPagoExacto`) **ignora ventas con
`total<=0`** y **clampa cada método a `>=0`** → una **venta negativa NO restaría nada**
y además descuadraría `total_general` vs métodos. En cambio, `abonosEfectivo` (y los
otros buckets de abonos) son **suma CRUDA** de `monto_efectivo/tarjeta/transferencia`
de los abonos del corte abierto (`Abono.filter({corte_caja_id})`), y **aceptan
negativos**.

**Mecanismo elegido:** registrar la devolución como **UN abono COMPENSATORIO negativo
en el corte ABIERTO**, con el desglose por método del anticipo en negativo
(`monto=-X`, `monto_efectivo=-Xef`, etc.). Util nuevo `src/utils/devolucionAnticipo.js`.
Efecto:
- `efectivo_esperado` baja exactamente el **efectivo** devuelto (UNA vez) — igual que
  una venta-devolución reduce el efectivo una vez (consistencia pedida por el MD).
- La card "Pagos de pedidos de pastel" refleja la salida por método.
- Los corte(s) viejo(s) **NO se tocan** (candado 9). 
- El pedido se sella `estado='cancelado'`, `tipo_cancelacion='devolucion'`,
  `monto_devuelto`, motivo, sello.

## Cambios (archivos)
- **`src/utils/devolucionAnticipo.js`** (NUEVO): `registrarDevolucionAnticipo({pedido,
  motivo, cajaAbierta, posUser, sucursalEfectiva})`. Calcula el desglose desde los
  abonos POSITIVOS del pedido (excluye devoluciones previas), crea el abono negativo en
  el corte abierto y sella el pedido. Sin anticipo real → solo sella (monto 0). Lanza
  `SIN_CAJA` si no hay corte.
- **`CancelarPedidoDialog.jsx`**: la ruta 'devolucion' con anticipo llama al gancho
  `onDevolverAnticipo`; el log del bloqueo esperado es `warn` (no error).
- **`PedidoPastelDetalleDialog.jsx`**: `handleDevolverAnticipo` (exige caja + corte al
  día) inyectado como `onDevolverAnticipo`.
- **`Caja.jsx`**: `handleDevolverAnticipoWeb` inyectado en la cola web.

## Verificación EN VIVO (BD — evidencia)
1. **Devolución efectivo CROSS-CORTE (escenario clave):** anticipo $100 efectivo en
   Corte 1 → cierro Corte 1 (`total_efectivo=100`, `efectivo_esperado=200` = doble
   conteo) → abro Corte 2 → devolución. Resultado:
   - Abono compensatorio en Corte 2: `monto=-100, monto_efectivo=-100, metodo=efectivo`.
   - Pedido: `cancelado/devolucion/monto_devuelto=100` + sello.
   - **Corte 1 INTACTO** (`efectivo_esperado=200`, `total_efectivo=100`) — candado 9 ✓.
   - **Corte 2 cerrado: `efectivo_esperado=-100`** (el efectivo salió una vez).
2. **Devolución mixto:** anticipo ef90+tar60 → abono compensatorio
   `monto=-150, ef=-90, ta=-60, metodo=mixto`. Métodos no se descuadran.
3. **Regresión método único:** Corte 1 (single-efectivo $100) dio `efectivo_esperado=200`
   = baseline doble conteo (sin cambio). ✓
4. **Sin anticipo + devolución:** pedido sin abonos → `cancelado/devolucion/monto 0`,
   **0 abonos** creados.
5. **Sin caja abierta → bloquea:** cerré la caja e intenté devolver un pedido con
   anticipo → el pedido quedó `con_anticipo` (NO cancelado), 0 abonos. Toast de aviso.
- `vite build` exit 0. Consola de errores limpia (el bloqueo SIN_CAJA es `warn`).

## Auto-auditoría
- **VEREDICTO: 🟢**
- **¿Cumple el objetivo?** Sí: la devolución saca el dinero del corte ABIERTO (efectivo
  baja una vez), con nota y sello, sin tocar cortes viejos, exigiendo caja abierta.
- **Candados:** 9 (cortes cerrados intactos) ✓; doble conteo se MANTIENE (no se
  "arregla") ✓; cancelar = cambio de estado ✓; sucursal en el abono ✓; reusa el
  diálogo de #5 ✓.
- **Regresión de dinero:** método único IDÉNTICO (200 para $100 efectivo).
- **FLAGS para Miguel (revisar):**
  - 🔸 **Mecanismo = abono negativo** (no venta negativa) por la matemática del desglose.
    Es la decisión propia clave. Reversible (es solo un registro Abono + el sello).
  - 🔸 **`efectivo_esperado` puede quedar NEGATIVO** en un corte cuya única actividad es
    una devolución (Corte 2 = -100). Es correcto (el efectivo salió y la fórmula no
    incluye el fondo de apertura). Si quieres que muestre `fondo - devuelto`, es otra
    decisión (no la tomé para no cambiar la fórmula del candado).
  - 🔸 **Mismo día (anticipo y devolución en el MISMO corte):** la venta paralela del
    anticipo sigue contando en `total_efectivo`; el abono negativo solo neutraliza el
    lado-abono. Queda el sesgo +efectivo del **doble conteo** (que es el quirk aceptado,
    NO un bug nuevo). Consistente con que la venta-devolución baja el efectivo una vez.
  - 🔸 La devolución baja `efectivo_esperado` y la card de abonos, pero **no** baja
    `total_efectivo`/`total_general` (ventas-only). Igual que devolver una venta de un
    corte pasado no baja los ingresos de hoy. Si Miguel quiere una línea explícita de
    "Devoluciones del día" en el corte/PDF, es una mejora aparte (no bloqueante).

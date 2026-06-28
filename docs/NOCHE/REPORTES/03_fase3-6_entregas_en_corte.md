# Reporte — Fase 3 #6 · Entrega de pastel en el corte

**Fecha:** 2026-06-28 (run nocturno)
**Commit:** (ver final)

## Objetivo
Pagar y entregar son momentos distintos. Cuando se ENTREGA un pastel/pedido, en el
corte debe aparecer una línea informativa (NO suma a totales ni a efectivo_esperado):
`Entregado [nombre interno] — [hora] — [folio] — entregado`. Respeta sucursal y la
frontera del día del corte.

## Diagnóstico
- Entregar hoy = `cambiarEstado('entregado', { fecha_entrega_real })` en
  `PedidoPastelDetalleDialog`. No tenía reflejo en el corte.
- El corte/PDF se arman en 3 sitios: `ResumenDelDia` (vivo), `CorteViewerDialog`
  (histórico) y `CorteAutoDownloader` (PDF al cierre). El PDF lo dibuja `CorteTicket`.

## Cambios
- **`src/utils/entregasCorte.js`** (NUEVO): `obtenerEntregasDelCorte({sucursalId, desde,
  hasta})` → pedidos `estado='entregado'` con `fecha_entrega_real` en el rango del corte
  y de su sucursal. Devuelve `[{folio, nombre, hora, fechaMs}]` (nombre interno =
  cliente_nombre || concepto). NO toca dinero.
- **`CorteTicket.jsx`**: prop `entregas` + Sección "Entregas de pastel del día"
  (tabla Pastel/Hora/Folio/Estado + nota "no suman a los totales").
- **`ResumenDelDia.jsx`**: prop `entregas` + sección con la línea
  `Entregado [nombre] — [hora] — [folio] — entregado`.
- **`Caja.jsx`**: query `entregas_corte` del corte abierto (sucursal del corte, desde
  apertura) → pasa a `ResumenDelDia`.
- **`CorteViewerDialog.jsx`** y **`CorteAutoDownloader.jsx`**: computan `entregas` por el
  rango del corte y lo pasan a `CorteTicket`.

## Verificación EN VIVO (BD + DOM + PDF)
- Pedido web `PP-B-0001` ("Lucia", $420). Abro corte, lo pago COMPLETO ($420 efectivo)
  y lo marco **Entregado** (estado='entregado', fecha_entrega_real).
- **Resumen del día (vivo):** aparece "Entregas de pastel del día → Entregado **Lucia**
  — 02:39 — PP-B-0001 — entregado".
- **PDF (CorteTicket, vía CorteViewerDialog):** sección "ENTREGAS DE PASTEL DEL DÍA" con
  fila `Entregado Lucia | 02:39 | PP-B-0001 | entregado` + nota informativa.
- **Totales NO afectados por la entrega:** el corte cerrado quedó `total_efectivo=420,
  total_general=420, efectivo_esperado=840, numero_ventas=1` — todo proveniente del PAGO
  (doble conteo 420+420), la entrega no sumó nada.
- `vite build` exit 0. (Se usó un `console.log` temporal para diagnosticar un falso
  negativo de lectura — el innerText del PDF refleja el `text-transform:uppercase` de los
  títulos; YA ELIMINADO.)

## Auto-auditoría
- **VEREDICTO: 🟢**
- **¿Cumple el objetivo?** Sí: la entrega aparece como línea informativa en el Resumen y
  en el PDF, con el formato pedido, sin tocar totales/efectivo_esperado.
- **Candados:** sucursal del corte respetada (candado 7); rango = apertura..cierre del
  corte (candado 2, frontera del día ya fijada por el corte); cero dinero movido.
- **Regresión de dinero:** idéntica (la entrega no crea registros de dinero; el corte
  refleja solo el pago).
- **Decisiones / FLAGS:**
  - 🔸 Las entregas se calculan por RANGO+sucursal en tiempo de render (vivo, histórico y
    cierre) — NO se snapshotean en una columna del corte. Ventaja: cero migración y
    siempre consistente con `fecha_entrega_real`. Si en el futuro se reabriera/editara la
    fecha de entrega, el PDF histórico reflejaría el estado actual (aceptable para algo
    informativo). Si Miguel quiere un snapshot inmutable, sería una columna JSON aparte.

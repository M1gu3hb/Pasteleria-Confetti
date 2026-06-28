# 03 — Fase 3 · #4 · Devolución de anticipo al cancelar (DINERO — máximo cuidado)

> ⚠️ **El cambio más delicado de la noche.** Marca su reporte como **ALTA PRIORIDAD** para
> la revisión de Miguel en la mañana. Commit aparte para que sea reversible solo.

## Objetivo
Si se cancela un pedido (web o pastel) que YA tuvo anticipo (registrado en un corte), con
**tipo='devolucion'**, el sistema debe: **AVISAR** del dinero devuelto, **RESTARLO del
dashboard**, y **EXPLICAR** que fue devolución con **NOTA** del porqué. Transparencia, no
asiento contable complejo. **Igual que al devolver una venta.**

## Candados que aplican
- **NUNCA reescribas cortes CERRADOS** (snapshot, candado 9). La devolución se registra en
  el **corte ABIERTO actual**.
- **Exige caja abierta:** si no hay, **bloquea y avisa** (como un cobro). No registres
  devolución sin corte abierto.
- Cancelar = cambio de estado (candado 5).

## Pasos
1. **DIAGNÓSTICO PRIMERO (no construyas hasta entenderlo):** cómo una **VENTA-devolución**
   registra el dinero de vuelta — `tipo_cancelacion='devolucion'`, `monto_devuelto`, y
   **CÓMO** eso afecta corte / dashboard / PDF (¿crea un registro?, ¿lo resta de
   `efectivo_esperado`/totales?, ¿requiere caja abierta?). Documenta el mecanismo EXACTO
   en el reporte.
2. **MIRROR, no inventes:** implementa la devolución del pedido con el **MISMO mecanismo**
   que la venta-devolución. El anticipo entró como Venta(s) paralela(s) a un corte; la
   devolución debe producir el efecto inverso **visible en el corte ABIERTO actual**
   (dinero que sale), con **nota** del motivo, restando del dashboard en vivo. **NO toques
   el/los corte(s) viejo(s)** donde entró el anticipo.
3. **Efecto por método (con Opción A ya aplicada):** si el anticipo fue efectivo/mixto, la
   salida de efectivo debe reflejarse en el efectivo del corte actual de forma
   **consistente** con cómo una venta-devolución refleja `monto_devuelto`. **Auto-audita la
   matemática:** tras la devolución, el dashboard/corte muestra el dinero saliendo, sin
   descuadrar los demás métodos.
4. **Conecta el camino 'devolucion' del diálogo de #5:** al elegir `devolucion` en un
   pedido con `total_abonado > 0`, dispara este flujo (monto a devolver = `total_abonado`
   por defecto; **nota obligatoria**). **Avisa** al usuario el monto devuelto.
5. **Pedido sin anticipo + devolucion:** no hay dinero que mover (trátalo como cancelacion
   con tipo devolucion, monto 0).

## Decisión propia si el mecanismo de venta-devolución no calza 1:1
Elige la opción que (a) mantenga el dashboard **transparente** (dinero que sale, visible,
con nota), (b) **NUNCA** reescriba cortes cerrados, (c) **exija caja abierta**.
Impleméntala y **FLAG FUERTE** en el reporte (es exactamente lo que Miguel revisará
primero).

## Verificación en vivo (evidencia BD + PDF — ALTA prioridad)
- Pedido con anticipo en **efectivo** → cancelar como devolución → el corte actual refleja
  la salida; dashboard baja; nota visible; **corte viejo intacto**.
- Pedido con anticipo **mixto** → ídem; efectivo y tarjeta correctos.
- **Regresión estándar de dinero** (corte de método único) **idéntica**.
- Pedido **sin** anticipo → cancela limpio sin tocar dinero.
- Sin caja abierta → bloquea con aviso.

Auto-audita con veredicto y **reporta TODO** (incluida la decisión de mecanismo). **Commit
aparte.**

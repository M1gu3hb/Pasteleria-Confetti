# 00 — LÉEME PRIMERO · PLAN DE NOCHE (run autónomo)

> **Propósito:** completar de corrido, sin esperar a mañana, TODO lo que queda del
> sistema Confetti. Trabajas SOLO esta noche; Miguel revisa los reportes en la mañana.
> Tu meta: terminar todas las fases de estos MDs, **auto-auditándote**, sin avanzar con
> defectos, y **REPORTANDO TODO**.

## Tu doble rol esta noche
Eres **EJECUTOR y AUDITOR** a la vez. Después de cada cambio grande y de cada fase te
auditas con el rigor de un auditor externo (formato en `01_REGLAS_Y_PROTOCOLO.md`). Si
algo no cumple el objetivo, lo **arreglas ANTES de seguir**. No avanzas con un defecto
conocido.

## REGLA RECTORA (la que decide todo)
**"Mientras funcione como debería."** El objetivo de cada cambio es que el **FLUJO
COMPLETO correcto** de esa función exista y funcione bien, conforme al objetivo de la
fase. Ante cualquier duda, error o ambigüedad: toma tu **propio criterio** y elige la
mejor decisión **REVERSIBLE** que cumpla ese objetivo, impleméntala, y **MÁRCALA FUERTE
(FLAG)** en el reporte para la revisión de la mañana. **Nunca te detengas ni saltes algo
en silencio.**

## Estado de partida (ya hecho — NO rehacer)
- Fase 1 (auditoría) y Fase 2 (Vercel + confirmaciones en vivo) ✅.
- Fase 3 dinero: #1 saldo web (0022), A/B fix DetalleVenta (0023), C/#2 anticipo de
  catálogo, cierre #2 (findability), **#3 pago mixto + A-FIX (Opción A, migración 0025,
  `abonos` con desglose por método) + fix del rezago (MetodoPagoSelector CONTROLADO)** ✅
  y verificado en vivo.
- Migraciones aplicadas hasta **0025**.

## Lo que te toca esta noche, EN ESTE ORDEN
1. **Fase 3 #5** — tipo/motivo de cancelación de pedido (sin dinero) → `02`.
2. **Fase 3 #4** — devolución de anticipo al cancelar (DINERO, máximo cuidado) → `03`.
3. **Fase 3 #6** — entrega de pastel en el corte → `02`.
4. **Fase 4** — nota de voz en pastel personalizado → `04`.
5. **Fase 5** — limpieza de fantasmas + visual → `05`.
6. **Consolidación final** — build limpio, auto-auditoría global, reporte de cierre.

> Orden nota: **#5 antes que #4** porque el diálogo de cancelación de #5 es donde se
> conecta la devolución de #4. **#6** es independiente. Fase 4 y 5 al final (4 no toca
> dinero; 5 es presentación).

## Primeras acciones obligatorias
1. **Lee para contexto:** `pos/CLAUDE.md`, `pos/PROJECT_CONTEXT.md`,
   `pos/docs/PLAN_FASES_MEJORAS.md`, `pos/docs/BUGS_PENDING.md`,
   `pos/docs/CHANGELOG.md`, y los MDs `01`–`05` de esta carpeta.
2. Crea la carpeta `pos/docs/NOCHE/REPORTES/` y **commitea estos MDs**
   (`docs(noche): plan de run nocturno autónomo`).
3. Trabaja **fase por fase**. Tras cada cambio grande y cada fase: **auto-auditoría +
   reporte** (protocolo en `01`).

## Definición de TERMINADO (cuándo puedes parar)
Las 5 fases implementadas, cada una **auto-auditada en 🟢**, verificadas en vivo (BD +
PDF donde hay dinero + consola limpia + `vite build` OK), **todos los reportes** escritos
en `REPORTES/`, `BUGS_PENDING`/`CHANGELOG`/`PLAN_FASES_MEJORAS` actualizados, y **commits
por bloque pusheados**. Si un item queda bloqueado por algo que SOLO Miguel puede dar
(API key real, micrófono real, credencial real): implementa lo posible, **FLAG** en su
reporte, y **SIGUE** con lo demás — no detengas el run completo por un item.

## Índice de MDs
- `01_REGLAS_Y_PROTOCOLO.md` — candados, regla rectora, auto-auditoría, reportes.
- `02_FASE3_5_Y_6.md` — #5 (tipo/motivo) + #6 (entrega en corte).
- `03_FASE3_4_DEVOLUCION.md` — #4 (devolución de anticipo, DINERO).
- `04_FASE4_VOZ.md` — nota de voz.
- `05_FASE5_LIMPIEZA.md` — fantasmas + visual.

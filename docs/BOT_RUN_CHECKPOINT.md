# Checkpoint de las pruebas largas del bot (pausa de sesión)

> Copia en el repo POS para que viaje por git. El detalle completo + el código viven en
> `Bot pruebas/bot-pruebas/docs/RUN_CHECKPOINT.md` (ese directorio NO es repo git → sincronizar a mano).

## Estado
- **Pruebas largas (60 días) PAUSADAS tras el día 17/60.** Faltan días 18-60 (43 días).
- **Semilla fija `20260620`** → reproducible. Día 18 parcial descartado.
- Reanudar (en la otra máquina, con dev servers arriba y staging en solo-maestros):
  `node bot-largo.mjs` (sin args lee `reportes/run60/estado.json` y continúa desde el día 18).

## Resultados días 1-17 — TODO LIMPIO
- **17/17 días limpios** · 🐛 0 bugs reales · ⚠️ 0 automatización.
- **Cuadres corte↔libro/oráculo: 51/51 ✅** (incluye el doble conteo de abonos).
- **Folios: 0 colisiones** (consecutivos por sucursal bajo concurrencia 3-suc).
- **Pedidos web: 8/8** recibidos en la sucursal correcta.
- **RLS: 3/3** sin fugas. **Cancelar/devolver**: el corte excluye las anuladas. **51 PDFs** guardados.

## Decisiones de Miguel ya aplicadas
- **Corte de turno**: botón fantasma de Base44 (Abel no lo usa) → reclasificado a post-cutover en `BUGS_PENDING.md` (g). El bot NO lo ejercita.
- **Cobro mixto**: huérfano en baseline+migrado = fiel a Base44 → `MEJORAS_POST_CUTOVER.md` #7. El bot NO lo fuerza.

## ⚠️ Sincronización a la otra máquina
El **directorio del bot** (`Bot pruebas/bot-pruebas/`: código `bot-largo.mjs`, `reportes/run60/` con MDs+PDFs+`estado.json`+`libro.sqlite`) **NO está en git** → sincronizarlo manualmente (nube/disco). Sin él no se puede reanudar la corrida exacta. Este resumen y los docs del POS sí viajan por git en `migracion/supabase`.

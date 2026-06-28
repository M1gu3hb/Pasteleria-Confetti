# Reporte — Consolidación final del run nocturno

**Fecha:** 2026-06-28 (run nocturno autónomo)
**Rama:** `migracion/supabase` · todos los commits pusheados.

## Resumen ejecutivo
Se completaron las 5 fases del plan de `docs/NOCHE/`, cada una auto-auditada en **🟢**,
verificadas en vivo (BD + PDF donde hay dinero + consola limpia + `vite build` OK), con
reporte por bloque y commits separados (reversibles).

## Fases (en orden) y commits
| Fase | Qué | Veredicto | Commit |
|------|-----|-----------|--------|
| 3 #5 | Cancelación de pedido con tipo/motivo/sello (mig 0026 + CancelarPedidoDialog) | 🟢 | `da8f653` |
| 3 #4 | Devolución de anticipo (DINERO) = abono compensatorio negativo en corte abierto | 🟢 | `ec271a9` |
| 3 #6 | Entregas de pastel en el corte (Resumen + PDF, informativo) | 🟢 | `ac31639` |
| 4 | Nota de voz (mig 0027 bucket + grabación/transcripción/reproducción) | 🟢* | `0aaf3ad` |
| 5 | Limpieza de fantasmas (F1/F2/F4–F12) + visual cards | 🟢 | `4b58351` |

\* Fase 4: 🟢 en todo lo verificable headless; la grabación con micrófono real requiere
verificación manual de Miguel (FLAG).

## Migraciones aplicadas este run
- **0026** `pedidos_cancelacion` — set de cancelación en `pedidos` + `monto_devuelto`.
- **0027** `notas_voz` — bucket `notas-voz` (RLS) + `nota_voz_url`/`nota_voz_transcripcion`.
(Previas del proyecto: 0022–0025.)

## Candados — estado final
- **Doble conteo en `efectivo_esperado`:** se MANTIENE (consistente, Opción A). La
  devolución resta el efectivo UNA vez (igual que una venta-devolución). ✓
- **Cortes CERRADOS inmutables:** la devolución NO toca cortes viejos (escribe en el
  corte ABIERTO). Verificado en vivo (corte viejo intacto $200). ✓
- **Cancelar = cambio de estado:** pedidos se cancelan con estado+sello, nunca borrado. ✓
- **Frontera del día / sucursal del corte:** respetadas en entregas y devolución. ✓
- **Reusar diálogos:** CancelarPedidoDialog espejo de CancelarVentaDialog. ✓
- `CantidadVariableDialog` NO tocado. ✓

## Auto-auditoría GLOBAL
- **VEREDICTO: 🟢**
- `vite build` final: exit 0.
- Runtime sin errores de consola en Caja, Configuración, Ventas, POS.
- **Regresión de dinero IDÉNTICA** tras todos los cambios: corte de método único
  (mostrador $140 efectivo) → `efectivo_esperado=$140`; y el baseline del doble conteo
  (single-efectivo $100 → $200) reproducido en las pruebas de #4.
- Staging dejado **pristino** (0 ventas/abonos/cortes/pedidos de prueba).
- Todos los reportes en `REPORTES/` + bitácora al día; `CHANGELOG`/`PLAN`/`BUGS_PENDING`
  actualizados.

## Lo que necesita a Miguel (FLAGS — detalle en `BUGS_PENDING.md`)
1. **Micrófono real (Fase 4):** verificar grabación+transcripción en vivo.
2. **`efectivo_esperado` negativo** en corte solo-devolución (decisión: ¿incluir fondo?).
3. **Decisión de mecanismo de #4** (abono compensatorio negativo) — revisar el reporte 02.
4. **Código muerto de mesas** dejado en `Configuracion.jsx` (gated) + `EstacionesAyuda`
   huérfano — limpieza enfocada opcional.
5. **Web** (WF1/WI2/I5) — no tocada (repo POS); I5 espera dominio.

## Definición de TERMINADO — cumplida
5 fases implementadas y 🟢, verificadas en vivo, reportadas, docs al día, commits por
bloque pusheados. El único item que queda fuera del alcance headless (micrófono real)
está implementado y FLAGGEADO para verificación manual.

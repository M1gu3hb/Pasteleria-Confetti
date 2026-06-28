# 01 — Reglas, candados, auto-auditoría y protocolo de reportes

## Candados (NO romper, jamás)
1. **Doble conteo en `efectivo_esperado`:** se MANTIENE (ahora consistente vía Opción A —
   `abonos` guardan `monto_efectivo/tarjeta/transferencia`; `efectivo_esperado =
   totalEfectivo + abonosEfectivo`). **NO lo "arregles".**
2. **Frontera del día operativo = medianoche América/Mexico_City** (no 6am).
3. **Cobro limitado a la sucursal del terminal** (`handleBuscarFolioWeb` y cola de Caja).
4. **Fallback venta↔corte** reproducido verbatim.
5. **Cancelar = cambio de estado, NUNCA borrado físico.**
6. **`DetalleVenta` guarda snapshots** (nombre/precio congelados).
7. **`sucursal_id` obligatorio** en todo registro operativo.
8. **Cargas por lotes `$in`**; nunca query por registro.
9. **Cortes CERRADOS son snapshots inmutables:** NUNCA reescribas los totales de un corte
   ya cerrado.
10. **snake_case**; lógica en frontend; **reusar diálogos** (no duplicar lógica).

## Regla rectora y decisiones
**"Mientras funcione como debería":** cada función debe tener su FLUJO completo correcto
conforme al objetivo de la fase. Ante error/ambigüedad: criterio propio → mejor decisión
**reversible** que cumpla el objetivo → impleméntala → **FLAG** en el reporte. No te
detengas; no saltes en silencio. Si algo solo lo puede dar Miguel (API key/mic/credencial
real): implementa lo posible, flaggea y sigue.

## Dinero
Máximo cuidado. Toda parte que toque dinero exige **verificación en vivo (BD + PDF del
corte)**. **Regresión estándar OBLIGATORIA** tras CUALQUIER cambio que toque
caja/abonos/ventas: un corte de **SOLO método único** debe dar el **mismo
`efectivo_esperado`** que el baseline (si cambia un centavo, algo se rompió → arréglalo
antes de seguir). No commitees PINs reales. Staging **pristino** entre pruebas.

## Auto-auditoría (tras cada cambio grande y al cerrar cada fase)
Tómate el rol de auditor externo:
1. **VEREDICTO:** 🟢 ok / 🟡 dudas / 🔴 roto.
2. **¿Cumple el OBJETIVO de la fase** (flujo completo correcto)? ¿Qué falta?
3. **¿Qué verifiqué en vivo?** (evidencia: valores de BD, PDF, consola, build).
4. **¿Candados intactos? ¿Regresión de dinero idéntica?**
5. **Riesgos / decisiones tomadas / qué debe revisar Miguel.**

Regla: **NO avanzas a la siguiente fase con 🟡 o 🔴.** Arregla y re-audita hasta 🟢. Si
tras intentos razonables sigue 🟡 por algo fuera de tu alcance, déjalo lo más correcto
posible, documenta el 🟡 y sigue (no detengas el run).

## Verificación en vivo (cómo)
- **Servidores:** POS `:5174`, Web `:5173` (Vite). **Reinicia el dev server** para consola
  limpia definitiva (descarta churn de HMR) antes de validar dinero.
- **Build:** `vite build` debe pasar tras cambios grandes.
- **BD:** usa el MCP de Supabase (ref `ivqcxdpqxwjxfohiswqb`) para leer ventas/abonos/
  cortes y confirmar montos.
- **Acceso staging (seed, NO reales):** dueño PIN `1234`; password terminal
  `POS-TERMINAL-CONFETTI`; admins XOCHI `2001` / TOPI `3001` / SANG `4001`. Eleva dueño
  con `1234` y navega por el **sidebar** (no recargues: la elevación se pierde).
- **PDF del corte:** genera y revisa etiquetas/montos.

## Protocolo de REPORTES (reporta TODO — regla estricta)
Carpeta: `pos/docs/NOCHE/REPORTES/`. **Un archivo por cambio grande y uno por fase:**
- Nombre: `NN_faseX_<tema>_<timestamp>.md` (ej. `03_fase3-4_devolucion_2026-06-29-0140.md`).
- Contenido mínimo:
  - **Objetivo** (qué y por qué, ligado a la fase).
  - **Cambios** (archivos, migraciones, con rutas).
  - **Verificación en vivo** (evidencia concreta: valores de BD, PDF, consola, build).
  - **Auto-auditoría** (el formato de arriba, con veredicto).
  - **Decisiones / criterio propio + FLAGS** para Miguel.
  - **Commit SHA.**
- Mantén `REPORTES/00_BITACORA.md`: **una línea por evento**, en orden, con hora — para
  leer el run completo de un vistazo en la mañana.
- Reporta también: **cada bug** que encuentres (aunque sea preexistente), **cada
  migración**, **cada decisión**, y **cada cosa que dejes flageada**.

## Fantasmas (Fase 5)
Ejecuta **SOLO** las disposiciones YA decididas en `pos/docs/PLAN_FASES_MEJORAS.md` (ver
`05`). Si encuentras un fantasma/elemento **NO listado**: **NO lo toques; repórtalo** para
Miguel. **Nunca borres sin disposición previa.**

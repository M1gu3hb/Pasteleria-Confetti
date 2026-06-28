# 05 — Fase 5 · Limpieza de fantasmas + visual

## Objetivo
Quitar/neutralizar fantasmas (herencia de la plantilla de restaurante) y limpiar lo
visual. Lo visual es solo presentación (cero riesgo de dinero), por eso al final. **Regla:
ejecuta SOLO las disposiciones YA decididas (abajo).** Cualquier fantasma/elemento **NO
listado**: NO lo toques; **repórtalo**.

## Disposiciones (de `PLAN_FASES_MEJORAS.md` — son las autorizaciones de Miguel)
- **F1** Corte de turno → **QUITAR** (Abel solo usa cierre diario).
- **F2** Mini-dashboard "Resumen" de Caja → **ARREGLAR** (no quitar): mostrar SOLO
  efectivo, métodos de pago y número de tickets. **Fuera:** margen, utilidad bruta/neta,
  costo de ventas, gastos, propinas, "propinas por mesero", "cuentas en mesa".
- **F4/F5/F6** botones muertos (Mantenimiento "Reiniciar/Borrar datos", Ventas "Limpiar
  ventas de prueba", Registros "Limpiar sección") → **NEUTRALIZAR**: al presionar,
  "desactivado por el momento" (no error).
- **F7** página huérfana `CorteCaja.jsx` (`/corte-caja` redirige a `/caja`) → **ELIMINAR**.
- **F8** componentes muertos (`FinancialChart`, `PrimerosPasosCard`, `PedidoListoWatcher`,
  `SolicitudesQRWatcher`, `SoundUnlockButton`) → **ELIMINAR**.
- **F9** `PropinaDialog`, **F12** `ModificadoresDialog` → **ELIMINAR**.
- **F10** código latente de restaurante (`mesas/`, `propinas/`, `IntegracionesRespaldos`,
  `EstacionesPreparacion`, `UnidadesMedida`, `Proveedores` — gated e inalcanzable) →
  **ELIMINAR**.
- **NO tocar:** `CantidadVariableDialog` (productos por kilo/porción — legítimo de
  pastelería).

> **Web** (repo `web`, si llegas esta noche): WF1 queries config muertas, WI2 WhatsApp/logo
> hardcodeados → limpieza menor. **I5** URL Base44 en "Ver web pública" → **NO ahora**
> (pendiente humano, espera dominio).

## Visual
- **Cards de vista rápida del pastel personalizado** (las de 3 en 3): se ven
  saturadas/desordenadas (colores del anticipo, ícono de web, varios colores). **Limpiar —
  menos saturación, más orden — MANTENIENDO toda la información y los íconos/colores**,
  solo mejor distribuidos.

## Método (por cada fantasma, uno por uno)
1. **Confirma en código** que está muerto/inalcanzable (grep de referencias) **ANTES** de
   eliminar.
2. Aplica la disposición. Tras cada eliminación: **`vite build` limpio + grep de
   referencias residuales = 0**.
3. **Reporta cada uno** (qué, por qué estaba muerto, evidencia de 0 referencias, commit).

## Auto-auditoría final de la fase
La app compila y arranca sin errores; **nada operativo se rompió** (ventas / caja /
pedidos / corte intactos — **regresión de dinero idéntica**). Reporta.

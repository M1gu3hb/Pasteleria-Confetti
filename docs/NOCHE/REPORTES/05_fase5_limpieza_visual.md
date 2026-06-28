# Reporte — Fase 5 · Limpieza de fantasmas + visual

**Fecha:** 2026-06-28 (run nocturno)
**Commit:** (ver final)

## Objetivo
Quitar/neutralizar fantasmas (herencia de la plantilla de restaurante) y limpiar lo
visual, **ejecutando SOLO las disposiciones ya decididas** en `PLAN_FASES_MEJORAS.md`.
Lo no listado se reporta, no se toca. `CantidadVariableDialog` NO se toca.

## Disposiciones ejecutadas
- **F1 — Corte de turno → QUITADO.** `Caja.jsx`: botón, estado, handler
  `handleCorteTurno` y render eliminados; `CorteTurnoDialog.jsx` borrado.
- **F2 — Resumen de Caja → ARREGLADO** (no quitado). `ResumenDelDia.jsx` ahora muestra
  SOLO: **Efectivo**, **Métodos de pago** (Método/Monto, sin columna de propinas) y
  **Tickets**. FUERA: ventas reales/total cobrado, utilidad bruta/neta, margen, costo de
  ventas, gastos, propinas, "propinas por mesero" y "cuentas en mesa". Se conservan las
  tarjetas de **Pagos de pedidos** (abonos) y **Entregas** (pastelería, no listadas como
  fuera).
- **F4/F5/F6 — botones muertos → NEUTRALIZADOS.** Llamaban a `base44.functions.invoke`
  (que LANZA). Ahora muestran toast "Función desactivada por el momento." sin error:
  `ReiniciarSistemaSection` (Mantenimiento), `Ventas.handleLimpiar` (Limpiar ventas),
  `LimpiarSeccionButton` (Registros).
- **F7 — `pages/CorteCaja.jsx` (huérfana) → ELIMINADA.** El route `/corte-caja` ya era un
  `<Navigate to="/caja">` (se conserva el redirect; la página no se importaba).
- **F8 — componentes muertos → ELIMINADOS:** `FinancialChart`, `PrimerosPasosCard`,
  `PedidoListoWatcher`, `SolicitudesQRWatcher`, `SoundUnlockButton` (sin imports vivos).
  Comentario obsoleto en `NotificationsWatcher` actualizado.
- **F9 `PropinaDialog` + F12 `ModificadoresDialog` → ELIMINADOS** (eran stubs/gated):
  removidos imports + usos en `POS.jsx`, `Caja.jsx`, `Productos.jsx` y borrados.
- **F10 — código latente de restaurante → ELIMINADO:** `mesas/` (3 stubs),
  `IntegracionesRespaldos`, `EstacionesPreparacionSection`, `UnidadesMedidaSection`,
  `ProveedoresSection`. Cirugía en `Configuracion.jsx`: quitadas las pestañas
  "Integraciones" y "Mesas" + los bloques `{false && …}` de Estaciones/Unidades/
  Proveedores + imports. Archivos borrados.
- **Visual — cards del pastel** (`PedidoPastelCard.jsx`): de-saturadas (badges
  `bg-X-50/text-X-700/border-X-200` en vez de `100/800/300`, folio menos pesado), mejor
  distribución (estado en la línea del folio; chips web/sucursal en su propia fila).
  Se MANTIENE toda la info, íconos y la identidad de color (rosa folio, web, sucursal).

## Verificación EN VIVO (build + runtime + dinero)
- `vite build` exit 0 tras CADA grupo de borrados; `grep` de referencias residuales = 0
  para todos los componentes eliminados.
- Dev server reiniciado: **sin errores de consola** en `/caja`, `/configuracion`,
  `/ventas`, `/pos`.
- **Configuración** (cirugía más pesada): carga; pestañas = Identidad/Operación/Usuarios/
  Pasteles/Mantenimiento; **sin** Integraciones ni Mesas; "Operación" conserva Categorías
  y ya no muestra Estaciones/Unidades/Proveedores.
- **POS/cobro:** quitar `PropinaDialog` NO rompió el cobro — "Cobrar" abre el PaymentModal
  directo; venta de $140 efectivo registrada.
- **Regresión de dinero IDÉNTICA:** corte de método único (mostrador $140 efectivo) →
  `total_efectivo=140, total_general=140, efectivo_esperado=140` (baseline sin cambio).
- Staging dejado pristino.

## Auto-auditoría
- **VEREDICTO: 🟢**
- **¿Cumple el objetivo?** Sí: todas las disposiciones ejecutadas; la app compila y
  arranca sin errores; nada operativo (ventas/caja/pedidos/corte) se rompió.
- **Candados / dinero:** regresión idéntica; no se tocó la matemática del corte (solo UI
  en F2). `CantidadVariableDialog` intacto.
- **Decisiones / FLAGS para Miguel:**
  - 🔸 **F10-mesas:** los COMPONENTES `mesas/` y todas sus referencias quedaron eliminados
    (residual = 0). PERO el **estado/handlers locales de mesas en `Configuracion.jsx`**
    (query `mesas`, `handleSaveMesa`, `openNew`, `eliminarMesasDemo`, etc.) se **dejaron
    como código muerto inocuo**: están gated (`showMesasTab` = solo restaurante_pro, nunca
    Confetti) y removerlos del todo arriesga el `saveUser` color-sync que referencia
    `mesas`. Recomiendo una limpieza enfocada posterior si se quiere quitar también ese
    bloque. (El invoke `eliminarMesasDemo` también quedó en ese código muerto, sin caller.)
  - 🔸 **`EstacionesAyuda.jsx`** quedó **huérfano** tras eliminar `EstacionesPreparacionSection`
    (su único uso). NO lo borré porque NO está en la lista de disposiciones (regla: lo no
    listado se reporta, no se toca). Candidato a borrado si Miguel lo aprueba.
  - 🔸 **Imports/vars ahora sin uso** en algunos archivos (p. ej. iconos en `ResumenDelDia`,
    `generateFolio('CT')` en Caja): inocuos (warnings, no errores). Limpieza cosmética
    opcional.
  - 🔸 **Web** (repo `web`, WF1/WI2 e I5): NO se tocó esta noche (el run es del repo POS;
    I5 espera dominio — pendiente humano).

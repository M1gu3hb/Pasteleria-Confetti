# Reporte — Cierre de cabos sueltos de limpieza (Fase 5)

**Fecha:** 2026-06-28 (continuación del run nocturno)
**Commit:** (ver final) · NO se tocó dinero (#4/#5/#6/A-FIX, efectivo_esperado, buckets, devolucionAnticipo).

## Objetivo
Cerrar los FLAGS de `BUGS_PENDING.md` (sección "FLAGS del run nocturno") que quedaron
como código muerto tras Fase 5.

## 1) Código muerto de mesas en `Configuracion.jsx` — CERRADO
**Diagnóstico de `saveUser` (handleSaveUser):** el único uso de la data `mesas` era el
bloque de color-sync, gated por `if (esMesero && prevUser?.id && colorAntes !==
colorDespues)` — sincroniza el color del MESERO en sus mesas. **Confetti no tiene meseros**
(pastelería sin mesas), así que ese bloque NUNCA se ejecuta; es plantilla de restaurante
que F10 elimina. → **se puede quitar sin riesgo.**

**Eliminado:** el bloque color-sync de `handleSaveUser` (+ su `invalidateQueries(['mesas'])`),
la query `mesas`, y todos los handlers/estado muertos: `handleSaveMesa`, `handleDeleteMesa`,
`handlePositionChange`, `handleReorder`, `openNew`, `mesasFiltradas`, `eliminarMesasDemo`,
`showMesasTab`, `puedeEliminarMesas`, `isMobile` (+ helper `useIsMobile` local),
`showEliminarMesas`, `eliminando`, `zonaFiltro`, `editingMesa`, `showMesaDialog`. Imports
muertos: `hasPermission`, `ZONAS_MESA`, iconos `UtensilsCrossed/AlertTriangle/Save/Cloud`.
**Conservado (fuera de alcance):** los switches de config `usa_mesas` / asignación de mesas
(escriben config, no son el mapa muerto).

**Verificado EN VIVO (eleva dueño PIN 1234 → Configuración → Usuarios):**
- **Crear** usuario "PRUEBA LIMPIEZA" (admin, Topilejo) → guardado OK (BD: activo=true).
- **Editar** ese usuario (cambiar teléfono → 5599887766) → guardado OK (BD actualizada).
- Sin errores de consola. Usuario de prueba borrado al final.
- `grep`: 0 referencias residuales a los handlers/estado de mesa eliminados.

## 2) `EstacionesAyuda.jsx` — ELIMINADO
Huérfano tras borrar `EstacionesPreparacionSection`. `grep` = 0 referencias externas →
borrado. Build OK.

## 3) `ResumenDelDia.jsx` — variables muertas eliminadas
Quitadas (computadas pero ya no renderizadas tras F2): `totalGeneral`, `totalPropinas`,
`totalCobrado`, `utilidad`, `costoTotal`, `totalGastos`, `utilidadNeta`, `ticketProm`,
`propinasPorMesero`, `colorMoney`, `colorTip`; props muertas `margenProm`, `verCostos`,
`ventasHoy`, `ventasPendientes`, `colorearImportes`; `totalesMetodos` simplificado a solo
`ventas`; imports muertos (`formatPercent` + iconos). **Sin tocar lo que se muestra.**
**Verificado EN VIVO:** corte con venta $140 efectivo → Resumen muestra "EFECTIVO $140.00",
"TICKETS 1", "Métodos de pago → Efectivo $140.00 / Total $140.00"; SIN utilidad/margen/
costo/propinas/total-cobrado. Idéntico a lo esperado.

## 4) Completitud Fase 5 — CONFIRMADO
- F7: `pages/CorteCaja.jsx` no existe; `/corte-caja` → `<Navigate to="/caja" replace />`.
- F4/F5/F6: `ReiniciarSistemaSection`, `Ventas.handleLimpiar`, `LimpiarSeccionButton`
  muestran "Función desactivada por el momento." (no error).

## 5) Blob de prueba en `notas-voz` — BORRADO
Faltaba policy DELETE → **migración 0028** (`notas_voz_auth_delete`, espejo de las demás).
Borrado el objeto `test_*.webm` (9 bytes) vía Storage API autenticado (200). Bucket vacío.

## Verificación global (obligatoria)
- `vite build` final: **exit 0**.
- App arranca sin errores: `/caja`, Configuración (elevada: Usuarios CRUD, Operación con
  Categorías y SIN Estaciones/Unidades/Proveedores), Dashboard (F8 removido, carga OK),
  POS (cobro OK). **Cero errores de consola** en todo el recorrido.
- **REGRESIÓN DE DINERO IDÉNTICA:** corte de método único (mostrador $140 efectivo) →
  `total_efectivo=140, total_general=140, efectivo_esperado=140` (baseline; el quirk se
  mantiene). La limpieza NO tocó la matemática.
- Staging pristino; `notas-voz` vacío.

## Auto-auditoría
- **VEREDICTO: 🟢**
- Candados intactos; dinero no tocado; `CantidadVariableDialog` intacto.
- 0 referencias residuales a lo eliminado. saveUser y el alta/edición de usuarios siguen
  funcionando (verificado en vivo) tras quitar el color-sync.
- **FLAGS restantes (NO bloqueantes, fuera de este alcance):** verificación de micrófono
  real (Fase 4); `efectivo_esperado` negativo en corte solo-devolución (decisión de
  Miguel). El resto de FLAGS del run quedaron cerrados.

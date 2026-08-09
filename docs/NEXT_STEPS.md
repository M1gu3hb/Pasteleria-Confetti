# NEXT_STEPS.md — Qué sigue (POS Confetti)

> **Actualizado: 2026-08-09** · commit `3a90e3c` en `migracion/supabase` (= producción).
> Lee antes `HANDOFF.md` y `PROJECT_CONTEXT.md`. El histórico de fases anteriores está al final.

---

## 🚨 URGENTE

### 1. Resolver el APK de las tablets — **requiere decisión de Miguel**
Las tablets del POS usan el **APK**, y su `server.url` apunta al **preview de la rama `apk/capacitor`**, que está **18 commits por detrás** de producción. Por ese canal **no ha llegado ninguna corrección de frontend**: ni el cierre en cero, ni la nota, ni el arreglo del dueño.

Quien opere desde el APK **todavía tiene el bug del cierre en cero en el cliente**; sólo lo protege el trigger `0058` de la base.

**Opciones (pregúntaselas a Miguel, NO decidas tú):**
- (a) Poner `apk/capacitor` a la altura de `migracion/supabase`.
- (b) Repuntar el `server.url` del APK a producción y regenerar/firmar el APK.
- (c) Ambas.

`CLAUDE.md` prohíbe fusionar o repuntar sin su OK explícito.

### 2. Confirmar con Abel que ya ve los cambios
Aunque se despliegue, **la tablet tiene que recargar** (service worker PWA). Ya provocó una recaída real: `CONF-A-C042` se rompió **un día después** del primer despliegue porque la tablet seguía con el bundle viejo.

---

## 🟠 IMPORTANTE

### 3. Envolver el árbol de rutas en `ErrorBoundary`
`ErrorBoundary.jsx` ya existe y **no lo usa nadie**. Sin él, cualquier throw en render apaga la app entera en las 3 sucursales — que es exactamente lo que pasó con el `Illegal invocation`. Cambio **aditivo**: envolver `AppLayout` y mostrar un fallback con botón de recarga.

### 4. Arreglar la sesión colgada al recargar
Tras recargar tras haber usado dueño/pastelero, la sesión Supabase puede seguir siendo la **global** mientras la UI dice "Modo empleado". Archivos: `TerminalGate.jsx:88`, `supabaseClient.js:84`.

### 5. Normalizar la tilde del rol donde deja al dueño sin funciones
- `MobileAdminRadialMenu.jsx:189` — menú radial de tablet.
- `Registros.jsx:48` — eliminar cortes.
- `LimpiarSeccionButton.jsx:40` — limpiar sección.
- `Configuracion.jsx:470` — rol en blanco en Usuarios POS.
- `ReiniciarSistemaSection.jsx:31` — sección inalcanzable.

> ⚠️ **NO toques `ModalPinAdmin.jsx:18`**: es el único punto que exige la tilde a propósito. Normaliza en el código, **nunca en el dato**: si el rol de la base pasa a `dueno`, el dueño se queda fuera del sistema.

### 6. Desplegar el frontend del pastelero
La migración `0060` **ya está aplicada** en Supabase, pero el frontend que le devuelve los botones (Guardar nota / Confirmar / Entregado) **sigue en la rama de trabajo**. Requiere la firma de Miguel sobre el cambio de RLS.

---

## 🟡 DESPUÉS

7. `CorteAutoDownloader`: filtrar por sucursal y `corte_caja_id`, no sólo por ventana de tiempo.
8. `SidebarContent` declarado dentro de `Sidebar`: sacarlo fuera (hoy remonta el subárbol y puede borrar el PIN a medio teclear).
9. `AccesoDuenoGate`: no pasar `_pin` a `activarAdmin`.
10. Acotar los `filter()` sin límite del adaptador.
11. Bloques nunca abiertos de la auditoría: 6 políticas `USING true`, 3 vistas `security_invoker=false`, grants y RPCs; Storage/imágenes; endurecimiento adicional del Edge Function de audio; renombrar la fachada Base44; **borrar `poc-auth-magiclink`** (por dashboard o CLI: el MCP no borra funciones).

---

## 💡 IDEAS FUTURAS

12. **Realtime del estado de caja**: `suscribirRealtimeCaja()` está **escrito y desactivado**; la publicación `supabase_realtime` está vacía y encenderla es DDL en producción + validación en tablet.
13. Cutover de Auth a `generateLink` + `verifyOtp` (PoC validado 8/8), gated en `MIGUEL_OK_AUTH_TABLETS`.
14. Enrolamiento de terminales por dispositivo.
15. Bajar la línea base de `lint` (39) y `typecheck` (1249) — hoy sólo se vigila que no suba.

---

## Gates humanos pendientes (Miguel)

- **`MIGUEL_OK_AUTH_TABLETS`** — cutover de Auth en tablets.
- **`MIGUEL_OK_CIERRE_CONFETTI`** — cierre definitivo del proyecto.
- **Firma** de la matemática del dinero y del aislamiento RLS (incluida la `0060` del pastelero).
- **Decisión sobre el APK** (punto 1).
- **Rotar la api_key de Base44** `847df…`, que sigue viva en la app de Abel.
- Decidir qué hacer con `ADMIN_1234`, que quedó como un segundo `dueño` **desactivado**.

---

## Histórico (fases ya cerradas)

Fases 0–5 de la migración Base44 → Supabase: **completas y firmadas**. WEB-0 a WEB-3: hechas. Bot de paridad de 60 días: 60/60 días limpios. Detalle en `docs/CHANGELOG.md` y en los reportes de `docs/`.

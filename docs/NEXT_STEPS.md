# NEXT_STEPS.md — Qué sigue (POS Confetti)

> **Actualizado: 2026-08-09 (Fase 0)** · commit `04bd33c` + el commit de docs de la Fase 0, en `migracion/supabase` (= producción).
> Lee antes `HANDOFF.md` y `PROJECT_CONTEXT.md`. El histórico de fases anteriores está al final.

---

## Plan de reparación integral (aprobado por Miguel el 2026-08-09)

Se trabaja **por fases**, deteniéndose y reportando al final de cada una. Rama de trabajo `fix/reparacion-integral`
en el worktree `C:/Pasteleria Confetti/pos-fix`; sólo pasa a `migracion/supabase` con el OK de Miguel.

| Fase | Qué | Estado |
|---|---|---|
| 0 | Documentación veraz | ✅ hecha |
| **1** | **Desbloquear el canal del APK** (fast-forward) | ⏳ **siguiente** |
| 2 | P0 dinero — truncación **PARCIAL**: barrido → reparación → blindaje → pruebas | pendiente |
| 3 | SEG-2 — `pin_hash` legible por cualquier terminal | pendiente (**firma Miguel**) |
| 4 | Bug #10 — sesión de dueño bajo la UI de "Modo empleado" | pendiente |
| 5 | ErrorBoundary + funciones perdidas del dueño | pendiente |
| 6 | Reauditoría integral y paso a producción | pendiente |
| 7 | APK definitivo (repuntar `server.url`, compilar sin firmar, **firma Miguel**, publicar) | pendiente |

---

## 🚨 URGENTE

### 1. Fase 1 — Desbloquear el canal del APK
Las tablets del POS usan el **APK**, y su `server.url` apunta al **preview de la rama `apk/capacitor`**, que es **ancestro estricto** de producción (se quedó en `9b36aa5`, del 2026-07-13). Por ese canal **no ha llegado ninguna corrección de frontend**: ni el cierre en cero, ni la nota, ni el arreglo del dueño. *(No cites un número de commits: cambia con cada push. Comprueba con `git rev-list --count origin/apk/capacitor..origin/migracion/supabase`.)*

**No es un riesgo latente: está fallando ahora.** Verificado en navegador el 2026-08-09 contra el corte real abierto
`CONF-A-C044`: por el canal del APK el Resumen muestra **$0.00 y 0 tickets** con **17 ventas y $5,735** reales, y
**Xochimilco no puede cerrar caja** (el trigger `0058` rechaza el cierre en cero, y el mensaje "actualiza la
aplicación" no se puede cumplir desde el APK).

**⚠️ Corrección a lo que decía este documento:** `apk/capacitor` **no tiene commits propios** — es ancestro estricto
de producción. Por eso:

- **(a) `migracion/supabase` → `apk/capacitor` (fast-forward)** — **NO toca producción**, no exige keystore ni
  reinstalar tablets, y el alias de rama de Vercel hace que el APK ya instalado cargue el bundle nuevo. Reversible con
  `git push --force-with-lease origin 9b36aa5:apk/capacitor`. **Elegida para la Fase 1.**
- **(b) Repuntar `server.url` a producción + regenerar y firmar el APK** — solución de fondo, pero exige el keystore
  de Miguel, republicar el instalador y **reinstalar físicamente en las 3 tablets**. **Fase 7.**
- **(c) Ambas, en ese orden.** Es el plan.

Lo que `CLAUDE.md` prohíbe es la dirección **contraria** (`apk/capacitor` → producción). Aun así, **ninguna de las dos
se hace sin OK explícito de Miguel**.

### 2. Confirmar con Abel que ya ve los cambios
Aunque se despliegue, **la tablet tiene que reiniciar la app** (service worker PWA; la pantalla ya cargada sigue con el JS viejo en memoria). Ya provocó una recaída real: `CONF-A-C042` se rompió **un día después** del primer despliegue porque la tablet seguía con el bundle viejo.

**Mientras tanto**, si en Xochimilco necesitan cerrar caja y la tablet va por el APK, el cierre debe hacerse desde el
**navegador** (`pasteleria-confetti.vercel.app`), que ya tiene el arreglo.

### 3. Fase 2 — P0 dinero: truncación PARCIAL
`CONF-A-C032` tiene **$1,420 sin reflejar** y estaba mal clasificado como "descuadre de otra causa". El trigger `0058`
**no** cubre ese caso (sólo `total_general = 0`), y `scripts/cierre_caja_verify.mjs` **excluye el folio por nombre**,
así que la suite da verde encima del agujero. Barrido de los 111 cortes cerrados: pendiente.
**Usa el criterio causal (ventana de 1.000 por sucursal), nunca el proxy "N más antiguas del corte".**

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

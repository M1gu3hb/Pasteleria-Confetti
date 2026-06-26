# FILE_MAP — archivos del port y qué NO romper

## Capa de datos
### `src/api/supabaseClient.js`
Cliente Supabase + `ensureSession()`. Hoy `ensureSession` hace auto-signin de la cuenta temporal `staging-pos@confetti.local` (Fase 2/3). **Al cerrar Fase 4 (wiring):** quitar ese auto-signin; agregar `loginConPin(pin,userId?)` y `loginTerminal(sucursalId)` + `logoutOperador()`. **No romper:** `ensureSession()` lo llama el adapter antes de cada query.

### `src/api/entitiesAdapter.js` ⚠️ CRÍTICO
Replica el contrato `base44.entities.X.filter/list/get/create/update/delete/bulkCreate` sobre Supabase.
- `TABLE_MAP`: PascalCase→tabla. `COLUMNS`: **whitelist por tabla** (descarta campos de Base44 que no existen → evita "column does not exist"). **Si agregas una columna a una tabla, AGRÉGALA al whitelist** o los writes la ignorarán.
- Traduce filtros Mongo: `$in→in`, `$ne→neq`, `$gte/$lte/$gt/$lt`, `$exists`. `created_date`/`updated_date` → alias de `created_at` (lectura) y mapeo en sort.
- Entidades fuera del map (lista roja) → stub no-op ([]/null). **No romper estos contratos** o se rompe el dinero.

### `src/api/base44Client.js`
Shim `base44`: `entities` (del adapter) + `integrations.Core.UploadFile`→Supabase Storage (**preserva `{ file_url }`**) + `auth` stubs + `functions.invoke` stub (rechaza). **No romper** el contrato `{file_url}`.

## Dinero / candados
### `src/pages/Caja.jsx` (~2249 líneas) ⚠️ ARCHIVO DE DINERO
- **CANDADO 1**: `resumen` (223-309), filtro venta↔corte 240-250 (núcleo 242, fallback 245-246); cierre 1406-1464 (asociación 1451-1461). Idéntico.
- Corte lee `Venta.filter({estado:'pagada'})` (193). `efectivo_esperado = totalEfectivo + abonosEfectivo` (1440).
- **CANDADO 3** (corregido): `handleBuscarFolioWeb` (679) filtra por `sucursalEfectiva.sucursal_id`.
- **NO cambiar la lógica.** Solo se redirige la fuente de datos (vía adapter). Si partes el archivo, preserva comportamiento.

### `src/lib/useCorteAtrasado.js`
- **CANDADO 2**: `obtenerInicioDiaMexico` (21-31) = medianoche México (UTC-6). Verbatim. No tocar.

### `src/components/pedidos/RegistrarPagoDialog.jsx`
- Abono (55-141): crea `Abono` (sucursal del pedido) + `Venta` paralela `pagada` (corte abierto, sucursal del terminal, monto_<metodo>=m) + `DetalleVenta`; recalcula total_abonado/saldo_pendiente; estado pagado/con_anticipo. **Ojo:** la venta paralela alimenta el quirk de doble conteo (ver BUGS). Idéntico a Base44.

### `src/utils/tipsUtils.js`
- `desgloseMetodosPagoExacto` (función REAL usada por el resumen). `tipsEnabled` default-on si `propinas_activas` undefined → por eso se migró `propinas_activas=false`.

## Auth (wiring PENDIENTE — Fase 4)
### `src/pages/POSLogin.jsx`
Hoy: lista `UsuarioPOS.filter({activo:true})` (anon ya NO puede) y compara `u.pin===pin` (pin eliminado). **Wiring:** listar vía vista `usuarios_login`; login vía `loginConPin(pin, selectedUser?.id)`.
### `src/components/common/TerminalGate.jsx`
Auto-login de "Empleado" virtual (35-42) sin sesión Supabase. **Wiring:** `await loginTerminal(sucursal_id)` (opción A) antes de `login(...)`.
### `src/components/common/ModalPinAdmin.jsx` + `AccesoDuenoGate.jsx`
Validan PIN de admin/dueño. **LEERLOS antes de tocar** (no se leyeron). Wiring: validar vía `loginConPin`.
### `src/lib/AuthContext.jsx`
Ya simplificado (sin auth de plataforma Base44). Provee `useAuth` con interfaz estable; `isAuthenticated:true`. Asegura sesión Supabase.
### `src/lib/POSAuthContext.jsx`
`posUser` en sessionStorage (identidad de UI). `login(user)`/`logout()`. La sesión Supabase es aparte (supabaseClient).

## Config / build
- `vite.config.js`: sin `@base44/vite-plugin`; alias `@`→`./src` (lo daba el plugin; **no quitarlo**).
- `package.json`: +`@supabase/supabase-js`; sin `@base44/*`, `@stripe/*`, `react-leaflet`, `three`.
- `.env` (gitignored): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_STAGING_AUTH_EMAIL/PASSWORD. Ver `.env.example` y `supabase/STAGING_NOTES.md`.
- `.claude/launch.json`: dev server (vite :5173) para el preview MCP.

## SQL
- `supabase/migrations/0001-0014` — ver DATABASE.md / CHANGELOG.md.
- `supabase/STAGING_NOTES.md` — cuenta de staging + env vars Vercel + modelo auth por operador.

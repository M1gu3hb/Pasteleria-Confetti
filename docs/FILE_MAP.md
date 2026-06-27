# FILE_MAP — archivos del port y qué NO romper

## Capa de datos
### `src/api/supabaseClient.js`
Cliente Supabase + auth (Fase 4 HECHA): `ensureSession()` bootstrapea la sesión **TERMINAL** desde localStorage (ya NO la cuenta staging) + `loginTerminal(sucursalId)` / `validarPin(pin,userId?)` (RPC, sin signin, para admin) / `loginConPin(pin,userId?)` (RPC + signin, para dueño) / `logoutOperador()`. **No romper:** `ensureSession()` lo llama el adapter antes de cada query (debe auto-resolver la sesión correcta).

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

## Auth (Fase 4 — WIREADO; pendiente de firma)
> `POSLogin.jsx` / ruta `/login-pos` **RETIRADOS** (hueco de aislamiento). También borrados `LoginBrandColors.jsx` y `ensureDefaultAdmin.js` (deps exclusivas). El modelo NO tiene login standalone.
### `src/components/common/TerminalGate.jsx`
Auto-login de "Empleado" virtual; ahora `await loginTerminal(terminal.sucursal_id)` (sesión terminal scoped) **antes** de `login(...)`; estado de error si falla.
### `src/components/common/ModalPinAdmin.jsx`
Valida PIN vía `validarPin` (RPC `login_pos`, **sin** abrir sesión). Devuelve el operador + `_pin` (transitorio).
### `src/components/common/AccesoDuenoGate.jsx` + `src/pages/ConfigurarTerminal.jsx`
Dueño: `loginConPin(_pin, id)` → sesión global. **Separan `_pin`** antes de `login()` (no persiste).
### `src/components/common/Sidebar.jsx` ⚠️ candado-sensible
Elevación: administrador = `activarAdmin` sobre la sesión terminal (exige `sucursal==terminal`, sin signin); dueño = `loginConPin` (global) y al salir `loginTerminal` (restaura scoped). Separa `_pin`.
### `src/lib/ConfigContext.jsx`
`queryFn` cae a la vista `config_publica` (anon) si la tabla no es legible sin sesión → branding pre-login.
### `src/lib/AuthContext.jsx`
Llama `ensureSession()` al montar (bootstrap terminal). `useAuth` con interfaz estable; `isAuthenticated:true`.
### `src/lib/POSAuthContext.jsx`
`posUser` en sessionStorage (identidad de UI; = admin real al elevar). `login(user)`/`logout()`. La sesión Supabase es aparte (supabaseClient).

## Config / build
- `vite.config.js`: sin `@base44/vite-plugin`; alias `@`→`./src` (lo daba el plugin; **no quitarlo**).
- `package.json`: +`@supabase/supabase-js`; sin `@base44/*`, `@stripe/*`, `react-leaflet`, `three`.
- `.env` (gitignored): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, **VITE_TERMINAL_PASSWORD** (cuentas terminal), VITE_STAGING_AUTH_EMAIL/PASSWORD (legado). Ver `.env.example` y `supabase/STAGING_NOTES.md`.
- `.claude/launch.json`: dev server (vite) para el preview MCP.

## SQL
- `supabase/migrations/0001-0016` — ver DATABASE.md / CHANGELOG.md.
- `scripts/fase4_rls_adversarial.mjs` — harness adversarial de RLS (31/31). Requiere datos sembrados + cuentas de prueba (ver CHANGELOG).
- `supabase/STAGING_NOTES.md` — cuenta de staging + env vars Vercel + modelo auth por operador.

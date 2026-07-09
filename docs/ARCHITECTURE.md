# ARCHITECTURE — Opción A (DB compartida + RLS)

## Visión
Una sola base **Supabase** sirve al **POS** (autenticado, RLS por rol/sucursal) y, después, a la **Web/catálogo público** (anon key + RLS restrictiva). Dos frontends React (Vite) en **Vercel**, una DB. **El puente Base44 desapareció.**

## APK Android (Capacitor) — split navegador/nativo
El MISMO código web corre en dos entornos y se ramifica por `Capacitor.isNativePlatform()`:
- **NAVEGADOR (PWA / lo que usa Abel hoy):** todo igual que siempre. La impresión usa `window.print` (iframe térmico de `print.js`); el corte usa el PDF carta (`printNodeAsPDF`). El APK NO cambia esta rama.
- **APK (WebView de la tablet):** el WebView **carga la web viva desde una URL de Vercel** (`server.url`), así las actualizaciones normales del POS siguen llegando por la nube sin reinstalar el APK. Lo ÚNICO que se instala por USB es lo nativo (impresión ESC/POS + cajón). La impresión se hace por un **plugin nativo DELGADO** (connect/sendBytes/imagen/cut/drawer, envuelve DantSu ESCPOS); TODA la lógica de ticket vive en JS (se actualiza por Vercel). Modo **IMAGEN** (default): renderiza el MISMO componente de ticket del DOM a un raster 576/384px y lo manda como imagen ESC/POS → el diseño se preserva y no hay riesgo de code-page (ñ/acentos).
- **Principio:** plugin nativo tonto + lógica en JS + config LOCAL por dispositivo + cada opción incierta seleccionable/probable en sitio (Camino A).

```
                 ┌──────────────────────────┐
  POS (React/Vite, Vercel)  ─auth (Supabase Auth)→  Supabase Postgres
   - operador: signInWithPassword                    ├─ tablas (RLS por rol/sucursal)
   - RLS: pos_is_admin() / pos_sucursal()            ├─ vistas públicas (anon): catalogo_publico,
                                                      │   config_publica, usuarios_login
  Web futura (React, Vercel) ─anon key→              ├─ funciones: siguiente_folio, login_pos,
   - SELECT catalogo_publico/config_publica          │   pos_sucursal, pos_is_admin
   - INSERT pedidos (origen='web', estado='pendiente')└─ Storage: bucket `uploads`
```

## Qué colapsó del puente (vs Base44 dos-apps)
- `src/utils/posApiClient.js` ELIMINADO (sync POS→Web de productos por `producto_pos_id`, api_key `847df…`, cascade cross-app).
- `crearPedidoPOS` (función Deno de la web) ya no se replica: la web insertará directo en `pedidos`.
- Se unifican: un solo `id` de producto (no `producto_pos_id`), un solo `folio` (no `folio_pedido`), disponibilidad por `sucursal_ids` (IDs, no nombres), un solo set de IDs de sucursal.

## POS ya "conectado"
El POS conserva la lectura de `pedidos WHERE origen='web' AND estado='pendiente'` (cola en Caja + buscador por folio con filtro de sucursal = CANDADO 3). Cuando exista la web, esos pedidos aparecen como filas nuevas en la tabla compartida — sin API intermedia.

## Auth (Fase 4)
- Cada operador (`usuarios_pos`) ↔ `auth.users` (email `<id>@pos.confetti.local`, password `POS-<pin>`). PIN validado por GoTrue (hash) + `login_pos` RPC (valida vs `pin_hash`, preserva UX de PIN).
- RLS lee `auth.uid()` → `usuarios_pos` (helpers `pos_sucursal()`/`pos_is_admin()`): dueño/admin todas las sucursales; caja/encargado solo la suya.
- Modo empleado (terminal sin PIN): pendiente decisión (cuentas terminal por sucursal vs requerir PIN). Ver NEXT_STEPS.

## Staging
- Supabase `ivqcxdpqxwjxfohiswqb` (us-east-1, PG17). Solo datos maestros; transaccional vacío.
- Vercel: pendiente import (GitHub→Vercel) de Miguel. Smoke se hizo en preview local (vite dev :5173 vía `.claude/launch.json`).

## Reglas globales (de los MDs de origen)
snake_case; lógica de negocio en frontend; `sucursal_id` columna vertebral; cancelar nunca borra (cambio de estado); snapshots en líneas de venta; cargas por lotes `$in`; paginación + filtros por fecha/sucursal en historiales.

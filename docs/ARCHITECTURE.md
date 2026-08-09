# ARCHITECTURE — Opción A (DB compartida + RLS)

---

# Actualización 2026-08-09 — sesiones, refresco de caja y canales de despliegue

## Modelo de sesiones (de aquí salen casi todos los bugs de rol)

| Quién | Sesión Supabase | Sucursal efectiva |
|---|---|---|
| Empleado (terminal) | `terminal-<sucursal_id>@pos.confetti.local`, **acotada por RLS** | la de la terminal |
| **Administrador** | **NO cambia de sesión**: sigue sobre la de la terminal | la suya (= la de su terminal) |
| **Dueño** | **Sesión GLOBAL** (`loginConPin` → `signInWithPassword`) | la que elija, o **`null`** (vista general) |
| **Pastelero** | **Sesión GLOBAL** | **`null`** (ve las 3) |

**Consecuencias que hay que tener presentes:**
- Sólo dueño y pastelero cambian de sesión → **son los únicos que disparan la limpieza de efectos que dependen de la sucursal**. Ahí estuvo el `Illegal invocation` que apagaba la app.
- Al **salir** de dueño/pastelero hay que **restaurar la sesión de la terminal**, o la tablet queda autenticada con una identidad que no es la que muestra la pantalla.
- `ensureSession()` puede degradar en silencio una sesión global a la de una terminal. **Bug abierto**, ver `BUGS_PENDING.md`.

## Refresco del estado de caja

Antes: `refetchInterval` en los hooks. React Query crea un temporizador **por observador**, y con ~6 puntos de montaje el intervalo efectivo caía a ~2 s → cientos de miles de consultas.

Ahora:
- **`cajaEstado.js`** — consultas filtradas en PostgreSQL, `LIMIT 1`, columnas mínimas. **Las listas de columnas incluyen `sucursal_id`** porque las guardas anti-fuga comparan ese campo.
- **`cajaRefresco.js`** — **un solo temporizador por sucursal**, a nivel de módulo y con refcount, más `visibilitychange` y `online`. Sin dependencia de Supabase, para poder verificarlo en Node.
- **`useCajaAbierta.js`** — fuente única de verdad. `placeholderData` y la memoria de sesión **descartan** cualquier fila que no sea de la sucursal activa: al cambiar de sucursal el estado queda en `unknown` ("Verificando…"), nunca se sirve la caja de otra.
- **Realtime escrito y DESACTIVADO**: la publicación `supabase_realtime` está vacía; encenderla es DDL en producción y hay que validarlo en tablet.

> ⚠️ En `cajaRefresco.js` los nativos `setInterval`/`clearInterval` van **envueltos en flechas**. Guardarlos como propiedad de un objeto y llamarlos como método (`r.clearIntervalFn(...)`) los invoca con `this` distinto de `window` y Chrome lanza `TypeError: Illegal invocation`. Al ocurrir en la limpieza de un `useEffect`, React desmonta la app entera.

## Consultas que alimentan dinero

**PostgREST corta las respuestas en 1.000 filas.** Una consulta sin `ORDER BY` ni límite explícito devuelve las 1.000 **más antiguas** y no avisa. Eso guardó 11 cortes en cero.

Regla: toda consulta que alimente la matemática del dinero va **acotada** (filtrada en PostgreSQL, no en el cliente), **ordenada** y **paginada hasta agotar**, y el `count` del servidor se lee con `typeof count === 'number'` (nunca `Number(count)`: **`Number(null)` es 0**).

El cierre además **falla cerrado**: si no se puede verificar contra el servidor, no se cierra. Y la base lo rechaza por su cuenta (`0058`) — **pero sólo cuando el total es exactamente 0**: la truncación **parcial** no la ve nadie. Ver `docs/DATABASE.md` §`cortes_caja` y el P0 abierto en `docs/BUGS_PENDING.md`.

## Canales de despliegue (hay DOS, y esto sorprende)

1. **Navegador / PWA** → Vercel, rama **`migracion/supabase`** = producción. Service worker `autoUpdate`, pero **la pantalla ya cargada sigue con el JS viejo**: hace falta recargar.
2. **APK Android (Capacitor)** → el WebView carga la URL fija de `capacitor.config.ts` (`server.url`), que hoy apunta al **alias de rama de Vercel del preview de `apk/capacitor`**, no a producción.

> **Esto significa que un arreglo desplegado a producción puede no llegar a las tablets.** Es el riesgo abierto más grande del proyecto. Ver `HANDOFF.md` §4.

**Cómo se relacionan las dos ramas (comprobado 2026-08-09):** `apk/capacitor` **no tiene commits propios** — es
**ancestro estricto** de `migracion/supabase`, y `capacitor.config.ts` existe idéntico en las dos. Consecuencias:

- El alias `…-git-apk-capacitor-…` **sigue automáticamente al último commit de la rama**, así que adelantar la rama
  actualiza el APK **ya instalado**, sin reinstalar ni re-firmar.
- Y al revés: mientras `server.url` apunte ahí, **cualquiera que empuje a esa rama cambia lo que ven las tablets de
  producción**. Es el motivo por el que la Fase 7 repunta `server.url` a producción y cierra este canal paralelo.
- **Un commit de sólo documentación produce un `dist` byte-idéntico** (comprobado: `3a90e3c` y `04bd33c` sirven el
  mismo bundle y el mismo `sw.js`), así que publicar docs **no** dispara actualización en las tablets.

## Sin ErrorBoundary

`ErrorBoundary.jsx` y `SafeBoundary.jsx` existen, pero **el árbol de rutas no está envuelto en ninguno**. Cualquier throw en render (incluido el del `Sidebar`, que se monta en todas las pantallas) deja `#root` vacío: pantalla en blanco sin mensaje. **Bug abierto de prioridad alta.**

---

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

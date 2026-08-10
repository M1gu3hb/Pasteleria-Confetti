# NEXT_STEPS.md — Trabajo pendiente (POS Confetti)

> **Este documento no dice "en qué punto estamos".** Lo dice la base y la rama, y este archivo se quedaría viejo en
> horas — ya pasó: llegó a anunciar como "⏳ siguiente" una fase hecha y desplegada, y a reclamar la reparación de
> `$1,420` que se habían reparado el mismo día. Ver la regla de estado volátil en `CLAUDE.md`.
>
> **Cómo saber el estado REAL, siempre, antes de tocar nada:**
> ```bash
> git log --oneline -5 origin/migracion/supabase          # qué corre en producción
> git log origin/apk/capacitor..origin/migracion/supabase # vacío = el canal del APK está al día
> ```
> ```sql
> select version, name from supabase_migrations.schema_migrations order by version desc limit 6;
> select count(*) from cortes_caja where estado='cerrado';
> ```
> Lee antes `HANDOFF.md` (mecanismos y causas) y `PROJECT_CONTEXT.md`.

---

## Cómo se trabaja

Por **bloques**, reportando al terminar cada uno. Rama de trabajo y de producción: **`migracion/supabase`**
(en el worktree `C:/Pasteleria Confetti/pos-fix`). **No tocar** los worktrees `pos` (rama `fix/auditoria-codex`,
con blindaje diferido sin commitear) ni `pos-apk`.

**Se PARA en seco y se pide firma de Miguel en dos sitios, sin excepción:**
1. Cualquier cambio de **RLS o políticas**.
2. Cualquier cosa que toque **dinero, folios o cortes**, aunque parezca inofensiva.

---

## 🔒 Condiciones permanentes (no son tareas: son condiciones)

### 1. `apk/capacitor` se sincroniza en CADA push a producción

```bash
git push origin <sha-de-migracion/supabase>:refs/heads/apk/capacitor
```

Los APKs instalados llevan `server.url` **baked** apuntando al **alias de rama**, no a producción (verificado abriendo
como ZIP los 12 APKs del repositorio y leyendo su `assets/capacitor.config.json`). Si la rama se abandona, las tablets
se congelan otra vez — el mecanismo exacto que produjo los cortes en cero.

**El aplazamiento del APK 1.2 depende de esto.** No es costumbre: es la condición que lo sostiene. Si algún día no se
puede sincronizar, hay que **reabrir la decisión del APK**, no seguir adelante. Detalle en `CLAUDE.md`.

Se deja de aplicar **sólo** cuando se verifique, tablet por tablet, que ninguna conserva un APK viejo.

### 2. Ante dos soluciones, gana la que llega SIN APK nuevo
Un APK nuevo exige keystore, republicar instalador y visitar 3 tablets. El canal de rama entrega lo mismo en el
siguiente push. Lo único que el canal **no** puede hacer es repuntar `server.url`: eso es la Fase 7.

---

## 🚨 Requiere FIRMA de Miguel (bloqueado hasta entonces)

### El archivo de `0059_crear_venta_directa_guards` no existe en el repo
**Es lo más grave que queda abierto, y es de trazabilidad de DINERO.**

`crear_venta_directa_tx` —la función que crea **cada venta directa de mostrador**— se aplicó el 2026-07-13 (`0049`) y
se **reemplazó el mismo día** por `0059_crear_venta_directa_guards`, que **nunca tuvo archivo en el repo**. El cuerpo
vivo es ~2.100 caracteres más largo que el del archivo `0049` y añade guards que ese archivo ni menciona
(`TOTAL_INVALIDO`, `TOTAL_NO_CUADRA`, `LINEA_INVALIDA`, `LINEA_NO_CUADRA`, `SIN_DETALLE`, `SIN_CAJA`, `SIN_SUCURSAL`).

Y hay **dos migraciones numeradas 0059**: la de arriba (sin archivo) y `0059_recalculo_cortes_en_cero_ronda2` (con
archivo). El 0059 del repo no es el 0059 de la base.

**Consecuencia:** leer el repo para saber qué valida el cobro de mostrador da una respuesta **falsa** — y falsa por el
lado peligroso, porque la versión viva es **más estricta** que la documentada.

**Qué hay que hacer:** reconstruir el archivo desde la base (`supabase_migrations.schema_migrations`), renumerarlo sin
colisión y commitearlo. Es SQL de dinero: **lo decide y lo firma Miguel.** La cabecera de
`0049_PREPARADA_crear_venta_directa_atomico.sql` ya lleva la nota fechada con las dos consultas de comprobación.

### SEG-2 — `pin_hash` legible por cualquier terminal
Migración `0042` **preparada y sin aplicar**, en la rama `fix/auditoria-codex`. Toca RLS → firma de Miguel.
Va con toda la pila diferida (`0042` → `0044` → `0045` → `0046` → `0047`), que sigue sin firmar.

### Frontend del pastelero
`0060` está aplicada, pero el frontend que le devuelve los botones (Guardar nota / Confirmar / Entregado) sigue en la
rama de trabajo. Requiere la firma del cambio de RLS.

---

## 🟠 Pendiente, sin bloqueo

### Ticket de pastel — "FAVOR DE REGRESAR LA BASE LIMPIA"
Línea al final del ticket de pastel **solamente**, en mayúsculas y con emojis, conviviendo con el bloque de domicilio,
dentro de `.ticket-printable` y con estilos **inline** (el raster no ve las hojas de estilo). Punto de inserción en
`src/components/tickets/TicketPastelConfetti.jsx`. Validar en el banco con un pedido ANTIGUO y con uno con domicilio.

### UI para `avanceAntesCorteDots`
Hoy el avance de papel antes del corte es un valor de `src/native/printerConfig.js` (150 puntos = 18,75 mm) que sólo se
cambia tocando código. Falta exponerlo **en milímetros** en Config → Operación → "Impresora y cajón (app)", con un
botón **PROBAR** que imprima y corte para medir en sitio. La distancia real cabezal→cuchilla de la Easytime **no se
puede saber sin la impresora delante**.

### Barrido de la familia "catch que se traga el mensaje"
`handleCierreDiario` está corregido (`src/lib/cierreBloqueado.js`), pero **no se ha barrido el resto del POS**.
Cualquier `catch` que sustituya un error accionable por un genérico tiene el mismo defecto: el usuario lee "intenta de
nuevo", reintenta y vuelve a fallar.

### Sesión: comprobar IDENTIDAD, no existencia
`TerminalGate` sólo hace auto-login **si no hay `posUser`**, y `ensureSession()` puede degradar en silencio la sesión
del dueño a la de una terminal. Resultado: tras recargar, la sesión Supabase puede seguir siendo la **global** mientras
la interfaz dice "Modo empleado" — y desde `0060` esa sesión colgada **puede escribir**. Hay que comprobar **quién** es
la sesión, no si existe; y **sólo degradar**, nunca ampliar.
*(El latch que dejaba el spinner infinito ya está arreglado; esto es lo otro.)*

### Mecanismo de actualización unificado
Hoy una tablet puede quedarse con el JS viejo en memoria indefinidamente, y **pedirle a Abel que reinicie es trabajo
nuestro, no suyo**. Falta: aviso a nivel web + recarga segura + red de seguridad en horas muertas; y a nivel nativo,
aviso hacia la página del instalador. De paso, corregir el comentario falso de `vite.config.js:11-12` y buscar sus
repeticiones.

### ErrorBoundary
`src/components/common/ErrorBoundary.jsx` existe y **no lo importa nadie**. Sin él, cualquier throw en render apaga la
app entera en las 3 sucursales — que es exactamente lo que pasó con el `Illegal invocation`. Aditivo: envolver
`AppLayout` y mostrar un fallback con botón de recarga.

### Tilde del rol, donde deja al dueño sin funciones
`MobileAdminRadialMenu.jsx` (menú radial), `Registros.jsx` (eliminar cortes), `LimpiarSeccionButton.jsx`,
`Configuracion.jsx` (rol en blanco en Usuarios POS), `ReiniciarSistemaSection.jsx` (inalcanzable por diseño).

> ⚠️ **NO toques `ModalPinAdmin.jsx` (`ROLES_ADMIN = ['dueño', …]`)**: es el único punto que exige la tilde a
> propósito. **Normaliza en el código, JAMÁS en el dato.** Si el rol de la base pasa a `dueno`, el dueño se queda
> fuera del sistema.

### `SidebarContent` declarado dentro de `Sidebar`
React lo trata como componente nuevo en cada render y remonta el subárbol, incluido el modal del PIN: puede **borrar el
PIN a medio teclear**. Sacarlo fuera.

### `AccesoDuenoGate` pasa `_pin` a `activarAdmin`
El PIN en claro queda vivo dentro de `TerminalContext.adminUser`. (`handleAdminSuccess` del Sidebar sí lo limpia; este
camino no.)

### `CorteAutoDownloader` empareja ventas sólo por ventana de tiempo
No filtra por sucursal ni por `corte_caja_id`. Con una sola sucursal es correcto; con varias abiertas a la vez puede
mezclar. Misma familia que el incidente de los ceros.
*(Archivo: `src/components/cortes/CorteAutoDownloader.jsx` — **no** `components/caja/`, como decía esta documentación.)*

### Rutas profundas → 404 del servidor
`GET /caja` devuelve **404** en los dos canales; hoy lo tapa el service worker, pero sólo **después** de instalarse. Un
dispositivo nuevo, un incógnito o un enlace pegado ven el 404. Arreglo probable: reescritura SPA en `vercel.json`.
Es config de despliegue: no se toca con cajas abiertas.

### `filter()` sin límite en el adaptador
Mismo patrón que truncó el corte. Hoy ninguno alimenta la matemática del dinero, pero están.

### Bloques de la auditoría original nunca abiertos
6 políticas `USING true`, 3 vistas `security_invoker=false`, grants y RPCs; Storage/imágenes; endurecimiento del Edge
Function de audio; renombrar la fachada Base44; **borrar `poc-auth-magiclink`** (por dashboard o CLI: el MCP no borra
funciones).

---

## 🟡 Fuera de alcance mientras nadie lo pida

- **Fase 7 — APK definitivo**: repuntar `server.url` a producción, compilar sin firmar, **firma Miguel**, publicar,
  reinstalar en las 3 tablets. Es lo único que acaba con la dependencia del canal de rama.
- **Cuadre del efectivo físico**: ruidoso en todo el histórico. `diferencia_efectivo` **no debe leerse como faltante o
  sobrante de un cajero** sin `dinero_dejado_en_caja` y `efectivo_inicial_contado`. La fórmula es CANDADO y está
  firmada: no se "mejora". Si algún día se quiere un cuadre fiable es una decisión de negocio, no de código.
- **Realtime del estado de caja**: `suscribirRealtimeCaja()` está escrito y desactivado; encenderlo es DDL en
  producción + validación en tablet.
- Cutover de Auth a `generateLink` + `verifyOtp` (PoC 8/8), gated en `MIGUEL_OK_AUTH_TABLETS`.
- Enrolamiento de terminales por dispositivo.
- Bajar la línea base de `lint` (39) y `typecheck` (1249) — hoy sólo se vigila que **no suba**.

---

## Gates humanos pendientes (Miguel)

- **Firma** de la matemática del dinero y del aislamiento RLS (incluida la `0060` del pastelero y la pila
  `0042`/`0044`/`0045`/`0046`/`0047`).
- **Decisión** sobre el archivo perdido de `0059_crear_venta_directa_guards`.
- **`MIGUEL_OK_AUTH_TABLETS`** — cutover de Auth en tablets.
- **`MIGUEL_OK_CIERRE_CONFETTI`** — cierre definitivo del proyecto.
- **Rotar la api_key de Base44** `847df…`, que sigue viva en la app de Abel.
- Decidir qué hacer con `ADMIN_1234`, que quedó como un segundo `dueño` **desactivado**.

---

## Histórico

Fases 0–5 de la migración Base44 → Supabase: **completas y firmadas**. WEB-0 a WEB-3: hechas. Bot de paridad de 60
días: 60/60 limpios. El detalle fechado de todo lo hecho está en `docs/CHANGELOG.md`, que **sí** cita commits porque
es un registro histórico.

# Actualización del APK desde el punto de venta

## Qué ve la terminal
Dentro del APK (nunca en navegador), arriba de todas las pantallas del POS aparece un aviso grande **«⬆️ Actualización pendiente»** con la versión nueva, la instalada, la lista «Qué cambia», el botón **«Actualizar ahora»** y **«Más tarde»** (lo reduce a una barra durante 4 horas). No es un diálogo: no bloquea ventas, cobros ni el lector. Se revisa al abrir, cada 30 minutos y al volver a la app.

- **APK 1.1.1 o anterior** (todas las terminales hoy): «Actualizar ahora» es un enlace al APK en `raw.githubusercontent.com`. Ese host está fuera de `allowNavigation`, así que Capacitor lo abre en Chrome, que descarga el archivo; la persona toca Abrir → Actualizar. Un enlace `*.vercel.app` o `*.supabase.co` se quedaría dentro de la app y **no descargaría nada** (Capacitor no tiene gestor de descargas; `HostMask` no distingue mayúsculas ni punto final). Por eso el APK no se enlaza desde la página de Vercel en este paso.
- **APK 1.3.0 o posterior:** `ConfettiApp.descargarEInstalar` descarga el APK, comprueba SHA-256 anunciado, paquete, versionCode anunciado y mayor que el instalado, y **mismo certificado de firma** que la app instalada; sólo entonces abre el instalador de Android. La primera vez Android pide activar «Permitir de esta fuente» (el aviso lo explica). Si falla algo distinto del permiso, ofrece «Descargar con el navegador».
- Android conserva los datos de la app en una actualización con la misma firma. Con otra firma Android rechaza instalar; **nunca desinstalar** para «forzar», porque se pierden sesión, ajustes locales e intenciones de cobro pendientes.

## Fuente del aviso
`public/apk/actualizacion.json`, servido por el mismo alias que carga el APK (sin CORS, no precacheado por el service worker). Campos: `esquema:1`, `publicada`, `versionCode`, `versionName`, `fecha`, `apk` (https), `pagina`, `sha256`, `certificadoSha256`, `cambios[]`. Con `publicada:false`, datos inválidos o un HTML en lugar de JSON, **no aparece nada** (falla cerrada). Versión instalada: `ConfettiApp.info()`; si el plugin no existe la app es 1.1.1 o anterior (versionCode 3; la 1.2.0 nunca se distribuyó).

Estado vivo: `git show origin/apk/capacitor:public/apk/actualizacion.json` y la versión instalada en cada terminal (Ajustes → Apps → Confetti POS).

## Publicar una versión (sólo con APK firmado por Miguel)
1. Compilar el release sin firmar (ver docs/LECTOR_NATIVO_ESCANER_2026-11-06.md) y firmarlo **con la llave de Miguel** (certificado SHA-256 `5074a110f20482e83c28d294af78b420415181250a4e8177be3f1096f9ebf610`, `CN=Confetti POS`, el mismo del APK 1.1.1 publicado). La llave nunca entra al repositorio ni a una sesión de IA.
2. `ANDROID_HOME=<sdk> node scripts/publicar_apk.mjs <APK-firmado> --salida <dir>` — rechaza sin escribir nada si el APK no está firmado, la llave es otra, el paquete/versión no coinciden con `build.gradle` y el JSON, o `server.url` no es el alias. Si pasa, genera `<dir>/ConfettiPOS-<versión>.apk`, `<dir>/index.html` y marca el JSON `publicada:true` con su SHA-256.
3. Subir el APK a la rama `descargas-apk` con ese nombre exacto y comprobar que `raw.githubusercontent.com/.../ConfettiPOS-<versión>.apk` devuelve el mismo SHA-256.
4. Desplegar `<dir>/index.html` en el proyecto de Vercel `confetti-inst-ead772fe6540` (página de respaldo, misma URL de siempre) y comprobar el HTML servido.
5. Commit + push del JSON a `apk/capacitor`; verificar en Vercel el JSON servido. Las terminales lo ven en su siguiente revisión (máximo 30 min o al volver a la app); una terminal que no ha recargado la web desde antes de este cambio necesita recargar una vez.
6. Para retirar un anuncio: volver `publicada:false` y push.

## Comprobar desde el servidor (qué se puede saber y qué no)
- **La versión del APK no se ve en el servidor.** 1.1.1 y 1.3.0 tienen el mismo `capacitor.config` (sin `appendUserAgent`): mismo user-agent (`Android 12; XW9901 … wv`) y mismo referer (alias `…-git-apk-capacitor-…`). Las descargas desde `raw.githubusercontent.com` y la página de Vercel no tienen registros consultables. La confirmación es en sitio: Ajustes → Apps → Confetti POS, o que el aviso haya desaparecido de esa terminal.
- **Qué terminal está activa y desde qué:** `edge_logs` de Supabase agrupado por `request.sb.auth_user` (cuenta técnica de cada sucursal, en `usuarios_pos.auth_user_id`), `request.headers.user_agent` y dominio de `request.headers.referer`. Referer `…-git-apk-capacitor-…` con `XW9901` = tableta con APK; `pasteleria-confetti.vercel.app` = navegador (sin aviso, sin lector nativo, sin impresión del APK).
- **Recarga posterior a un despliegue** (la terminal ya tiene el código del aviso): una carga completa empieza con `configuracion_negocio?select=*&order=id.asc` y el resto de consultas iniciales en el mismo segundo; la hora del despliegue está en Vercel.
- **Uso del escáner:** cualquier lectura reconocida en venta o en «Probar escáner» llama `rpc/buscar_producto_codigo_pos`; asignar llama `rpc/asignar_codigo_producto_pos`; abrir Configuración → Escáner hace HEAD `productos?…codigo_barras=is.null`. En la base: `count(*) filter (where codigo_barras is not null)` en `productos` y la tabla `codigos_producto_reservados`. La vinculación del lector sólo se guarda en la tableta (no deja rastro en el servidor).
- `query_logs` admite ventanas de 24 h como máximo; consulta día por día.

## Pruebas
- `scripts/apk_update_verify.mjs` (en la puerta de build): manifiesto con valores crudos inválidos, coherencia con `build.gradle`/certificado/`capacitor.config.ts`, réplica de `HostMask`, versión instalada, lectura sin caché.
- `scripts/apk_update_browser.mjs`: aviso real en Chromium para navegador, APK viejo, APK al día, APK 1.3.0 (instalación, permiso, firma incorrecta → navegador), «Más tarde» persistente y teléfono sin desbordar.
- JVM: `VerificadorActualizacionTest` (6) y `ConfettiAppActivityTest` (4, `MainActivity` real API 31: carga del plugin, versión, sólo https, permiso de instalación).
- `publicar_apk.mjs` probado el 2026-11-06: APK sin firmar → rechazado; firmado con una llave desechable → rechazado sin tocar el JSON; con una copia del repo que esperaba esa llave → acepta y genera un JSON válido. La llave y el APK de prueba se borraron y nunca se publicaron.
- Sin probar en hardware: descarga en Chrome del dispositivo, instalador de Android y permiso real «Permitir de esta fuente».

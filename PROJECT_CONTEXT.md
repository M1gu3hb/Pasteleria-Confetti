# PROJECT_CONTEXT — POS Pastelería Confetti (migración Base44 → Vercel + Supabase)

> **Fuente principal de transferencia.** Léelo COMPLETO antes de tocar nada, junto con `CLAUDE.md` y `docs/`.
> Última actualización: 2026-06-27 (POS+Web migrados y VALIDADOS; **bot 60 días COMPLETO e impecable**; **próxima fase = Vercel + MEJORAS** → `docs/MEJORAS_POST_VALIDACION.md`; cutover pendiente = lunes, imágenes se mantienen).
> **Working tree estable:** `C:\Pasteleria Confetti\pos` (clon de `M1gu3hb/Pasteleria-Confetti@migracion/supabase`).
> **Repo Web (aparte):** `M1gu3hb/Pasteleria-Confetti-web-` (CON guion final) en `C:\Pasteleria Confetti\web`.

---

## APK Android (Confetti POS) — estado 2026-07-09 (rama `apk/capacitor`)
Se envolvió el POS en un **APK Android (Capacitor 8)** que carga la web viva desde Vercel e **imprime ESC/POS nativo** (arregla el "imprime a medias" del `window.print` en el WebView). **TODAS las fases de CÓDIGO están hechas** (0,1,3,4,5,corte,6,7); pendiente = **prueba física EN SITIO** + (con OK) fusionar a producción.

**Qué hace / arquitectura:**
- `capacitor.config.ts`: `server.url` = **preview de la rama** `pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app` (NO producción durante el piloto; producción aún no tiene el código nativo). `allowNavigation` Vercel+Supabase, `cleartext` (TCP a impresora). Proyecto `android/` (appId `com.mhastral.confettipos`). Refuerzos: orientación horizontal, pantalla siempre encendida, botón ATRÁS no cierra.
- **Impresión** (`src/lib/print.js` con rama nativa aditiva detrás de `isNativePlatform()`): en el APK, `printDocument` delega en `src/native/printTicket.js` → renderiza el MISMO ticket del DOM a imagen 576px (html2canvas, `useCORS` para el logo) → `imprimirImagenRaster` + `cortar`. Modo **Imagen** (default, preserva diseño) o **Texto** ESC/POS (opción). En navegador: `window.print` de siempre, intacto.
- **Plugin nativo delgado** `ConfettiPrinterPlugin.java` (envuelve **DantSu ESCPOS 3.4.0**): conectarUSB (permiso persistente por intent-filter), conectarTCP(9100), enviarBytes, imprimirImagenRaster (576/384), cortar, abrirCajonPorImpresora, **abrirCajonUsbSerial** (usb-serial-for-android). Lógica de ticket en JS (se actualiza por Vercel).
- **Cajón** (`src/native/cajon.js` `abrirCajon(metodo)`): `ninguno` | `usb_trigger` (disparador USB-serial) | `kick_impresora` (patada ESC/POS).
- **Corte de caja térmico** (opción además del PDF): `CorteTicketTermico.jsx` (1 columna) reusa los MISMOS `corte.*` + helpers que `CorteTicket` → **números idénticos** (verificado). `CorteViewerDialog` ramifica por `formatoCorte`.
- **Config LOCAL por dispositivo** `src/native/printerConfig.js` (localStorage): conexion/ip/puerto/modo/metodoCajon/formatoCorte. UI: **Config → Operación → "Impresora y cajón (app)"** (`ImpresoraCajonAppSection.jsx`) para seleccionar + PROBAR; funcional solo en APK, deshabilitada en navegador.
- **Entregable:** `C:\Pasteleria Confetti\release\` → `ConfettiPOS.apk` (firmado, apksigner v2+v3), `keystore/` (+ `RESGUARDAR.txt`, ¡respaldar!), `usb/ConfettiPOS_USB.zip` (+ `LEEME_instalacion.txt` con protocolo de prueba en sitio), `muestras/` (PNGs de evidencia).

**Hardware objetivo:** tablet **Higole** RK3399 Android 12 (USB host, LAN; **sin RJ11** de cajón). Impresora **Easytime 80mm** ESC/POS (USB+Ethernet, corte auto, 72mm/576pts, sin Bluetooth, sin RJ11). Cajón: manual o disparador USB-serial.

**Pendiente (tuyo / en sitio):** (1) instalar `ConfettiPOS.apk` en la tablet y probar impresora/cajón/corte con `release/usb/LEEME_instalacion.txt`; (2) tras tu OK, **fusionar `apk/capacitor` → `migracion/supabase` y repuntar `server.url` a producción**. Ver `docs/NEXT_STEPS.md`.

## 1. Objetivo
Independizar el **POS interno** de Pastelería Confetti de Base44, dejándolo **idéntico en comportamiento** sobre infra propia: **React (Vite) en Vercel + Supabase (Postgres + Auth + RLS + Storage)**. NO es reconstrucción: el sistema ya estaba aprobado por el cliente (Abel); se migra, no se rediseña. El cliente sigue operando en Base44 en producción durante toda la migración; el corte a producción lo decide Miguel y NO es parte de esta fase.

## 2. Estado real (honesto)
- **Fase 0** (reconocimiento + andamiaje): COMPLETA, auditada por Miguel.
- **Fase 1** (esquema unificado): COMPLETA y APLICADA en staging, auditada.
- **Fase 2** (seed maestros + port capa de datos + smoke): COMPLETA, auditada. Build verde; smoke en preview local OK.
- **Fase 3** (validación aritmética del dinero): COMPLETA, auditada. + **PASO 0 gate money-crítico CERRADO LIMPIO**.
- **Fase 4** (Auth + RLS + wiring): **CERRADA (firmada por Miguel).** Opción A; auth real terminal/admin/dueño; RLS scoped; migraciones 0015/0016; adversarial 31/31; `_pin` no persiste. Ver `CHANGELOG.md` (cont./cont.2) + `DECISIONS.md` (13–19).
- **Fase 5** (Validación de FIDELIDAD vs Base44 vivo): **HECHA y APROBADA por Miguel.** Maestros 0 diffs; pantallas/flujos conformes; corte real 14/14 campos idénticos (incl. doble conteo). **POS migrado, independiente y fiel — Fases 0-5 COMPLETAS.**
- **WEB-0 / WEB-1** (migración Web, repo aparte `M1gu3hb/Pasteleria-Confetti-web-`): **HECHAS.** Andamiaje web pusheado; GAP1 folio = **migración 0017** (trigger), GAP2 upload = **migración 0018** (bucket `web-uploads`) — ambas en ESTE repo POS (esquema = fuente única), verificadas (anon 11/11, regresión POS limpia). Ver `CHANGELOG.md` / `DATABASE.md` / `DECISIONS.md`.
- **WEB-2** (port de la capa de datos de la web): **HECHA.** Migraciones **0019** (RPC `crear_pedido_web` devuelve folio → folio-Gracias resuelto), **0020** (RPC anon-only), **0021** (sella `creado_por_nombre='Web Confetti'`) en ESTE repo POS; el port (cliente anon, adaptador, puente muerto, NOMBRE→ID, web-uploads) en el repo web, build verde + smoke real. Ver repo web `docs/CHANGELOG.md`.
- **WEB-3** (validación end-to-end POS↔web): **HECHA y aprobada por evidencia.** Pedido web visible y fiel en el POS (badge 🌐 WEB, "Creado por Web Confetti", imagen de referencia) + aislamiento por sucursal; edición de producto en el POS reflejada de inmediato en el catálogo web (misma fila, sin sync). Sin diffs vs Base44. Ver `CHANGELOG.md` (cont. 4). **Pendiente humano:** import Vercel del repo web.
- **Bot de paridad / pruebas largas** (concurrencia/PDFs, otro proyecto de Miguel: `Bot pruebas/bot-pruebas/`): **COMPLETO.** 60 días simulados, 3 sucursales en paralelo, libro mayor + oráculo confrontando cada corte → **60/60 días limpios, cuadres 180/180 (con doble conteo), folios 180/180 sin colisión, web 30/30, RLS 18/18, 0 bugs reales**. Evidencia: `reportes/run60/RESUMEN_EJECUTIVO_60_DIAS.md`. Halló y reclasificó (decisión de Miguel): corte de turno = fantasma; cobro mixto/catálogo huérfano = fiel a Base44.
- **➡️ PRÓXIMA FASE = MEJORAS** (lo pendiente en Base44 por créditos): **#1 subir a Vercel** (POS ya importado en preview `migracion/supabase`; Web FALTA proyecto Vercel aparte) para revisión visual de Miguel; luego fantasmas, notas de voz, pagos mixtos, cancelación-con-anticipo→devolución, etc. **Orden completo en `docs/MEJORAS_POST_VALIDACION.md`.** El **CUTOVER de Base44 sigue pendiente** (Abel se instala el lunes); las imágenes `media.base44.com` se mantienen hasta entonces.

## 3. Stack
- Frontend: React 18 + Vite 6 + Tailwind 3 + React Router 6 + React Query 5 (export de Base44, migrado). Sin TS en el front.
- Datos/Auth/RLS/Storage: Supabase (proyecto staging `ivqcxdpqxwjxfohiswqb`, us-east-1, PG17).
- Hosting destino: Vercel (import pendiente de Miguel).

## 4. Arquitectura — Opción A (DB compartida + RLS)
Una sola base Supabase sirve al POS y (después) a la Web, separadas por RLS. **El puente Base44 desapareció** (`posApiClient.js` eliminado, sin api_key, sin sync de productos, sin `crearPedidoPOS`). La Web futura leerá la vista `catalogo_publico` e insertará en `pedidos` con anon key + RLS. Detalle en `docs/ARCHITECTURE.md` y `docs/DATABASE.md`.

## 5. Los 3 CANDADOS (regla irrompible)
- **CANDADO 1** — fallback venta↔corte (`Caja.jsx:220-246` y `1441-1461`): asociación por `corte_caja_id` o fallback por `fecha_cierre`+sucursal. **Idéntico bit a bit** (verbatim). NO optimizar.
- **CANDADO 2** — día operativo = **MEDIANOCHE América/Mexico_City (UTC-6 fijo)** vía `obtenerInicioDiaMexico` (`useCorteAtrasado.js:21`) y `Dashboard.jsx:38`. **NO es 06:00** (el `hora_inicio_dia_operativo='06:00'` es de plantilla QR, fuera de dinero). Idéntico.
- **CANDADO 3** — `handleBuscarFolioWeb` (`Caja.jsx:679`): el ÚNICO que se corrigió — ahora filtra el cobro por folio por la sucursal del terminal.

## 6. Entidades / tablas (lista verde, 12)
`sucursales, usuarios_pos, configuracion_negocio, productos, categorias_producto, ventas, detalle_venta, cortes_caja, pedidos, abonos, folio_contador, gastos_operativos`. (`clientes` NO se creó: 0 refs.) Basura de plantilla restaurante descartada. Detalle en `docs/DATABASE.md`.

## 7. Mapeo de archivos clave (qué NO romper) — ver `docs/FILE_MAP.md`
- `src/api/supabaseClient.js` — cliente + sesión.
- `src/api/entitiesAdapter.js` — capa de adaptación `base44.entities.*`→Supabase (traduce `$in/$ne/$gte/$lte`, `created_date→created_at`, whitelist de columnas por tabla). **No romper el whitelist ni el contrato.**
- `src/api/base44Client.js` — shim `base44` (entities + `UploadFile`→Storage `{file_url}` + stubs auth/functions).
- `src/pages/Caja.jsx` (~2249 líneas) — CANDADOS 1/2/3 + matemática del dinero. **Solo se redirige la fuente de datos; la lógica NO cambia.**
- `src/components/pedidos/RegistrarPagoDialog.jsx` — abono → venta paralela (ver quirk doble conteo en `docs/BUGS_PENDING.md`).
- **Auth/sesión (Fase 4, wireados):** `supabaseClient.js` (`ensureSession`/`loginTerminal`/`validarPin`/`loginConPin`/`logoutOperador`), `TerminalGate.jsx`, `ModalPinAdmin.jsx`, `AccesoDuenoGate.jsx`, `ConfigurarTerminal.jsx`, `Sidebar.jsx`, `AuthContext.jsx`, `ConfigContext.jsx` (fallback `config_publica`). **NO tocan la matemática del dinero ni los candados.** (`POSLogin`/`/login-pos` RETIRADO — el modelo no tiene login standalone.)

## 8. Flujos críticos (matemática del dinero) — ver `docs/DATABASE.md`
Corte lee SOLO `Venta estado='pagada'`; cancelar/devolver excluye por construcción; abono crea Abono (sucursal del pedido) + Venta paralela `pagada` (corte abierto, sucursal del terminal); entregar exige `saldo_pendiente=0`; efectivo_esperado = `total_efectivo + abonosEfectivo` (⚠️ doble conteo = quirk Base44, ver bugs).

## 9. Bugs / riesgos — ver `docs/BUGS_PENDING.md`
(a) doble conteo efectivo_esperado con abono efectivo = quirk de Base44 reproducido idéntico (CANDADO, fuera de alcance); (b) 2/20 cortes reales con abono efectivo y total_efectivo=0 (edge a verificar con bot); (c) imágenes en `media.base44.com` mueren al apagar Base44 (re-hospedar en cutover).

## 10. Próximos pasos — ver `docs/NEXT_STEPS.md`
Decisión tomada (Opción A) y wiring HECHO. **Próximo:** auditoría + firma de Miguel/su arquitecto sobre `migracion/supabase` (dinero + aislamiento RLS) → cierra Fase 4. Luego Fase 5 (bot de paridad).

## 11. Pendientes humanos (Miguel)
- Import Vercel (GitHub→Vercel, repo PRIVADO `M1gu3hb/Pasteleria-Confetti`, rama `migracion/supabase`, + 4 env vars de `supabase/STAGING_NOTES.md`).
- Rotar la api_key Base44 `847df…` (sigue viva en prod de Abel).

## 12. Repo / staging
- GitHub: `M1gu3hb/Pasteleria-Confetti` (**privado**), rama de trabajo `migracion/supabase`; `main` = baseline export Base44 intacto (api_key redactada).
- Supabase staging `ivqcxdpqxwjxfohiswqb`: SOLO datos maestros (sucursales 3, categorías 8, productos 20, **usuarios_pos 36 = 33 operadores + 3 cuentas terminal**, config 1); transaccional 0. `usuarios_login` (vista) = 33 (terminales excluidas). Cuenta auth por operador `<id>@pos.confetti.local` (password `POS-<pin>`); cuentas terminal `terminal-<sucursalid>@pos.confetti.local` (password `POS-TERMINAL-CONFETTI`). Cuenta staging `staging-pos@confetti.local` ya NO se usa (el login real existe) — se puede borrar.

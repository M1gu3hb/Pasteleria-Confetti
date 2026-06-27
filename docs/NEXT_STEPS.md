# NEXT_STEPS

Última actualización: 2026-06-27 (POS Fases 0-5 COMPLETAS+aprobadas; WEB-0/1/2/3 hechas; migraciones web 0017-0021; pendiente humano = import Vercel + bot al final).

> Nota de terminología: Miguel redefinió **Fase 5 = Validación de FIDELIDAD** (POS migrado vs Base44 vivo).
> El **bot de paridad** pasa a ser "al final" (con la Web ya migrada), no Fase 5.

> Repo/working tree estable: `C:\Pasteleria Confetti\pos` (clon de
> `M1gu3hb/Pasteleria-Confetti@migracion/supabase`). El scratchpad de la sesión anterior era temporal.

## ✅ DECISIÓN DE MIGUEL TOMADA: Opción A (cuenta terminal por sucursal)
Modelo exacto (fuente de verdad = el código actual, replicado): terminal=localStorage; empleado sin
PIN sobre la sesión terminal (scoped por RLS); administrador=PIN que **desbloquea UI sobre la sesión
terminal** (mismo alcance de sucursal, exige `sucursal==terminal`); dueño=PIN que abre **sesión global**
(`pos_is_admin`). Ver `DECISIONS.md` y la sección de esta sesión en `CHANGELOG.md`.

## ✅ FASE 4 — CERRADA (firmada por Miguel)
Wiring de auth (6 archivos + `ConfigContext` + `entitiesAdapter`) + migraciones 0015/0016. Auth real
(terminal/admin/dueño), RLS scoped, adversarial 31/31, `_pin` no persiste, dueño entra y restaura terminal.

## ✅ GATE DE AISLAMIENTO — RESUELTO (sesión cont. 2)
- **GATE-1:** `/login-pos`/`POSLogin` **RETIRADO** (era el hueco: un admin abría sesión global por ahí). No era load-bearing. Borrados ruta + componente + deps huérfanas.
- **GATE-2:** sellado de actor VERIFICADO = usa `posUser` → admin real al elevar (no centinela). Bug `_pin`→sessionStorage corregido.
- **GATE-3:** migración **0016** reproduce los auth.users de operadores (idempotente, NO-OP en staging).
- **GATE-4:** adversarial **31/31** incluyendo "validar PIN de admin NO escala la sesión; admin-B confinado a A".
- **GATE-5 (re-smoke UI del fix `_pin`):** 4/4 por UI — empleado abre caja + vende; admin eleva (sesión sigue terminal, `posUser`=admin real); admin de otra sucursal rechazado; dueño entra (usa `_pin`, funciona tras el strip) → global → al salir restaura terminal. **`posUser` sin `_pin`** en ambas elevaciones. 0 errores.

## ✅ FASE 5 — Validación de FIDELIDAD: HECHA y **APROBADA por Miguel**
El POS migrado es FIEL a Base44 (solo-lectura MCP). Detalle en `CHANGELOG.md` (cont. 3).
- **BLOQUE A** (maestros): **0 diffs** — sucursales 3, categorías 8, productos 20, usuarios 33, config (precio_kilo_global=140, ratio=7, propinas_activas=false, extras/rellenos) idénticos.
- **BLOQUE B** (pantallas/flujos vs MD 03): todo conforme (POS+Otros, Caja+CANDADO 3+cola web filtrada, Ventas cancel/devolver, Productos sin sync, PedidosPastel entregar saldo 0, Dashboard).
- **BLOQUE C** (corte real línea por línea): **14/14 campos idénticos** en CONF-C-C073 (con abono efectivo → doble conteo presente e idéntico) y CONF-A-C03358 (sin abono). Harness `scripts/fase5_corte_fidelity.mjs`.

> **POS migrado, independiente y fiel a Base44 — Fases 0-5 COMPLETAS y aprobadas.** Solo queda pendiente, al final de todo, el BOT de pruebas agresivas (concurrencia, PDFs de corte) — vive en otro proyecto de Miguel.

## ✅ WEB-0 y WEB-1 — HECHAS (migración de la Web; ver repo web `M1gu3hb/Pasteleria-Confetti-web-`)
- **WEB-0** (recon + andamiaje): repo web privado creado + andamiaje pusheado. Web = catálogo público mobile-first; Opción A (misma Supabase, anon key + RLS; el puente Base44 desaparece). 2 GAPs detectados.
- **WEB-1** (fixes de DB, en ESTE repo POS — esquema = fuente única): **0017 `web_pedido_folio_trigger`** (GAP1: trigger BEFORE INSERT en `pedidos` origen='web'/folio NULL → `siguiente_folio` vía SECURITY DEFINER; folio sigue NOT NULL, anon sin execute directo) y **0018 `web_uploads_bucket`** (GAP2: bucket `web-uploads` público/no-listable, 5MB, solo imágenes; anon INSERT solo ahí; `uploads` del POS authenticated-only intacto). Verificado **anon 11/11** + folio `PP-A-0001` asignado + **regresión POS limpia**. Harness `scripts/web1_gaps_verify.mjs`.

## ✅ WEB-2 y WEB-3 — HECHAS (validadas; pendiente solo import Vercel de Miguel)
WEB-2 (port de la capa de datos) y WEB-3 (validación end-to-end POS↔web) **completas**. Esquema web = migraciones **0019/0020/0021** en ESTE repo POS; el port y los smokes en el repo web. WEB-3: pedido web visible y fiel en el POS (badge 🌐 WEB, "Creado por Web Confetti", imagen de referencia) + aislamiento por sucursal; edición de producto en el POS reflejada de inmediato en el catálogo web (misma fila, sin sync); sin diffs vs Base44. Ver repo web `docs/CHANGELOG.md` y este `CHANGELOG.md` (cont. 4). **Siguiente:** import Vercel (Miguel) + bot de pruebas agresivas (al final). _Notas del plan original abajo (referencia)._
- ⚠️ **PUNTO DE FIDELIDAD CRÍTICO (cambio de LÓGICA, no plomería):** la web Base44 filtra/bloquea la sucursal por **`sucursales_disponibles` (NOMBRES)**; el esquema compartido usa **`sucursal_ids` (IDs)** y `catalogo_publico` expone `sucursal_ids`. Reescribir la disponibilidad para matchear por **ID** (vacío/null = global). **Un find-replace lo rompe en silencio** — verificar con un producto limitado a 1 sucursal.
- ✅ **Folio en pantalla Gracias — RESUELTO (migración 0019, en ESTE repo POS).** RPC `crear_pedido_web(payload jsonb) → text` SECURITY DEFINER que inserta el pedido y **devuelve el folio**; el web usa `rpc('crear_pedido_web', {payload})` en vez de `insert`. Reaplica los candados del WITH CHECK anon, whitelist de columnas, valida requeridos + sucursal activa, reutiliza el trigger 0017 (un solo generador). anon: solo EXECUTE, sin SELECT. Verificado (folio real devuelto, web/pendiente, 42501 en SELECT directo, inválidos rechazados). Ver DECISIONS #22.

## PENDIENTES HUMANOS DE MIGUEL
- Import **Vercel** del **repo web** (`Pasteleria-Confetti-web-`, rama `migracion/supabase`, env `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` = mismo Supabase) y del POS.
- Rotar api_key Base44 `847df…`.
- ~~Decidir el mecanismo de folio para Gracias~~ → **RESUELTO** (0019 RPC `crear_pedido_web`).

## CUTOVER (futuro, no ahora)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con históricos).
- Los 3 productos "prueba" ("prueba 1/2/suscursal") NO van al catálogo real de Abel.
- 🔴 **BLOQUEANTE DE CUTOVER — fotos de producto del catálogo (Flag WEB-2):** las imágenes de producto que muestra la web pública vienen de **`productos.imagen_url`**, que aún apunta a **`media.base44.com`** (el CDN de Base44). Cargan hoy porque Base44 sigue vivo. **Antes de apagar Base44** hay que **re-hospedar esas imágenes en Supabase Storage y actualizar `productos.imagen_url`**; si no, el catálogo público de la web **pierde las fotos**. Es migración de DATOS del POS (no del repo web). Ver `BUGS_PENDING.md`.
- Borrar las 2 imágenes de prueba residuales de los smokes WEB-2/WEB-3 en `web-uploads/pedidos/` (`db92b1c3-…png`, `74aa34e2-…png`) por Storage dashboard / service_role. Ver BUGS_PENDING (h).

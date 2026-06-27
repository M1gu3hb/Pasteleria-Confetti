# NEXT_STEPS

Última actualización: 2026-06-26 (fin de sesión: wiring de Fase 4 HECHO).

> Repo/working tree estable: `C:\Pasteleria Confetti\pos` (clon de
> `M1gu3hb/Pasteleria-Confetti@migracion/supabase`). El scratchpad de la sesión anterior era temporal.

## ✅ DECISIÓN DE MIGUEL TOMADA: Opción A (cuenta terminal por sucursal)
Modelo exacto (fuente de verdad = el código actual, replicado): terminal=localStorage; empleado sin
PIN sobre la sesión terminal (scoped por RLS); administrador=PIN que **desbloquea UI sobre la sesión
terminal** (mismo alcance de sucursal, exige `sucursal==terminal`); dueño=PIN que abre **sesión global**
(`pos_is_admin`). Ver `DECISIONS.md` y la sección de esta sesión en `CHANGELOG.md`.

## ✅ WIRING DE FASE 4 — HECHO (pendiente de firma de Miguel)
Wireados 6 archivos + `ConfigContext` (#7) + `entitiesAdapter` (mapeo de vista) + migración 0015
(3 cuentas terminal; `usuarios_login` excluye `pin_hash null`). Build verde, **smoke UI 4/4**,
**adversarial RLS 25/25** (`scripts/fase4_rls_adversarial.mjs`). Datos de prueba limpiados.

## ✅ GATE DE AISLAMIENTO — RESUELTO (sesión cont. 2)
- **GATE-1:** `/login-pos`/`POSLogin` **RETIRADO** (era el hueco: un admin abría sesión global por ahí). No era load-bearing. Borrados ruta + componente + deps huérfanas.
- **GATE-2:** sellado de actor VERIFICADO = usa `posUser` → admin real al elevar (no centinela). Bug `_pin`→sessionStorage corregido.
- **GATE-3:** migración **0016** reproduce los auth.users de operadores (idempotente, NO-OP en staging).
- **GATE-4:** adversarial **31/31** incluyendo "validar PIN de admin NO escala la sesión; admin-B confinado a A".
- **GATE-5 (re-smoke UI del fix `_pin`):** 4/4 por UI — empleado abre caja + vende; admin eleva (sesión sigue terminal, `posUser`=admin real); admin de otra sucursal rechazado; dueño entra (usa `_pin`, funciona tras el strip) → global → al salir restaura terminal. **`posUser` sin `_pin`** en ambas elevaciones. 0 errores.

## 🔴 PRÓXIMO PASO: AUDITORÍA + FIRMA DE MIGUEL (no encadenar solo)
Miguel/su arquitecto revisan `migracion/supabase` (dinero + aislamiento RLS) → cierra Fase 4. Decisiones ya aprobadas: admin=desbloqueo de UI; ConfigContext→config_publica; password terminal embebido OK staging (prod = provisión por dispositivo en cutover). Resto a confirmar:
- Mapeo sesión→RLS: admin sobre la sesión terminal (no `signInWithPassword`); dueño global con restauración de la terminal al salir.
- Migración 0016: en cutover real se re-siembra con los PINs del export de Base44.

## DESPUÉS (con luz verde de Fase 4)
- **Fase 5** (bot de paridad vs Base44, ya existe en otro proyecto de Miguel): dejar el sistema listo para conectarlo; documentar cómo apuntarlo a esta Supabase/Vercel; correr a volumen y comparar cortes idénticos. Lo firma Miguel.
- **Web** (sub-proyecto aparte): apuntar a la misma Supabase (vista `catalogo_publico` + RLS anon ya listas).

## PENDIENTES HUMANOS DE MIGUEL
- Import Vercel: GitHub→Vercel, repo PRIVADO, rama `migracion/supabase`, + 4 env vars (ver `supabase/STAGING_NOTES.md`). Sin Vercel CLI ni git-link, no es automatizable.
- Rotar api_key Base44 `847df…`.

## CUTOVER (futuro, no ahora)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con históricos).
- Los 3 productos "prueba" ("prueba 1/2/suscursal") NO van al catálogo real de Abel.
- Re-hospedar imágenes de `media.base44.com`.

# NEXT_STEPS

Última actualización: 2026-06-26 (Fase 4 CERRADA + Fase 5 de fidelidad HECHA).

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

## ✅ FASE 5 — Validación de FIDELIDAD: HECHA (pendiente de revisión de Miguel)
Comparación solo-lectura vs Base44 vivo (MCP). Detalle en `CHANGELOG.md` (sesión cont. 3).
- **BLOQUE A** (maestros): **0 diffs** — sucursales 3, categorías 8, productos 20, usuarios 33, config (precio_kilo_global=140, ratio=7, propinas_activas=false, extras/rellenos) idénticos.
- **BLOQUE B** (pantallas/flujos vs MD 03): todo presente y conforme (POS+Otros, Caja+CANDADO 3+cola web filtrada, Ventas cancel/devolver, Productos sin sync, PedidosPastel entregar saldo 0, Dashboard).
- **BLOQUE C** (corte real línea por línea): **14/14 campos idénticos** en CONF-C-C073 (con abono efectivo → doble conteo presente e idéntico) y CONF-A-C03358 (sin abono). Harness `scripts/fase5_corte_fidelity.mjs`.

## 🔴 PRÓXIMO PASO: REVISIÓN DE MIGUEL (no encadenar solo)
Miguel revisa la Fase 5. **NO iniciar la Web** hasta su luz verde.

## DESPUÉS (con luz verde de Fase 5)
- **Web** (sub-proyecto aparte): apuntar a la misma Supabase (vista `catalogo_publico` + RLS anon ya listas).
- **Bot de paridad** (al final, con la Web ya migrada; vive en otro proyecto de Miguel): correr a volumen y comparar cortes vs Base44. Lo firma Miguel.

## PENDIENTES HUMANOS DE MIGUEL
- Import Vercel: GitHub→Vercel, repo PRIVADO, rama `migracion/supabase`, + 4 env vars (ver `supabase/STAGING_NOTES.md`). Sin Vercel CLI ni git-link, no es automatizable.
- Rotar api_key Base44 `847df…`.

## CUTOVER (futuro, no ahora)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con históricos).
- Los 3 productos "prueba" ("prueba 1/2/suscursal") NO van al catálogo real de Abel.
- Re-hospedar imágenes de `media.base44.com`.

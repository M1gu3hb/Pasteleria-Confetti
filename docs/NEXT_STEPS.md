# NEXT_STEPS

Última actualización: 2026-06-26.

## 🔴 DECISIÓN PENDIENTE DE MIGUEL (bloquea el wiring de Fase 4)
**Modo empleado bajo RLS real.** Hoy Abel opera la terminal SIN PIN (auto-login de "Empleado" virtual, rol caja, sucursal del terminal). Bajo RLS estricta esa sesión necesita identidad de sucursal en Supabase. Opciones:
- **(A, RECOMENDADA — preserva la UX de Abel):** crear una **cuenta "terminal" por sucursal** (rol caja, `pin_hash` null). Al configurar la terminal, auto-login a esa cuenta (`signInWithPassword`, password fijo embebido tipo `POS-TERMINAL`, scoped por RLS a su sucursal). El cajero sigue sin teclear PIN. Excluir esas cuentas de la vista `usuarios_login`.
- **(B, más estricta):** quitar el modo empleado; todos entran con PIN. Cambia la operación diaria.

## PRÓXIMO PASO EXACTO (tras la decisión)
**Cerrar Fase 4 = wiring de la UI de auth a las sesiones reales** (6 archivos). El backend ya está listo (auth.users por operador, `login_pos` RPC, RLS scoped, adversarial 17/17).

1. `src/api/supabaseClient.js`: agregar `loginConPin(pin, userId?)` → `supabase.rpc('login_pos',{p_pin,p_user_id})` → `signInWithPassword(email, 'POS-'+pin)` → devuelve operador; `loginTerminal(sucursalId)` (si opción A); `logoutOperador()` (signOut). Quitar el auto-signin de la cuenta `staging-pos` (Fase 2/3) de `ensureSession` (dejar que solo retorne la sesión existente).
2. `src/pages/POSLogin.jsx`: listar usuarios con la vista **`usuarios_login`** (anon-legible) en vez de `UsuarioPOS` (ya bloqueada para anon). Reemplazar `u.pin === pin` por `loginConPin(pin, selectedUser?.id)`; on success `login(operador)`.
3. `src/components/common/TerminalGate.jsx`: el auto-login de empleado debe `await loginTerminal(terminal.sucursal_id)` (opción A) antes de `login({...empleado virtual...})`.
4. `src/components/common/ModalPinAdmin.jsx` y `AccesoDuenoGate.jsx`: validar PIN vía `loginConPin` (establecen la sesión Supabase del admin/dueño). LEERLOS antes de tocar (no se leyeron en la sesión anterior).
5. `src/lib/AuthContext.jsx`: ya simplificado; confirmar que no reintroduce la sesión staging.
6. Crear (opción A) las 3 cuentas terminal (usuarios_pos rol caja + auth.users, email `terminal-<sucursalid>@pos.confetti.local`, pin_hash null) y actualizar la vista `usuarios_login` para excluir `pin_hash is null`.
7. **Build** (`npm run build`) + **smoke** (preview local, ver patrón en sesión previa): login por PIN como caja A → ve solo A; admin/dueño → ve todo; vender/abrir-cerrar corte/abono. Confirmar que la RLS no rompe ningún flujo.
8. Re-correr el harness adversarial (en `docs/` no quedó guardado; reconstruir el patrón de `_fase4_rls.mjs` descrito en CHANGELOG) y confirmar 17/17 sigue.
9. Limpiar datos de prueba (staging solo maestros). DETENERSE y reportar para que Miguel firme Fase 4.

## DESPUÉS (no ahora)
- **Fase 5** (bot de paridad vs Base44, ya existe en otro proyecto de Miguel): dejar el sistema listo para conectarlo; documentar cómo apuntarlo a esta Supabase/Vercel; correr a volumen y comparar cortes idénticos. Lo firma Miguel.
- **Web** (sub-proyecto aparte): apuntar a la misma Supabase (vista `catalogo_publico` + RLS anon ya listas).

## PENDIENTES HUMANOS DE MIGUEL
- Import Vercel: GitHub→Vercel, repo PRIVADO, rama `migracion/supabase`, + 4 env vars (ver `supabase/STAGING_NOTES.md`). Sin Vercel CLI ni git-link, no es automatizable.
- Rotar api_key Base44 `847df…`.

## CUTOVER (futuro, no ahora)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con históricos).
- Los 3 productos "prueba" ("prueba 1/2/suscursal") NO van al catálogo real de Abel.
- Re-hospedar imágenes de `media.base44.com`.

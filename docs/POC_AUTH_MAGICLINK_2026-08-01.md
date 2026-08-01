# PoC Auth — `generateLink(magiclink)` + `verifyOtp`

Fecha: 2026-08-01 · Proyecto `ivqcxdpqxwjxfohiswqb` · **Resultado: PASA (8/8)**

## Qué se probó y cómo

Se desplegó una Edge Function **temporal** (`poc-auth-magiclink`) que usa
`SUPABASE_SERVICE_ROLE_KEY` **sólo del lado servidor**. Operaba exclusivamente sobre una cuenta
**sintética hardcodeada** (`poc-sintetico-…@pos.confetti.local`); nunca sobre el dueño ni ningún
usuario real. No se envió ningún correo: `auth.admin.generateLink` **genera** el enlace, no lo manda.

## Evidencia

| # | Criterio | Resultado |
|---|---|---|
| 1 | `generateLink` devuelve `hashed_token` | OK (`verification_type: magiclink`) |
| 2 | `verifyOtp` (`POST /auth/v1/verify`, `type=email`) entrega **access token** | OK — JWT de 832 chars, `expires_in: 3600` |
| 3 | Entrega **refresh token** | OK |
| 4 | **Usuario correcto** | OK — `claim sub` = `user.id` = el de la cuenta sintética |
| 5 | Claims correctos | OK — `role: authenticated`, `email` correcto |
| 6 | **Token de un solo uso** (reintento del mismo `token_hash`) | OK — rechazado con `otp_expired` |
| 7 | **Refresh automático** (`grant_type=refresh_token`) | OK — nuevo access token + refresh rotado |
| 8 | Sesión válida contra la API (equivale a restaurar tras recargar) | OK — `GET /auth/v1/user` devuelve el id |
| 9 | **Logout** | OK — HTTP 204 |
| 10 | Refresh **después** del logout | OK — rechazado con `refresh_token_not_found` |

No se registró en ningún log el `token_hash`, el access token, el refresh token ni el enlace completo.
Los artefactos locales con tokens se borraron al terminar.

## Limpieza

- Cuenta sintética **borrada** (`auth.users` vuelve a 7, 0 sintéticos).
- La Edge Function del PoC quedó **neutralizada**: responde `410 gone`, ya no usa `service_role`, no
  crea usuarios ni genera enlaces.
- **PENDIENTE PARA MIGUEL:** borrarla del panel (Edge Functions → `poc-auth-magiclink` → Delete).
  El MCP de Supabase no expone borrado de funciones.

## Arquitectura seleccionada (confirmada por el PoC)

`generateLink` + `verifyOtp` es viable. El diseño para el flujo nuevo:

1. La tablet mantiene su sesión de **terminal** (credencial de alta entropía, nunca en el bundle).
2. El empleado pulsa "modo administrador" y teclea **el mismo PIN de 4 dígitos**.
3. El frontend llama a una Edge Function con la sesión de terminal en el `Authorization`.
4. La función, en este orden: **(a)** exige terminal autenticada y registrada → **(b)**
   `app_private.pin_rate_intentar` → **(c)** valida el PIN contra `pin_hash` → **(d)** sólo entonces
   `generateLink` para el correo interno de ese operador.
5. Devuelve **sólo** el `token_hash`; el cliente lo canjea con `verifyOtp`.
6. `service_role` jamás sale de la función. No se firma ningún JWT a mano.

**Hallazgo que simplifica mucho la migración:** no hace falta tocar `auth.users` ni el mapeo
`usuarios_pos.auth_user_id`. Los mismos usuarios siguen sirviendo, así que `pos_is_admin()` y
`pos_sucursal()` — y por tanto toda la RLS — se comportan igual. Lo único que cambia es **cómo** se
obtiene la sesión. En el cutover se rotan las contraseñas a valores aleatorios de alta entropía, con
lo que el grant por password contra `/auth/v1/token` deja de servir y la cadena `POS-${pin}` muere.

## Riesgo conocido a cubrir en la implementación

`verify_jwt=true` significa "JWT válido del proyecto", **no** "usuario autenticado": la propia clave
`anon` es un JWT válido. Por eso la función **debe rechazar explícitamente el rol `anon`** y exigir
que el `sub` corresponda a una cuenta de terminal registrada, antes incluso del rate limit.

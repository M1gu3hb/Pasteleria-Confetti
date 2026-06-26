# Notas de staging (Fase 2/3)

## Sesión Supabase temporal (rol `authenticated`)
Para que apliquen las políticas RLS amplias del POS en Fase 2/3, la app abre una
sesión Supabase con una **cuenta de staging** (no es el login de operador):

- Email: `staging-pos@confetti.local`
- Password: en `.env` (`VITE_STAGING_AUTH_PASSWORD`) — NO se commitea.
- Creada vía SQL en `auth.users` + `auth.identities` (idempotente con `where not exists`).

⚠️ Fase 4 reemplaza esto por Supabase Auth real por usuario y **elimina** esta
cuenta y la columna `usuarios_pos.pin` (PIN en claro interino).

## Variables de entorno (Vercel)
Configurar en el proyecto Vercel (rama `migracion/supabase`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STAGING_AUTH_EMAIL`
- `VITE_STAGING_AUTH_PASSWORD`

## Datos
Solo **datos maestros** (sucursales, categorías, productos, usuarios, config).
Sin datos transaccionales (decisión Miguel). Los transaccionales de prueba creados
durante el smoke test se limpiaron.

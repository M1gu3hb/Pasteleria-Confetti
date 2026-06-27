# PROJECT_CONTEXT — POS Pastelería Confetti (migración Base44 → Vercel + Supabase)

> **Fuente principal de transferencia.** Léelo COMPLETO antes de tocar nada, junto con `CLAUDE.md` y `docs/`.
> Última actualización: 2026-06-26 (fin de sesión: wiring de Fase 4 HECHO, pendiente de firma).
> **Working tree estable:** `C:\Pasteleria Confetti\pos` (clon de `M1gu3hb/Pasteleria-Confetti@migracion/supabase`).

## 1. Objetivo
Independizar el **POS interno** de Pastelería Confetti de Base44, dejándolo **idéntico en comportamiento** sobre infra propia: **React (Vite) en Vercel + Supabase (Postgres + Auth + RLS + Storage)**. NO es reconstrucción: el sistema ya estaba aprobado por el cliente (Abel); se migra, no se rediseña. El cliente sigue operando en Base44 en producción durante toda la migración; el corte a producción lo decide Miguel y NO es parte de esta fase.

## 2. Estado real (honesto)
- **Fase 0** (reconocimiento + andamiaje): COMPLETA, auditada por Miguel.
- **Fase 1** (esquema unificado): COMPLETA y APLICADA en staging, auditada.
- **Fase 2** (seed maestros + port capa de datos + smoke): COMPLETA, auditada. Build verde; smoke en preview local OK.
- **Fase 3** (validación aritmética del dinero): COMPLETA, auditada. + **PASO 0 gate money-crítico CERRADO LIMPIO**.
- **Fase 4** (Auth + RLS + wiring): **CERRADA (firmada por Miguel).** Opción A; auth real terminal/admin/dueño; RLS scoped; migraciones 0015/0016; adversarial 31/31; `_pin` no persiste. Ver `CHANGELOG.md` (cont./cont.2) + `DECISIONS.md` (13–19).
- **Fase 5** (Validación de FIDELIDAD vs Base44 vivo): **HECHA, pendiente de revisión de Miguel.** Maestros 0 diffs; pantallas/flujos conformes; corte real 14/14 campos idénticos (incl. doble conteo). Ver `CHANGELOG.md` (cont. 3). (El **bot de paridad** queda para el final, con la Web ya migrada.)
- **Web** (sub-proyecto): NO iniciada (espera luz verde de Fase 5).

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

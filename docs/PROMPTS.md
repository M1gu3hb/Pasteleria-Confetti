# PROMPTS — apertura de sesión y patrón de trabajo

## Prompt maestro — APK Android (proyecto por fases, 2026-07-09)
> Convertir el POS web en APK Android instalable con **Capacitor** que: (1) cargue la web VIVA de Vercel (para actualizar por nube sin reinstalar); (2) imprima ESC/POS nativo (USB/Ethernet) SIN window.print/RawBT; (3) abra cajón con varios métodos seleccionables; (4) deje TODA variable incierta (conexión/modo/cajón/corte) como OPCIÓN seleccionable y probable EN SITIO; (5) NO cambie la operación actual ni el diseño de los tickets.
>
> **Reglas rectoras (inviolables):** UNA fase a la vez → auditar + evidencia + DETENERSE y esperar "continúa". NO tocar la lógica del DINERO (cortes/ventas/abonos/saldos/folios/RLS/efectivo esperado/registrarPagoPedido). NO cambiar el diseño de ningún ticket (el modo IMAGEN renderiza los MISMOS componentes). El NAVEGADOR queda byte-por-byte igual; lo nativo va detrás de `Capacitor.isNativePlatform()` (aditivo). Rama `apk/capacitor` (nace de `migracion/supabase`); previews sí, **producción NO** sin OK. Lo físico se prueba EN SITIO (Camino A) — no autocertificar. APK final en `C:\Pasteleria Confetti\release\`. git checkpoint antes de cada fase; conventional commits sin co-author de IA.
>
> **Fases:** 0 diagnóstico · 1 cáscara Capacitor+Vercel · 2 APK de prueba (validación de carga en tablet) · 3 plugin nativo delgado ESC/POS · 4 capa de impresión (IMAGEN default + TEXTO opción) · 5 cajón (variantes) · corte térmico · 6 panel Config→Operación (config local) · 7 firmar APK + carpeta release · cierre + docs. **Estado: todo el código HECHO; pendiente = prueba en sitio + repunte a producción tras OK.**

## Prompt de apertura (pegar en una sesión nueva)
> Eres un ingeniero senior continuando la migración del POS de Pastelería Confetti (Base44 → Vercel + Supabase). **Antes de tocar nada**, lee `PROJECT_CONTEXT.md` y todo `docs/` (NEXT_STEPS, DECISIONS, DATABASE, FILE_MAP, BUGS_PENDING, CHANGELOG, ARCHITECTURE) y `CLAUDE.md`. Verifica el estado real: último commit de la rama `migracion/supabase` y el estado de la DB Supabase `ivqcxdpqxwjxfohiswqb` (list_tables, list_migrations). NO toques Base44 en vivo ni la api_key. Respeta los 3 candados. El dinero y el RLS los firma Miguel. Trabaja por fases: al terminar, DETENTE y reporta; espera luz verde. El próximo paso está en `docs/NEXT_STEPS.md` (bloqueado por una decisión de Miguel sobre el modo empleado).

## Accesos / contexto operativo
- GitHub: `M1gu3hb/Pasteleria-Confetti` (privado), rama `migracion/supabase`. Cuenta MCP autenticada como M1gu3hb (PAT restringido: NO crea repos; para crear repos se usó la credencial local GCM).
- Supabase MCP: proyecto `ivqcxdpqxwjxfohiswqb`. Usar `list_tables`, `apply_migration`, `execute_sql`, `get_advisors`, `get_publishable_keys`.
- Base44 MCP (app POS `6a28a71350ef872d8486262b`): SOLO LECTURA (`query_entities`, `list_entity_schemas`) para export/verificación.
- Vercel MCP: `deploy_to_vercel` NO despliega (solo instrucciones); no hay git-link → import manual de Miguel.
- Preview local: `.claude/launch.json` (server `confetti-pos`, vite :5173) + tools `mcp__Claude_Preview__*` (preview_start/screenshot/eval/click/console_logs).
- El código del POS vive en `scratchpad/pos` en la sesión de origen; en una sesión nueva, clonar el repo (rama `migracion/supabase`) y `npm install`.

## Patrón de trabajo por fases (el que siguió Miguel)
0. Reconocimiento + andamiaje → STOP.
1. Esquema (PROPONER, no aplicar sin auditoría) → STOP.
2. Seed maestros + port capa de datos + smoke → STOP.
3. Validación aritmética del dinero (casos deterministas, función REAL + lógica verbatim) → STOP.
4. Auth + RLS real + adversariales + re-run bajo RLS → STOP.
5. Bot de paridad vs Base44 (firma Miguel) → POS 100%.
- Cada fase: reportar qué se hizo / validó / falta. No auto-certificar dinero ni RLS. Verificar contra datos reales, no afirmar.
- Commits pequeños; doc viva (actualizar `docs/` + CHANGELOG tras cada cambio).

## Verificación del dinero (lección de Fase 3)
Para validar lógica embebida (p. ej. el resumen del corte en `Caja.jsx`): importar las funciones REALES puras (`desgloseMetodosPagoExacto`) + copiar VERBATIM la lógica del componente a un harness Node determinista; y para quirks (doble conteo), verificar contra **datos reales de Base44** (no asumir). El bot (Fase 5) es la autoridad final de paridad.

# CLAUDE.md — Reglas permanentes del proyecto (POS Confetti)

## ANTES DE TOCAR NADA
1. Lee **`PROJECT_CONTEXT.md`** (raíz) COMPLETO.
2. Lee **`docs/`**: NEXT_STEPS, DECISIONS, DATABASE, FILE_MAP, BUGS_PENDING, CHANGELOG.
3. Revisa el estado real de la DB con las herramientas de Supabase (proyecto `ivqcxdpqxwjxfohiswqb`) y el último commit de la rama `migracion/supabase`.

## Documentación viva (OBLIGATORIO)
Tras CADA cambio significativo, actualiza la doc correspondiente y `docs/CHANGELOG.md`. La doc es la memoria del proyecto entre sesiones; si queda desfasada, la siguiente sesión se pierde. Commit + push frecuente (commits pequeños y descriptivos).

## Los 3 CANDADOS (irrompibles)
- **CANDADO 1** — fallback venta↔corte (`Caja.jsx:220-246`, `1441-1461`): copiar IDÉNTICO, bit a bit. Prohibido "mejorar"/optimizar.
- **CANDADO 2** — día operativo = MEDIANOCHE América/Mexico_City (UTC-6). Idéntico. (NO 6am.)
- **CANDADO 3** — `handleBuscarFolioWeb` (`Caja.jsx:679`): el único que SÍ se corrige (filtro por sucursal del terminal). Ya hecho.
> "Idéntico" = todo lo que Abel usa se comporta exactamente igual. La basura de plantilla descartada no cuenta.

## Reglas de seguridad / alcance
- **NUNCA** tocar las apps Base44 en vivo ni los datos reales (solo LECTURA para export/verificación).
- **NUNCA** re-exponer la api_key `847df…` (el puente murió; rotarla es tarea de Miguel).
- La **matemática del dinero** y el **aislamiento RLS** NO se auto-certifican: se entrega evidencia; **los firma Miguel**.
- snake_case en todo. Lógica de negocio en el frontend (no moverla a features de plataforma).

## Proceso por fases
Trabajar por fases; al terminar cada una **DETENERSE y reportar** (qué se hizo, qué se validó, qué falta); esperar luz verde de Miguel. No encadenar fases solas. No abrir una fase sin cerrar la anterior.

## Capa de datos
NO es find-replace. El adaptador (`src/api/entitiesAdapter.js`) preserva el contrato de `base44.entities.*`. Cargas por lotes `$in`, paginación y filtros por fecha/sucursal en historiales. Guards anti-pantalla-blanca (`Array.isArray`, `Number()||0`, optional chaining, `.catch(()=>[])`).

## Git
Rama de trabajo: `migracion/supabase` (no `main`). Sin co-author de IA en commits (config del usuario). Conventional commits.

## APK Android (Capacitor) — reglas (rama `apk/capacitor`)
El POS también se envuelve en un **APK Android (Capacitor)** que carga la web VIVA desde Vercel e imprime ESC/POS nativo. Reglas al tocarlo:
- **REGLA DE ORO:** el plan NO se apuesta a un solo camino. Cada eslabón incierto (conexión USB/Ethernet, modo imagen/texto, método de cajón, formato de corte) queda como **opción SELECCIONABLE y PROBABLE EN SITIO** (panel Config → Operación → "Impresora y cajón (app)"). Nunca hardcodear "el que creo que jala".
- **Split navegador/APK:** TODO lo nativo va detrás de `Capacitor.isNativePlatform()`. El **NAVEGADOR queda byte-por-byte igual** (lo que usa Abel): `print.js` rama navegador (`printTicketViaIframe`/`window.print`) intacta; la rama nativa es ADITIVA. Los componentes de ticket NO cambian de diseño.
- **Dinero/RLS/folios/corte-math NO se tocan.** El APK solo cambia CÓMO se imprime, no QUÉ se calcula. El corte térmico reusa los mismos `corte.*` y helpers que `CorteTicket` (números idénticos, verificados).
- **Config LOCAL por dispositivo** para impresora/cajón/formato-corte: `src/native/printerConfig.js` (localStorage), NO la config compartida de Supabase.
- **Camino A:** las pruebas físicas (impresora/cajón real) son EN SITIO; no se autocertifican ("no afirmar que jala").
- **Rama `apk/capacitor`** (nace de `migracion/supabase`). Previews de Vercel permitidos; **NO deploy a producción** ni merge a `migracion/supabase` sin OK explícito de Miguel. El `server.url` del APK apunta a la **PREVIEW de la rama** durante el piloto (producción aún no tiene lo nativo).
- Detalle: ver `PROJECT_CONTEXT.md` §APK, `docs/ARCHITECTURE.md`, `docs/FILE_MAP.md`, `docs/DECISIONS.md`, `docs/NEXT_STEPS.md`. Entregable en `C:\Pasteleria Confetti\release\`.

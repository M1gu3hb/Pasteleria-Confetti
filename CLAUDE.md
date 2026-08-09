# CLAUDE.md — Reglas permanentes del proyecto (POS Confetti)

## Propósito

Instrucciones permanentes para **cualquier** sesión de Claude Code, otra cuenta u otra IA que trabaje en este proyecto. Estas reglas mandan sobre cualquier costumbre por defecto.

> **Contexto que cambia cómo trabajas:** esto es un **POS en producción**, operando **hoy**, en 3 sucursales, sobre tablets, con personal no técnico y de edad. Un despliegue malo deja al negocio sin cobrar. Trabaja como si cada cambio se fuera a estrenar en la caja registradora dentro de cinco minutos — porque así es.

---

## ANTES DE TOCAR NADA

1. Lee **`PROJECT_CONTEXT.md`** (raíz) COMPLETO.
2. Lee **`HANDOFF.md`** (raíz) — es lo más reciente y dice exactamente dónde se quedó la última sesión.
3. Lee **`docs/`**: `NEXT_STEPS`, `BUGS_PENDING`, `DECISIONS`, `DATABASE`, `FILE_MAP`, `ARCHITECTURE`, `CHANGELOG`.
4. Lee `README.md`, `package.json`, `vite.config.js` y la estructura de carpetas.
5. **Revisa el estado REAL**: la base con las herramientas de Supabase (proyecto `ivqcxdpqxwjxfohiswqb`) y el último commit de `migracion/supabase`. **La documentación puede estar vieja; el código y la base son la verdad.**
6. Si la documentación contradice al código, **arregla la documentación antes de seguir** y dilo en tu respuesta.

---

## Los 3 CANDADOS (irrompibles)

- **CANDADO 1** — fallback venta↔corte (`Caja.jsx`): copiar IDÉNTICO, bit a bit. Prohibido "mejorar"/optimizar.
- **CANDADO 2** — día operativo = **MEDIANOCHE América/Mexico_City (UTC-6)**. Idéntico. **NO 6am.**
- **CANDADO 3** — `handleBuscarFolioWeb` (`Caja.jsx`): el único que SÍ se corrigió (filtro por sucursal del terminal). Ya hecho.

> "Idéntico" = todo lo que Abel usa se comporta exactamente igual.

**Además:** el **doble conteo de `efectivo_esperado`** con abono en efectivo es un **quirk de Base44 reproducido a propósito**. No es un bug. No lo "arregles".

---

## Reglas de seguridad / alcance

- **NUNCA** tocar las apps Base44 en vivo ni los datos reales (solo LECTURA para export/verificación).
- **NUNCA** re-exponer la api_key `847df…` (rotarla es tarea de Miguel).
- **NUNCA** dejar secretos de servicio en el frontend, en el repo, en logs ni en documentación: ni `service_role`, ni contraseñas en `VITE_*`, ni `token_hash`, ni tokens de sesión.
- La **matemática del dinero** y el **aislamiento RLS** **NO se autocertifican**: se entrega evidencia; **los firma Miguel**.
- **No alteres datos reales para probar.** Usa transacciones revertidas (`DO $$ … RAISE`), fixtures aislados o pruebas controladas, y **comprueba después que no quedó rastro**.
- **No crear** ventas, pedidos, abonos, cortes ni gastos ficticios en producción.
- **El PIN permanece en 4 dígitos.** Sin CAPTCHA, sin pasos nuevos, sin re-logins, sin pantallas nuevas.
- **No borres imágenes, audios ni datos.** No recomprimas imágenes.
- Al cambiar policies, **no dejes una ventana sin RLS**: usa transacciones o `ALTER POLICY`.
- snake_case en todo. Lógica de negocio en el frontend.

---

## Proceso por fases

Trabaja por fases; al terminar cada una **DETENTE y reporta** (qué se hizo, qué se validó, qué falta) y espera luz verde de Miguel. No encadenes fases solas. No abras una fase sin cerrar la anterior.

---

## Capa de datos

NO es find-replace. El adaptador (`src/api/entitiesAdapter.js`) preserva el contrato de `base44.entities.*`. Cargas por lotes `$in`, paginación y filtros por fecha/sucursal en historiales. Guards anti-pantalla-blanca (`Array.isArray`, `Number()||0`, optional chaining, `.catch(()=>[])`).

> **Aprendido a base de golpes:** PostgREST corta las respuestas en **1.000 filas**. Una consulta **sin `ORDER BY` ni límite explícito** devuelve las 1.000 **más antiguas** y **no avisa**. Eso costó 11 cortes de caja guardados en cero. **Toda consulta que alimente dinero va acotada, ordenada y paginada.**

---

## Cómo escribir pruebas aquí (regla ganada a golpes)

Dos bugs graves se colaron porque **las pruebas probaban el arnés, no el código**:

- Un test abstraía el `count` del servidor en un **booleano**, así que nunca evaluó la expresión real y no vio que **`Number(null) === 0`**.
- Otro **inyectaba** `setInterval`/`clearInterval` como funciones normales de JS, así que nunca tocó los nativos del navegador y no vio el **`Illegal invocation`** que dejaba la app en blanco.

**Reglas:**
1. Si inyectas un doble, que **imite la restricción real** (por ejemplo, comprobar el receptor como hace Chrome), o ejercita **también** el camino real.
2. Toda prueba de regresión debe **comprobarse contra el código viejo**: si no falla ahí, no prueba nada.
3. Pasa **valores crudos** (`null`, `undefined`, `NaN`, strings), no banderas que resuman el caso.

---

## Verificación antes y después de desplegar

- `npm run build` debe salir **0**.
- `npm run lint` → **39 errores es la LÍNEA BASE**, no cero. Lo que importa es que **no suba**.
- `npm run typecheck` → **1249 es la LÍNEA BASE**. Igual: que no suba.
- Corre las suites de `scripts/*.mjs` (todas funcionan sin credenciales).
- Tras desplegar: confirma en Vercel que el deployment es `target: "production"` y **descarga el bundle servido** para comprobar que trae el cambio.
- **Recuerda que las tablets tienen que recargar** para tomar el bundle nuevo. Un arreglo desplegado no es un arreglo entregado.

---

## Git

- Rama de trabajo **y de producción**: **`migracion/supabase`** (no `main`). Vercel despliega producción desde ahí; cualquier otra rama sale como preview.
- Sin co-author de IA en los commits (config del usuario). Conventional commits.
- Commits pequeños y descriptivos. El cuerpo del commit explica **causa raíz y evidencia**, no sólo el qué.

---

## Documentación viva (OBLIGATORIO)

**Nunca termines una sesión sin actualizar la documentación** con los cambios hechos, decisiones tomadas, archivos tocados, entidades afectadas, bugs detectados y próximos pasos. La documentación es la memoria del proyecto entre sesiones: si queda desfasada, la siguiente sesión se pierde y Abel paga el error.

**Cambio significativo** = crear/borrar/modificar archivos importantes · cambiar arquitectura · cambiar entidades, tablas, schemas o migraciones · cambiar rutas, endpoints, servicios o componentes principales · resolver o detectar bugs · cambiar reglas de negocio o flujo de usuario · cambiar configuración, variables de entorno o scripts · añadir dependencias · cambiar permisos, roles o seguridad.

**Después de cada grupo de cambios relacionados:**
1. Actualiza `PROJECT_CONTEXT.md`.
2. Actualiza `docs/CHANGELOG.md`.
3. ¿Cambió la arquitectura? → `docs/ARCHITECTURE.md`.
4. ¿Cambiaron entidades/modelos/migraciones? → `docs/DATABASE.md`.
5. ¿Cambió la estructura de archivos? → `docs/FILE_MAP.md`.
6. ¿Hubo decisión técnica? → `docs/DECISIONS.md`.
7. ¿Apareció o se resolvió un bug? → `docs/BUGS_PENDING.md`.
8. ¿Cambió la prioridad? → `docs/NEXT_STEPS.md`.
9. ¿Un prompt funcionó bien? → `docs/PROMPTS.md`.
10. ¿Traspasas la sesión? → `HANDOFF.md`.

**Regla de transferencia:** `PROJECT_CONTEXT.md` + `HANDOFF.md` son la fuente principal para pasar el proyecto a otra sesión o IA. Siempre actualizados, claros y accionables.

**Regla anti-documentación muerta:** no dejes documentación vieja. Si algo cambió, actualízalo. Si ya no aplica, márcalo obsoleto o bórralo. **Nada de documentación decorativa**: escribe lo que otra IA necesita para continuar sin preguntar.

---

## APK Android (Capacitor) — rama `apk/capacitor`

El POS también se envuelve en un **APK Android** que carga la web VIVA desde Vercel e imprime ESC/POS nativo.

- **⚠️ LO PRIMERO QUE HAY QUE MIRAR:** el `server.url` del APK apunta al **preview de la rama `apk/capacitor`**, no a producción. Si esa rama está atrasada, **las tablets no reciben ninguna corrección**. Ver `HANDOFF.md` §4.
- **REGLA DE ORO:** cada eslabón incierto (USB/Ethernet, imagen/texto, método de cajón, formato de corte) queda como **opción seleccionable y probable EN SITIO** (Config → Operación → "Impresora y cajón (app)"). Nunca hardcodear "el que creo que jala".
- **Split navegador/APK:** todo lo nativo detrás de `Capacitor.isNativePlatform()`. El **navegador queda byte-por-byte igual**. Los componentes de ticket NO cambian de diseño.
- **Dinero/RLS/folios/corte-math NO se tocan.** El APK sólo cambia CÓMO se imprime.
- **Config LOCAL por dispositivo** (`src/native/printerConfig.js`, localStorage), no la config compartida de Supabase.
- Las pruebas físicas (impresora/cajón real) son **EN SITIO**; no se autocertifican.
- **NO fusionar `apk/capacitor` → `migracion/supabase` ni repuntar a producción sin OK explícito de Miguel.**

---

## Regla de cierre de sesión

Antes de terminar, verifica:

- ¿`CLAUDE.md` actualizado?
- ¿`PROJECT_CONTEXT.md` refleja el estado real?
- ¿`HANDOFF.md` al día?
- ¿`docs/CHANGELOG.md` tiene entrada de esta sesión?
- ¿`DATABASE.md` cambió si se tocaron entidades?
- ¿`FILE_MAP.md` cambió si se tocaron archivos importantes?
- ¿`BUGS_PENDING.md` actualizado?
- ¿`NEXT_STEPS.md` dice exactamente qué sigue?

Y termina tu respuesta con este bloque:

```
## Estado de documentación
- CLAUDE.md actualizado: Sí/No
- PROJECT_CONTEXT.md actualizado: Sí/No
- HANDOFF.md actualizado: Sí/No
- CHANGELOG.md actualizado: Sí/No
- DATABASE.md actualizado: Sí/No/No aplica
- FILE_MAP.md actualizado: Sí/No
- BUGS_PENDING.md actualizado: Sí/No
- NEXT_STEPS.md actualizado: Sí/No

## Próximo paso recomendado
<una sola acción concreta>
```

---

## Reportar honestamente

Si algo falla, dilo con la salida. Si te saltaste un paso, dilo. Si rompiste algo, **dilo primero y sin adornos**. Si no puedes comprobar algo, no afirmes que funciona: di qué falta para comprobarlo. En este proyecto una afirmación optimista sin evidencia cuesta dinero de verdad.

# BUGS_PENDING / riesgos conocidos

---

# 🔴 ABIERTOS AL 2026-08-09 (auditoría multiagente con verificación adversarial)

> Todos los de abajo **sobrevivieron** a un pase de refutación: un agente independiente intentó demostrar que eran falsos y no pudo. Los que sí se refutaron están al final, para que nadie los persiga otra vez.
> Contexto completo en `HANDOFF.md`.

## ✅ RESUELTO (2026-08-09) — El aviso "FAVOR DE REGRESAR LA BASE LIMPIA" estaba en un componente MUERTO
> Es lo único que Abel había pedido expresamente, y llevaba meses "hecho" sin salir nunca en el papel.

- **Por qué no salía:** el texto existía desde el import de Base44 (`9a281f3`) en
  `src/components/pedidos/TicketPedidoPastel.jsx` — **y ese componente no lo renderiza nadie**.
  `NuevoPedidoPastel.jsx:26` lo importa y **nunca lo usa**: su botón "Imprimir" hace `setVerDetalle(true)`,
  que abre `PedidoPastelDetalleDialog`, y ése monta **`TicketPastelConfetti`**, que no tenía el aviso.
  Comprobado: `grep -rn "<TicketPedidoPastel" src/` → **0 resultados**; `git log -S "<TicketPedidoPastel"` →
  **0 commits** (nunca se renderizó en la historia de este repo).
- **Arreglado** en `TicketPastelConfetti.jsx`, al final del todo, después del bloque de domicilio, con estilos
  **en línea** (el iframe térmico no carga Tailwind) y **sólo** para `pastel_personalizado`.
- **Prueba:** `scripts/ticket_pastel_base_limpia_verify.mjs` **23/23**, **7 FAIL contra el código viejo**.
  Incluye el sha256 del **contenido** de los otros 5 componentes de ticket para demostrar que **ninguno cambió**.
- **Estado: cerrado.** Queda pendiente sólo la comprobación que **no se puede hacer sin la tablet**: ver más abajo.

## 🟡 MEDIA — `devolver_base` es un campo fantasma: la elección del usuario se tira en silencio
> Encontrado el 2026-08-09 al implementar el aviso de la base. **Mismo patrón que las propinas.**

- **Qué pasa:** `NuevoPedidoPastel.jsx` mantiene `devolver_base` en el formulario (init en :103, relectura en
  :222, envío en :425, reset en :532) y lo manda al guardar. Pero:
  - **la columna `devolver_base` NO EXISTE en `pedidos`** (verificado en `information_schema.columns`: la
    consulta por `column_name ilike '%devolver%'` devuelve **0 filas**);
  - **tampoco está en `COLUMNS.pedidos`** del adaptador (`src/api/entitiesAdapter.js:41`), y `pickColumns`
    (:63-69) itera sobre la **lista permitida**, así que lo descarta **sin error y sin aviso**.
- **Consecuencia:** al releer, `p.devolver_base` es siempre `undefined`, y `p.devolver_base !== false` da
  siempre `true`. Cualquier condición sobre ese campo es una **opción falsa**: parece configurable y no lo es.
- **Atenuante comprobado:** hoy **no hay ningún control en la UI** que lo cambie (las 4 apariciones son init,
  relectura, envío y reset; ningún checkbox). Así que nadie está perdiendo una elección que haya hecho — pero
  el campo está ahí para que alguien lo "conecte" y crea que funciona.
- **Por eso el aviso nuevo NO se cuelga de él.** Está escrito en el comentario del componente.
- **Decisión pendiente de Miguel:** o se borra el campo fantasma del formulario, o se añade la columna y el
  control. **No se toca sin decidirlo**: `pedidos` es tabla de dinero.

## ⚠️ NO COMPROBABLE DESDE AQUÍ — que el WebView de la tablet dibuje los emojis
- **Lo que sí está demostrado:**
  - En modo **TEXTO ESC/POS** un emoji sale **basura**: `TextEncoder` es **UTF-8 y sólo UTF-8** (lo fija la
    spec), 🎂 = `f0 9f 8e 82` y 🙏 = `f0 9f 99 8f`, **4 bytes cada uno, todos > 0x7F**, que una impresora en
    CP437 pinta como 4 glifos sueltos. ⚠️ **Pero eso ya pasaba**: `ñ` = `c3 b1` y `á` = `c3 a1` también son
    > 0x7F, así que el modo texto **ya salía mal con los acentos** — es justo la razón por la que el modo
    **IMAGEN es el default** (`printerConfig.js`: `modo: 'imagen'`) y está documentada en `DECISIONS.md`.
  - En modo **IMAGEN** (el que se usa) el pipeline conserva lo que el DOM dibuje: el banco compara **pixel a
    pixel** y da idéntico (44/44).
  - **El corte no se lo come:** el avance `ESC J` es un **sufijo de longitud fija** que va después de TODO el
    contenido (`ejecutarYcortarSiempre`), así que el margen hasta la cuchilla **no depende de lo alto que sea
    el ticket**. Comprobado con los bytes reales: 150 puntos = 18,77 mm, **idénticos** con y sin el aviso.
- **Lo que NO se puede comprobar sin la tablet:** si la fuente del Android de Abel tiene el glifo. Un navegador
  de escritorio no responde esa pregunta.
- **Cómo se ha neutralizado el riesgo:** el aviso **se entiende sin los emojis** (van de adorno, nunca cargando
  el significado) y los dos elegidos son de **Unicode 6.0 (2010)** — 🎂 `U+1F382` y 🙏 `U+1F64F` —, la misma
  quinta que el 🚚 `U+1F69A` que **ya se imprime en este mismo ticket desde julio**. Si no hubiera glifo saldría
  un recuadro vacío y el aviso seguiría leyéndose.
- **Qué falta para cerrarlo:** un ticket real impreso. **No se le pide a Abel.**

## 🚨 ALTA — `0059_crear_venta_directa_guards` no tiene archivo en el repo (trazabilidad de DINERO)
> **Requiere decisión y firma de Miguel.** Encontrado el 2026-08-09 al corregir la cabecera de `0049`.

- **Qué pasa:** `crear_venta_directa_tx` —la función que crea **cada venta directa de mostrador**— se aplicó el
  2026-07-13 como `0049_crear_venta_directa_atomico` y se **reemplazó el mismo día** por
  `0059_crear_venta_directa_guards`, que **nunca tuvo archivo en el repo**.
- **Impacto:** el repo **no describe lo que corre**. El cuerpo vivo es ~2.100 caracteres más largo que el del archivo
  `0049` y añade guards que ese archivo ni menciona: `TOTAL_INVALIDO`, `TOTAL_NO_CUADRA`, `LINEA_INVALIDA`,
  `LINEA_NO_CUADRA`, `SIN_DETALLE`, `SIN_CAJA`, `SIN_SUCURSAL`. Es decir, **la versión viva es MÁS estricta que la
  documentada**: leer el archivo para saber qué valida el cobro de mostrador da una respuesta falsa.
- **Agravante — colisión de números:** hay **dos migraciones 0059**. La de arriba (2026-07-13, sin archivo) y
  `0059_recalculo_cortes_en_cero_ronda2` (2026-08-09, con archivo). **El 0059 del repo no es el 0059 de la base.**
- **Y la cabecera del archivo mentía entera:** decía `PREPARADA — NO APLICADA` y `NO mergear hasta la firma`, cuando
  está aplicada, mergeada y en uso. El orden de firma que declara (`0042 → 0044 → … → 0049 → frontend`) **no se
  siguió**: `0049` y su frontend se adelantaron a toda la cadena.
- **Corregido de momento (2026-08-09):** nota fechada al principio de
  `supabase/migrations/0049_PREPARADA_crear_venta_directa_atomico.sql`, **sin tocar una línea del SQL**, con las dos
  consultas para comprobarlo contra la base.
- **Lo que falta:** reconstruir el archivo desde `supabase_migrations.schema_migrations`, renumerarlo sin colisión y
  commitearlo. **Es SQL de dinero: lo decide y lo firma Miguel.**
- **Prioridad:** alta. **Estado:** abierto.

## ✅ RESUELTO (2026-08-09) — DOBLE PEDIDO Y DOBLE COBRO del anticipo (`NuevoPedidoPastel`)
> El único de todo el barrido que **le cobraba dos veces a un cliente real**.

- **Qué pasaba:** el botón "Guardar pedido" sólo llevaba `disabled={guardando}`, y `guardando` vuelve a `false` en el
  `finally`. Al terminar el guardado el botón quedaba **otra vez activo** y **seguía diciendo "Guardar pedido"** — y
  arriba la pantalla apenas cambia, así que creer que no se guardó es lo normal. Un segundo toque no entra por la rama
  de edición (`editId` es null): cae al `else` y **crea otro pedido**, con **otro folio** y, si había anticipo,
  **otro abono con otra venta paralela** cobrada en el corte del día.
- **⚠️ La base NO lo para**, comprobado en producción: `pedidos` y `abonos` sólo tienen su PK, y **`ventas.folio` no es
  único**. No hay red debajo.
- **Arreglo:** `guardandoRef` **síncrona** (`setGuardando` no se ve hasta el siguiente render, y en tablet el doble
  toque es más rápido que un render), el botón se **desarma** con `!editId && !!pedidoGuardado?.id`, y **lo dice**:
  "Pedido guardado ✓". "Nuevo pedido" (`limpiar`) lo vuelve a armar. **Matemática y flujo de anticipo sin tocar.**
- **Prueba:** `scripts/dinero_estado_cobro_verify.mjs` (26/26; **16 FAIL contra el código viejo**).

## ✅ RESUELTO (2026-08-09) — El método de pago sobrevivía de un ticket al siguiente, y el mixto no se comprobaba
- **Qué pasaba (1):** `abrirVenta` limpiaba los importes pero **no `metodoPago`**, que sólo se reponía tras un cobro
  **correcto**. Abrir un ticket, elegir "Tarjeta", salirse sin cobrar y abrir el siguiente lo dejaba **ya en
  "Tarjeta"**: un cobro en efectivo registrado como tarjeta. El dinero está en el cajón pero el corte no lo espera, y
  al cuadrar aparece un descuadre que nadie sabe explicar — **con el cajero cargando la culpa de un fallo de la
  pantalla**. La **búsqueda por folio** (la puerta de los pedidos web) no limpiaba **nada**.
- **Qué pasaba (2):** "mixto" es el **único** método sin reparto automático — los otros tres hacen
  `mEfec = totalACobrar` y compañía, así que no pueden descuadrar. El mixto se guardaba tal cual lo tecleaba el cajero,
  **sin comprobar que sumara**. Con los campos vacíos, la venta se guardaba **pagada con efectivo=0 + tarjeta=0 +
  transferencia=0**: el ticket entero desaparecía del reparto por método.
- **Arreglo:** `limpiarCamposCobro()` único, llamado desde **las dos puertas**, con los mismos valores que el
  `useState` inicial y que la limpieza post-cobro. Y una guarda que impide guardar un cobro incoherente —
  **estrictamente una guarda**: lee lo ya calculado y se niega; **no se tocó cómo se calcula nada**, y la suite lo
  verifica **byte a byte** sobre las tres líneas del reparto automático. Tolerancia y forma calcadas de la
  comprobación de propinas que ya vivía veinte líneas más abajo.
- **Prueba:** `scripts/dinero_estado_cobro_verify.mjs` (26/26).

## ✅ RESUELTO (2026-08-09) — Spinner infinito: el POS se quedaba muerto hasta recargar
> **Lo introdujo el propio arreglo de la sesión colgada.** Queda escrito así a propósito.

- **Qué pasaba:** `Sidebar.handleSalirAdmin` hace `logout()` si al salir de dueño/pastelero falla `loginTerminal`
  (correcto: preferible a operar con una identidad que no es la que se muestra). Pero `TerminalGate` es el `element` de
  la ruta de layout —**no se desmonta nunca**— y `autoLoginRef` no se soltaba: era un **latch de por vida**. El efecto
  se volvía a disparar y moría en `if (autoLoginRef.current) return`. Y como `sesionError` seguía en `null`, tampoco
  salía el botón "Reintentar", que era el **único** otro sitio que soltaba el ref. Resultado: spinner, y **la caja no
  cobra hasta recargar la página**.
- **Arreglo:** soltar el ref cuando desaparece `posUser`. El ref sigue haciendo su trabajo real (no abrir dos sesiones
  durante el `await`); deja de hacer el que no le tocaba.
- **Prueba:** `scripts/dinero_estado_cobro_verify.mjs` (26/26).
- **⚠️ No confundir con** la entrada 🟠 de más abajo, que sigue abierta: aquélla es **identidad** de la sesión, ésta
  era **disponibilidad**. Arreglar una no arregla la otra.

## ✅ RESUELTO (2026-08-09, Fase 2) — Truncación PARCIAL: reparada, blindada y con aviso al cajero
> Se conserva el detalle completo abajo, tachado el estado pero **no el análisis**: es la explicación del mecanismo y
> del criterio del guard, y hace falta para entender `0064`.

**Qué se hizo, en orden:**
1. **Barrido causal de los 108 cortes cerrados** (2.1): 106 sanos, **0 sobrevalorados**, 2 infravalorados.
2. **Reparación** (2.2, migraciones `0062` respaldo + `0063` recálculo): **$1,490.00** reflejados —
   `CONF-A-C032` $1,420 (truncación **parcial**) y `CONF-C-C002` $70 (**carrera de refresco**, causa distinta y
   demostrada). Comparación de las 31 columnas de las 108 filas contra el respaldo: **exactamente 2 difieren**.
3. **Blindaje** (2.3, migración `0064`): trigger `guard_cierre_incompleto`, criterio asimétrico (el cliente puede
   traer MÁS, nunca MENOS). Simulado: **0 de 108 sanos bloqueados**, **12 de 12 rotos bloqueados**.
4. **El aviso llega al cajero** (2.3): se descubrió que el `catch` de `handleCierreDiario` se tragaba el mensaje y
   mostraba un genérico — el texto de `0058` **no lo había visto nunca nadie**. Ahora se detecta por marcador
   (`src/lib/cierreBloqueado.js`) y se muestran instrucciones. Ver la entrada 🟠 de abajo.
5. **Procedimiento de emergencia** escrito en `HANDOFF.md` §8-bis (3 vías).

**Estado: cerrado.** El análisis original se conserva a continuación.

---

## ~~🚨 P0~~ (histórico) — Truncación PARCIAL del resumen del corte: nadie la detecta, y hay dinero sin reflejar
> **Abierto el 2026-08-09.** Estaba **cerrado por error** en la documentación: `CONF-A-C032` figuraba como
> "descuadre preexistente de otra causa" en `HANDOFF.md`, `PROJECT_CONTEXT.md`, `docs/CHANGELOG.md`,
> `docs/DECISIONS.md` (D-23), `docs/INCIDENTE_CIERRE_EN_CERO_2026-08-08.md` y el comentario de la migración `0057`.
> **Era falso.**

- **Impacto (dinero real):** un corte puede cerrarse con un total **creíble pero incompleto** y nadie lo impide.
  Caso confirmado: **`CONF-A-C032` (Xochimilco, cerrado 2026-07-30) — $1,420.00 sin reflejar.**
  *(Estado al escribirlo, 2026-08-09 por la mañana: **sin reparar**. **Se reparó ese mismo día** con `0062`+`0063`.
  Se deja el texto porque es la explicación del mecanismo; **no lo leas como una tarea pendiente**.)*
- **Causa:** la misma de siempre — `Venta.filter({estado:'pagada'})` sin orden, sin límite y sin filtro por corte, con
  PostgREST cortando en 1.000 filas — pero en su forma **parcial**: cuando **una parte** de las ventas del corte cae
  dentro de la ventana y otra fuera. Ocurre justo **el día en que la sucursal cruza las 1.000 ventas pagadas**.
- **Evidencia (SQL de solo lectura, reproducible):** de las 31 ventas de `CONF-A-C032`, las **23** que caen dentro de la
  ventana de 1.000 **de Xochimilco** suman **exactamente $4,995.00** — que es **el `total_general` guardado** — y su
  recuento es **exactamente 23**, que es **el `numero_ventas` guardado**. Las 8 restantes suman **exactamente
  $1,420.00**, que es el descuadre. Las dos magnitudes coinciden a la vez: no es casualidad.

  | modelo de ventana | ventas | suma | ¿reproduce? |
  |---|---|---|---|
  | **GUARDADO** en `cortes_caja` | 23 | $4,995.00 | — |
  | REAL (todas las del corte) | 31 | $6,415.00 | — |
  | **acotada a la SUCURSAL (causal)** | 23 | $4,995.00 | **sí, exacto** |
  | GLOBAL (sin filtro de sucursal) | 0 | $0.00 | no |
  | proxy "N más antiguas del corte" | 23 | $4,995.00 | coincide **aquí**, pero es proxy |

- **⚠️ Por qué el trigger `0058` NO lo protege:** `guard_cierre_en_cero()` hace
  `if coalesce(new.total_general,0) <> 0 then return new;` — **cualquier total distinto de cero pasa sin comprobar
  nada**. `0058` sólo cubre el caso `total = 0`. La documentación lo describía como una red más ancha de lo que es.
- **⚠️ Por qué el frontend arreglado tampoco basta para los cortes ya cerrados:** `ventasCorte.js` impide que vuelva a
  ocurrir en cortes nuevos, pero **no repara** los ya guardados.
- **Archivos/objetos:** `supabase/migrations/0058_guard_cierre_en_cero.sql` (función `guard_cierre_en_cero`),
  `src/pages/Caja.jsx` (guarda del cierre), `src/lib/ventasCorte.js`.
- **⚠️ Criterio obligatorio para cualquier barrido de reparación:** usar el criterio **causal** (ventana de 1.000
  **por sucursal**), **nunca** el proxy "las N más antiguas del corte". El proxy coincide en este caso por casualidad —
  las ventas del corte son contiguas en el tiempo — y **da falsos positivos en cortes pequeños**. Barrer los 111
  cortes con el proxy habría "reparado" cortes sanos, es decir, **metido dinero mal**.
- ~~**Prioridad:** **P0**. **Estado:** abierto.~~ → **CERRADO el 2026-08-09.** Barrido causal de los 108 cortes
  cerrados: **106 sanos, 0 sobrevalorados, 2 infravalorados**. Reparados con `0062` (respaldo) + `0063` (recálculo):
  **$1,490.00** reflejados. Blindado con `0064`. Ver el bloque ✅ del principio de este archivo.

## 🟠 ALTA — Los `catch` que se tragan un mensaje específico y muestran uno genérico
> **Familia de bugs, no un caso aislado.** Encontrada el 2026-08-09 al implementar el guard de `0064`.

- **El caso confirmado y ya corregido:** el `catch` de `handleCierreDiario` (`Caja.jsx`) hacía
  `console.error(err)` + `toast.error('No se pudo cerrar la caja. Intenta de nuevo.')`. Los triggers `0058`/`0064`
  escriben un mensaje **redactado para el cajero**, y **nunca llegaba a la pantalla**: el cajero leía "intenta de
  nuevo", reintentaba, y volvía a fallar. Un guard que bloquea sin decir qué hacer es peor que no tener guard.
  **Corregido** (`src/lib/cierreBloqueado.js` + el `catch`), con suite propia
  `scripts/cierre_bloqueado_verify.mjs` (25/25, y **5 FAIL contra el código viejo**).
- **⚠️ Lo que queda abierto:** *"el de `handleCierreDiario` no puede ser el único"*. **No se ha barrido el resto del
  POS.** Cualquier otro `catch` que sustituya un error accionable por un genérico tiene el mismo defecto.
- **Prioridad:** alta. **Estado:** el caso del cierre, cerrado; **el barrido completo va en la Fase 6**
  (auditoría profunda final), donde es uno de los frentes explícitos.

## ✅ RESUELTO (2026-08-09) — La suite de verificación ocultaba el agujero
- **Corregido:** se quitó `const CONOCIDOS = new Set(['CONF-A-C032','CONF-C-C002'])` de
  `scripts/cierre_caja_verify.mjs`. Los dos cortes están reparados, así que **el test pasa por mérito propio**
  (24/24), sin exenciones. En su lugar queda escrita la regla de `CLAUDE.md` sobre exclusiones por nombre.
- **Estado:** cerrado. El detalle histórico se conserva abajo.

## ~~🚨 P0~~ (histórico) — La suite de verificación oculta el agujero (da verde sobre dinero no reflejado)
- **Impacto:** `scripts/cierre_caja_verify.mjs` **cuenta como "cuadran"** los folios que excluye, así que la
  comprobación de integración **pasa en verde encima de $1,420 no reflejados**. Es peor que no tener test: da una
  garantía que no existe.
- **Causa:** `scripts/cierre_caja_verify.mjs:124`
  ```js
  // Descuadres PREEXISTENTES, anteriores a este incidente y de otra causa.
  const CONOCIDOS = new Set(['CONF-A-C032', 'CONF-C-C002']);
  ...
  else if (CONOCIDOS.has(c.folio)) { cuadran++; preexistentes.push(c.folio); }
  ```
  El test **sí imprimía** la exclusión, pero la justificación (*"de otra causa"*) **nunca se verificó** y era falsa.
- **Archivos:** `scripts/cierre_caja_verify.mjs`.
- **Arreglo:** quitar la exclusión y **dejar que el test FALLE** hasta que el corte esté reparado (Fase 2.4).
- **Regla derivada, ya en `CLAUDE.md`:** ninguna prueba puede excluir un caso por nombre sin justificación
  **verificada y fechada**; y una exclusión sin evidencia verificada **se trata como fallo**.
- ~~**Prioridad:** **P0**. **Estado:** abierto (Fase 2.4).~~ → **CERRADO el 2026-08-09**: la exclusión se eliminó y el
  test pasa **por mérito propio** (24/24), sin exenciones, porque los dos cortes están reparados.

## 🚨 P0 — El APK de las tablets apunta a la rama equivocada
- **Impacto:** las tablets **no reciben ninguna corrección de frontend**. **No es un riesgo latente: está fallando
  ahora.** Verificado en navegador el 2026-08-09 contra el corte real abierto `CONF-A-C044`: por el canal del APK la
  pestaña Resumen muestra **`EFECTIVO $0.00` y `TICKETS 0`** cuando lo real son **17 ventas y $5,735**.
  - **Consecuencia operativa: desde el APK, Xochimilco NO PUEDE CERRAR CAJA.** El resumen da 0 → el trigger `0058`
    rechaza el cierre → el cajero lee *"Actualiza la aplicación (cierra y vuelve a abrirla)"*, que **en el APK no
    puede funcionar** porque apunta a un preview congelado.
  - **Topilejo (587) y San Gregorio (499)** siguen por debajo de 1.000 ventas pagadas: desde el APK cierran bien
    **por ahora**, y se romperán solas al cruzar el umbral.
- **Causa:** `capacitor.config.ts` (presente en **ambas** ramas, idéntico) tiene `server.url` = preview de la rama
  `apk/capacitor`, y esa rama se quedó en `9b36aa5` (2026-07-13) mientras producción siguió avanzando.
  *No se citan ni hashes de bundle ni número de commits de retraso: ambos caducan y ambos ya provocaron
  afirmaciones falsas en esta documentación. Lo estable es que `apk/capacitor` es **ancestro estricto**.*
- **Dato que cambia el riesgo:** `apk/capacitor` **no tiene ni un commit propio** — es **ancestro estricto** de
  producción (`git log origin/migracion/supabase..origin/apk/capacitor` → vacío). Por tanto **`migracion/supabase` →
  `apk/capacitor` es un fast-forward puro que NO toca producción**. Lo que `CLAUDE.md` prohíbe es la dirección
  contraria. No confundirlas.
- **Archivos:** `capacitor.config.ts`.
- **Prioridad:** máxima.
- **✅ CANAL DESBLOQUEADO el 2026-08-09 (Fase 1).** Fast-forward `migracion/supabase` → `apk/capacitor` (`84d13f3`).
  Verificado: el alias del APK sirve ahora el **mismo bundle byte-idéntico** que producción (sha256 `A536B714…`), con
  los marcadores `[ventas_corte]`, `[ventas_corte_count]` y `"No se pudieron leer las ventas de este corte"` dentro
  del bundle descargado, y el mismo backend Supabase. Probado en navegador contra el canal del APK en **las 3
  sucursales**, y cuadra al peso con SQL: Xochimilco `CONF-A-C044` 25 tickets / $7,000.00 efectivo (antes **$0.00 / 0
  tickets**), Topilejo `CONF-B-C032` 12 / $5,185.00, San Gregorio `CONF-C-C037` 4 / $700.00.
- **⚠️ Estado: NO cerrado del todo.** Falta que **cada tablet reinicie la app** para tomarlo (el JS ya cargado sigue en
  memoria), y falta la **Fase 7** (repuntar `server.url` a producción + APK nuevo firmado por Miguel).
- **Ver también:** la 🔒 **REGLA PERMANENTE** de sincronización en `CLAUDE.md`, `HANDOFF.md` §4 y `docs/NEXT_STEPS.md`.

## ✅ RESUELTO (2026-08-09) — El ticket se cortaba SIN avanzar el papel: se perdía el final
> **Es el bug que reportó Abel** ("al ticket de pastel le falta el total y lo de domicilio"), y **no** era el de
> las bandas. El troceo de la FASE 4 arregló el desbordamiento de memoria; **esto era otra cosa y seguía viva.**

- **Causa, leída en la librería y no supuesta.** `javap -c` sobre el AAR real de DantSu 3.4.0 (caché de Gradle):
  ```
  public EscPosPrinterCommands cutPaper() {
      ...write(new byte[]{ 29, 86, 1 });   // 0x1D 0x56 0x01 = GS V 1 (corte parcial)
      ...send(100);
  }
  ```
  **Tres bytes y un flush: no avanza papel.** En una térmica la cuchilla está por debajo del cabezal, así que al
  cortar de inmediato los últimos milímetros del ticket siguen entre ambos y **se quedan pegados al ticket
  siguiente** — justo el final, que es donde van el total y el bloque de domicilio.
- **Alcance:** afectaba a la ruta de **IMAGEN**, que es el default y la que usa el ticket de pastel. La de TEXTO
  mandaba `texto + '\n\n\n'`, o sea ~10 mm de avance accidental.
- **Arreglo:** `ESC J n` desde JS antes de cortar, con el avance en la **config local por dispositivo**
  (`avanceAntesCorteDots`, default **150 puntos = 18,75 mm**). Va en su propio `try` para no romper la garantía de
  corte de la FASE 4. **Llega sin APK nuevo**, porque `enviarBytes` ya está expuesto en la 1.1.1 instalada.
- **Pruebas:** `scripts/impresion_avance_corte_verify.mjs` **25/25**, y **8 FAIL contra el código viejo**.
- **⚠️ Lo que NO se pudo comprobar aquí:** la distancia real cabezal→cuchilla de la Easytime. 150 puntos es una
  estimación con margen (típico 10–16 mm). **Se mide en el primer ticket real** y se ajusta desde
  **Config → Operación** sin recompilar.

## 📋 OBSERVACIÓN — el cuadre del efectivo FÍSICO es ruidoso en todo el histórico
> **Fuera de alcance. NO es una tarea, NO se investiga y NO se toca.** Requiere decisión de Miguel.
> La fórmula del efectivo esperado es **CANDADO** y ya está firmada: no se "mejora".

Salió al comprobar, tras reparar `CONF-A-C032` (Fase 2.2), si su superávit era atípico. **No lo era** — y de paso
quedó claro que **no existe un cuadre físico de referencia** contra el que comparar.

Métrica `diferencia_efectivo − efectivo_inicial_contado` sobre los cortes cerrados:

| Ámbito | Cortes | Mediana | Rango | Se desvían > $100 |
|---|---|---|---|---|
| Todas | 106 sanos | **−1,150** | −11,642 … +4,893 | **93 de 106** |
| Xochimilco | 40 | −1,940 | −9,415 … +3,810 | 35 de 40 |
| Topilejo | 31 | −880 | −11,642 … +4,893 | 29 de 31 |
| San Gregorio | 35 | −1,150 | −3,460 … +1,330 | 29 de 35 |

De tres modelos posibles, el único que centra en cero es `diferencia − fondo + dinero_dejado_en_caja`
(mediana **0.00**), y aun así **sólo 21 de 106 caen exactamente en cero** y 30 dentro de $100. La explicación está en
que **en 64 de 106 cortes el fondo de apertura es exactamente el dinero que se deja en caja**: el fondo se queda en el
cajón y se cancela, en vez de aparecer como superávit.

**Consecuencia práctica, que es lo único que hay que recordar:**
> **`diferencia_efectivo` NO debe leerse como faltante o sobrante de un cajero** sin tener en cuenta
> `dinero_dejado_en_caja` y `efectivo_inicial_contado`. Tomado solo, señala descuadres que no existen — y ese fue
> exactamente el razonamiento que estuvo a punto de hacernos declarar un descuadre inexistente en `CONF-A-C032`.

**Estado:** observación registrada. Sin acción. Si algún día se quiere un cuadre físico fiable, es una decisión de
negocio (cómo se cuenta y qué se deja en caja), no un arreglo de código.

## ✅ AUDITADO Y SANO (2026-08-09) — Circuito WEB pública → POS
> Se anota **aquí a propósito**, aunque no sea un bug: había una duda razonable de que se hubiera roto con el
> movimiento de estos días, y que conste auditado evita que alguien vuelva a perseguirlo.

- **Auditado por Miguel el 2026-08-09**, con evidencia:
  - `pasteleria-confetti.com` responde **200**; el bundle de la web apunta al **mismo** proyecto Supabase
    (`ivqcxdpqxwjxfohiswqb`) y usa `crear_pedido_web`, `catalogo_publico`, `config_publica` y el bucket `web-uploads`.
  - **Alta real de pedido con el rol `anon`, en transacción revertida:** folio **`PP-A-0185`** asignado, fila creada,
    `estado='pendiente'`, `creado_por_nombre='Web Confetti'`.
  - **Residuo 0** tras revertir, y el contador de folios vuelve a **184**: usa `UPDATE … RETURNING` (no una
    secuencia), así que revierte limpio. *Dato útil: por eso este circuito SÍ se puede probar sin dejar rastro.*
  - **El POS lo ve:** la terminal de Xochimilco lista **11 pedidos web, 5 pendientes**.
  - Las imágenes de referencia responden **200 `image/jpeg`**.
- **Estado: sano. Sin acción pendiente.**

## 🟡 MEDIA — Las rutas profundas devuelven 404 en el servidor (lo tapa el service worker)
- **Impacto:** entrar directamente a `https://…/caja` (o cualquier ruta que no sea `/`) devuelve **404** de Vercel. Hoy
  no se nota porque el service worker del PWA intercepta la navegación y sirve `index.html` desde caché — pero eso sólo
  funciona **después** de que el SW esté instalado. Un dispositivo nuevo, un navegador en incógnito o un usuario que
  pegue un enlace profundo verá el 404.
- **No afecta al APK:** el WebView carga la **raíz** (`server.url` sin ruta) y navega en cliente.
- **Evidencia (2026-08-09):** `GET /caja` → **404** en **los dos canales** (producción y alias del APK); `GET /` → 200.
  Es **preexistente e idéntico en ambos**, no lo introdujo el fast-forward de la Fase 1.
- **Arreglo probable:** una regla de reescritura SPA en `vercel.json` (`/(.*)` → `/index.html`). **No se toca ahora**:
  es config de despliegue y hay 3 cajas abiertas.
- **Prioridad:** media. **Estado:** abierto, sin fase asignada.

## ✅ RESUELTO (2026-08-09) — `CONF-C-C002`: causa DEMOSTRADA y reparado
- **Hecho comprobado:** San Gregorio, cerrado 2026-07-06. `total_general` guardado **$370** con **2** ventas; lo real
  eran **3** ventas por **$440**. Descuadre: **$70**.
- **Causa demostrada (no era truncación):** San Gregorio nunca ha superado las 1.000 ventas pagadas, así que la ventana
  de PostgREST no puede explicarlo. Era una **carrera de refresco**: el resumen se calculó antes de que la tercera
  venta entrara en la lista que leía el cliente.
- **Reparado** en la misma migración `0063` que `CONF-A-C032`, pero **con su causa declarada por separado** — a
  petición expresa de Miguel, para no volver a meter dos cosas distintas bajo una sola etiqueta.
- **Estado: cerrado.** Los **$70** están reflejados.
- **Lección que se queda:** la documentación anterior lo declaró "de otra causa" **sin demostrarlo**, igual que a
  `CONF-A-C032` — y allí la afirmación era falsa. Se demostró antes de clasificar. **No clasificar sin evidencia.**

## 🟠 ALTA — El árbol de rutas no está envuelto en ErrorBoundary
- **Impacto:** cualquier excepción durante el render deja **toda la app en blanco**, sin mensaje. Es el amplificador que convirtió el `Illegal invocation` en un apagón total en las 3 sucursales.
- **Causa:** `src/components/common/ErrorBoundary.jsx` existe y **no lo importa nadie**. `App.jsx` monta las rutas sin protección.
- **Archivos:** `src/App.jsx`, `src/components/common/ErrorBoundary.jsx` (y `SafeBoundary.jsx`).
- **Arreglo propuesto:** envolver el `AppLayout`/árbol de rutas con `ErrorBoundary` y una pantalla de fallo con botón de recarga. **Aditivo, sin tocar lógica.**
- **Prioridad:** alta. **Estado:** abierto.

## 🟠 ALTA — Sesión colgada al recargar tras usar dueño/pastelero
- **Impacto:** tras recargar la tablet, la sesión Supabase puede seguir siendo la **global** (dueño/pastelero) mientras la interfaz dice "Modo empleado". La sucursal para RLS no es la que la pantalla muestra. Y desde `0060` esa sesión colgada **puede escribir** en pedidos.
- **Causa:** `TerminalGate` sólo hace auto-login de la terminal **si no hay `posUser`** — comprueba que la sesión *exista*, no *quién* es; y `ensureSession()` puede degradar en silencio la sesión del dueño a la de una terminal.
- **Lo que hay que hacer:** comprobar la **identidad** de la sesión, no su existencia, y **sólo degradar** — nunca ampliar el alcance.
- **Archivos:** `src/components/common/TerminalGate.jsx`, `src/api/supabaseClient.js` (`ensureSession`).
- **Prioridad:** alta. **Estado:** abierto.
- **Ya arreglado en esta familia, para que nadie lo persiga otra vez:**
  - `Sidebar.handleSalirAdmin` no restauraba la sesión al salir del pastelero. Corregido.
  - **El latch de `autoLoginRef` que dejaba el spinner infinito** (ver la entrada ✅ de abajo). **Es otra cosa**: aquélla era disponibilidad, ésta es identidad. Arreglar una no arregla la otra.

## 🟡 MEDIA — Comparaciones de rol sin normalizar la tilde
En la base el rol es **`dueño` CON TILDE**; el código compara contra `dueno`. Casi todo normaliza, pero estos no:

| Archivo | Consecuencia |
|---|---|
| `src/components/common/MobileAdminRadialMenu.jsx:189` | El **menú radial de tablet no le sale al dueño** |
| `src/pages/Registros.jsx:48` | El **dueño no puede eliminar cortes** (`isAdmin` compara sólo contra `'administrador'`) |
| `src/components/registros/LimpiarSeccionButton.jsx:40` | Botón "Limpiar sección" oculto para el dueño |
| `src/pages/Configuracion.jsx:470` | `ROLE_LABELS` sin la clave con tilde → el rol de Abel sale **en blanco** en Usuarios POS |
| `src/components/configuracion/ReiniciarSistemaSection.jsx:31` | Vive en ruta `soloDueno` pero exige rol `'administrador'` → **inalcanzable por diseño** |

> ⚠️ **AVISO CRÍTICO, no lo toques a lo bruto:** `src/components/common/ModalPinAdmin.jsx:18` (`ROLES_ADMIN = ['dueño', ...]`) es el **ÚNICO** punto que **exige la tilde**. Si alguien "normaliza" el rol en la base a `dueno`, **el dueño se queda fuera del sistema**. Normaliza en el código, **nunca en el dato**.

**Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — `SidebarContent` se declara dentro de `Sidebar`
- **Impacto:** React lo trata como un componente nuevo en cada render y **remonta todo el subárbol**, incluido el modal del PIN: puede **borrar el PIN a medio teclear**.
- **Archivos:** `src/components/common/Sidebar.jsx:292`.
- **Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — El PIN del dueño queda vivo en memoria
- **Impacto:** `AccesoDuenoGate` pasa a `activarAdmin` el objeto **con `_pin`**, así que el PIN en claro queda dentro de `TerminalContext.adminUser`. (`handleAdminSuccess` del Sidebar sí lo limpia; este camino no.)
- **Archivos:** `src/components/common/AccesoDuenoGate.jsx:46`.
- **Prioridad:** media. **Estado:** abierto.

## 🟡 MEDIA — `CorteAutoDownloader` empareja ventas sólo por ventana de tiempo
- **Impacto:** el PDF del corte no filtra por sucursal ni por `corte_caja_id`. Con una sola sucursal es correcto; con varias abiertas a la vez puede mezclar. Es la misma familia del incidente de los ceros.
- **Archivos:** `src/components/cortes/CorteAutoDownloader.jsx`. *(Esta ficha decía `src/components/caja/`. **No existe ahí.** Corregido el 2026-08-09.)*
- **Prioridad:** media. **Estado:** abierto.
- **Ya arreglado en el mismo archivo (2026-08-09), y es otra cosa:** el botón «Listo» estaba anidado dentro de
  `{!done && ( … {done && …} … )}` —o sea `!done && done`: **inalcanzable**— así que `onDone` **nunca** se llamaba y
  `autoDownloadCorte` se quedaba puesto en `Caja.jsx`. Consecuencia **silenciosa**: al cerrar un **segundo** corte sin
  salir de `/caja`, el componente no se remontaba, `done` seguía en `true`, el efecto no descargaba y el botón de
  rescate tampoco aparecía → **el PDF de ese corte y de todos los siguientes no se descargaba, sin aviso y sin forma
  de pedirlo**. Prueba: `scripts/impresion_corte_botones_verify.mjs` (14/14, 12 FAIL contra el código viejo).

## 🟡 MEDIA — `filter()` sin límite en el adaptador
- **Impacto:** mismo patrón que truncó el corte (PostgREST corta en 1.000 filas). Hoy **ninguno alimenta la matemática del dinero**, pero conviene acotarlos antes de que un histórico crezca.
- **Archivos:** `src/api/entitiesAdapter.js` y sus call-sites.
- **Prioridad:** media. **Estado:** abierto.

## 🟢 BAJA — `CambiarSucursalDialog` marca dos opciones activas
- En "Vista general" el diálogo marca **dos** opciones como activas a la vez y miente sobre lo que el dueño está viendo.
- **Archivos:** `src/components/common/CambiarSucursalDialog.jsx:55`. **Estado:** abierto.

## 🟢 BAJA — CORS del Edge Function
- `ORIGEN_PREVIEW` es una regex más permisiva de lo necesario en `supabase/functions/transcribir-nota-voz/index.ts`. **Estado:** abierto.

---

## ✅ REFUTADOS en la verificación adversarial — NO los persigas

- **`AppLayout.jsx:29` `if (!posUser) return null`** — el código existe, pero la línea es **inalcanzable** como estado observable: `TerminalGate` ya muestra su propio spinner antes.
- **`COLS_CIERRE` sin `sucursal_id` "hace que `fondoEsperado` caiga a 0"** — la observación era cierta (la guarda era siempre falsa) pero **la consecuencia de dinero no se sostiene**. Se arregló igual (commit `3a90e3c`) porque la guarda debe hacer lo que dice.
- **`Dashboard.jsx` desreferencia nula con `sucursalEfectiva=null`** — verificado limpio, no ocurre.
- **`useCajaAbierta` "borra la memoria de sesión en cada render" con `sucId` null** — los hechos son ciertos, la atribución causal no.
- **"Algún sitio lee el rol de la metadata del JWT"** — descartado: nadie lo hace.

---

## 📌 Bloques de la auditoría 2026-08-01 que NUNCA se abrieron

- 6 políticas con `USING true` y 3 vistas con `security_invoker=false`, grants y endurecimiento de RPCs.
- Storage / imágenes / caché.
- Endurecimiento adicional del Edge Function de audio (`getUser` + rate limit).
- Renombrar la fachada Base44.
- **Borrar la Edge Function `poc-auth-magiclink`** (el MCP no tiene herramienta de borrado; hay que hacerlo por dashboard o CLI).
- Cutover de Auth a `generateLink`+`verifyOtp` (gated en `MIGUEL_OK_AUTH_TABLETS`) y enrolamiento de terminales.

---

## RESUELTO (2026-08-09) — el rol `pastelero` NO podía ESCRIBIR en pedidos
Verificado en vivo: con la sesión del pastelero se **leían** 229 pedidos, pero cualquier `UPDATE`
afectaba **0 filas**.
- **Origen:** `0037_rol_pastelero.sql` (**2026-06-30**, commit `17a3210`). Su propio comentario decía
  *"Solo lectura: no toca INSERT/UPDATE/DELETE (esos siguen bajo `pos_scope_pedidos`)"* — la
  suposición falla porque el pastelero tiene `sucursal_id = NULL`, así que `sucursal_id = pos_sucursal()`
  evalúa a NULL (no a true) y la política de escritura nunca lo dejaba pasar.
- **Resuelto** por la migración `0060` (política `FOR UPDATE` + trigger de alcance: nota y avance de
  estado; nada de dinero). Aplicada en Supabase; **el frontend sigue en la rama de trabajo**, así que
  en producción todavía no cambia nada visible. Evidencia: `scripts/pastelero_alcance_evidencia.sql`
  (12/12, transacciones revertidas) y `scripts/pastelero_alcance_verify.mjs` (31/31).
- **Falta:** que Miguel firme el cambio de RLS y dé luz verde al despliegue del frontend.

## ABIERTO (2026-08-09) — hallazgos de revisión aún sin cerrar
- `CorteAutoDownloader.jsx` empareja las ventas del PDF **sólo por ventana de tiempo**, sin filtrar por
  sucursal ni por `corte_caja_id`. En una sucursal es correcto; con varias abiertas a la vez puede
  mezclar. No causó el incidente de los ceros, pero es la misma familia de fallo.
- Llamadas `filter()` sin límite en `entitiesAdapter.js` (mismo patrón que truncó el corte). Ninguna
  alimenta hoy la matemática del dinero, pero conviene acotarlas antes de que un histórico crezca.
- CORS del Edge Function: `ORIGEN_PREVIEW` es una regex más permisiva de lo necesario.

> **Actualización de auditoría independiente (2026-07-10):** la afirmación histórica siguiente de “SIN bugs de código” queda **superada**. `CAMBIOS_V2/REPORTES/AUDITORIA_INDEPENDIENTE_POS_APK_2026-07-10.md` documenta, sin modificar código ni datos reales, hallazgos críticos de RLS/folios, hallazgos altos de concurrencia de dinero, soporte incompleto 58/80 mm y APK release sin firma. Pendiente de revisión y firma de Miguel; la auditoría no propuso ni aplicó correcciones.
>
> **Corrección por fases (2026-07-10):**
> - **FASE A — 58/80 mm en venta y pastel: RESUELTA en código** (rama `apk/capacitor`, no toca dinero/RLS). Antes, `imprimirTicketNativo` rasterizaba SIEMPRE a 576 px (80 mm) ignorando `config.ancho_impresora`; el corte térmico sí honraba 58/80. Ahora `print.js` pasa `getPaperWidth()` al dispatcher y `printTicket.js` usa un helper único `anchoRaster` (58→384 px, 80→576 px) compartido por venta/pastel y corte. Evidencia: `release/muestras/{venta,pastel}_{58,80}.png` (58 = 384 px exactos, contenido completo sin recorte). Builds verdes (vite + gradlew `assembleRelease`). Navegador byte-por-byte igual. Llega al dispositivo con el deploy de Vercel de la preview (server.url), no requiere APK nuevo.
> - Fases B (folios atómicos) / C, F, G (concurrencia de dinero) / D (RLS 0042): PREPARAR con evidencia + **firma de Miguel**; una a la vez.

## APK Android (2026-07-09) — SIN bugs de código; pendientes = pruebas físicas EN SITIO
El proyecto APK (rama `apk/capacitor`) compila verde (vite + gradlew assembleRelease), APK firmado, navegador intacto, dinero/RLS sin tocar. **No hay bugs de código abiertos.** Lo que falta se valida CON el hardware en la visita (Camino A):
- **Impresora Easytime 80mm:** confirmar conexión (probar USB; si no, Ethernet + IP). Ajuste posible en sitio: el `class="7"` de `res/xml/device_filter.xml` si la impresora enumera con otra clase/VID-PID.
- **WebView de la Higole (Android 12):** riesgo de System WebView viejo → layout roto. Fix: actualizar "Android System WebView" + Chrome (ver `LEEME_instalacion.txt`).
- **Cajón:** no se sabe si el de Abel es electrónico. Probar `usb_trigger` (VID/PID del disparador USB-serial se lee en sitio) → `kick_impresora` → `ninguno` (manual).
- **Emoji 🚚** del bloque de entrega: se dibujó en Chrome de escritorio (muestra), pero el WebView de la tablet PODRÍA no dibujarlo con html2canvas. Decisión de Miguel: se queda; si en sitio se pierde, cambiar por texto "ENTREGA A DOMICILIO".

## FLAGS del run nocturno 2026-06-28 (para revisión de Miguel)
- **(voz) Verificación manual del micrófono — FASE 4.** La grabación (`getUserMedia`/
  `MediaRecorder`) y la transcripción en vivo (`SpeechRecognition` es-MX) NO se pudieron
  ejercitar headless. Probar manualmente: grabar hablando en el form de pastel, confirmar
  transcripción + subida + reproducción en la card. (La subida a Storage YA está probada:
  blob 200 + lectura pública 200.) Solo en navegadores Chromium/Edge hay transcripción.
- **(devolución) `efectivo_esperado` puede quedar NEGATIVO — FASE 3 #4.** Un corte cuya
  única actividad es una devolución de anticipo en efectivo cierra con `efectivo_esperado`
  negativo (p. ej. −$100). Es matemáticamente correcto (la fórmula no incluye el fondo de
  apertura), pero si Miguel prefiere ver `fondo − devuelto`, es otra decisión (no se tocó
  la fórmula del candado). Ver REPORTES/02.
- **(mesas) ✅ RESUELTO (cierre de cabos, REPORTES/07).** Diagnóstico: el color-sync de
  `saveUser` era mesero-only (`if (esMesero && …)`) y Confetti no tiene meseros → nunca
  corría. Se eliminó el color-sync + la query `mesas` + todos los handlers/estado muertos
  + imports muertos. `saveUser` (crear/editar usuario) verificado EN VIVO. 0 referencias
  residuales. (Los switches de config `usa_mesas`/asignación se conservaron: no son el
  mapa muerto.)
- **(estaciones) ✅ RESUELTO (cierre de cabos).** `EstacionesAyuda.jsx` borrado (Miguel
  autorizó; 0 referencias).
- **(notas-voz blob) ✅ RESUELTO (cierre de cabos).** Migración **0028** añadió la policy
  DELETE faltante en `notas-voz`; el objeto de prueba de 9 bytes se borró. Bucket vacío.
- **(web) WF1/WI2/I5 no tocados.** El run fue del repo POS; la limpieza menor de la web e
  I5 (URL Base44 en "Ver web pública", espera dominio) siguen pendientes (post-cutover).

## (l) ✅ RESUELTO (FASE 3 A-FIX) — `pago` con rezago (useEffect) → desglose por método viejo al confirmar rápido
- **Qué fue:** `MetodoPagoSelector` emitía el `pago` (metodo + montos por método) al padre vía `useEffect → onChange` (asíncrono). Si se cambiaba el monto/total y se confirmaba ANTES de que el efecto propagara, el padre usaba un `pago` VIEJO → la venta/abono quedaban con `monto_efectivo/tarjeta/transferencia` del total anterior. **Reproducido:** un abono de $50 con dialog pre-llenado a saldo $370 → `monto_efectivo=370` (en vez de 50). Money-crítico (desglose por método mal → corte mal).
- **Resolución:** `MetodoPagoSelector` pasó a **CONTROLADO** (el padre es dueño de `metodo` y `montos`; computa `construirPago` SÍNCRONO cada render; sin useEffect/onChange de pago). `PaymentModal` y `RegistrarPagoDialog` adaptados. Verificado: confirm inmediato tras cambiar el monto → desglose correcto (abono $50 → monto_efectivo=50).

## (k) ✅ RESUELTO (FASE 3 A-FIX, Opción A de Miguel) — Abono MIXTO no entraba a los buckets de método
- **Qué:** el `Abono` guarda `metodo_pago` + `monto` (sin desglose por método). `Caja.jsx:266-271` calcula `abonosEfectivo/Tarjeta/Transferencia` filtrando por `metodo_pago` EXACTO → un abono `metodo_pago='mixto'` aporta **$0** a los tres buckets y a `abonosTotal`.
- **(a) efectivo_esperado** = `totalEfectivo + abonosEfectivo` (`Caja.jsx:1236` y `1316`): la porción EFECTIVO de un abono mixto **NO se doble-cuenta**, mientras que un abono efectivo ÚNICO **sí** (candado del doble conteo). **Verificado en vivo:** corte con 1 abono efectivo único $50 + 3 abonos mixtos (efectivo 90+30=120) → `total_efectivo=170`, **`efectivo_esperado=220`** (=170 + abonosEfectivo 50). El $120 efectivo de los mixtos no se dobló; el $50 single sí → inconsistente (mismo $ efectivo tratado distinto según si el abono fue mixto o único).
- **(b) ResumenDelDia** (`196-228`): la card "Pagos de pedidos de pastel" se muestra solo si `abonosTotal>0` y desglosa por bucket → un abono mixto **no aparece** (o el card subreporta el total de abonos). Verificado: corte con un solo abono mixto → card OCULTA.
- **Importante:** el mixto del corte sí cuadra por método (el desglose lee `monto_efectivo/tarjeta/transferencia` de la **venta paralela**, no del abono). El problema es SOLO `efectivo_esperado` (doble conteo) y el display del card de abonos.
- **Opciones (decisión de Miguel; NO tocado):**
  - **A (recomendada): consistencia con el candado.** Que la porción por método del abono mixto entre a los buckets — guardando `monto_efectivo/tarjeta/transferencia` en `abonos` (migración + `RegistrarPagoDialog` los setea; el más limpio) o derivándola de la venta paralela. Así el efectivo del mixto se trata IGUAL que cualquier abono efectivo (se dobla, consistente) y se muestra en el Resumen. Recomendada porque el candado existe para que TODO abono efectivo se dable-cuente igual; tratar dos abonos con el mismo $ efectivo distinto es confuso.
  - **B:** dejar el mixto fuera del doble conteo (mixto = "más correcto") y arreglar SOLO el display para que el abono no desaparezca del Resumen. Deja la inconsistencia de fondo (single dobla, mixto no).
  - El doble conteo es CANDADO (fidelidad Base44, que el bot validó); Base44 nunca tuvo abonos mixtos.
- **RESOLUCIÓN (Opción A, aprobada por Miguel):** migración **0025** añade `monto_efectivo/tarjeta/transferencia` a `abonos` (+ backfill desde metodo_pago; 0 filas en staging limpio, en prod single-método el CASE las cubre); `RegistrarPagoDialog` setea el desglose del abono desde `construirPago` (mismo split de la venta paralela); `Caja.jsx:266-271` ahora SUMA esas columnas (no filtra por metodo_pago). `efectivo_esperado` (1236/1316) NO se tocó: sigue `totalEfectivo + abonosEfectivo`, pero ahora `abonosEfectivo` incluye el efectivo del mixto → el quirk del doble conteo se MANTIENE pero CONSISTENTE. **Verificado en vivo:** regresión single-método idéntica (corte solo-efectivo $50 → efectivo_esperado $100, igual que antes); consistencia mixto (corte single $50 + mixtos $120 ef → efectivo_esperado **$340**, antes $220); la card "Pagos de pedidos de pastel" ahora muestra las porciones del mixto (Efectivo $170/Total $250); totales por método y etiquetas del PDF sin cambio.

## (i) ✅ RESUELTO (FASE 3 A) — Venta paralela de ANTICIPO sin `DetalleVenta` (`producto_id: ''` en `uuid NOT NULL`)
- **Qué fue:** `RegistrarPagoDialog.jsx` (y `Caja.handleCobrarPedidoWeb`/`CobrarPedidoWebDialog`) creaban el `DetalleVenta` de la venta paralela con `producto_id: ''` y la columna `detalle_venta.producto_id` es `uuid NOT NULL` → `invalid input syntax for type uuid: ""` → la línea NO se creaba (el dinero entraba al corte pero la línea no salía en el ticket/PDF). Afectaba TODO anticipo (POS+web). Destapado al hacer cobrables los pedidos web (FASE 3 #1).
- **Resolución (Opción A de Miguel):** migración **0023** `detalle_venta_producto_id_nullable` (producto_id → `uuid NULL`; sin FK, datos existentes intactos) + las dos creaciones de línea ahora usan `producto_id: null` con concepto en `producto_nombre` (`Anticipo pedido [folio]` en RegistrarPagoDialog; nombre del producto parseado en handleCobrarPedidoWeb). Modelo ya snapshot-first (el ticket/corte usan `producto_nombre`, no lookup). Consumidores verificados que toleran null: `CorteTicket.jsx:52` (key `producto_id || producto_nombre`), joins de receta (no machean → costo 0), `DescuentoInventarioVenta` (no mapeado). Ventas de mostrador normales (con producto_id real) intactas.
- **Verificado en vivo (FASE 3 B/C):** anticipo a pedido web → SIN error de uuid; `DetalleVenta` creado con `producto_id=null` + `Anticipo pedido PP-B-0001` $150; **la línea aparece en el PDF del corte** (`CONF-B-V0001 · 21:31 · Anticipo pedido PP-B-0001 ×1 · $150.00 · Efectivo`); el dinero entra al corte (Resumen $150) y al dashboard (Ventas hoy, con corte abierto).

## (j) ✅ RESUELTO (FASE 3, cierre de #2) — Findability del pedido de CATÁLOGO en cualquier estado activo
- **Qué fue:** los pedidos de **catálogo** solo aparecían en la cola **Caja → Pedidos** filtrada a `estado='pendiente'`; tras el 1er anticipo (`con_anticipo`) salían de la cola y, al no vivir en "Pedidos de Pastel", quedaban difíciles de re-encontrar para 2º anticipo/liquidar/entregar. (El buscador por folio sí los encontraba — no filtra estado —, pero requería conocer el folio.)
- **Resolución (`Caja.jsx`):** la query de la cola pasa de `estado:'pendiente'` a `estado:{$nin:['entregado','cancelado']}` (todos los activos, por exclusión). La lista se separa en **dos grupos**: "Pendientes de cobro" (manejan la notificación de "nuevo": beep + badge pulsante, vía `pedidosWebPendientes`) y "En proceso — con anticipo / por entregar". La notificación de pedidos NUEVOS sigue solo sobre `pendiente` (no molesta con los en proceso). El pastel NO se tocó.
- **Verificado en vivo (ciclo completo de un catálogo):** pendiente→1er anticipo (pasa a "En proceso", saldo baja, **no se pierde**)→2º anticipo→liquidación (pagado, saldo 0, sigue visible "por entregar")→**Entregado** (habilitado al saldo 0)→sale de la lista. 3 abonos/3 ventas/3 líneas (todas `producto_id` null) = $300, todo al corte. **#2 CERRADO.**

## (g) CORTE DE TURNO — **BOTÓN FANTASMA de Base44 (NO es bug)** — decisión de Miguel
- **Decisión de Miguel (2026-06-27):** Confetti **NO usa cortes de turno**. Abel opera **solo con CIERRE DIARIO por sucursal**. El "Corte de turno" es un **elemento fantasma** heredado de la plantilla Base44, igual que mesas/propinas/restaurante. **NO es un bug a arreglar.**
- **Qué pasa técnicamente (para la auditoría de fantasmas):** si alguien lo pulsara, `handleCorteTurno` (`Caja.jsx:1341-1365`) hace `CorteCaja.create({...})` **sin `sucursal_id`**, y la RLS `pos_scope_cortes` (`pos_is_admin() OR sucursal_id = pos_sucursal()`) rechaza la fila (`new row violates row-level security policy for table "cortes_caja"`). El cierre diario sí setea `sucursal_id`, por eso funciona. Además inserta columnas inexistentes en el esquema migrado (`corte_padre_id`, `total_propinas`, `propinas_por_mesero`).
- **Acción:** **post-cutover** — en la auditoría de fantasmas con el sistema vivo, Miguel decide si se **quita el botón** o se deja muerto. NO se toca durante la migración. El **bot NO ejercita corte de turno** en las pruebas largas (no es operación real de Abel).
- **Origen:** detectado por `Bot pruebas/bot-pruebas/bot-corte-turno.mjs` (reclasificado de 🐛 a fantasma por decisión de Miguel). Ver también auditoría de fantasmas en `MEJORAS_POST_CUTOVER.md` #5.

## (a) Doble conteo de `efectivo_esperado` con abonos en efectivo — quirk de Base44
- **Qué:** `efectivo_esperado = total_efectivo + abonosEfectivo` (`Caja.jsx:1440`), pero la **venta paralela** que crea cada abono (`RegistrarPagoDialog.jsx`, `monto_efectivo=m`, `corte_caja_id=caja`) ya está dentro de `total_efectivo`. → el efectivo de un abono se cuenta **dos veces**.
- **Verificación:** contra 20 cortes cerrados REALES de Base44 con abono efectivo → **18/20 coinciden EXACTO** con la fórmula (ii) (doble). Base44 SÍ doble-cuenta.
- **Estado:** **CANDADO — reproducido idéntico. NO se arregla en la migración** (romperlo violaría la paridad con Base44 que valida el bot en Fase 5).
- **Acción:** **bug de Base44 FUERA de alcance.** Decidir con Miguel si se corrige **post-cutover** (decisión de negocio). Documentar para el dueño.

## (b) 2/20 cortes reales con abono efectivo y `total_efectivo=0`
- **Qué:** `CONF-A-C087` y `CONF-B-C04299` tienen `efectivo_esperado=0` y `total_efectivo=0` pese a tener un abono efectivo vinculado por `corte_caja_id`.
- **Hipótesis:** edge de asociación abono↔corte (corte cerrado sin recompute, o abono vinculado tras el cierre, o corte de prueba vacío). No contradice (a) (los 18 con totales reales sí doble-cuentan).
- **Acción:** **verificar en el bot (Fase 5)** con datos a volumen; si reaparece, revisar el momento de asociación del abono al corte.

## (c) Imágenes hospedadas en `media.base44.com` / `base44.app`
- **Qué:** `productos.imagen_url` y `configuracion_negocio.logo_url` apuntan a `media.base44.com/.../...png` y `base44.app/...`. **Mueren cuando se apague Base44.**
- **Acción (cutover):** re-hospedar imágenes del POS en Supabase Storage (bucket `uploads`) o Vercel y reescribir las URLs. No urgente en staging (Base44 sigue vivo).
- **Web:** las 8 imágenes de marca/arte de la **web** YA se re-hospedaron en `web-uploads/assets/` (esta sesión). Falta solo el cambio de prefijo de URL en el código web (parte de WEB-2).

## (d) Fase 4 (auth) + Fase 5 (fidelidad): HECHAS y APROBADAS por Miguel
- **Qué fue:** la UI de auth no consumía las sesiones reales. **Resuelto:** Opción A (cuentas terminal), admin=desbloqueo de UI sobre la sesión terminal, dueño=sesión global; `/login-pos` retirado (era hueco de aislamiento).
- **Estado:** build verde, smoke UI 4/4, **adversarial 31/31**, Fase 5 fidelidad (maestros 0 diffs, corte 14/14). **POS Fases 0-5 completas y firmadas.** Ver CHANGELOG.

## (f) Folio en pantalla Gracias del web — ✅ RESUELTO (migración 0019)
- **Qué fue:** anon hace INSERT en `pedidos` pero **no puede leer de vuelta el folio** (sin SELECT; 42501). La fila SÍ queda con `PP-<prefijo>-####` (trigger 0017). La pantalla Gracias quiere mostrarlo.
- **Resolución (Miguel, opción 1):** migración **0019 `web_crear_pedido_rpc`** — RPC `crear_pedido_web(payload jsonb) → text` SECURITY DEFINER que inserta y **devuelve el folio**; el web usa `rpc` en vez de `insert`. Candados del WITH CHECK anon reaplicados, whitelist de columnas, reutiliza el trigger 0017. anon: solo EXECUTE, sin SELECT. Verificado y aplicado a la Supabase compartida. Ver `DECISIONS.md` #22, `DATABASE.md` y `CHANGELOG.md`.

## (e) `uploads` bucket permite listar (advisor WARN)
- Política SELECT pública amplia → clientes pueden listar archivos. Bajo riesgo (imágenes de catálogo públicas). Opcional: restringir a acceso por URL en hardening posterior.

## (g) 🔴 Fotos de producto del catálogo web en `media.base44.com` — BLOQUEANTE DE CUTOVER (Flag WEB-2)
- **Qué:** la web pública muestra las fotos de producto desde **`productos.imagen_url`**, que apunta a **`media.base44.com`** (CDN de Base44). Detectado en el smoke del port WEB-2 (catálogo: 16 imágenes servidas por el CDN de Base44).
- **Riesgo:** cargan hoy solo porque Base44 sigue vivo. **Al apagar Base44, el catálogo público pierde las fotos.**
- **Acción (antes del cutover, decisión de timing de Miguel):** re-hospedar esas imágenes en Supabase Storage y actualizar `productos.imagen_url`. Es migración de **datos del POS** (no del repo web; los 8 assets de marca de la web ya se re-hospedaron). NO ejecutada aún. Ver `NEXT_STEPS.md` (CUTOVER).

## (h) Imágenes de prueba residuales en `web-uploads/pedidos/` (smokes WEB-2/WEB-3)
- 2 objetos de prueba: `db92b1c3-…png` (93 B, WEB-2) y `74aa34e2-…png` (110 B, WEB-3). No listables (bucket sin SELECT anon), solo accesibles por URL exacta.
- No se pudieron borrar sin `service_role`/Storage API (el trigger `storage.protect_delete()` bloquea el DELETE por SQL; **no se tocó RLS ni el trigger**). **Borrar por el Storage dashboard.** (Cada smoke con subida de imagen deja un objeto en `pedidos/`.)

## Notas de cutover (recordatorio)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con folios históricos).
- Los 3 productos "prueba" ("prueba 1", "prueba 2", "prueba suscursal") NO van al catálogo real de Abel.
- Eliminar la cuenta `staging-pos@confetti.local` cuando el login real esté wireado.
- Rotar la api_key Base44 `847df…`.
- **Re-hospedar fotos de producto (`productos.imagen_url`) fuera de `media.base44.com`** — ver (g), bloqueante.

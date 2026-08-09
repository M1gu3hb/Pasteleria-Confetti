# DECISIONS — decisiones de arquitectura/diseño (con su porqué)

---

# Decisiones 2026-08-01 → 2026-08-09

### D-20 · 2026-08-01 — RLS: envolver los helpers en `(select …)` en vez de reescribir policies
- **Razón:** `pos_is_admin()` / `pos_sucursal()` son `STABLE` sin argumentos; llamados "desnudos" el ejecutor los evalúa **por fila**. Envueltos, pasan a InitPlan: **una evaluación por statement**.
- **Consecuencia:** ~20 → 0.58 scans/s (**~96 % menos**) sin cambiar quién ve ni quién escribe qué. Se usó `ALTER POLICY` (nunca `DROP+CREATE`) para que la tabla no quede sin política ni un instante.
- **Archivos:** `supabase/migrations/0051_rls_initplan_wrap_helpers.sql`.

### D-21 · 2026-08-01 — Rate limit forward-only
- **Razón:** `0053` tenía dos fallos reales (bloqueo perpetuo y bucket manipulable por el cliente). **No se edita una migración ya aplicada.**
- **Consecuencia:** `0054` la sustituye; `0053` queda en el histórico marcada como superada.

### D-22 · 2026-08-08 — El cierre de caja se protege en TRES capas, no en una
- **Razón:** arreglar sólo la consulta deja fuera a las tablets que aún corren el bundle viejo — y eso **pasó de verdad** (`CONF-A-C042` se rompió un día después del despliegue).
- **Consecuencia:** consulta acotada + guarda falla-cerrada en el cliente + **trigger en la base** (`0058`), independiente del frontend.
- **⚠️ Matiz añadido el 2026-08-09:** la tercera capa es **más estrecha de lo que esta decisión sugiere**. `0058` sólo
  rechaza `total_general = 0`; la **truncación parcial** pasa de largo. Con el bundle viejo, las dos primeras capas no
  existen, así que en ese escenario la única defensa cubre **un solo** modo de fallo. Ampliarla es la Fase 2.3.

### ~~D-23 · 2026-08-08 — No maquillar los descuadres preexistentes~~ → **REVOCADA el 2026-08-09**
> **Se conserva a propósito, tachada, para que nadie la reabra creyendo que sigue vigente.**

- ~~**Razón:** `CONF-A-C032` y `CONF-C-C002` son de **otra causa** y anteriores al incidente.~~
- ~~**Consecuencia:** se **declaran** en las pruebas y en la documentación en vez de "cuadrarlos". Las pruebas los excluyen **explícitamente y por nombre**, no en silencio.~~

**POR QUÉ SE REVOCA.** La premisa era **falsa** y nunca se verificó. `CONF-A-C032` **no** es de otra causa: es el
**mismo** bug de truncación, en su forma **parcial**. Comprobado en la base (solo lectura): de sus 31 ventas, las 23
que caen dentro de la ventana de 1.000 **de Xochimilco** suman **exactamente $4,995.00** (= el `total_general`
guardado) y son **exactamente 23** (= el `numero_ventas` guardado); las 8 restantes suman **exactamente $1,420.00**
(= el descuadre). Las dos magnitudes coinciden a la vez.

**Qué salió mal, además del dato.** La decisión legitimó una **exclusión por nombre** en
`scripts/cierre_caja_verify.mjs`, y esa exclusión hizo que la suite **diera verde encima de $1,420 no reflejados**
durante toda la etapa. La intención ("declarar en vez de maquillar") era correcta; el fallo fue **no verificar la
premisa** y **convertirla en una exención de test**.

**Qué la sustituye:**
- `CONF-A-C032` se **repara** (Fase 2.2), con respaldo previo y firma de Miguel.
- `CONF-C-C002` **no se clasifica hasta demostrar su causa** (Fase 2.1). Sigue siendo un descuadre real de $70.
- La exclusión sale del test (Fase 2.4) y se aplica **D-30**.

### D-30 · 2026-08-09 — Una exclusión por nombre en un test es un fallo, no una exención
- **Razón:** D-23 demostró el modo de fallo: una exclusión "declarada y explícita" sigue siendo un agujero si la
  justificación **no se verificó**. El test imprimía la exclusión y aun así ocultó dinero.
- **Consecuencia (regla en `CLAUDE.md`):** ninguna prueba puede excluir un caso por nombre sin justificación
  **verificada y fechada**; el test debe **imprimir** la exclusión y su recuento; y **una exclusión sin evidencia
  verificada se trata como fallo: el test debe fallar, no pasar.**

### D-31 · 2026-08-09 — Clasificar cortes con el criterio CAUSAL, nunca con el proxy
- **Razón:** la ventana de 1.000 de PostgREST está **acotada a la sucursal** (la RLS ya filtra por `sucursal_id`). Se
  probaron los tres modelos sobre `CONF-A-C032`: la ventana **por sucursal** reproduce exacto (23 / $4,995), la
  **global** no reproduce (0 / $0) y el proxy "las N más antiguas del corte" **coincide por casualidad**, porque las
  ventas de ese corte son contiguas en el tiempo.
- **Consecuencia:** cualquier barrido de reparación usa la ventana **por sucursal**. El proxy **da falsos positivos en
  cortes pequeños**: barrer los 111 cortes con él habría "reparado" cortes sanos — es decir, **metido dinero mal**.
  Si los dos criterios divergen en algún corte, **ese corte no se repara** hasta explicar la divergencia.

### D-32 · 2026-08-09 — Las dos direcciones del merge del APK no son la misma operación
- **Razón:** `apk/capacitor` **no tiene commits propios** (es ancestro estricto de `migracion/supabase`), y
  `capacitor.config.ts` existe idéntico en ambas ramas.
- **Consecuencia:** `apk/capacitor` → producción es lo que `CLAUDE.md` prohíbe; **producción → `apk/capacitor` es un
  fast-forward puro que no toca producción**. Se elige esta segunda para desbloquear las tablets (Fase 1) y se deja
  repuntar `server.url` para la Fase 7. Ambas siguen requiriendo OK de Miguel.

### D-33 · 2026-08-09 — En la documentación no se escriben cifras que caducan
- **Razón:** dos afirmaciones falsas nacieron de escribir un dato volátil como si fuera permanente.
  1. **Hashes de bundle.** `HANDOFF.md` afirmaba que producción servía `index-DOafkEZU.js`; en vivo, el commit citado
     (`3a90e3c`) servía `index-B5y-Tcrd.js`. El hash cambia en el siguiente build.
  2. **Número de commits de retraso del APK.** La doc decía **18**; eran **20** al corregirla y **21** al día
     siguiente. Cambia con cada push a producción.
- **Consecuencia:** ambos se usan **para verificar en el momento**, nunca como referencia escrita.
  - En vez de un hash → se cita el **commit**, y se comprueba el bundle servido buscando dentro un **marcador del
    código nuevo** (p. ej. `ventas_corte_count`).
  - En vez de un número de commits → se afirma la propiedad **estable**: `apk/capacitor` es **ancestro estricto** de
    `migracion/supabase`. Se comprueba con
    `git log origin/migracion/supabase..origin/apk/capacitor` (vacío = ancestro estricto).

### D-24 · 2026-08-09 — "La nota no se guarda": arreglar en el diálogo, no en los 3 call-sites
- **Razón:** los tres sitios que abren el diálogo le pasaban una instantánea congelada. Arreglar el diálogo cubre los tres y no toca ningún handler de guardado.
- **Consecuencia:** la queryKey cuelga de `['pedidos_pastel']` **a propósito**, para heredar los `invalidateQueries` existentes.

### D-25 · 2026-08-09 — Pastelero: política + trigger de alcance, no permisos por columna
- **Razón:** RLS no distingue columnas y el POS usa **un único rol de base** (`authenticated`), así que los `GRANT` por columna no separan roles del POS.
- **Consecuencia:** `0060` = política `FOR UPDATE` + trigger que compara OLD/NEW. **NO-OP para el resto de roles** (early return), así que caja/administrador/dueño quedan byte-idénticos.

### D-26 · 2026-08-09 — `0061` cambia el rol de Abel en vez de reactivar `ADMIN_1234`
- **Razón:** "Abel" es el usuario que el personal usa y cuyo PIN (1234) conocen. Reactivar el viejo obligaría a repartir otro PIN.
- **Consecuencia:** `ADMIN_1234` queda como un segundo `dueño` **desactivado**. No estorba (`pos_is_admin()` resuelve por `auth_user_id`), pero hay que decidir si se borra o se guarda de respaldo.

### D-27 · 2026-08-09 — Normalizar el rol en el CÓDIGO, nunca en el DATO
- **Razón:** la base guarda `'dueño'` con tilde. `ModalPinAdmin.jsx` es el **único** punto que **exige** la tilde: si se "normaliza" el dato a `dueno`, **el dueño se queda fuera del sistema**.
- **Consecuencia:** los bugs de tilde se arreglan añadiendo normalización en cada comparación, **sin tocar el dato ni `ModalPinAdmin`**.

### D-28 · 2026-08-09 — Las pruebas no pueden probar sólo el arnés
- **Razón:** dos bugs graves se colaron por dobles que no imitaban la restricción real: un booleano que ocultó que `Number(null) === 0`, y temporizadores inyectados que ocultaron el `Illegal invocation` de los nativos del navegador.
- **Consecuencia:** toda prueba de regresión (a) pasa **valores crudos**, (b) **imita la restricción real** cuando usa dobles, y (c) **se comprueba contra el código viejo**: si no falla ahí, no prueba nada.

### D-29 · 2026-08-09 — El APK no se repunta sin OK de Miguel
- **Razón:** el `server.url` del APK apunta al preview de `apk/capacitor`. Cambiarlo o fusionar la rama es un despliegue a las tablets de producción.
- **Consecuencia:** queda documentado como **decisión pendiente de Miguel**, con las tres opciones planteadas, en `HANDOFF.md` §4 y `NEXT_STEPS.md` §1.
- **Resuelta el 2026-08-09:** Miguel eligió **(c) ambas, en orden** — Fase 1 fast-forward, Fase 7 repuntar. Ver **D-32**.

---

## APK Android (Capacitor) — decisiones (2026-07-09)
- **Capacitor + cargar la web viva de Vercel** (no empaquetar el `dist`). *Por qué:* las actualizaciones del POS siguen por la nube sin reinstalar el APK; solo lo nativo (impresión/cajón) se instala por USB.
- **Impresión modo IMAGEN raster por defecto** (renderizar el MISMO ticket a 576px y mandarlo como imagen ESC/POS), con TEXTO ESC/POS como opción. *Por qué:* preserva el diseño exacto que le gusta a Abel e inmuniza contra code-page (ñ/acentos); el texto plano es solo fallback.
- **Plugin nativo DELGADO** (connect/sendBytes/imagen/cut/drawer, envuelve **DantSu ESCPOS**) + lógica de ticket en JS. *Por qué:* lo que cambia seguido (diseño/lógica) se actualiza por Vercel; lo nativo casi no cambia.
- **Config LOCAL por dispositivo** (localStorage), no Supabase. *Por qué:* cada sucursal tiene su impresora/IP/cajón; no debe afectar a las demás.
- **Cajón por disparador USB-serial** como método principal (+ kick ESC/POS y "ninguno"). *Por qué:* ni la tablet Higole ni la impresora Easytime tienen RJ11.
- **Camino A (probar en sitio):** cada eslabón incierto queda SELECCIONABLE y PROBABLE en el panel de Operación; no se autocertifica el hardware.
- **`server.url` en la PREVIEW de la rama para el piloto** (no producción). *Por qué:* el código nativo vive en `apk/capacitor`; producción no lo tiene aún. Repuntar a producción es posterior, tras validar en sitio y OK de Miguel para fusionar.

1. **Opción A (DB compartida + RLS)** — una sola Supabase para POS y Web futura. El puente Base44 desaparece (sin `posApiClient.js`, sin api_key, sin sync de productos, sin `crearPedidoPOS`). Web futura: lee `catalogo_publico` + inserta `pedidos` con anon key. *Por qué:* máxima simplificación; menos superficie de error.

2. **"enums" como `text` + CHECK** (no ENUM nativo). *Por qué:* evolucionar estados sin `ALTER TYPE`; mismos valores que Base44.

3. **`detalle_venta.producto_id` SIN FK** (uuid suelto) + snapshots (`producto_nombre`, `precio_unitario_snapshot`). *Por qué:* el hard-delete de un producto NO debe romper el histórico (regla de negocio). venta_id sí tiene FK (ON DELETE CASCADE para mantenimiento).

4. **Actor-ids a `text`** (usuario_cajero_id, cancelado_por_id, cliente_id, usuario_apertura_id, registrado_por_id, creado_por_id, usuario_id). *Por qué:* el POS usa ids centinela string como `'empleado_terminal'`; en Base44 los ids eran strings; no son FK estrictas (guardan snapshot/centinela). Detectado en smoke de Fase 2 (insert de corte fallaba con uuid).

5. **jsonb → `text` en campos JSON-string** (extras_pastel, rellenos_pastel, precio_kilo_por_sucursal, ratio_personas_por_sucursal). *Por qué:* en Base44 son `string` y el front hace `JSON.stringify`/`JSON.parse`; como jsonb, `JSON.parse` recibiría un objeto nativo y rompería.

6. **`pin_hash` + `auth_user_id`; PIN plano ELIMINADO.** Auth real = Supabase Auth (`signInWithPassword`, hash en `auth.users`). `pin_hash` (bcrypt) de referencia + para `login_pos`. *Por qué:* seguridad (el original comparaba `u.pin===pin` en cliente).

7. **`login_pos(pin)` RPC** (SECURITY DEFINER, anon) — valida PIN server-side vs pin_hash y devuelve el operador; el cliente luego hace `signInWithPassword(email,'POS-'+pin)`. *Por qué:* preserva la UX de PIN-only del POS sin exponer hashes ni reintroducir comparación en cliente. Password derivado `POS-<pin>` (≥6 chars para GoTrue). Emails sintéticos `<id>@pos.confetti.local`.

8. **RLS amplia (temporal Fases 1-3) → scoped por rol/sucursal (Fase 4).** Tablas de dinero: `pos_is_admin() OR sucursal_id = pos_sucursal()`. Maestros: broad authenticated (operadores necesitan catálogo/config/folios; no son datos de dinero por sucursal). *Por qué:* aislamiento real backend; los WARN del advisor en maestros son esperados/intencionales.

9. **Doble conteo de `efectivo_esperado` con abono efectivo = quirk de Base44, FUERA de alcance.** Verificado vs 18/20 cortes reales: Base44 hace `total_efectivo + abonosEfectivo` y la venta paralela del abono ya está en total_efectivo. *Por qué NO se arregla:* CANDADO 1 = idéntico a Base44 (el bot Fase 5 compara contra Base44; arreglarlo rompería la paridad). Decidir si se corrige POST-cutover (decisión de negocio, no de migración).

10. **Frontera del día operativo = MEDIANOCHE América/Mexico_City (UTC-6 fijo), NO 06:00.** El código real usa `obtenerInicioDiaMexico` (medianoche) y `toLocaleDateString` TZ; `hora_inicio_dia_operativo='06:00'` solo lo usa limpieza de QR (plantilla), no el corte. *Por qué importa:* es CANDADO 2; se investigó en vez de asumir.

11. **Stubs no-op** para componentes apagados que importan archivos de dinero (PropinaDialog, CantidadVariableDialog, 3 editores de Mesa). *Por qué:* sacar sus call-sites de Caja/POS/Configuración = cirugía en archivos de dinero = riesgo candado. El stub que renderiza `null` cambia menos. Confirmado inalcanzables (propinas_activas=false; no hay productos `tipo_venta` variable). Decisión de Miguel: dejarlos así.

12. **Repo privado** (no público) — POS de dinero + historial git permanente. Confirmado por Miguel.

13. **Modo empleado = Opción A (cuenta terminal por sucursal).** Decisión de Miguel. 3 cuentas `auth.users` + `usuarios_pos` rol `caja`, `pin_hash` null, 1 por sucursal (email `terminal-<sucursalid>@pos.confetti.local`). La terminal hace auto-login a la suya (`signInWithPassword`). *Por qué:* preserva la UX de Abel (cajero sin PIN) y le da identidad de sucursal a la sesión para que la RLS la confine.

14. **Mapeo sesión→RLS (el diseño nuevo, candado-sensible).** *Por qué cada parte:*
    - **Administrador = desbloqueo de UI sobre la sesión TERMINAL** (NO abre sesión propia con `signInWithPassword`). Se valida su PIN con `login_pos` (sin cambiar sesión) y se exige `admin.sucursal_id == terminal`. Así un administrador hereda el alcance scoped de la terminal y **nunca** ve otra sucursal, aunque su rol `administrador` daría `pos_is_admin=true` si firmara sesión. Elegante: la RLS lo confina por construcción.
    - **Dueño = sesión global real** (`loginConPin` → `signInWithPassword`, `pos_is_admin=true`). Al salir de dueño en una terminal, se **restaura** la sesión terminal (`loginTerminal`) para volver al alcance scoped.
    - **`ensureSession()` bootstrapea la sesión TERMINAL** desde localStorage (reemplaza el bootstrap de la cuenta staging). El adaptador la espera antes de cada query, así el arranque diario queda autenticado y scoped sin carreras.

15. **`ConfigContext` cae a la vista `config_publica` cuando no hay sesión.** *Por qué:* al quitar la sesión staging, las pantallas pre-login (ConfigurarTerminal, AccesoDuenoGate) quedan anon y la tabla `configuracion_negocio` está bloqueada para anon. El fallback a `config_publica` (anon-legible) preserva el branding EXACTO de Confetti pre-login. No cambia el comportamiento autenticado (sigue leyendo la tabla completa).

16. **Password fijo embebido de las cuentas terminal (`POS-TERMINAL-CONFETTI`, `VITE_TERMINAL_PASSWORD`).** *Por qué:* Miguel pidió "password fijo embebido". Va en el bundle (vía `VITE_*`) — mismo modelo de confianza que la cuenta staging anterior; la RLS scoped (caja → solo su sucursal) acota el blast radius. *Pendiente de decisión para producción:* provisión por dispositivo en vez de password compartido.

17. **`POSLogin` (`/login-pos`) RETIRADO** (decisión de Miguel, GATE de aislamiento). El modelo no tiene login standalone: empleado=default sobre la terminal; admin/dueño elevan por PIN. Era un hueco: por ahí un administrador abría SU sesión (→ global por su rol), rompiendo "A no ve B". Investigado: no era load-bearing (único navigate = fallback de AppLayout que TerminalGate ya intercepta; sin links). Se borraron ruta + `POSLogin.jsx` + deps exclusivas (`LoginBrandColors.jsx`, `ensureDefaultAdmin.js`) + el mapeo `UsuarioLogin` del adapter. La vista `usuarios_login` se conserva (anon-safe).

18. **`_pin` nunca persiste en `posUser`/sessionStorage.** ModalPinAdmin pasa `_pin` en el callback (para que el dueño abra sesión); los handlers lo **separan** (`const {_pin, ...limpio}`) antes de `login()`. *Por qué:* el PIN no debe quedar en sessionStorage (XSS). El sellado de actor usa `posUser.{id,nombre}` (admin real al elevar; 'empleado_terminal' en modo empleado) — sin cambio de lógica.

19. **auth.users de operadores reproducibles (migración 0016).** Se habían creado ad-hoc (no reproducibles en DB fresca). 0016 los provisiona idempotentemente por nombre con los PINs de 0006 (token-cols en '' para evitar el 500 de GoTrue), saltando filas ya provisionadas (NO-OP en staging). *Por qué:* cutover/DB fresca deben poder reconstruir el auth por operador. En cutover real se re-siembra con los PINs del export.

20. **GAP1 folio del pedido web = TRIGGER, no RPC ni folio nullable (migración 0017).** Decisión de Miguel. Trigger `BEFORE INSERT` en `pedidos` (`origen='web' AND folio IS NULL`) que llama `siguiente_folio('pedido_pastel', sucursal_id)` (SECURITY DEFINER, search_path fijo; `revoke execute from anon, public`). *Por qué así:* (a) **NO hacer `folio` nullable** — rompería invariantes del POS y reportes que asumen folio presente; (b) **NO una RPC genérica** que el web invoque para "crear pedido" — mantiene el INSERT directo + RLS WITH CHECK como única superficie, sin exponer una función de escritura. El web inserta sin folio y la fila queda con `PP-<prefijo>-####`. *Consecuencia (ver #22):* el web no recupera el folio en el mismo INSERT.

21. **GAP2 upload de imagen = bucket dedicado `web-uploads`, NO abrir el `uploads` del POS (migración 0018).** Decisión de Miguel. Bucket nuevo público/no-listable, límite 5MB, solo MIME de imagen; policy anon INSERT **solo** en ese bucket; lectura por URL pública. *Por qué:* el bucket `uploads` del POS es authenticated-only y guarda adjuntos internos; darle INSERT a anon ahí ampliaría el blast radius. Un bucket separado aísla el contenido subido por público. (Las imágenes de marca de la web también se re-hospedaron ahí, en `web-uploads/assets/`.)

22. **Folio en la pantalla Gracias del web — RESUELTO vía RPC (migración 0019).** Consecuencia de #20: anon hace INSERT pero **no puede leer de vuelta el folio** (`pedidos` no tiene SELECT para anon — correcto por aislamiento; `insert().select()` → 42501, probado). **Decisión de Miguel (bloqueada): opción 1.** Migración **0019 `web_crear_pedido_rpc`**: función `crear_pedido_web(payload jsonb) returns text` SECURITY DEFINER (owner postgres, `search_path=public`) que inserta el pedido y **devuelve el folio** en una sola llamada — reproduce el `crearPedidoPOS` de Base44 sin api_key. El web cambia `insert` por `rpc('crear_pedido_web', {payload})`. Reaplica los MISMOS candados que el `WITH CHECK` de `anon_insert_pedidos` (fuerza `origen='web'`/`estado='pendiente'`, rechaza otros), acota `tipo_pedido` a `pastel_personalizado`/`productos_catalogo` (rechazo explícito), whitelist explícita de columnas (ignora `devolver_base`/`folio`/financieros/`creado_por_*`), valida requeridos + sucursal activa, y **reutiliza el trigger 0017** para el folio (insert con `folio` NULL + `RETURNING` → un solo generador). anon recibe solo EXECUTE; **sigue sin SELECT** en `pedidos`. **0020 (hardening):** se revoca el EXECUTE que el default de Supabase da a `authenticated` → la RPC es ejecutable **solo por anon** (el POS escribe `pedidos` por INSERT directo con su RLS scoped, no por esta función). **0021 (fidelidad):** la RPC SELLA `creado_por_nombre='Web Confetti'` como constante server-side (no del payload → no inyectable), restaurando la señal con que el POS distingue los pedidos que entraron por la web (Abel la usa); verificado: inyectar otro `creado_por_nombre` en el payload se ignora. Descartadas: (2) Gracias sin folio; (3) policy anon SELECT (filtraría pedidos ajenos). Verificado anon: folio real devuelto, fila web/pendiente, SELECT directo → 42501, payloads inválidos rechazados.

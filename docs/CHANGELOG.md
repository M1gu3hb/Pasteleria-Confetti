# CHANGELOG

## 2026-06-29 — Auditoría final pre-instalación (POS) — restos Base44 + deploy
> Detalle completo y bitácora en `AUDITORIA_FINAL/` (raíz del workspace).
- **IDs de sucursal Base44 → UUID reales** en `Dashboard.jsx` y `SelectorSucursalesProducto.jsx`
  (antes ventas por sucursal en $0 en la vista general). Verificado contra `sucursales` (MCP).
- **Vista `config_publica`** ahora expone `extras_pastel` + `rellenos_pastel` (mig **0029**, ya
  aplicada en vivo). Cierra el feature **precio de relleno → web** (la web ya lo lee/suma; POS y
  web consistentes: el `precio_kilo` del relleno **sobrescribe** el global).
- **Restos Base44 en código vivo eliminados:** `WebPublica.jsx` `WEB_URL` → web Vercel (el botón
  "Ver web pública" apuntaba a la web Base44 muerta); `ConfigContext.jsx` `MH_LOGO_URL` →
  Supabase Storage.
- **Imágenes re-hospedadas a Supabase Storage** (decisión de Miguel): logo del negocio
  (`configuracion_negocio.logo_url`) + **16** imágenes de producto (`productos.imagen_url`) +
  logo de plataforma → bucket `uploads/rehost/`. **0 referencias Base44** restantes en BD y en
  TODO el código desplegado (POS y Web). URLs nuevas verificadas HTTP 200.
- **Volumen/concurrencia:** índices de filtro presentes en tablas calientes; folios atómicos por
  `folio_contador UNIQUE(tipo,sucursal_id)`. Sin índice crítico faltante.
- **FLAG (no tocado):** `qrPedidoFlow.js:171` usa el campo viejo `visible_en_menu_digital` (ruta
  Portal QR, inactiva en Confetti; el campo inexistente vuelve la condición inocua). Limpieza
  futura; riesgo nulo.
- **No se tocó la matemática del dinero** (candados intactos). Commits POS: `74f7332`, `4fafe4a`
  → Vercel READY (producción).

## Run nocturno 2026-06-28 — Cierre de cabos de limpieza (Fase 5)
- **Configuracion.jsx:** eliminado el código muerto de mesas (color-sync de `saveUser`
  —mesero-only, Confetti no tiene meseros—, query `mesas`, handlers `handleSaveMesa/
  handleDeleteMesa/handlePositionChange/handleReorder/openNew/eliminarMesasDemo/
  mesasFiltradas`, estado y imports muertos). `saveUser` (crear/editar usuario) verificado
  en vivo. Conservados los switches de config `usa_mesas`/asignación.
- **EstacionesAyuda.jsx** borrado (huérfano, autorizado).
- **ResumenDelDia.jsx:** quitadas las variables muertas (utilidad, margen, costoTotal,
  utilidadNeta, totalGeneral/Propinas/Cobrado, ticketProm, propinasPorMesero, colorMoney/
  colorTip) y props muertas; sin tocar lo que se muestra (efectivo/tickets/métodos/abonos/
  entregas). Verificado en vivo (idéntico).
- **Migración 0028** (`notas_voz_auth_delete`): policy DELETE faltante en `notas-voz`;
  borrado el blob de prueba (bucket vacío).
- Build OK; **regresión de dinero idéntica** ($140 → efectivo_esperado $140); 0 errores de
  consola. FLAGS (mesas, estaciones, blob) cerrados en BUGS_PENDING.

## Run nocturno 2026-06-28 — FASE 5: limpieza de fantasmas + visual
- **F1** Corte de turno QUITADO (Caja). **F2** Resumen de Caja recortado a SOLO efectivo +
  métodos + tickets (fuera utilidad/margen/costos/gastos/propinas/mesero/mesas).
- **F4/F5/F6** botones muertos (Mantenimiento/Ventas/Registros) NEUTRALIZADOS → "Función
  desactivada por el momento" (antes lanzaban por `functions.invoke`).
- **F7** `pages/CorteCaja.jsx`, **F8** (FinancialChart, PrimerosPasosCard,
  PedidoListoWatcher, SolicitudesQRWatcher, SoundUnlockButton), **F9** PropinaDialog,
  **F12** ModificadoresDialog, **F10** (mesas/, IntegracionesRespaldos,
  EstacionesPreparacion, UnidadesMedida, Proveedores) ELIMINADOS + sus referencias
  (incluida cirugía de pestañas en Configuracion). `CantidadVariableDialog` intacto.
- **Visual:** cards del pastel de-saturadas y mejor distribuidas (info/íconos/colores
  conservados).
- Build OK; runtime sin errores (Caja/Configuracion/Ventas/POS); **regresión de dinero
  idéntica** (mostrador $140 → efectivo_esperado $140). FLAGS: estado mesas muerto dejado
  en Configuracion (gated, acoplado al color-sync) + EstacionesAyuda huérfano (no listado).

## Run nocturno 2026-06-28 — FASE 4: nota de voz en pastel personalizado
- **Migración 0027**: bucket `notas-voz` (público, RLS espejo de `uploads`) + `pedidos` +=
  `nota_voz_url`, `nota_voz_transcripcion`. `UploadFile` ahora acepta `bucket`.
- **`NotaVozRecorder`** (nuevo): `MediaRecorder` + `SpeechRecognition` (es-MX) en paralelo;
  sube el audio a `notas-voz` y emite URL+transcript. Integrado en `NuevoPedidoPastel`
  (grabar) y `PedidoPastelDetalleDialog` (reproductor + transcripción editable, sustituye
  el placeholder "próximamente"). Degradación si no hay reconocimiento/grabación.
- **Verificado headless:** bucket+RLS, subida de blob (200) + lectura pública (200),
  persistencia de campos, reproductor renderiza, transcripción editable guarda, recorder
  presente. **FLAG:** la grabación con micrófono real necesita verificación manual de
  Miguel (no ejercitable headless).

## Run nocturno 2026-06-28 — FASE 3 #6: entregas de pastel en el corte
- **`src/utils/entregasCorte.js`** (nuevo): `obtenerEntregasDelCorte` lista los pedidos
  `entregado` (con `fecha_entrega_real`) del rango+sucursal del corte. Informativo, sin
  dinero.
- **CorteTicket** (PDF) y **ResumenDelDia** (vivo): nueva sección "Entregas de pastel del
  día" con la línea `Entregado [nombre] — [hora] — [folio] — entregado`. Cableado en
  `Caja` (vivo), `CorteViewerDialog` (histórico) y `CorteAutoDownloader` (cierre).
- **Verificado en vivo:** entrega de "Lucia"/PP-B-0001 aparece en el Resumen y en el PDF;
  el corte cerró con totales solo del pago (efectivo 420 / esperado 840), la entrega no
  sumó nada. Build OK. **FASE 3 (dinero) COMPLETA.**

## Run nocturno 2026-06-28 — FASE 3 #4: devolución de anticipo (DINERO) ⚠️
- **Mecanismo (decisión propia, FLAG):** la devolución de un pedido con anticipo se
  registra como **UN abono COMPENSATORIO negativo en el corte ABIERTO** (con desglose por
  método en negativo), no como venta negativa: el desglose de ventas ignora `total<=0` y
  clampa métodos a `>=0`, mientras `abonosEfectivo` suma en crudo. Así `efectivo_esperado`
  baja exactamente el efectivo devuelto, UNA vez (consistente con la venta-devolución),
  sin tocar cortes viejos (candado 9). El quirk del doble conteo se MANTIENE.
- **`src/utils/devolucionAnticipo.js`** (nuevo): `registrarDevolucionAnticipo`. Exige caja
  abierta. Cableado en `PedidoPastelDetalleDialog` y en la cola web de `Caja` (gancho
  `onDevolverAnticipo` del `CancelarPedidoDialog` de #5).
- **Verificado en vivo (BD):** cross-corte efectivo (Corte viejo intacto $200; Corte
  nuevo `efectivo_esperado=-100`), mixto (abono -150 ef-90/ta-60), regresión método único
  ($200), sin anticipo (cancela sin abono), sin caja (bloquea). Build OK.
- **FLAGS:** `efectivo_esperado` puede quedar negativo en un corte solo-devolución
  (correcto, sin fondo); mismo-día conserva el sesgo del quirk; la devolución no baja
  `total_efectivo`/`total_general` (ventas-only), igual que devolver una venta pasada.

## Run nocturno 2026-06-28 — FASE 3 #5: tipo/motivo de cancelación de pedido
- **Migración 0026** `pedidos_cancelacion` (aplicada): `pedidos` += `tipo_cancelacion,
  motivo_cancelacion, cancelado_por_id/nombre, fecha_cancelacion` + `monto_devuelto
  numeric default 0` (gancho de #4). Idempotente.
- **`CancelarPedidoDialog`** (nuevo, espejo de `CancelarVentaDialog`): selector de tipo
  (cancelacion|devolucion) + motivo OBLIGATORIO + sello. Reemplaza los 2 `confirm()`
  (`PedidoPastelDetalleDialog` para pastel/catálogo, y `Caja.handleCancelarPedidoWeb`
  para la cola web). Adaptador: whitelist `pedidos` += 6 columnas.
- Ruta SIN dinero verificada en vivo (BD: estado/tipo/motivo/sello; sale de la cola;
  build OK). Devolución CON anticipo delega al gancho de #4 (bloqueada hasta entonces).

## Sesión 2026-06-28 — FASE 3 A-FIX (Opción A): abono mixto = suma de partes + fix del rezago del selector

### Opción A — abono mixto entra a los buckets (consistencia del doble conteo) — `BUGS_PENDING (k)` RESUELTO
- **Migración 0025** `abonos_desglose_metodo` (aplicada): `monto_efectivo/tarjeta/transferencia` (numeric default 0) en `abonos` + backfill desde metodo_pago (0 filas en staging limpio; en prod single-método el CASE las cubre).
- **Código:** adaptador (whitelist abonos +3 cols); `RegistrarPagoDialog` setea el desglose del abono desde `construirPago`; `Caja.jsx:266-271` SUMA las columnas (no filtra por metodo_pago). `efectivo_esperado` (1236/1316) NO se tocó: el quirk del doble conteo se MANTIENE, ahora consistente (el efectivo del mixto entra a `abonosEfectivo`).
- **Verificado en vivo (BD/PDF):** regresión single-método IDÉNTICA (corte solo-efectivo $50 → efectivo_esperado **$100**); consistencia mixto (single $50 + mixtos $120 ef → efectivo_esperado **$340**, antes $220); card "Pagos de pedidos de pastel" muestra el mixto (Efectivo $170/Total $250); totales por método y etiquetas del PDF sin cambio.

### Fix del rezago del selector — `BUGS_PENDING (l)` (encontrado durante A-FIX)
- `MetodoPagoSelector` emitía el `pago` vía `useEffect→onChange` (async) → cambiar el monto y confirmar rápido dejaba el desglose por método VIEJO (reproducido: abono $50 con `monto_efectivo=370`). **Fix:** selector CONTROLADO (el padre dueño de metodo+montos; `construirPago` síncrono); `PaymentModal`/`RegistrarPagoDialog` adaptados. Verificado: confirm inmediato → desglose correcto. Mostrador mixto+single regresión OK.
- Staging limpiado a pristino.

## Sesión 2026-06-28 — Auditoría post-#3 (BLOQUE A): verificaciones + hallazgo del abono mixto/quirk

Auditoría de la entrega de #3 contra el código real. Mixto bien construido; 2 puntos de dinero que el reporte de #3 no cubrió.

### A1 — Hallazgo (decisión de Miguel PENDIENTE; NO se tocó `efectivo_esperado`/buckets)
- El abono `metodo_pago='mixto'` no cae en `abonosEfectivo/Tarjeta/Transferencia` (filtran por método exacto, `Caja.jsx:266-271`) → (a) su porción efectivo NO se doble-cuenta en `efectivo_esperado` (un abono efectivo único SÍ → inconsistente con el candado); (b) no sale en la card "Pagos de pedidos de pastel" de ResumenDelDia. **Verificado en vivo:** corte con efectivo único $50 + 3 mixtos (ef 120) → `total_efectivo=170`, `efectivo_esperado=220` (solo el $50 single dobló). Documentado en `BUGS_PENDING (k)` con opciones A (recomendada: consistencia) / B. **Detenido para decisión de Miguel.**

### A2–A7 — Verificado en vivo (BD/PDF/consola); sin correcciones de código necesarias
- **A2** anticipo MIXTO sobre **pastel personalizado**: abono `mixto` $150 + venta paralela `mixto` (ef $90/tar $60) + línea `producto_id` null + saldo $420→$270. ✓
- **A3** método ÚNICO en RegistrarPagoDialog intacto: anticipo solo-efectivo $50 (V0002) y solo-tarjeta $50 (V0003), montos por método correctos, al corte. ✓
- **A4** etiquetas con TRANSFERENCIA en el PDF del corte: "Mixto (E+T)", "Mixto (E+TR)", "Mixto (T+TR)", "Efectivo", "Tarjeta" — sin ambigüedad (E/T/TR). ✓
- **A5** redondeo de centavos en `construirPago`: $100.10+$200.20=$300.30 **cuadra** y deja confirmar; off por 1¢ ($300.29) → "Falta $0.01" + bloquea. `toFixed(2)` maneja los flotantes — **sin fix**. ✓
- **A6** `construirPago` exige ≥2 métodos POSITIVOS: "mixto" con todo en un método → suma cuadra pero sale aviso "al menos 2 métodos" + confirm bloqueado — **sin fix**. ✓
- **A7** build de producción limpio (`vite build` exit 0, `dist/` regenerado) tras el borrado de 131 líneas; **dev server reiniciado** + carga en frío de `/caja` **sin errores de consola** (los errores previos eran churn de HMR del archivo borrado). ✓
- Staging limpiado a pristino.

## Sesión 2026-06-27 (cont. 9) — FASE 3 #3: PAGO MIXTO en todos los puntos (construido + verificado en vivo)

### Componente/lógica reutilizable (sin duplicar)
- **`src/utils/metodoPago.js`** — `construirPago(total, metodo, montos)` (método único o mixto, valida que la suma cuadre exacto + ≥2 métodos), `etiquetaMetodoPago(v)` ("Mixto (E+T)" con iniciales E=efectivo, T=tarjeta, TR=transferencia), `INICIAL_METODO`, `metodosUsadosDe`.
- **`src/components/pos/MetodoPagoSelector.jsx`** — selector reutilizable: 4 métodos (efectivo/tarjeta/transferencia/mixto); en mixto, 3 inputs + feedback de cuadre (✓ Cuadra / Falta / Sobra) y bloqueo si no cuadra. Emite `onChange(pago, valido)`.

### Integración en TODOS los puntos de cobro
- **Mostrador** (`PaymentModal.jsx`): usa el selector; conserva "recibido/cambio" solo para efectivo único; confirma solo si el pago es válido. `...paymentData` ya fluía a la Venta (`metodo_pago='mixto'` + montos).
- **Anticipo de pastel y de pedido web** (`RegistrarPagoDialog.jsx`): usa el selector; el Abono y su Venta paralela quedan con `metodo_pago` + montos por método; la línea (fix A, `producto_id` null) intacta.
- **CobrarPedidoWebDialog ELIMINADO** (decisión): era HUÉRFANO (`abrirCobroPedidoWeb` nunca se invocaba) y habría DUPLICADO la lógica que ya cubre `RegistrarPagoDialog` (con mixto + saldo completo, gracias a #1). Borrados el componente + `handleCobrarPedidoWeb`/`abrirCobroPedidoWeb`/estado en `Caja.jsx` + el import `parseProductosDesdeNotas` que quedó sin uso (sigue definido/usado dentro de `PreCuentaTicket`). Sin referencias residuales. El cobro del pedido web va por el flujo único de la cola → `PedidoPastelDetalleDialog` → `RegistrarPagoDialog`.

### Esquema — `abonos` no permitía 'mixto' (migración 0024)
- **`supabase/migrations/0024_abonos_metodo_pago_mixto.sql`** (aplicada): `ventas_metodo_pago_check` YA incluía 'mixto', pero `abonos_metodo_pago_check` no → el abono mixto fallaba con `violates check constraint`. Se recrea el check de abonos incluyendo 'mixto' (espejo de ventas; solo amplía el conjunto, filas existentes intactas).

### Presentación en el corte/PDF
- **`CorteTicket.jsx`**: la columna "Pago" usa `etiquetaMetodoPago` → método único capitalizado o **"Mixto (E+T)"** (solo qué métodos por iniciales, NO el monto). El desglose de TOTALES por método del corte no cambia (ya sumaba por `monto_efectivo/tarjeta/transferencia` vía `desgloseMetodosPagoExacto`).

### Verificado en vivo (vía real, BD + corte/PDF)
- **Mostrador mixto:** venta `metodo_pago='mixto'`, efectivo $200 + tarjeta $100, en el corte. **Método único (efectivo) intacto** (venta single + cambio $60). Resumen del día: Efectivo $340 (200+140) + Tarjeta $100 = $440, cuadra.
- **Anticipo de catálogo mixto:** abono `mixto` $150 + venta paralela `mixto` (efectivo $90 + tarjeta $60) + línea (`producto_id` null), saldo baja.
- **Corte cerrado:** totales Efectivo $430 + Tarjeta $160 = $590 (cuadra). **PDF:** las 2 ventas mixtas muestran "Mixto (E+T)", la single muestra "Efectivo".
- Staging limpiado a pristino tras las pruebas.

## Sesión 2026-06-27 (cont. 8) — FASE 3: cierre de #2 (findability del catálogo) — `BUGS_PENDING (j)` RESUELTO

### Findability del pedido de catálogo (gap j) — solo frontend, sin migración
- **`Caja.jsx`:** la cola Caja→Pedidos pasa de `estado:'pendiente'` a `estado:{$nin:['entregado','cancelado']}` (todos los activos). Lista en **dos grupos**: "Pendientes de cobro" (manejan beep + badge pulsante, vía nuevo `pedidosWebPendientes`) y "En proceso — con anticipo / por entregar" (nuevo `pedidosWebEnProceso`). El badge de la pestaña muestra el total activo; el parpadeo/beep de "nuevo" sigue SOLO sobre `pendiente` (no molesta con los en proceso). El buscador por folio ya encontraba cualquier estado (sin cambio). El flujo del **pastel NO se tocó**.
- **Verificado en vivo (ciclo completo de un catálogo, vía real):** pendiente (grupo "Pendientes de cobro") → 1er anticipo $100 → **se mueve a "En proceso"**, saldo $300→$200, no se pierde → 2º anticipo $100 (saldo $100) → liquidación $100 → **pagado**, saldo 0, sigue visible "por entregar" → **"Entregado"** habilitado → marcado → **sale de la lista** ("No hay pedidos web de catálogo activos"). BD: pedido `entregado`, 3 abonos / 3 ventas / 3 líneas (todas `producto_id` null = "Anticipo pedido PP-B-0001") = $300, todo al corte. Sin errores. **#2 (anticipos de catálogo, igual que el pastel) CERRADO COMPLETO.**
- Staging limpiado a pristino tras las pruebas.

## Sesión 2026-06-27 (cont. 7) — FASE 3 A (fix DetalleVenta) + B (línea en ticket) + C (#2 anticipo catálogo→corte+dashboard)

### A — Fix del bug `producto_id: ''` (Opción A de Miguel) → `BUGS_PENDING (i)` RESUELTO
- **Migración 0023** `detalle_venta_producto_id_nullable` (aplicada a la Supabase compartida): `detalle_venta.producto_id` de `uuid NOT NULL` → `uuid NULL`. Auditoría previa: sin FK en producto_id (solo en venta_id); todas las filas existentes con uuid válido; consumidores toleran null (CorteTicket key `producto_id||producto_nombre` + render por snapshot; joins de receta no machean→costo 0; DescuentoInventarioVenta no mapeado). Las ventas de mostrador normales no se tocan.
- **Código:** `RegistrarPagoDialog.jsx` (línea de anticipo: `producto_id: null`, `producto_nombre: 'Anticipo pedido <folio>'`) y `Caja.jsx` handleCobrarPedidoWeb (items de pedido web: `producto_id: null`, concepto = nombre parseado).

### B — Anticipo como línea en el ticket/PDF (verificado en vivo)
- Pedido web → anticipo en POS → **sin** el toast de error de uuid; `DetalleVenta` creado con `producto_id=null`; la **línea aparece en el PDF del corte**: `CONF-B-V0001 · 21:31 · "Anticipo pedido PP-B-0001 ×1" · $150.00 · Efectivo`. El dinero sigue entrando al corte (no se rompió el #1).

### C — #2 Anticipo de pedido de CATÁLOGO → corte + dashboard (verificado en vivo)
- Catálogo web nace cobrable (saldo=total, #1) → "Registrar pago" (mismo `RegistrarPagoDialog` que el pastel) registra el anticipo (saldo baja), crea su venta paralela ligada al **corte abierto** + su línea de detalle (fix A). **Corte:** Resumen del día muestra Ventas $150 / Efectivo $150. **Dashboard:** con el corte ABIERTO, "Ventas hoy" = $50 (2º anticipo de prueba) — el Dashboard filtra por `corte_caja_id` de cortes abiertos ([Dashboard.jsx:80,109-111]); por eso "se reinicia" al cierre (esperado).
- ⚠️ **Gap encontrado (`BUGS_PENDING (j)`):** el pedido de catálogo `con_anticipo` SALE de la cola Caja→Pedidos (que filtra `pendiente`) y no vive en "Pedidos de Pastel" → difícil de re-encontrar para 2º anticipo/liquidación/entrega. El pastel NO tiene este problema → aún no es "igual que pastel". Pendiente decisión de Miguel (alcance de #2).
- Staging limpiado a pristino (transaccional=0, folios reseteados) tras las pruebas.

## Sesión 2026-06-27 (cont. 6) — Vercel en producción + FASE 2 confirmada en vivo + FASE 3 #1 (saldo web)

### Plan maestro
- Nuevo **`docs/PLAN_FASES_MEJORAS.md`** = fuente de verdad de las 5 fases de mejoras (regla rectora: ya NO "idéntico a Base44"; arreglar lo incompleto). Cada fase futura lo lee.

### FASE 2 — Vercel + confirmación en vivo (HECHA)
- **Vercel HECHO (Miguel, panel, equipo MH Astral Systems / huertabautistamiguel62@gmail.com):** POS `pasteleria-confetti` con env vars `VITE_SUPABASE_URL`+`VITE_SUPABASE_ANON_KEY`, Production Branch → `migracion/supabase`, producción promovida; **Web** proyecto NUEVO importado de `Pasteleria-Confetti-web-` (mismas env vars, **Vercel Authentication OFF** = público). Ambos verificados funcionando en producción. (Claude detectó que las env vars habían quedado vacías → `createClient(undefined)`; corregido.)
- **Confirmación en vivo (Claude, BD+DOM; los screenshots del preview fallan en este entorno):**
  - **I1 SALDO WEB=0 CONFIRMADO y más amplio de lo documentado:** pedidos web **pastel Y catálogo** nacían con `saldo_pendiente=0` pese a `total_final>0` (PP-B-0001 pastel $420/$0; PP-B-0002 catálogo $300/$0). El anticipo se **bloqueaba** ("El monto excede el saldo pendiente ($0.00)") y **"Entregado" quedaba habilitado sin cobrar**. Resuelve la contradicción bot-vs-código (el bot validó ruteo, no cobro).
  - **Productos Web Pública→web (c):** cambiar **precio** ($260→$275) y **descripción** (vacía→texto) en el POS se refleja **de inmediato** en el catálogo público (vista `catalogo_publico`, sin sync). Nombre = misma columna de la vista (mismo mecanismo). Imagen = mismo campo `imagen_url` (cambiarla exige subir archivo, no manejable en preview headless).
- Staging limpiado a pristino tras las pruebas.

### FASE 3 #1 — SALDO WEB = total_final (migración 0022) — CHECKPOINT para revisión de Miguel
- **`supabase/migrations/0022_web_crear_pedido_saldo.sql`** (aplicada a la Supabase compartida): `create or replace function crear_pedido_web` ahora setea, server-side, `total_abonado=0, a_cuenta=0, saldo_pendiente=greatest(0, total_final)` (calculado desde el MISMO `total_final` que inserta, NO del payload → no inyectable). Cierra la asimetría: el POS (`NuevoPedidoPastel`) ya inicializaba el saldo; la web no. Candados/whitelist/sello `creado_por_nombre='Web Confetti'`/grants anon-only **idénticos** a 0021.
- **Verificado en vivo (anon):** nuevo pedido web PP-B-0001 nace con `saldo_pendiente=$420` (=total_final); en el POS el diálogo muestra **"Saldo pendiente $420.00"** (ya no $0.00), un anticipo de **$200 se registra** (pedido→`con_anticipo`, saldo $420→$220, abono creado, **venta paralela CONF-B-V0001 ligada al corte**), y **"Entregado" queda deshabilitado** hasta liquidar. ✅
- ⚠️ **Bug PRE-EXISTENTE destapado** (no causado por #1): al registrar el anticipo, la **venta paralela no genera su `DetalleVenta`** — `RegistrarPagoDialog.jsx:108` (y `CobrarPedidoWebDialog`/`Caja.handleCobrarPedidoWeb`) crean el detalle con `producto_id: ''` y la columna es **`uuid NOT NULL`** → `invalid input syntax for type uuid`. El **dinero entra bien al corte** (la venta sí), pero la **línea de la venta de anticipo NO sale en el ticket/PDF**. Afecta TODOS los anticipos (POS y web), latente hasta ahora porque la web no era cobrable. Ver `BUGS_PENDING (i)`. Pendiente de decisión de Miguel (no se arregló: toca esquema/money-path y es separable del #1).

## Sesión 2026-06-27 (cont. 5) — Bot de pruebas largas (60 días) COMPLETO + apertura de fase MEJORAS

### Validación a volumen (bot de paridad, `Bot pruebas/bot-pruebas/`)
- **60 días simulados, 3 sucursales en paralelo**, operación real de Abel por UI, con **libro mayor + oráculo independientes** confrontando cada corte. Semilla fija `20260620` (reproducible). Corrido por chunks de 15 días bajo modelo vigilante; pausado tras el día 17 (cambio de máquina) y reanudado desde `estado.json` sin re-correr.
- **Resultado IMPECABLE:** 60/60 días limpios · cuadres corte↔libro **180/180** (incl. doble conteo de 60 abonos) · folios **180/180** sin colisión bajo concurrencia (ráfaga 2 cajeros en Topilejo) · pedidos web **30/30** a la sucursal correcta · RLS **18/18** sin fugas · **0 bugs reales · 0 fallos de automatización**. Volumen: 180 cortes, 589 ventas, 60 abonos, 30 pedidos web, **180 PDFs** generados. Evidencia: `reportes/run60/RESUMEN_EJECUTIVO_60_DIAS.md`.
- **PDF del corte verificado** (`bot-pdf.mjs`): el cierre auto-descarga un PDF válido que refleja el corte y lista las cancelaciones en el desglose (PDF es imagen html2canvas → contenido validado en el render del CorteTicket).
- **Hallazgos reclasificados por Miguel:** corte de turno = **botón fantasma** (Abel no lo usa) → `BUGS_PENDING.md` (g); cobro mixto/catálogo huérfano = **fiel a Base44** (no bug) → ahora es flujo a construir.

### Apertura de la fase MEJORAS
- Nuevo doc **`docs/MEJORAS_POST_VALIDACION.md`** con la **lista ordenada** de mejoras (lo pendiente en Base44 por falta de créditos): #1 Vercel (POS+Web), #2 no-cutover, #3 fantasmas (corte turno=quitar; mini-dashboard Caja=arreglar a efectivo/métodos/tickets; mixto=construir), #4 notas de voz, #5 pagos mixtos en todos los puntos, #6 cancelación-con-anticipo→devolución negativa en corte, #7 tipo de cancelación, #8 mejora visual de cards + verificaciones pendientes.
- **Estado del import Vercel (confirmado vía API):** POS ✅ importado (`pasteleria-confetti`, auto-deploy de `migracion/supabase` → preview READY, `live:false`); Web ❌ sin proyecto Vercel (crear aparte). Falta confirmar env vars Supabase en ambos.
- **Cutover de Base44: PENDIENTE** (Abel se instala el lunes). **Imágenes `media.base44.com`: se mantienen** (al independizar, recrear/descargar idénticas; nunca quitarlas).
- `NEXT_STEPS.md` y `PROJECT_CONTEXT.md` actualizados con este estado.

## Sesión 2026-06-26 — Fases 0–4 (núcleo)

### Fase 0 — Reconocimiento + andamiaje (COMPLETA, auditada)
- Lectura de 8 MDs + 2 auditorías ZIP. Confirmada Opción A, matemática del dinero, 3 candados.
- Verificado líneas reales en `Caja.jsx`: corte lee `pagada` (193), fallback venta↔corte (220-246, 1441-1461), efectivo esperado (1350/1430), `handleBuscarFolioWeb` (679).
- Repo `M1gu3hb/Pasteleria-Confetti` (privado, existía vacío); push de `main` (baseline export Base44 con api_key REDACTADA) + rama `migracion/supabase`.
- Vercel team `MH Astral Systems`; Supabase staging `ivqcxdpqxwjxfohiswqb`.

### Fase 1 — Esquema unificado (COMPLETA, aplicada, auditada)
- Migración `esquema_unificado` (repo 0001): 12 tablas (lista verde), tipos uuid/numeric/timestamptz, `tipo_pedido` explícito, NOT NULL de pastel relajados (kilos default 0, fecha_entrega nullable), `created_at default now()`, vistas `catalogo_publico`/`config_publica` (sin costo), RLS anon restrictiva + RLS POS amplia temporal, `siguiente_folio` (folios atómicos por tipo+sucursal).
- Hardening (0002 grants anon mínimos, 0003 execute siguiente_folio solo authenticated, 0004 revoke execute rls_auto_enable de anon).
- Adversarial anon: anon no lee ventas/cortes; anon insert pedido estado='pagada' falla; web/pendiente pasa; catalogo_publico sin costo. Folios: PP-A-0001, CONF-A-V1, CONF-A-C001, sin colisión.

### Fase 2 — Seed maestros + port capa de datos + smoke (COMPLETA, auditada)
- PASO A seed (repo 0005 ajustes schema, 0006 seed): 3 sucursales, 8 categorías, 20 productos (incl 3 "prueba"), 33 usuarios (6 dueño/12 admin/15 caja), 1 config. 0 FK huérfanas. Correcciones vs datos vivos: rol `dueño` al CHECK; `pin` interino; `hora_inicio_dia_operativo`; campos reales de config; google_maps_url/whatsapp_numero en sucursales. 0007: extras/rellenos/precio_por_sucursal a `text` (JSON string). 0008: bucket Storage `uploads`. 0009: actor-ids a `text` (centinela 'empleado_terminal').
- PASO B port: `supabaseClient.js`, `entitiesAdapter.js`, `base44Client.js` (shim), `AuthContext` simplificado, `vite.config` sin plugin Base44, `package.json` (+supabase-js, −@base44/* −@stripe −react-leaflet −three). Eliminado `posApiClient.js` + todas sus llamadas; `app-params.js`. Descartada plantilla roja (9 páginas + componentes); 5 stubs no-op para componentes apagados que importan archivos de dinero. CANDADO 3 corregido. Build verde.
- PASO C smoke (preview local): app boota, sesión, marca real, 3 sucursales, terminal, login empleado, Caja, abrir caja (write+folio CONF-A-C003), POS catálogo, carrito, venta (CONF-A-V2 + detalle con snapshot). Bug hallado y corregido: actor-ids uuid→text (0009).
- Vercel deploy NO automatizable (sin CLI ni git-link) → pendiente import de Miguel.

### Fase 3 — Validación aritmética del dinero (COMPLETA, auditada) + PASO 0 gate
- Harness determinista (importa la función REAL `desgloseMetodosPagoExacto` + lógica VERBATIM): 27/27 OK. 7 casos (métodos+mixto, cancel/devolución fuera, abono→venta paralela, entregar saldo=0, cierre, frontera día, fallback).
- Hallazgos: (1) frontera del día = **medianoche México** no 6am (06:00 es de plantilla QR); (2) `propinas_activas` no migrado → tipsEnabled default-on → corregido (0010 false). 0011 sonidos_activos.
- **PASO 0 gate (post-auditoría):** doble conteo de `efectivo_esperado` con abono efectivo **verificado contra 18/20 cortes REALES de Base44** = quirk de Base44 → reproducido idéntico (CANDADO), bug fuera de alcance. Barrido de feature-flags: solo propinas divergía. `hora_inicio_dia_operativo` fuera de rutas de dinero.

### Fase 4 — Auth + RLS (DB+RLS HECHA y PROBADA; wiring UI PENDIENTE)
- 33 `auth.users` por operador (email `<id>@pos.confetti.local`, password `POS-<pin>`, GoTrue hashea); `auth_user_id` + `pin_hash` en usuarios_pos; **PIN plano eliminado** (0013).
- RLS scoped por rol/sucursal (0012): helpers `pos_sucursal()`/`pos_is_admin()`; dueño/admin todo, caja solo su sucursal (ventas/cortes/abonos/pedidos/gastos/detalle). Maestros broad. Vista `usuarios_login` (anon, sin pin_hash). RPC `login_pos(pin)` (0014).
- **Adversarial 17/17 PASS:** anon bloqueado; caja A no ve B; caja B solo B; dueño ve todo; 7 casos de dinero IDÉNTICOS bajo RLS estricta.
- **PENDIENTE:** wiring de la UI de auth (6 archivos) → la app no loguea por UI. Decisión de modo empleado pendiente de Miguel.

## Sesión 2026-06-26 (cont.) — Fase 4: WIRING UI de auth (HECHO; pendiente de firma de Miguel)

Decisión de Miguel: **Opción A** (cuenta terminal por sucursal) con el modelo exacto:
terminal=localStorage; empleado sin PIN sobre la sesión terminal (scoped); administrador=PIN
que **desbloquea UI sobre la sesión terminal** (mismo alcance de sucursal); dueño=PIN que abre
**sesión global**. Trabajo en clon fresco estable `C:\Pasteleria Confetti\pos` (el scratchpad viejo
era temporal). GitHub = fuente de verdad.

### Mapeo sesión→RLS (el diseño nuevo; Base44 no tenía RLS)
- **Sesión terminal** (3 cuentas `caja`, 1 por sucursal, `pin_hash` null) → `pos_is_admin=false`,
  scoped a su sucursal. Empleado y administrador-de-esa-sucursal operan sobre ella.
- **Administrador** = `validarPin` (RPC `login_pos`, **sin** `signInWithPassword`) → desbloqueo de UI.
  Se exige que su `sucursal_id == terminal` (admin de otra sucursal NO eleva).
- **Dueño** = `loginConPin` (`login_pos` + `signInWithPassword`) → sesión global (`pos_is_admin=true`).
  Al salir, se restaura la sesión terminal (`loginTerminal`).

### Archivos wireados (solo capa auth/sesión; CANDADOS 1/2/3 y matemática intactos)
- `src/api/supabaseClient.js`: `ensureSession()` reescrito (bootstrap de sesión TERMINAL desde
  localStorage; ya NO usa la cuenta staging) + `loginTerminal()` / `validarPin()` / `loginConPin()` /
  `logoutOperador()`.
- `src/components/common/TerminalGate.jsx`: `await loginTerminal(sucursal)` antes del auto-login del
  empleado; estado de error si la sesión falla.
- `src/components/common/ModalPinAdmin.jsx`: valida por `validarPin` (login_pos) en vez de `u.pin===`.
- `src/components/common/AccesoDuenoGate.jsx` y `src/pages/ConfigurarTerminal.jsx`: dueño abre sesión
  global (`loginConPin`); corregido bug pre-existente `activarAdmin('dueno')` (string→usuario).
- `src/components/common/Sidebar.jsx`: admin = UI sobre terminal + chequeo de sucursal; dueño = sesión
  global; al salir restaura la terminal. (Quitado import muerto `ROLE_LABELS`.)
- `src/lib/AuthContext.jsx`: comentario; sigue llamando `ensureSession()` (ahora bootstrap terminal).
- `src/pages/POSLogin.jsx` (login standalone, secundario): lista desde vista `usuarios_login` +
  `loginConPin`.
- `src/lib/ConfigContext.jsx` (#7, necesario): fallback a vista `config_publica` (anon) para preservar
  el branding EXACTO en pantallas pre-login sin la sesión staging.
- `src/api/entitiesAdapter.js`: +mapeo `UsuarioLogin→usuarios_login` (lectura; aditivo).

### Backend (migración 0015)
- 3 cuentas TERMINAL: `auth.users` (email `terminal-<sucursalid>@pos.confetti.local`, password fijo
  `POS-TERMINAL-CONFETTI`) + identity + `usuarios_pos` rol caja, `pin_hash` null. Vista `usuarios_login`
  ahora excluye `pin_hash is null` (las terminales no son seleccionables).
- ⚠️ Gotcha resuelto: al insertar `auth.users` a mano, `confirmation_token/recovery_token/email_change/
  email_change_token_new` deben ir `''` (no NULL) o `signInWithPassword` da **500**. La 0015 ya los
  pone en `''`.

### Verificación
- `npm run build` verde. ESLint del set wireado limpio.
- **Smoke UI real (4/4)**, con cuentas de prueba temporales (ya borradas): (1) terminal Xochimilco →
  empleado, ve SOLO Xochimilco, Caja; (2) PIN admin Xochimilco → eleva, sesión sigue terminal, scoped a
  Xochimilco; (3) PIN admin Topilejo en terminal Xochimilco → NO eleva; (4) PIN dueño → sesión global,
  vista general, ve todas; al salir restaura la sesión terminal. Branding pre-login (anon) = Confetti
  vía `config_publica`. 0 errores de consola.
- **Adversarial RLS 25/25** (`scripts/fase4_rls_adversarial.mjs`, guardado en el repo): anon bloqueado
  en dinero; terminal A↔B aislados; WITH CHECK bloquea inserción cruzada (42501); dueño global.
- Datos de prueba limpiados → staging = solo maestros + 3 cuentas terminal (usuarios_pos=36, login=33,
  transaccional=0).

**Fase 4 NO se da por cerrada:** la firma (dinero + aislamiento RLS) la hace Miguel/su arquitecto.

## Sesión 2026-06-26 (cont. 2) — GATE de aislamiento (post-revisión de Miguel)
Miguel aprobó el wiring y pidió cerrar UN hueco + 2 verificaciones antes de firmar. Respuestas: admin=UI ✓, ConfigContext→config_publica ✓, password embebido OK staging / prod por dispositivo (cutover), /login-pos = RETIRAR.

- **GATE-1 — `/login-pos` RETIRADO.** Investigación: el único navigate era `AppLayout.jsx` (fallback que TerminalGate ya intercepta); sin links/botones → NO load-bearing. Acción: quitada la ruta + `import` en App.jsx, quitado el efecto navigate de AppLayout, quitada la entrada en usePageTitle. **Borrados** `POSLogin.jsx` + sus deps exclusivas `LoginBrandColors.jsx` y `ensureDefaultAdmin.js` (huérfanas). Quitado el mapeo `UsuarioLogin` del adapter (sin consumidor; la vista `usuarios_login` se queda). El modelo NO tiene login standalone.
- **GATE-2 — sellado de identidad admin VERIFICADO.** Todas las acciones que sellan actor (`usuario_cajero_id`, `cancelado_por_id`, `registrado_por_id`, `creado_por_id`, `usuario_id`) en Caja.jsx / POS.jsx / CancelarVentaDialog / RegistrarPagoDialog / NuevoPedidoPastel usan `posUser?.id`/`posUser?.nombre`. Al elevar admin, `posUser` = admin real → sella el **admin real** (no el centinela 'Empleado'); en modo empleado sella 'empleado_terminal' (igual que Base44). `productos` no tiene campo de actor (no sella nada). **Sin cambio de lógica.** **Bug corregido:** `_pin` viajaba en el objeto a `login()` → se filtraba a `sessionStorage`. Ahora se separa (`const {_pin, ...limpio}`) en Sidebar/AccesoDuenoGate/ConfigurarTerminal; nunca persiste.
- **GATE-3 — reproducibilidad auth.users (migración 0016).** Los 33 `auth.users` de operadores se habían creado ad-hoc. `0016_provision_auth_operadores` los provisiona idempotentemente por nombre usando los PINs ya sembrados en 0006 (mismo repo), con token-cols en ''. **NO toca filas con `auth_user_id` ya asignado → NO-OP en staging** (verificado: 36 usuarios_pos, 0 auth.users nuevos). Reproduce los operadores en DB fresca/cutover.
- **GATE-4 — adversarial 31/31** (antes 25): +6 casos del hueco resuelto. `login_pos` valida el PIN de un admin de B pero **NO escala** la sesión (sigue terminal A, `pos_is_admin=false`, `pos_sucursal=A`); admin-B sobre terminal A queda **confinado a A** (no ve B ni todas; no escribe en B = 42501). Contraste: dueño SÍ escala (intencional).

Build verde, lint del set limpio, advisors sin novedades. Datos/cuentas de prueba limpiados (transaccional=0, usuarios_pos=36, usuarios_login=33).

### Re-smoke UI del fix `_pin` (sesión cont. 2b — pedido por Miguel antes de firmar)
El strip de `_pin` tocó el flujo de elevación y no se había probado por UI. Re-corrido en el clon (dev server + 3 cuentas de prueba temporales, ya borradas):
- **(1) Empleado Xochimilco:** sesión terminal scoped, ve SOLO Xochimilco; **abrió caja** (`CONF-A-C001`, sucursal A, actor "Empleado") y **vendió** (`CONF-A-V0001`, $35, pagada, ligada al corte, scoped a A). Write real bajo la sesión terminal ✓.
- **(2) Admin Xochimilco (PIN 1111):** eleva; **sesión sigue terminal** (`pos_is_admin=false`, `pos_sucursal=A`); `posUser`=TEST_ADMIN_XOCHI (admin real). **`posUser` SIN `_pin`** (keys: id,email,nombre,rol,sucursal_id,sucursal_nombre,adminRole) ✓.
- **(3) Admin Topilejo (PIN 2222) en terminal Xochimilco:** RECHAZADO (toast "otra sucursal"), sigue empleado ✓.
- **(4) Dueño (PIN 9999):** **SÍ entra tras el strip** (usa `_pin` para `signInWithPassword`) → sesión global (`pos_is_admin=true`, cuenta dueño, no terminal), vista general (Dashboard/Pedidos/Ventas/Web/Config + "Ver otra sucursal"); `posUser`=TEST_DUENO **sin `_pin`**; al **Salir de dueño** RESTAURA la sesión terminal scoped (`pos_is_admin=false`, Xochimilco) ✓.
- 0 errores de consola. Sin cambios de código (el fix ya estaba en commit `0602bca`). Datos/cuentas de prueba limpiados.

## Sesión 2026-06-26 (cont. 3) — FASE 5: Validación de FIDELIDAD (POS migrado vs Base44 vivo)
Comparación SOLO-LECTURA contra Base44 vía su MCP (app `Pasteleria Confetti` `6a28a71350ef872d8486262b`). No es el bot (eso es al final). NO se escribió nada en Base44.

### BLOQUE A — Paridad de datos maestros: **0 diffs**
- **sucursales** 3/3 (A/B/C, activas, orden 1/2/3) idénticas.
- **categorías** 8/8 (7 activas + General inactiva; nombre/orden/activo) idénticas.
- **productos** 20/20 idénticos (nombre, precio_venta, categoria_nombre, visible_en_web, visible_en_pos, activo, sucursal_ids): incl. `prueba 1` web=false y `prueba suscursal` con 1 sucursal (Xochimilco).
- **usuarios** 33/33 idénticos (nombre, rol, sucursal, activo; pin no expuesto): 6 dueño + 12 admin + 15 caja.
- **configuracion_negocio**: todos los campos migrados idénticos — `precio_kilo_global=140`, `ratio_personas_por_kilo=7`, `hora_inicio_dia_operativo=06:00`, `propinas_activas=false`, colores #E8579A/#FFF8F4/#5C2D1E, extras (base50/oblea30/muñeca80/velas25), rellenos (8, precio_kilo 0). (Campos de plantilla restaurante/integraciones/portal_qr NO migrados = subset curado, decisión de migración; no son datos que Confetti use.)

### BLOQUE B — Paridad de pantallas/flujos (vs MD 03): todo presente y conforme
- **POS**: tabs por categoría + bucket "Otros" para huérfanos.
- **Caja**: corte lee solo `Venta estado='pagada'` (L193); cola web `tipo_pedido=productos_catalogo + origen=web + estado=pendiente + sucursal_id` (filtrada por sucursal); buscador de venta por folio; **CANDADO 3** = `handleBuscarFolioWeb` filtra por sucursal del terminal (L685-694).
- **Ventas**: cancelar/devolver vía `CancelarVentaDialog`.
- **Productos**: CRUD directo; **puente Base44 muerto** (sin `posApiClient`/`producto_pos_id`/sync — solo un comentario que lo documenta en `NuevoProductoWebDialog`).
- **PedidosPastel**: `RegistrarPagoDialog` reusado (pastel y catálogo); "Entregado" bloqueado si `saldo_pendiente>0` (`PedidoPastelDetalleDialog`).
- **Dashboard** del dueño presente. (Las 9 páginas de plantilla restaurante se descartaron en Fase 2 — no son de Confetti.)

### BLOQUE C — Spot-check de corte real línea por línea: **14/14 campos idénticos**
Harness `scripts/fase5_corte_fidelity.mjs`: recrea inputs EXACTOS de cortes reales en staging, los lee por la sesión terminal y genera el resumen con la **función real `desgloseMetodosPagoExacto`** + fórmulas verbatim del cierre (Caja.jsx:291-300, 1440), comparando contra los valores ALMACENADOS de Base44.
- **CONF-C-C073** (San Gregorio, 42 ventas pagadas + 4 abonos, **con abono efectivo**): total_efectivo 30333.69, total_tarjeta 20032.46, total_transferencia 4839.6, total_general 55205.75, numero_ventas 42, ticket_promedio 1314.42…, **efectivo_esperado 30743.69** = total_efectivo + abono efectivo (410) → **doble conteo PRESENTE e idéntico en ambos lados**.
- **CONF-A-C03358** (Xochimilco, 48 ventas pagadas + 2 abonos, sin abono efectivo): los 7 campos idénticos; efectivo_esperado 34405.4 (sin doble conteo, correcto).
- total_cancelaciones = 0 en ambos (no se computa en el cierre, igual que Base44). Datos de prueba limpiados (staging solo maestros: usuarios_pos=36, login=33, transaccional=0).

**Resultado Fase 5: el POS migrado cuadra IDÉNTICO a Base44** (maestros, pantallas y dinero del corte, incluido el quirk). Pendiente: revisión de Miguel. No se inicia la Web.

## Sesión 2026-06-27 — WEB-1: fixes de DB para la web pública (migraciones 0017/0018 en la Supabase compartida)
La web (repo aparte `M1gu3hb/Pasteleria-Confetti-web-`) se conecta a ESTA Supabase con anon key (Opción A). WEB-0 detectó 2 GAPs; se resuelven con cambios de **esquema** que viven aquí (fuente única de verdad), NO en el repo web. Decisiones de Miguel.

### 0017 — `web_pedido_folio_trigger` (GAP 1: folio de pedido web)
- Trigger `BEFORE INSERT` en `pedidos`, `WHEN (new.origen='web' AND new.folio IS NULL)`, función `set_web_pedido_folio()` **SECURITY DEFINER** (owned por postgres) → `new.folio := siguiente_folio('pedido_pastel', new.sucursal_id)`.
- `folio` SIGUE NOT NULL; anon SIGUE sin EXECUTE directo sobre `siguiente_folio` (el trigger lo llama como definer). Mismo contador atómico que el POS → sin colisión web↔POS.
- **Verificado:** anon INSERT pedido web sin folio → fila con `PP-A-0001`; con folio provisto → NO se re-folia (`ZZWEB1-PROVIDED`); anon `siguiente_folio` directo → 42501.

### 0018 — `web_uploads_bucket` (GAP 2: imagen de referencia)
- Bucket nuevo `web-uploads` (separado de `uploads` del POS): `public=true` (lectura por URL, **sin** policy SELECT → no listable), `file_size_limit=5MB`, `allowed_mime_types` solo imágenes.
- Policy `web_uploads_anon_insert`: anon INSERT **solo** en `web-uploads`. El bucket `uploads` del POS queda **authenticated-only (intacto)**.
- **Verificado:** anon sube imagen a web-uploads (legible por URL, HTTP 200); anon a `uploads` (POS) → RLS deniega; no-imagen → rechazo por mime; >5MB → rechazo por tamaño.

### Regresión POS (verificada)
anon sigue ciego a ventas/cortes/pedidos; `siguiente_folio` sigue authenticated-only; bucket `uploads` y la generación de folios del POS NO cambian. Harness `scripts/web1_gaps_verify.mjs` (11/11 anon). Datos/archivos/contadores de prueba limpiados (transaccional=0, folio_contador=0, web-uploads vacío).

### Migraciones (repo `supabase/migrations/`)
… · 0015 fase4_cuentas_terminal · 0016 provision_auth_operadores · **0017 web_pedido_folio_trigger** · **0018 web_uploads_bucket**.

## Sesión 2026-06-27 (cierre / handoff) — Fase 5 aprobada; WEB-2 NO iniciado
- **Fase 5 APROBADA por Miguel** (POS fiel a Base44). POS Fases 0-5 completas.
- Se intentó arrancar **WEB-2** (port de la capa de datos de la web) pero se **pausó por ventana de contexto** y el port parcial se **descartó** (la próxima sesión arranca WEB-2 con clon fresco del repo web). Nada de WEB-2 quedó commiteado.
- **Hallazgo nuevo (WEB-2):** la web (anon) hace INSERT en `pedidos` pero **no puede leer de vuelta el folio** (sin SELECT; probado 42501). El pedido SÍ queda con `PP-<prefijo>-####` (trigger 0017). Para mostrarlo en la pantalla Gracias: opción recomendada = RPC `crear_pedido_web(...)` SECURITY DEFINER (migración 0019, repo POS) que devuelva el folio; alternativas = Gracias sin folio, o policy anon SELECT (descartada). **→ RESUELTO en la sesión siguiente (migración 0019); ver abajo.**
- **Imágenes de la web YA re-hospedadas** en `web-uploads/assets/` (8 archivos, mismos nombres; base `…/storage/v1/object/public/web-uploads/assets/`). WEB-2 solo cambia el prefijo de URL, NO re-subir.

### Migraciones aplicadas en staging (repo `supabase/migrations/`)
0001 esquema_unificado · 0002 hardening_anon_grants · 0003 harden_siguiente_folio_execute · 0004 harden_rls_auto_enable_execute · 0005 ajustes_schema_datos_vivos · 0006 seed_datos_maestros · 0007 config_campos_json_string · 0008 storage_bucket_uploads · 0009 actor_ids_a_text · 0010 config_propinas_activas · 0011 config_sonidos_activos · 0012 fase4_rls_por_rol_sucursal · 0013 fase4_drop_pin_plano · 0014 fase4_login_pos_rpc · 0015 fase4_cuentas_terminal · **0016 provision_auth_operadores**.
(Nota: el seeding de `auth.users` por operador se hizo vía SQL directo, no como migración versionada — password derivado `POS-<pin>`; ver `supabase/STAGING_NOTES.md`.)

## Sesión 2026-06-27 (cont.) — WEB-2 sub-paso 1: 0019 RPC `crear_pedido_web` (folio-Gracias RESUELTO)
- **Decisión #22 bloqueada por Miguel (opción 1).** Migración **0019 `web_crear_pedido_rpc`** (este repo POS; el esquema vive solo aquí): función `crear_pedido_web(payload jsonb) → text` **SECURITY DEFINER** (owner postgres, `search_path=public`) que INSERTA el pedido web y **DEVUELVE el folio** en una sola llamada — reproduce el `crearPedidoPOS` de Base44 **sin api_key**. La web pasa de `insert` directo a `rpc('crear_pedido_web', {payload})` (cambio de código del envío, en el repo web, pendiente del port).
- **Candados (idénticos al WITH CHECK de `anon_insert_pedidos`):** fuerza `origen='web'`/`estado='pendiente'` (rechaza otros valores, no los "corrige"); acota `tipo_pedido` a `pastel_personalizado`/`productos_catalogo` (rechazo explícito); **whitelist EXPLÍCITA** de columnas → ignora lo que no exista (`devolver_base`) y los POS-only (`folio`, financieros `total_abonado`/`saldo_pendiente`, fechas de ciclo, `creado_por_*`); valida requeridos (cliente_nombre, cliente_telefono, fecha_entrega, sucursal_id) + **sucursal existente y activa**. Folio: **reutiliza el trigger 0017** (insert con `folio` NULL + `RETURNING folio`) → un solo generador, sin duplicar lógica. anon recibe **solo EXECUTE**, sin SELECT extra (FORCE RLS off + owner postgres ⇒ la función es la superficie controlada).
- **Verificado en la Supabase compartida (como rol anon):**
  - (a) RPC pastel válido → folio `PP-A-0001` + fila `origen='web'/estado='pendiente'`, `cliente_nombre` recortado; inyección `folio:"HACK-999"`/`total_abonado:999`/`devolver_base` **ignorada**.
  - (d) RPC catálogo → folio `PP-B-0001`, `kilos=0`, productos como texto en `notas_generales`.
  - (b) anon `SELECT … FROM pedidos` directo → **42501 permission denied** (sigue ciega).
  - (c) rechazos: falta `cliente_telefono` / `estado='pagada'` / `origen='pos_interno'` → excepción clara.
  - Limpieza: filas y contador de prueba borrados → **transaccional=0, folio_contador=0**.
- **0020 `web_crear_pedido_rpc_harden`** (hardening detectado en la verificación): Supabase otorga EXECUTE a `authenticated` por default al crear funciones → `authenticated` quedaba pudiendo ejecutar la RPC (un `caja` podría crear un pedido web/pendiente para CUALQUIER sucursal vía la función DEFINER, saltándose `pos_sucursal()`). `revoke execute … from authenticated` → la RPC queda **solo anon** (= la única superficie de escritura nueva, como pidió Miguel). Patrón igual a 0003/0004. Verificado: `anon EXECUTE=true / authenticated=false / public=false`; anon sigue creando el pedido; authenticated → 42501 permission denied for function. El POS escribe `pedidos` por INSERT directo (RLS scoped), NO por esta función.
- **Regresión POS:** ningún candado/dinero tocado; 0019/0020 solo AÑADEN una función + endurecen su grant (no alteran tablas, RLS ni folios del POS). Único cambio de esquema permitido en WEB-2.
- **DETENIDO** para auditoría de Miguel antes de seguir con WEB-2 (cliente anon + adaptador → matar puente/auth → port de call-sites con NOMBRE→ID → build+smoke).

### Migraciones aplicadas en staging (actualizado)
… · 0016 provision_auth_operadores · 0017 web_pedido_folio_trigger · 0018 web_uploads_bucket · **0019 web_crear_pedido_rpc** · **0020 web_crear_pedido_rpc_harden**.

## Sesión 2026-06-27 (cont. 3) — WEB-2 cerrado: 0021 sello creador + flags de cutover
- **0021 `web_crear_pedido_rpc_sello_creador`** (raíz del Flag 2 del port web): `create or replace` de `crear_pedido_web` que **SELLA `creado_por_nombre='Web Confetti'`** como constante server-side (igual que `origen='web'`; NO se lee del payload → no inyectable). Restaura la fidelidad con Base44: el pedido web nacía con ese sello y el POS lo usa para distinguir los pedidos que entraron por la web. Resto del cuerpo idéntico (candados origen/estado/tipo_pedido, whitelist, requeridos + sucursal activa, folio vía trigger 0017). `create or replace` preserva los grants de 0020 (anon-only); se reafirman en la migración.
- **Verificado (anon):** RPC válido con `creado_por_nombre:"HACKER INYECTADO"` y `creado_por_id:"hacker-id"` en el payload → la fila queda con `creado_por_nombre='Web Confetti'` y `creado_por_id=null` (ambos ignorados); folio del trigger sale (`PP-A-0001`); privilegios `anon=true / authenticated=false / public=false`. Limpieza: transaccional=0, folio_contador=0.
- **Flag 1 (fotos de catálogo en `media.base44.com`) — documentado como BLOQUEANTE DE CUTOVER** (NEXT_STEPS + BUGS_PENDING): las imágenes de producto vienen de `productos.imagen_url` (dato del POS), cargan por el CDN de Base44; antes de apagar Base44 hay que re-hospedarlas en Storage y actualizar `productos.imagen_url`. NO ejecutado (decisión de timing de Miguel).
- **Flag 3 (imagen de prueba residual):** 1 objeto de prueba (93 B) en `web-uploads/pedidos/db92b1c3-…png` del smoke del port; no se pudo borrar sin `service_role` ni Storage API (el trigger de Supabase bloquea el delete por SQL; no se tocó RLS). Anotado para borrado por dashboard.

### Migraciones aplicadas en staging (actualizado)
… · 0019 web_crear_pedido_rpc · 0020 web_crear_pedido_rpc_harden · **0021 web_crear_pedido_rpc_sello_creador**.

## Sesión 2026-06-27 (cont. 4) — WEB-3: validación end-to-end POS↔web (sin cambios de esquema)
Validación de FLUJO CRUZADO sobre el Supabase compartido (solo lectura + datos de prueba; sin tocar esquema/código POS). Demuestra que el puente Base44 colapsó. Detalle completo en el repo web (`docs/CHANGELOG.md` 2026-06-27 cont. 3).
- **FLUJO 1 (pedido web → POS):** pedidos web de Topilejo (pastel `PP-B-0001` + catálogo `PP-B-0002`) **visibles y fieles** en el POS como terminal Topilejo: PedidosPastel con badge **🌐 WEB**, detalle completo, imagen de referencia desde `web-uploads`, **"Creado por Web Confetti"** (el sello 0021, visible como la señal que Abel usa); catálogo en la cola web de Caja con kilos=0 + productos en texto. **Aislamiento RLS por sucursal verificado:** la terminal Xochimilco ve **0** pedidos de Topilejo.
- **FLUJO 2 (producto POS → catálogo web):** edición de `Cheesecake` (nombre/precio) reflejada **de inmediato** en el catálogo web (misma fila vía `catalogo_publico`, sin sync); `visible_en_web` toggle funciona; la vista no expone costo/margen. Restaurado a originales.
- **Regresión:** ningún cambio de esquema/código POS. Limpieza: transaccional=0, folio_contador=0; maestros intactos (productos 20, sucursales 3). Residual: 2 imágenes de prueba en `web-uploads/pedidos/` (ver BUGS_PENDING (h)).
- **Sin diffs vs Base44** en el flujo cruzado. POS+Web listos para la auditoría de Miguel antes del bot de pruebas agresivas.

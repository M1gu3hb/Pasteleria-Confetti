# BUGS_PENDING / riesgos conocidos

## (i) ✅ RESUELTO (FASE 3 A) — Venta paralela de ANTICIPO sin `DetalleVenta` (`producto_id: ''` en `uuid NOT NULL`)
- **Qué fue:** `RegistrarPagoDialog.jsx` (y `Caja.handleCobrarPedidoWeb`/`CobrarPedidoWebDialog`) creaban el `DetalleVenta` de la venta paralela con `producto_id: ''` y la columna `detalle_venta.producto_id` es `uuid NOT NULL` → `invalid input syntax for type uuid: ""` → la línea NO se creaba (el dinero entraba al corte pero la línea no salía en el ticket/PDF). Afectaba TODO anticipo (POS+web). Destapado al hacer cobrables los pedidos web (FASE 3 #1).
- **Resolución (Opción A de Miguel):** migración **0023** `detalle_venta_producto_id_nullable` (producto_id → `uuid NULL`; sin FK, datos existentes intactos) + las dos creaciones de línea ahora usan `producto_id: null` con concepto en `producto_nombre` (`Anticipo pedido [folio]` en RegistrarPagoDialog; nombre del producto parseado en handleCobrarPedidoWeb). Modelo ya snapshot-first (el ticket/corte usan `producto_nombre`, no lookup). Consumidores verificados que toleran null: `CorteTicket.jsx:52` (key `producto_id || producto_nombre`), joins de receta (no machean → costo 0), `DescuentoInventarioVenta` (no mapeado). Ventas de mostrador normales (con producto_id real) intactas.
- **Verificado en vivo (FASE 3 B/C):** anticipo a pedido web → SIN error de uuid; `DetalleVenta` creado con `producto_id=null` + `Anticipo pedido PP-B-0001` $150; **la línea aparece en el PDF del corte** (`CONF-B-V0001 · 21:31 · Anticipo pedido PP-B-0001 ×1 · $150.00 · Efectivo`); el dinero entra al corte (Resumen $150) y al dashboard (Ventas hoy, con corte abierto).

## (j) ⚠️ Pedido de CATÁLOGO `con_anticipo` desaparece de la cola de Caja (gap de #2, encontrado en FASE 3 C)
- **Qué:** los pedidos web de **catálogo** (`tipo_pedido='productos_catalogo'`) NO viven en la página "Pedidos de Pastel" (esa excluye catálogo); solo aparecen en la cola **Caja → Pedidos**, que filtra a `estado='pendiente'`. Tras el PRIMER anticipo el pedido pasa a `con_anticipo` y **sale de la cola**. La búsqueda "Buscar pedido web por folio" tampoco lo trajo en la prueba (posible interferencia de un diálogo; a confirmar).
- **Efecto:** un pedido de catálogo parcialmente abonado es difícil de re-encontrar en el POS para un 2º anticipo, la liquidación o la entrega. El **pastel personalizado NO tiene este problema** (vive en "Pedidos de Pastel" con todos los estados activos) → no funciona "igual que pastel".
- **Acción:** pertenece al alcance de **#2** (que el catálogo funcione igual que el pastel). Decidir con Miguel: que la cola de Caja muestre también `con_anticipo` (no solo pendiente), y/o que el buscador encuentre catálogo en cualquier estado activo. NO tocado aún.

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

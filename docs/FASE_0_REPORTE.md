# Fase 0 — Reporte de comprensión (POS Pastelería Confetti)

> Migración Base44 → Vercel + Supabase, **Opción A** (DB compartida + RLS).
> Este documento es la mitad escrita de la Fase 0. La otra mitad (esquema SQL
> propuesto) vive en `supabase/migrations/0001_esquema_unificado.sql`.

---

## (a) Conexión POS↔Web y por qué el puente desaparece en Opción A

Hoy son **dos apps Base44 con dos bases separadas**, puenteadas por **REST +
api_key compartida** (`847df4…`), en dos sentidos:

- **POS → Web (productos, one-way):** al crear/editar/renombrar/borrar un producto
  visible, el POS empuja una *copia* a la web emparejando por **`producto_pos_id`**
  (no por nombre), con borrado en cascada. Todo en `src/utils/posApiClient.js`.
- **Web → POS (pedidos):** la web crea `PedidoPastel` (`origen='web'`,
  `estado='pendiente'`) vía la función Deno `crearPedidoPOS`. Ese código vive en
  la **web**, no en el ZIP del POS; el POS solo **lee** esos pedidos.

**En Opción A el puente entero colapsa.** Lo que se elimina:

| Se elimina | Por qué |
|---|---|
| `src/utils/posApiClient.js` completo (sin stubs) | Ya no hay app a la cual empujar |
| `producto_pos_id` | Un solo `id` de producto (tabla `productos` compartida) |
| `folio_pedido` (web) vs `folio` (POS) | Se unifica a un solo `folio` |
| Traducción nombre↔ID de sucursal (`sucursales_disponibles` ↔ `sucursal_ids`) | Un solo set de IDs; disponibilidad por `sucursal_ids` (uuid[]) |
| api_key embebida en el front | La web usa **anon key + RLS**; nada privilegiado en cliente |
| `crearPedidoPOS` / sync de productos / cascade cross-app | La web hace `SELECT` sobre la vista `catalogo_publico` e `INSERT` en `pedidos` |

El POS **ya queda "conectado"**: conservo su lectura de
`pedidos WHERE origen='web' AND estado='pendiente'` (cola en Caja + buscador por
folio). Cuando exista la web, esos pedidos aparecen como filas nuevas en la misma
tabla. No construyo la web en esta migración; solo dejo lista la vista + RLS anon.

---

## (b) Matemática del dinero

- **El corte lee SOLO `Venta` con `estado='pagada'`** (`Caja.jsx` L193:
  `base44.entities.Venta.filter({ estado: 'pagada' })`). Consecuencia: **cancelar
  o devolver excluye del corte y del dashboard por construcción** — no se resta nada.
- **Abono** (`RegistrarPagoDialog`): crea un **`Abono`** sellado con la sucursal
  **del pedido**, **y** una **`Venta` paralela** `estado='pagada'` con
  `corte_caja_id = cajaAbierta.id` (sucursal **del terminal**). Recalcula
  `total_abonado` y `saldo_pendiente = total_final − total_abonado`. Por
  construcción la sucursal del pedido y la del terminal coinciden (la cola filtra
  por sucursal del terminal) — salvo el hueco del buscador por folio (CANDADO 3).
- **Entregar** un pedido exige `saldo_pendiente === 0`.
- **Cancelar/devolver NUNCA borra:** `estado='cancelada'` + `tipo_cancelacion`
  (`cancelacion` | `devolucion`) + `monto_devuelto` + sellos `cancelado_por_*`.
  Un corte cerrado es snapshot inmutable.
- **Efectivo esperado** = `total_efectivo + abonosEfectivo` (`Caja.jsx` L1350 y L1430).
- **Cargas por lotes `$in`** para `DetalleVenta` (nunca un query por venta).

### Cómo voy a reproducir 🔒 CANDADO 1 (fallback venta↔corte) — IDÉNTICO

El código (verificado, `Caja.jsx`):
- **L220–246 (armado del resumen):** una venta pertenece al corte abierto si
  `v.corte_caja_id === cajaAbierta.id` (**L242**) **O**, si **no** tiene
  `corte_caja_id`, si `v.fecha_cierre` existe, es de la misma sucursal
  (`mismaSucursal(v)`) y `new Date(v.fecha_cierre).getTime() >= apertura` (**L245–246**).
- **L1441–1450 (al cerrar):** asocia las ventas sueltas `pagada` posteriores a la
  apertura sin `corte_caja_id` y de la misma sucursal, haciendo
  `Venta.update(v.id, { corte_caja_id: corteId })` (**L1446–1450**).

**Plan:** porto ese predicado **byte a byte** en el cliente. Lo único que cambia
es la fuente de datos (filas Supabase con los **mismos nombres snake_case** en
vez de Base44): `Venta.filter({estado:'pagada'})` → `.eq('estado','pagada')`. La
comparación en memoria (`>= apertura`, `mismaSucursal`, los `||` del fallback) no
se toca, no se "optimiza". Lo verifico con `git diff` de la función contra el
baseline y con el bot en Fase 5.

### Cómo voy a reproducir 🔒 CANDADO 2 (TZ CDMX del día operativo) — IDÉNTICO

El "día" del corte se calcula **en cliente**. Riesgo: si lo calculo distinto, una
venta de las 11pm CDMX se va al día siguiente y el corte no cuadra.
**Plan:**
1. Guardar todos los timestamps como `timestamptz` (UTC) en Postgres.
2. Localizar en Fase 2 la lógica TZ exacta (helper de fecha / inline en Caja) y
   **copiarla verbatim** (misma conversión a `America/Mexico_City`, misma frontera
   de día).
3. Validar con el caso "venta 23:00 CDMX cae en el día operativo correcto" en Fase 3
   y contra Base44 con el bot en Fase 5.

---

## (c) Los tres candados (en mis palabras)

- 🔒 **CANDADO 1 — fallback venta↔corte: IDÉNTICO, bit a bit.** La asociación por
  `corte_caja_id` con fallback por `fecha_cierre` + misma sucursal se copia tal
  cual. Prohibido mejorarla u optimizarla. Es frágil a propósito y así debe quedar.
- 🔒 **CANDADO 2 — TZ CDMX del día operativo: IDÉNTICA.** Misma zona horaria y misma
  lógica de frontera de día que el original, para que los cortes caigan igual.
- 🔒 **CANDADO 3 — `handleBuscarFolioWeb`: el ÚNICO que SÍ se corrige.** Hoy el
  cobro por folio (`Caja.jsx` L679) **no filtra por sucursal**, así un operativo
  podría cobrar un pedido de otra sucursal y el dinero caería en la caja
  equivocada. Al migrar, limito el cobro a la sucursal del terminal; si el folio
  es de otra sucursal, no permito cobrar y aviso. Todo lo demás idéntico; esto,
  arreglado.

---

## Inventario verde / roja (confirmado contra la auditoría)

ZIP POS: **341 archivos, 32 entidades declaradas, 5 funciones Deno** ✓.

**✅ MIGRAR (verde, 12 tablas):** `sucursales`, `usuarios_pos`,
`configuracion_negocio` (subconjunto), `productos` (ex ProductoTerminado),
`categorias_producto`, `ventas`, `detalle_venta`, `cortes_caja`, `pedidos`
(ex PedidoPastel), `abonos`, `folio_contador`, `gastos_operativos`.
→ **`clientes` NO se crea**: 0 referencias en `src` (audit); `cliente_*` vive
inline en ventas/pedidos.

**❌ DESCARTAR (roja, 19):** `CategoriaIngrediente`, `CompraInsumo`,
`DescuentoInventarioVenta`, `DetalleCompra`, `EstacionPreparacion`, `Ingrediente`,
`IntegrationSyncLog`, `LiquidacionPropina`, `MenuQRSeccion`, `Mesa`,
`MovimientoInventario`, `PedidoPastelItem`, `PedidoPreparacion`, `PlantillaCompra`,
`PlantillaGasto`, `Proveedor`, `RecetaEscandallo`, `SolicitudQR`, `User` (built-in).
→ 12 verde + 19 roja = **31** entidades de negocio + `Cliente` (verde-opcional
descartada) = 32 declaradas. ✓

**Funciones Deno (5):** `eliminarMesasDemo`, `limpiarHistorialSeccion`,
`limpiarVentas`, `reiniciarSistema`, `seedRecetasDemo`. Todas mantenimiento/reset.
`seedRecetasDemo` = basura. Prioridad baja; se reconstruyen como SQL admin-only /
Edge Function si se conservan (Fase 2, no llamando a Base44).

---

## Mapa de dónde vive cada cálculo de dinero (líneas verificadas en el código real)

`Caja.jsx` extraído = **2249 líneas** (la auditoría citaba ~2353; las refs caen
dentro y coinciden).

| Cálculo / lógica | Archivo | Línea (verificada) | Candado |
|---|---|---|---|
| Corte lee **solo `pagada`** | `Caja.jsx` | **193** | — |
| Asociación venta↔corte (lectura, con fallback) | `Caja.jsx` | **220–246** (núcleo **242**, fallback **245–246**) | 🔒 1 |
| Asociación venta↔corte al cerrar | `Caja.jsx` | **1441–1450** (**1446–1447**) | 🔒 1 |
| **Efectivo esperado** = `totalEfectivo + abonosEfectivo` | `Caja.jsx` | **1350** y **1430** | — |
| Abono → **Venta paralela** `pagada` + `corte_caja_id` | `Caja.jsx` | **601, 611–612** | — |
| **Buscador por folio sin filtro de sucursal** (corregir) | `Caja.jsx` | **679** (UI **1807/1812**) | 🔒 3 |
| TZ día operativo | a localizar en Fase 2 (util de fecha / inline) | — | 🔒 2 |
| Folios no atómicos (read-increment-write) | `src/utils/pedidoPastelUtils.js` | — | — |
| api_key del puente (borrar archivo) | `src/utils/posApiClient.js` | L18–19, L30 | — |
| PIN en texto plano (`u.pin === pin`) | `src/pages/POSLogin.jsx` | — | (Fase 4) |

---

## Decisiones del SQL propuesto (resumen — detalle en el `.sql`)

1. **snake_case, uuid PK** (`gen_random_uuid()`), `created_at timestamptz default now()`.
2. **`tipo_pedido` columna explícita** en `pedidos` (estaba en datos, no en schema).
3. **NOT NULL de pastel relajados para catálogo:** `kilos numeric not null default 0`,
   `fecha_entrega date` **nullable**.
4. **Folios atómicos:** función `siguiente_folio(tipo, sucursal)` con
   `UPDATE … RETURNING` (lock de fila) por `(tipo, sucursal_id)` — elimina la
   condición de carrera. Devuelve el folio formateado (PP-A-0001 / CONF-A-V#### / CONF-A-C###).
5. **"enums" como text + CHECK** (no ENUM nativo) para evolucionar estados sin ALTER TYPE.
6. **Snapshots:** `detalle_venta.producto_id` **sin FK** (el histórico sobrevive al
   hard-delete del producto); `producto_nombre` / `precio_unitario_snapshot` congelados.
7. **Vista `catalogo_publico`** (security_invoker=false): solo columnas seguras del
   catálogo visible; **nunca costo/margen** (la tabla `productos` ni siquiera tiene
   columna de costo). Vista `config_publica` para marca/precio de pastel (sin
   `presentacion_password` ni jsonb internos).
8. **RLS:**
   - **anon:** `SELECT` solo en vistas (catálogo/config) + `sucursales`/`categorias`
     activas; `INSERT` en `pedidos` con `WITH CHECK (origen='web' AND estado='pendiente')`;
     **cero** acceso a ventas/cortes/abonos/detalle/usuarios (RLS default-deny +
     REVOKE explícito).
   - **authenticated (POS):** amplio y **temporal** (Fase 4 lo restringe por rol/sucursal).
9. **`clientes` no se crea** (0 refs).

> Pendiente de confirmar en Fase 2 contra datos vivos: set exacto de campos de
> `configuracion_negocio`, valores de `gastos_operativos.categoria`, y los valores
> de `folio_contador.tipo` (venta/corte/pedido_pastel).

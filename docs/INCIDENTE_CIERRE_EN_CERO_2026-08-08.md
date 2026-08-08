# Incidente — el cierre de caja guardaba TODO EN CERO

**Detectado:** 2026-08-08 · **Primer corte afectado:** 2026-07-30 · **Cortes en cero:** 10 · **Importe no reflejado:** 79,530

## Qué pasaba

`Caja.jsx` calculaba el resumen del corte sobre esta consulta:

```js
base44.entities.Venta.filter({ estado: 'pagada' })   // sin límite, sin orden, sin filtro por corte
```

PostgREST **corta la respuesta en 1,000 filas**. Al no haber `ORDER BY`, devolvía las 1,000
**más antiguas**. Cuando Xochimilco superó las 1,000 ventas pagadas —el **2026-07-30 01:08:55**—
las ventas del día dejaron de venir en la respuesta. El memo del resumen no encontraba ninguna
venta del corte, daba 0, y el cierre **guardaba esos ceros**.

Reproducido en vivo sobre el último corte roto (`CONF-A-C041`):

| Consulta | Filas devueltas | Ventas del corte halladas | Suma |
|---|---|---|---|
| La que rompió | 1000 (`content-range: 0-999/1290`) | **0** | **0** |
| La nueva, acotada al corte | 4 | 4 | **140** ✓ |

La última venta que devolvía la consulta vieja era de `2026-07-30T01:08:55` — el instante exacto del cruce.

## Segundo camino al mismo fallo

`CONF-C-C035` (San Gregorio) también quedó en 0 aunque su consulta **no** estaba truncada (477/477).
La causa de fondo es la misma línea:

```js
const safeVentas = Array.isArray(ventasHoy) ? ventasHoy : [];
```

Convierte en `[]` cualquier caso en que la lista no esté disponible, **sin distinguir "no hay ventas"
de "todavía no cargó" o "falló"**. Con `[]` el resumen da 0 y el cierre lo escribe. Firma del daño:
todo lo *calculado* en 0 (`total_general`, `total_gastos`, `efectivo_esperado`) y todo lo *tecleado*
intacto (`dinero_dejado_en_caja` = 1350).

## Qué NO fue

- **No fue causado por los cambios de esta auditoría.** El primer corte roto es del **2026-07-30**;
  la primera migración se aplicó el **2026-08-01**. Además los cambios de frontend viven en la rama
  de trabajo, que sólo despliega como *preview*; producción sigue en `migracion/supabase`.
- **No se perdió ninguna venta.** Las 2,314 ventas pagadas están íntegras y **todas** ligadas a su
  corte (0 huérfanas). Sólo los agregados de `cortes_caja` estaban mal.

## Arreglo

**`src/lib/ventasCorte.js` (nuevo)** — `fetchVentasDelCorte(corte)`: filtra en PostgreSQL por el
corte (`corte_caja_id = X` ó el fallback de ventas en tránsito), con paginación explícita. La
truncación deja de ser posible por construcción. La lógica de reparto venta↔corte (CANDADO 1) **no
se tocó**: sólo recibe los datos correctos.

**Guarda anti-ceros en `handleCerrarCaja`** — antes de escribir, contrasta contra el **servidor**
(`contarVentasDelCorte`). Si el servidor reporta ventas y el resumen calculó 0, **aborta el cierre**
con un mensaje claro en vez de guardar ceros. También bloquea si la consulta aún no cargó.

## Reparación de datos

- **0056** — respaldo íntegro de las 10 filas afectadas.
- **0057** — recálculo desde las ventas reales.

Fórmulas replicadas de `Caja.jsx` + `tipsUtils.js` + `efectivoEsperado.js`. `ventas` no tiene
columnas de propina ni de costo, así que esos términos valen 0 en la app.

**Validación previa obligatoria antes de tocar dinero:**
- **90/92** cortes sanos se reproducen EXACTAMENTE con estas fórmulas (tarjeta y gastos: 92/92).
- Los 2 restantes (`CONF-C-C002`, `CONF-A-C032`) son descuadres **previos** y ajenos; **no se tocaron**.
- **82/82** cortes con conteo confirman `diferencia_efectivo = efectivo_contado − efectivo_esperado`.

No se modificó nada tecleado por el personal (`efectivo_contado`, `dinero_dejado_en_caja`, `notas`),
ni ninguna venta.

| Corte | Día | Antes | Después |
|---|---|---|---|
| CONF-A-C033 | 30-jul | 0 | 7,725 |
| CONF-A-C034 | 31-jul | 0 | 5,690 |
| CONF-A-C035 | 01-ago | 0 | 13,370 |
| CONF-A-C036 | 02-ago | 0 | 10,610 |
| CONF-A-C037 | 03-ago | 0 | 8,720 |
| CONF-A-C038 | 04-ago | 0 | 21,240 |
| CONF-A-C039 | 06-ago | 0 | 4,605 |
| CONF-A-C040 | 07-ago | 0 | 5,320 |
| CONF-C-C035 | 07-ago | 0 | 2,110 |
| CONF-A-C041 | 08-ago | 0 | 140 |

Verificado tras aplicar: `total_general` = suma real de ventas en los 10. Cero cortes con el defecto.

**Rollback:** `update cortes_caja c set ... from app_private.cortes_backup_20260808 b where b.id=c.id;`

## Riesgo abierto

El arreglo de código está en la rama de trabajo, **no en producción**. Hasta desplegarlo, cualquier
cierre en **Xochimilco** volverá a dar 0 (su consulta sigue truncada hoy). El recálculo de datos sí
está aplicado.

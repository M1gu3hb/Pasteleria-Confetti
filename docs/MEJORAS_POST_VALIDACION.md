# MEJORAS POST-VALIDACIÓN — Pastelería Confetti

> Fase que arranca **después** de la validación. El sistema migrado ya es FIEL a lo que Abel usaba en
> Base44 (POS + Web independientes, validados, y respaldados por 60 días de bot). Estas son las mejoras
> que **quedaron pendientes en Base44 por falta de créditos** y ahora SÍ se hacen, **en orden**.
> Última actualización: 2026-06-27.

---

## ESTADO ACTUAL (registro claro)
- **POS y Web MIGRADOS** de Base44 a **Supabase + Vercel**, independientes, y **VALIDADOS al 100% como estaban en Base44** (Fases 0-5 del POS firmadas + WEB-0..3 + flujo cruzado).
- **Pruebas largas de bot (60 días) COMPLETAS:** 60/60 días limpios · cuadres corte↔libro **180/180** (con doble conteo) · folios **180/180** sin colisión bajo concurrencia · pedidos web **30/30** a la sucursal correcta · RLS **18/18** sin fugas · **0 bugs reales**. Evidencia en `Bot pruebas/bot-pruebas/reportes/run60/RESUMEN_EJECUTIVO_60_DIAS.md`.
- **El sistema está LISTO PARA PRODUCCIÓN en lo que Abel YA usaba.**
- **El CUTOVER a producción NO se ha hecho.** Abel se instala el **LUNES**. Hasta entonces sigue operando en **Base44**.
- **IMÁGENES (`media.base44.com`): NO migrar/quitar todavía.** Se mantienen para mostrarle a Abel el sistema con contenido. Cuando se independice, la preferencia de Miguel es **RECREAR/descargar las MISMAS imágenes** (recortar de Base44 o regenerar idénticas con Gemini), **NUNCA quitarlas ni cambiarlas**. **El cutover de imágenes NO es ahora.**

---

## LISTA DE MEJORAS (EN ORDEN)

### 1. ✅ HECHO — Vercel (POS y Web) en producción
Completado por Miguel en su panel (equipo *MH Astral Systems* / `huertabautistamiguel62@gmail.com`):
- **POS `pasteleria-confetti`:** env vars `VITE_SUPABASE_URL`+`VITE_SUPABASE_ANON_KEY` añadidas, **Production Branch → `migracion/supabase`**, producción promovida. Verificado en vivo: carga y conecta (muestra las 3 sucursales reales).
- **Web:** proyecto **NUEVO** importado de `M1gu3hb/Pasteleria-Confetti-web-` (rama `migracion/supabase`, mismas env vars, **Vercel Authentication OFF** = catálogo público). Verificado en vivo: carga el catálogo con imágenes.
- _Nota:_ las `VITE_SUPABASE_URL` habían quedado vacías al pegarlas (`createClient(undefined)`); corregidas y redeployadas. Ambos confirmados funcionando.

### 2. NO cutover de Base44 aún · mantener imágenes actuales
Abel se instala el **lunes**; hasta entonces, Base44 es producción. Las imágenes `media.base44.com` se quedan tal cual (ver ESTADO ACTUAL). El cutover de imágenes (recrear idénticas) es un paso **posterior**, no ahora.

### 3. FANTASMAS (identificar con el sistema ya en Vercel)
**Regla de fantasmas:** Claude **DETECTA y LISTA**; **Miguel decide cada uno** (borrar o asignarle función); **NUNCA borrar sin autorización por elemento.** Estado de los 3 candidatos, **reclasificados por Miguel**:
- **Corte de turno → FANTASMA real.** Abel NO lo usa (Confetti opera solo con **CIERRE DIARIO** por sucursal). Acción: **quitar o dejar muerto**, decisión por elemento (en la auditoría con el sistema vivo). Detalle técnico en `BUGS_PENDING.md` (g). El bot NO lo ejercitó.
- **Mini-dashboard "Resumen" de Caja → NO borrar, ARREGLAR.** Hoy muestra campos que el POS **no maneja** (margen, utilidades, costos operativos = inútiles). Acción: dejarlo mostrando **SOLO lo que el POS sí tiene**: **efectivo, métodos de pago, número de tickets** — un mini-dashboard rápido y real para la caja.
- **Pagos mixtos → NO es fantasma, es FLUJO INCOMPLETO** a construir (ver #5).

### 4. NOTAS DE VOZ en pastel personalizado
- **Primero confirmar** que las **notas internas** ya se muestran **aparte** en la card (debería estar codeado; hay placeholder reservado en `PedidoPastelDetalleDialog`). Si no está, hacerlo.
- **Luego agregar opción de VOZ:** grabar audio → transcribir → en la card mostrar **AMBOS**: el **audio con botón play** + la **transcripción** (como nota interna escrita). Audio vía **Supabase Storage** + transcripción.

### 5. PAGOS MIXTOS (construir flujo completo)
Debe funcionar en **TODOS los puntos de pago**: **venta de mostrador**, **anticipo de pastel personalizado**, **anticipo/cobro de pedido web**.
- Conectar **`CobrarPedidoWebDialog`** (hoy **HUÉRFANO** — `abrirCobroPedidoWeb` definido pero sin call-site; ver `MEJORAS_POST_CUTOVER.md` #7).
- Resolver que el **pedido web de catálogo nace con `saldo_pendiente=0` (≠ `total_final`)**, por lo que **no es cobrable** por la UI conectada → hacerlo **cobrable** y con **mixto**.

### 6. CANCELACIÓN DE PEDIDO CON ANTICIPO → DEVOLUCIÓN EN CORTE
Construir/verificar el flujo: cancelar un pedido (web o pastel) que **YA tuvo anticipo registrado en un corte anterior** debe generar la **DEVOLUCIÓN** del dinero como **NEGATIVO en el corte del día de la cancelación**. **Hoy se sospecha que NO existe**: se cancela el pedido pero el dinero del anticipo **no se refleja como devolución** → **incongruencia a corregir**.

### 7. TIPO DE CANCELACIÓN
Añadir/mejorar la **distinción de tipos de cancelación**.

### 8. MEJORA VISUAL de las cards de vista rápida de pastel personalizado (SOLO visual)
Hoy se ven **saturadas/desordenadas** (colores del anticipo, ícono de web, varios colores). **Limpiar** — menos saturación, más orden — **MANTENIENDO toda la información y los íconos/colores**, solo **mejor distribuidos**. No cambia lógica.

---

## VERIFICACIONES PENDIENTES (confirmar que funcionan — el bot NO las probó a fondo)
- **Adelantar pago de pedido web de CATÁLOGO con método de pago** → que salga en el **corte** Y en el **dashboard** de la sucursal **+ vista general** (el dinero del anticipo del día debe sumar en ambos).
- **Cambiar IMAGEN y DESCRIPCIÓN de producto** → reflejo en el **catálogo web** (el bot probó nombre/precio, **no** imagen/descripción).
- **Cancelar pedidos web y de pastel personalizado** con su **efecto correcto en el dinero**.

## LO QUE EL BOT SÍ VERIFICÓ (consta en reportes — NO re-verificar)
- Cancelación de **ventas de mostrador** + desglose en **PDF** del corte.
- Creación de **producto** + **asignación a sucursal** + reflejo en web (**nombre/precio**).
- **Abonos con doble conteo** entrando al corte.
- **Concurrencia / folios / RLS** a 60 días.

---

## Relación con otros docs
- `BUGS_PENDING.md` (g) — corte de turno (fantasma).
- `MEJORAS_POST_CUTOVER.md` — mejoras de no-fidelidad ya catalogadas (incl. #7 mixto/cobro de catálogo huérfano, doble conteo, desglose de descuentos, auditoría de fantasmas).
- `Bot pruebas/bot-pruebas/reportes/run60/RESUMEN_EJECUTIVO_60_DIAS.md` — evidencia de la validación a volumen.

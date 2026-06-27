# BUGS_PENDING / riesgos conocidos

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

## (f) Folio en pantalla Gracias del web — DECISIÓN PENDIENTE (WEB-2)
- **Qué:** anon hace INSERT en `pedidos` pero **no puede leer de vuelta el folio** (sin SELECT; 42501). La fila SÍ queda con `PP-<prefijo>-####` (trigger 0017). La pantalla Gracias quiere mostrarlo.
- **Acción:** decidir con Miguel — (1, recomendada) RPC `crear_pedido_web` SECURITY DEFINER (migración 0019) que devuelva el folio; (2) Gracias sin folio; (3) policy anon SELECT (descartada). Ver `DECISIONS.md` #22 y NEXT_STEPS.

## (e) `uploads` bucket permite listar (advisor WARN)
- Política SELECT pública amplia → clientes pueden listar archivos. Bajo riesgo (imágenes de catálogo públicas). Opcional: restringir a acceso por URL en hardening posterior.

## Notas de cutover (recordatorio)
- Sembrar `folio_contador.ultimo_numero` por (tipo, sucursal) con el MÁXIMO folio existente (evitar colisión con folios históricos).
- Los 3 productos "prueba" ("prueba 1", "prueba 2", "prueba suscursal") NO van al catálogo real de Abel.
- Eliminar la cuenta `staging-pos@confetti.local` cuando el login real esté wireado.
- Rotar la api_key Base44 `847df…`.

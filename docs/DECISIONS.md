# DECISIONS — decisiones de arquitectura/diseño (con su porqué)

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

# PLAN DE FASES — Mejoras POS + Web Confetti

> Fuente de verdad de todos los cambios pendientes. Cada fase lee este MD.
> El contexto NO vive en la memoria del chat — vive aquí.

## REGLA RECTORA (NUEVA)
Se acabó el "idéntico a Base44". El sistema ya es INDEPENDIENTE (POS+Web en
Supabase+Vercel). Se migró desde una base INCOMPLETA: cosas inconclusas,
botones muertos heredados de una plantilla de POS de RESTAURANTE, flujos a
medias por falta de créditos en Base44. El objetivo ahora es que TODO
FUNCIONE CORRECTAMENTE — arreglar lo incompleto y hacer las cosas bien, no
imitar a Base44.

## DISCIPLINA
- Una fase a la vez. Cada fase: prompt → construcción → Miguel revisa →
  arquitecto audita → siguiente.
- Dinero y aislamiento RLS los valida SIEMPRE Miguel, nunca se autocertifican.
- Fantasmas: Claude DETECTA y LISTA; Miguel decide c/u; NUNCA borrar sin
  autorización por elemento.
- Imágenes de media.base44.com: se MANTIENEN (sistema con contenido). Cuando
  se independice, RECREAR las mismas (descargar de Base44 o regenerar idénticas
  con Gemini), NUNCA quitarlas. No es ahora.

---

## FASE 1 — Auditoría de fantasmas e incongruencias ✅ HECHA
Detección sin tocar código. Entregó reporte de fantasmas (F1-F12) e
incongruencias (I1-I7 POS, WF1/WI1/WI2 Web). Pendiente: confirmar I1 en vivo
(se hace en Fase 2).

## FASE 2 — Vercel + confirmación en vivo + verificaciones
OBJETIVO: subir POS y Web a Vercel para que Miguel vea el sistema, y confirmar
EN VIVO (Claude Code opera y toma capturas — Miguel NO) los flujos que la
auditoría de código no cerró y que el bot no probó a fondo.
- Vercel: cuenta de Miguel (huertabautistamiguel62@gmail.com) para que no
  bloquee el deploy. POS ya tiene proyecto (falta producción); la Web NO tiene.
- Confirmar I1 (saldo web=0): crear varios pedidos web (pastel Y catálogo),
  intentar cobrar anticipo en POS, ver si bloquea + si "Entregado" queda libre
  sin cobrar.
- Verificar anticipo de pedido de CATÁLOGO (el que llega de web a cola de Caja):
  que se le puedan hacer anticipos como al pastel personalizado, y que un
  anticipo de hoy salga en el corte de hoy + dashboard.
- Verificar productos Web Pública→web: cambiar imagen/descripción/precio/nombre
  desde Web Pública del POS y confirmar que se refleja en la página web.
- NO se construye nada. Solo subir, ver, confirmar con capturas.

## FASE 3 — Dinero (la más delicada)
OBJETIVO: arreglar toda la matemática del dinero incompleta. Se valida con
máximo cuidado; Miguel confirma cada parte.

1. SALDO WEB = 0 (I1/WI1): los pedidos web (pastel Y catálogo) nacen con
   saldo_pendiente=0 aunque total_final>0, porque el RPC crear_pedido_web no
   setea el saldo (toma default 0). El POS sí lo inicializa → asimetría.
   ARREGLAR: que todo pedido web nazca con su saldo correcto y sea cobrable.

2. ANTICIPOS DE PEDIDO DE CATÁLOGO: el pedido de catálogo que llega de la web a
   la cola de Caja debe poder recibir anticipos igual que el pastel
   personalizado. Si el anticipo es hoy, sale en el corte de hoy de esa
   sucursal + dashboard. (Depende de resolver el saldo=0.)

3. PAGO MIXTO: construir y CONECTAR en TODOS los puntos de pago — venta
   mostrador, anticipo de pastel personalizado, anticipo/cobro de pedido web
   (catálogo). El CobrarPedidoWebDialog tiene la lógica pero está HUÉRFANO
   (nunca se invoca); conectarlo. En el CORTE, un pago mixto debe mostrar
   "mixto" + los métodos por iniciales (E=efectivo, C/T=tarjeta,
   T=transferencia) — no el monto de cada uno, solo qué métodos se usaron.

4. CANCELACIÓN DE PEDIDO CON ANTICIPO: si se cancela un pedido (web o pastel)
   que YA tuvo anticipo (registrado en un corte previo), debe AVISAR del dinero
   devuelto, RESTARLO del dashboard, y EXPLICAR que fue devolución, con NOTA de
   por qué. No es un asiento contable complejo — es transparencia: que no quede
   "se canceló pero el dinero no se movió". Igual que al devolver una venta.

5. TIPO/MOTIVO DE CANCELACIÓN DE PEDIDO (I3): los pedidos se cancelan con un
   confirm() nativo, sin tipo ni motivo. Las VENTAS sí distinguen
   cancelación/devolución + motivo + monto_devuelto. Darle a los pedidos el
   mismo trato (tipo + nota obligatoria).

6. ENTREGA DE PASTEL EN EL CORTE (función nueva): pagar y entregar son momentos
   distintos (se puede pagar un día y entregar otro). Cuando se ENTREGA un
   pastel/pedido, en el corte debe aparecer una línea donde iría el monto:
   "Entregado [nombre interno] — [hora de entrega] — [folio] — entregado".
   Ej: "Entregado pastel Lucía — 15:00 — PP-A-0012 — entregado". Usa el nombre
   interno (que puede ser el nombre del cliente, ej. Lucía).

## FASE 4 — Notas de voz en pastel personalizado
OBJETIVO: en la sección de notas internas (hasta abajo del formulario de pastel
personalizado) se puede ESCRIBIR o GRABAR AUDIO.
- Al grabar: se graba el audio Y al mismo tiempo se transcribe todo lo que
  dicen (como dictado de voz).
- Al guardar el pedido y entrar a la card del pastel: en las notas internas se
  muestran AMBOS — el audio para reproducir (play) + la transcripción (como
  nota interna escrita/editada).
- Las notas internas ESCRITAS ya se muestran aparte (parte 1 ya hecha); esto
  agrega la voz. Audio vía Supabase Storage; transcripción vía API/navegador.
- Hay un placeholder "Nota de voz — próximamente" reservado para esto.

## FASE 5 — Limpieza de fantasmas + visual
OBJETIVO: quitar/neutralizar fantasmas y dejar la presentación limpia. Cada
fantasma: Miguel aprueba qué se hace antes de tocarlo. Lo visual es solo
presentación (cero riesgo de dinero), por eso al final.

FANTASMAS (herencia de la plantilla de restaurante):
- F1 Corte de turno → QUITAR (Abel no lo usa, solo cierre diario).
- F2 Mini-dashboard "Resumen" de Caja → ARREGLAR (no quitar): mostrar SOLO
  efectivo, métodos de pago y número de tickets. Fuera margen, utilidad bruta,
  utilidad neta, costo de ventas, gastos, propinas, "propinas por mesero",
  "cuentas abiertas en mesa" (el POS no maneja costos → todo eso es engañoso).
- F4/F5/F6 Botones muertos (Mantenimiento "Reiniciar/Borrar datos", Ventas
  "Limpiar ventas de prueba", Registros "Limpiar sección") → dependen de
  base44.functions.invoke que siempre falla. NEUTRALIZAR: al presionar que
  digan "desactivado por el momento" (no error). Más adelante se decide si se
  conectan o se quitan.
- F7 Página huérfana CorteCaja.jsx (/corte-caja redirige a /caja, nunca se
  importa) → ELIMINAR.
- F8 Componentes muertos (FinancialChart, PrimerosPasosCard, PedidoListoWatcher,
  SolicitudesQRWatcher, SoundUnlockButton) → ELIMINAR.
- F10 Código latente de restaurante (carpetas mesas/, propinas/,
  IntegracionesRespaldos, EstacionesPreparacion, UnidadesMedida, Proveedores —
  gated e inalcanzable) → ELIMINAR.
- F9 PropinaDialog, F12 ModificadoresDialog → ELIMINAR con los demás.
- NOTA: CantidadVariableDialog (productos por kilo/porción) NO es fantasma — es
  legítimo de pastelería. NO tocar.

VISUAL:
- Cards de vista rápida de pastel personalizado (las de 3 en 3): se ven
  saturadas/desordenadas (colores del anticipo, ícono de web, varios colores).
  Limpiar — menos saturación, más orden — MANTENIENDO toda la información y los
  íconos/colores, solo mejor distribuidos.

## MENORES / POST-CUTOVER (no ahora)
- I5 URL Base44 hardcodeada en "Ver web pública" (WebPublica.jsx) → cambiar
  hasta el cutover, cuando Miguel tenga el dominio.
- WF1 queries config muertas en Nav/Footer web → limpieza menor.
- WI2 WhatsApp/logo hardcodeados en la web → limpieza menor.
- I6 dueño no puede usar Mantenimiento, I7 botón disabled con onClick toast →
  menores.

## YA HECHO / NO TOCAR (confirmado por auditoría)
- Eliminar productos (borrado real cascada POS+web). ✓
- Abrir↔cerrar caja, método de pago se refleja, cancelar venta mostrador con
  tipo, abono con método. ✓
- Notas internas se ven aparte (mejora voz parte 1). ✓
- Migración completa validada (POS+Web + bot 60 días impecable). ✓

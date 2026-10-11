# Pedidos personalizados: horario y WhatsApp — 2026-10-11

Miguel autorizó auditar, implementar, probar y publicar orden por hora,
acceso rápido de horario y base en el mensaje al cliente. El canal relevante
es el alias de apk/capacitor cargado por server.url, no sólo el dominio de
producción. No se necesita modificar ni reinstalar el binario.

## Revisión previa y efectos del cambio

Se contrastaron CLAUDE, contexto, handoff, arquitectura, base, mapa, decisiones,
pendientes y changelog con los dos canales Git/Vercel y lecturas de Supabase.
Se revisaron los informes de reparación operativa, autoridad y evidencia,
la configuración Capacitor/PWA y el histórico de tickets. Dos planes antiguos
de junio aún describían Base44/cutover/doble conteo como vigentes: ahora sus
cabeceras advierten que son históricos y dirigen al contrato vigente.

| Parte | Hallazgo | Cambio y efecto acotado |
|---|---|---|
| Orden | Fecha → UUID, sin hora; 17:00 podía preceder a 15:00 | Fecha → hora local → ID. Dentro de un día, hora ausente al final. |
| Hora | Campo text, captura time; datos en 24 h | Parser de 24 h con minutos/segundos. Ayuda de captura 15:00/17:00. No inferir AM/PM. |
| Accesos | Tres filas (Pedidos/Pagos/Entrega) | Cuarta fila Horario con el mismo componente/alineación; botones de 44 px. |
| Filtros | Consulta/snapshot, clave de cache y guardia local por sucursal | Horario se cruza con esos filtros. Búsqueda restablece horario sin soltar sucursal. |
| Detalle | Se cierra al cambiar de sucursal; guardia evita pedido ajeno | Contrato conservado y probado frente a respuesta/caché con filas de otra sucursal. |
| Indicador | Cuenta pastelero global mostraba «Todas» en cabecera aunque el tab filtrase una sucursal | Cabecera refleja la sucursal del tab. Tarjetas sin hora lo indican explícitamente. |
| WhatsApp | Link wa.me con texto; no adjunta ticket ni mostraba base | Base guardada y leyenda de devolución con base limpia. No recalcula ni suma dinero. |
| Ticket | TicketPastelConfetti incluye precio_base positivo y aviso base limpia | Componente visual, diseño e impresión sin cambios. Render real probado. |
| Datos | RLS de pedidos activada; roles globales/terminal con alcance existente | Ninguna policy/RPC/DDL ni escritura de producción. |
| APK | Web viva desde alias estable de rama | Publicar mismo commit en producción y APK por fast-forward, conservar server.url. |

Los accesos de Horario son Todas las horas, Antes de 12:00, 12:00–17:59,
Desde 18:00 y Sin hora. 12:00 pertenece a tarde y 18:00 a la última franja.
Null, vacío o valor inválido no desaparecen de Todas/Sin hora. La fecha usa
calendario CDMX; la hora de entrega no se convierte a la zona del dispositivo.

## Supabase: lecturas del 11 de octubre

fecha_entrega es date; hora_entrega es text; incluye_base boolean;
precio_base numeric. Se observaron 11 pedidos sin hora, cero horas no vacías
inválidas y cero discrepancias entre base positiva y bandera incluye_base.
RLS permanecía activada. Las políticas permiten lectura global al pastelero,
y el alcance de terminal depende de sucursal; los filtros no conceden permisos.

Los rangos de base observados fueron 1–3 kg: $0; 4–5: $80; 6–8: $100;
9–15: $120. El POS permite captura manual, necesaria encima del máximo.
Ejemplo guardado PP-B-0120: 9 kg, base $120, total $1380.
El mensaje debe usar ese importe histórico incluso si se cambian los rangos.

Pendientes comerciales, sin modificar dinero: huecos entre rangos para kilos
fraccionarios (3.5/5.5/8.5 producen base automática cero); se observaron 25
pedidos de 3.5 kg con base cero. La ayuda de BaseRangosSection afirma que
encima del máximo usa el último rango, pero el cálculo realmente cotiza aparte.
No elegir una tarifa ni recalcular historial sin definir la regla con Miguel.

## Pruebas ejecutadas

- npm ci y npm run build, que exige lint, puerta de tipos, operación,
  autoridad, pendientes, evidencia y ahora test:pedidos: código 0.
- Lint: cero errores en el alcance configurado. Puerta de tipos: ningún
  diagnóstico nuevo; 677 diagnósticos anteriores siguen como deuda explícita.
- test:pedidos ejecuta helpers y página reales: precio histórico/manual,
  total/pagos/saldo sin cambio, fallback legacy, base cero/nula/inválida,
  catálogo, formato 24 h, segundos, límites 12/18, nulos y desempates;
  consulta/cache/búsqueda/horario/detalle por sucursal y terminal.
- Testigos separados: con WhatsApp anterior falla por importe ausente;
  con pantalla anterior y WhatsApp ya corregido falla porque UUID coloca
  17:00 antes de 15:00. No se demuestra regresión sólo probando el arnés.
- Playwright con Chromium y React/React Query/componentes/CSS reales,
  datos/contextos aislados: las tres sucursales, filtro fecha + hora,
  búsqueda, detalle, respuesta retrasada y cambio a terminal. Sin pageerror.
- Diseño real a 1024×768, 768×1024 y 390×844: cuatro filas alineadas,
  botones >=44 px y sin desborde de página. Desplazamiento interno en móvil.
  Capturas inspeccionadas. Sin depender sólo del color: aria-pressed y labels.
- Ticket abonado 40/40, base limpia 21/21, cierre 24/24 (integración con
  credenciales omitida por el propio script), avance/corte 25/25,
  cierre bloqueado 25/25, pastelero 31/31, notas 11/11, botones impresión
  14/14, refresco caja 19/19, estado dinero 26/26 y raster por bandas PASS.
- Estado de caja: 181 fronteras de medianoche CDMX y 11 casos de sucursal PASS.
  Suites del build incluyen SQL real en PGlite con RLS, transacciones,
  errores/reintentos, libro completo de 60,001 filas y aislamiento.

La prueba antigua de base limpia fallaba antes de esta tarea: huella de
PreCuentaTicket omitía nombreLineaTicket, agregado el 12 de julio en 13c89ae.
Se reprodujo 20 PASS/1 FAIL en el árbol anterior 5e2e02c. El componente actual
coincide con ese árbol desplegado y no tuvo diff. Se corrigió sólo la huella,
con comentario de causa/evidencia; no se cambió la plantilla para pasar la prueba.

Prueba de navegador opcional: instalar Playwright/Chromium en el entorno de
pruebas; npm run build y node scripts/pedidos_browser_verify.mjs. Puede
usar CONFETTI_CHROMIUM_EXECUTABLE. No agrega dependencias de navegador al POS.

## Archivos y límites

Código: PedidosPastel, NuevoPedidoPastel (sólo ayuda), pedidoPastelUtils,
horarioPedidos y PedidoPastelCard (leyenda Sin hora). Pruebas: pedidos_horario_whatsapp_verify, pedidos_browser_verify,
huella de ticket_pastel_base_limpia_verify y test:pedidos en package.json.
Documentación de contexto/traspaso, mapa, arquitectura, decisiones, base,
pendientes y changelog actualizada con mecanismos, sin versiones volátiles.

Caja, efectivoEsperado, pagos/folios, adaptador, RLS, server.url, plugins
e impresión conservan sus fuentes. No hubo pedidos/pagos/cortes ficticios,
mensajes enviados, migraciones ni modificaciones de datos reales.
La devolución de base se comunica; no se crea un registro de reembolso.
No se certifica operación física ni que una tablet abierta ya cargó el cliente.

## Publicación

Primera comprobación: commit 4830ddbb9f101f6ec54ae4a3dfb005eb63ebfde5,
árbol 4f889a015a14e5f21fc44356812fe75ee2406952, idéntico al probado localmente.
Producción READY dpl_G1QQzTypd13USnDC9p3zqhn7JM3F y APK READY
dpl_5SuPYnKqzV5rBU1qa4GTSt1c8k5e. Ambos dominios respondieron HTTP200 con
index-ngo2ZxeF.js, SHA256 bee73d87effb85316767a8a0bc878c1d53ce7e3cffd0541569ee96d4b8aadb75.
Todos los marcadores de horario/base/captura estaban presentes; sw.js
referenciaba el mismo bundle nuevo. Runtime Vercel no reportó error/fatal de
ese deployment en la ventana consultada; POS es principalmente estático,
por lo que esto no certifica todos los errores de clientes/servicio Supabase.

La revisión visual posterior aclara la cabecera de sucursal al seleccionar
un tab pastelero y marca Sin hora en la tarjeta; tests de navegador/página
incluyen ambos y pasaron. Se repitió build para esa entrega final con código 0.
Consultar
Git/Vercel y repetir la descarga del bundle para identificar la versión viva.

Tres suites antiguas (fase4_rls_adversarial, fase5_corte_fidelity,
web1_gaps_verify) se ejecutaron y se detuvieron en ENOENT .env, como advierte
CLAUDE.md. No se buscaron contraseñas ni se generaron operaciones de prueba
en producción para forzarlas. La regresión de RLS/transacciones actual se
ejecutó en PGlite y el estado real se consultó en Supabase sólo en lectura.

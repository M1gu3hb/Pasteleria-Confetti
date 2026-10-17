# Auditoría y cambio de pedidos e historial — 17 de octubre de 2026

## Alcance y autorización

Miguel autorizó auditar, implementar, probar y publicar en migracion/supabase y apk/capacitor; la autorización abarca la migración aditiva de lectura. Se leyó documentación vigente, informes operativos de octubre, código POS/web, base y despliegues vivos. El screenshot de Abel confirma que Entregado ocultaba el pedido por estado: no era borrado físico, pues seguía buscable por folio.

## Hallazgos y soluciones

| Parte | Hallazgo | Cambio y alcance |
| --- | --- | --- |
| Personalizados | Entregado ocultaba tarjetas y reaparecía tras liquidar | Acción oculta y pregunta eliminada; la operación de cobro y su intención no cambian. Catálogo conserva entrega manual en Caja. |
| Lista antigua | Pedidos viejos saturaban; estado entregado ocultaba futuros por error | Clasificación derivada de saldo y fecha, sin alterar registros históricos ni afirmar entrega física. |
| Anteriores | Debe exigir pago y entrega pasada | Saldo conocido <= medio centavo, total positivo y fecha válida; inicio mayor entre entrega + 2 días y pago completo, CDMX. Treinta días después sólo historial. No archivar por pago solo ni fecha sola. |
| Datos faltantes | Fecha/saldo legado puede faltar | Permanece en Actuales; etiqueta Revisar saldo/Sin fecha. No se inventa deuda ni entrega. |
| Acceso | Usuario necesita navegación evidente | Dos botones grandes, aviso persistente del número de Anteriores, volver a Actuales; historial bajo Más opciones. Buscar abre historial completo conservando sucursal. |
| Tarjetas | Estado de pago/fecha no se distinguía a simple vista | Etiquetas breves: Fecha pasada · saldo pendiente / Pagado · entrega próxima / Pagado · fecha pasada, altura consistente y saldo visible. |
| Caja | Historial detenía la consulta en 100 cortes | Páginas sucesivas con Cargar más cortes de caja; filtro de sucursal/fechas en servidor. |
| Dashboard | Lista compacta independiente y limitada | Reutiliza historial paginado; seis iniciales y carga sucesiva. |
| Registros | Ya paginaba, pero ocultaba cargar más al buscar y sin coincidencias cargadas | Botón accesible incluso buscando, etiquetas explícitas y exportación parcial identificada. |
| Ventas | filterAll/listAll ya recorrían páginas, pero renderizaba todo | Tarjetas de 100 en 100 con Cargar más ventas; totales sobre conjunto completo, errores visibles. |
| Sucursal | Podían persistir datos previos un render antes del efecto | Hook descarta inmediatamente filas de otra sucursal y respuestas tardías; detalles y PDF ligados al alcance. |

## Contrato del servidor

La migración 20261017181425_pedidos_anteriores_historial_lectura.sql agrega una RPC STABLE SECURITY INVOKER con search_path vacío y execute sólo authenticated. Conserva RLS, autorización de sesión y alcance global deliberado del dueño/pastelero. Terminal y administrador requieren su sucursal, incluso si manipulan parámetros. Consulta sólo personalizados, incluidos legado sin tipo; catálogo queda fuera.

Cursor por fecha/hora/UUID, ligado a sucursal, vista y filtros. Páginas de 50 en cliente, máximo de 100 por solicitud en servidor; no es un máximo histórico. Lectura por servidor evita descargar años de pedidos cada quince segundos. No cambia columnas, policies, cron ni registros de pedidos/pagos/cortes. No hay DELETE, TTL ni limpieza física al archivar. Cancelados permanecen en Historial completo; antiguos Entregados vuelven a clasificarse por saldo y fecha, sin reescribir su estado.

La versión de archivo se alineó con 20261017181425, la versión efectivamente registrada por apply_migration; el SQL no cambió. Hash MD5 de prosrc local y vivo: 21010163d656c9f447171c441b600d17. SECURITY INVOKER/STABLE confirmados, sin execute anónimo.

Esta lista es viva, no un snapshot financiero. Si otra persona edita fecha/hora/saldo entre páginas, puede cambiar la posición; la actualización periódica vuelve a recorrer las páginas. Los informes financieros mantienen historial_operativo_pos. Ventas sigue obteniendo todo el alcance para sus totales: consultar muchos años puede requerir optimización futura. Paginación de cortes por offset también refleja una lista viva.

## Evidencia de datos reales (sólo lectura)

A la revisión: 588 pedidos, 316 cortes totales, 313 cerrados. El primero es CONF-A-C001: inicio 30 de junio de 2026 a las 00:04 y cierre 1 de julio a las 10:49, CDMX; total $325. Estas fechas distinguen apertura y cierre. No se conoce desde una base actual si existieron intentos que jamás llegaron al servidor; persistencia presente no demuestra ausencia de todo borrado histórico.

Antes/después de aplicar la migración coincidieron conteos y huellas completas de 588 pedidos, 316 cortes, 7,469 ventas y 796 abonos: ninguna modificación de datos operativos. Conciliación viva: cero saldos inconsistentes, enlaces inconsistentes, abonos de caja sin venta o ventas cruzadas de corte. Permanecen cuatro cancelaciones ya documentadas; no se normalizaron importes.

La RPC viva dio, por sucursal: Xochimilco 192 Actuales, 57 Anteriores y 398 en Historial completo; Topilejo 42, 45 y 128; San Gregorio 2, 17 y 62. Historial incluye todas las secciones y cancelados, por eso no se suman esas tres columnas.

Los topes de página no eliminan datos al llegar a fin de año. No se promete almacenamiento infinito: respaldo/restauración, capacidad del plan y operación de las cuentas siguen siendo obligaciones operativas. Se conserva la evidencia financiera anterior y sus pendientes de conciliación, sin ajustar dinero para que cuadre un informe.

## Sitio público

Hay 25 pedidos origen web, último registrado el 8 de octubre de 2026 a las 13:10 CDMX. La página de pedido carga formulario, precios y tres sucursales; se comprobó selección de Topilejo sin enviar una orden. Build web completo aprobado, incluidas pruebas de intención/reintento y accesibilidad. No se modificó ni desplegó el repo web.

La suite pendientes_sql_verify compara los hashes de las tres funciones probadas con las leídas en producción y ejecuta ambos payloads completos del frontend (pastel y productos) para tres sucursales aisladas. Comprueba folio, persistencia, sucursal correcta, saldo, acceso POS, reintento sin duplicar y prohibición de lectura anónima. No se hizo un envío real de cliente ni se garantiza entrega de WhatsApp por esa prueba. Resultado: no se encontró rotura del circuito web en el alcance comprobado.

## Validaciones reproducibles

- npm run test:historial: SQL real en PGlite, ambas condiciones, límites de dos y treinta días, pago tardío, faltantes, entregado accidental, exclusión catálogo, roles/RLS, cursor de otra vista/sucursal, búsqueda y cero mutaciones al leer. 1,212 registros de una sucursal recorridos sin pérdidas ni duplicados.
- Cortes: componente real alcanza 205 registros aunque el servidor responda sólo 73 por página; offsets 0/73/146/205 y botón explícito.
- Cliente real: loader valida sucursal/respuesta/cursor/error; hook no muestra sucursal anterior antes de efectos; diálogo de pago cobra una vez, notifica una vez y cierra sin cambiar entrega. Ambas regresiones se ejecutaron contra código anterior y fallaron por la condición que corrigen.
- Pruebas de horario/WhatsApp y recuperación adaptadas a consulta paginada y eliminación de la segunda pregunta; las verificaciones financieras anteriores se conservan.
- quality/build incluye todas estas pruebas además de operación, autoridad, cancelaciones/evidencia, impresión nativa, consultas completas y formularios web. Lint sin errores; puerta de tipos no admite nuevos diagnósticos. Persisten 597 diagnósticos POS históricos (antes 677; se tipó Input correctamente), 23 en web; no se declara TypeScript limpio.
- No se modifican Caja.jsx, efectivoEsperado, plantillas/aritmética de tickets, módulos nativos ni capacitor.config.ts. No se generan ventas, abonos, pedidos ni cortes ficticios en producción.

## Publicación

Preview de código 5814c20568914bd5a0d50bf5b5c36d82fe39158b: READY en Vercel. Prueba visual aislada en rama qa/historial-sintetico-20261017 (fa37197618c920de5fac3dbef4dbfce3ecbca736); su HTML sintético NO forma parte del árbol de producción. Componentes reales con datos/conexiones simulados, no transacciones del negocio. Se verificó: Anteriores y volver, detalle sin Entregado, búsqueda de pedido de junio, resultado vacío al cambiar a otra sucursal, 50→60 pedidos, 73→146→205 cortes, terminal B sólo su corte, pago completo cierra sin segunda pregunta y error de red visible.

La migración aplicada y su hash coinciden con el archivo versionado. Canales operativos: migracion/supabase (alias pasteleria-confetti.vercel.app) y apk/capacitor (alias configurado en capacitor.config.ts). El release se avanza sin force y se comprueban estado READY, SHA y contenido servido en ambos; los identificadores de despliegue se consultan en Vercel para el commit informado al usuario. La prueba física en tablets/impresoras y la recepción de la nueva versión por cada equipo no puede certificarse desde un despliegue remoto. Reabrir/recargar la app para recibir el cliente actualizado.

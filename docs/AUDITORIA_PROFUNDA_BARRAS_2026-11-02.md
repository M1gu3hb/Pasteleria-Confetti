# Auditoría profunda de escáner y etiquetas — 2 de noviembre de 2026

Miguel pidió acumular los fallos antes de corregir, repetir el diagnóstico hasta una pasada sin hallazgos adicionales, reparar el conjunto y volver a auditar. Se trabajó sobre `387c365648693728b7ac15e6f3765f3dee84954a`, comprobado en las dos ramas operativas. No se crearon ventas, pedidos, cortes ni productos ficticios en producción.

## Hallazgos completos de esta ronda

| ID | Gravedad | Defecto reproducido | Reparación |
|---|---|---|---|
| R01 | Alta | El normalizador eliminaba espacios/controles internos: una trama `00 12345` podía consultar el producto `0012345`. La base repetía esa transformación. | Validador de trama/imagen exige caracteres canónicos; normalización de servicio/SQL sólo recorta relleno exterior, nunca interior. El campo de asignación rechaza también espacios exteriores. Nueva migración `codigo_canonico`, sin reescribir productos. |
| R02 | Media | Un refresco que cambiaba sólo el nombre del producto cerraba la asignación y perdía su código todavía sin guardar. | Separar actualización de información guardada del reinicio de borrador: cambiar nombre conserva el trabajo; cambiar producto/código reinicia la asignación. |
| R03 | Alta | Una respuesta demorada de generar/asignar reemplazaba en pantalla un código más reciente ya observado por un refresco desde otro dispositivo. | Invalidar consultas y releer el producto actual antes de mostrar el resultado. No usar la respuesta antigua como última autoridad local. Exportar continúa comprobando el código vigente. |
| R04 | Alta | Aunque se cancelaban consultas en vuelo, un carrito ya agregado seguía cobrable al cambiar de sucursal; podía incluir un producto exclusivo de Topilejo. Cambiar cajero tampoco vinculaba la orden. | Orden ligada a sucursal/cajero originales. Conservarla y bloquear agregar/editar/cobrar hasta regresar al origen o limpiar explícitamente. La limpieza se bloquea si hay cobro pendiente. |
| R05 | Alta | Tras perder una respuesta de cobro, no había recuperación directa con carrito vacío/recarga. Otro carrito podía terminar disparando la recuperación de la intención anterior y ser borrado. | Recuperación explícita del intento durable original, con su clave, detalle y pago exactos; bloqueo de lecturas/edición/nuevo cobro mientras esté pendiente. Accesible también con caja cerrada para consultar/reintentar el original bajo las validaciones del servidor. Ticket canónico. Sólo limpiar el borrador congelado que inició ese intento; conservar cualquier otro. Validar contexto/RPC antes de recuperar. |
| R06 | Alta | Dentro de una trama conocida F9, Ctrl/Alt/Meta podían ejecutar atajos; Tab cancelaba el origen y permitía que un sufijo válido se leyera como otro producto. | Consumir atajos y controles inesperados de la trama prefijada y descartar el resto hasta Enter/Escape/F9. Shift sigue admitido para mayúsculas. Tab fuera de trama prefijada conserva navegación normal. |
| R07 | Media | `Date.now()` y diferencias negativas permitían aceptar una lectura interrumpida si el reloj retrocedía. El cero también se usaba como ausencia de tiempo. | Reloj monótono `performance.now()` llamado con su receptor, rechazo de retrocesos y marcador nulo para tiempo ausente. |
| R08 | Media | La fuente Helvetica interna del PDF deformaba nombres Unicode fuera de su codificación; `Pastel Łódź` se imprimía con letras distintas y espaciado roto. | Renderizar esos nombres con fuente del navegador en una imagen dentro del PDF. Barras e identificador siguen vectoriales/texto. Nombres latinos compatibles conservan texto. Verificación visual y lectura independiente del código. |

R04/R05 son defectos de integración con el POS existente; no se atribuyen a la unicidad SQL del generador. R08 se reprodujo con datos sintéticos: los 43 nombres del catálogo consultado eran Latin1, ninguno estaba afectado por ese ejemplo. Se detectaron ocho problemas funcionales; no se infló la lista con fallos del arnés de pruebas.

## Pasadas y criterio de cierre

1. Diagnóstico sin cambios de aplicación: componentes, lector, cola, RPC, permisos, reservas, impresión, PDF y recuperación. Se agregaron primero pruebas acumulativas; éstas no se detienen en el primer fallo. Se reprodujeron R01–R05 en páginas reales, R01/R06/R07 en motores reales y R08 renderizando el PDF anterior.
2. Revisión adicional del mismo alcance: modelo independiente de 2,000 tramas, SQL real en PGlite, cola real de impresión y contratos de contexto/exportación. No añadió hallazgos distintos. Entonces se cerró el diagnóstico y se hicieron las reparaciones del conjunto.
3. Reauditoría de las reparaciones: ampliar cobro perdido antes/después de commit, recarga, caja cerrada, rechazo definitivo, intento malformado, borrador ajeno y venta normal. Se corrigieron restricciones del arnés: serialización JSON como HTTP, esperas al cierre de Radix y texto real del ticket con cantidad. Un build concurrente cambió el CSS de `dist`; el fixture ahora captura sus bytes al arrancar. Estos fallos eran de instrumentación, no se cuentan como defectos del POS ni como comprobaciones aprobadas hasta volver a ejecutar.
4. Cierre: repetir las regresiones profundas y las anteriores, más build completo, modelo con semillas adicionales y decodificador independiente. El criterio es ninguna regresión reproducible pendiente en el alcance descrito; no una promesa de ausencia absoluta de errores.

## Evidencia repetible

- `scripts/barcodes_auditoria_profunda_browser.mjs`: 15 casos de páginas/componentes reales, PaymentModal real y servicio RPC sintético. Compara solicitudes serializadas con el intento original y comprueba una sola venta simulada, incluso al recargar. Acumula fallos y captura errores de JavaScript.
- `CONFETTI_QA_DEEP_BASELINE=1 CASES=R01,R02,R03,R04,R05 ... node scripts/barcodes_auditoria_profunda_browser.mjs`: las cinco regresiones fallan contra la aplicación publicada anterior. No requieren credenciales ni escriben en producción.
- `node scripts/barcodes_profunda_modelo_verify.mjs --baseline`: falla por identidad alterada, atajo no consumido, sufijo después de Tab y reloj inverso. Sin `--baseline` valida la reparación.
- `node scripts/barcodes_sql_verify.mjs --baseline`: falla exactamente al esperar rechazo de un código con espacio interno. La suite normal aplica las tres migraciones y verifica además unicidad, reservas permanentes, roles, RLS y sucursales.
- `scripts/barcodes_profunda_matriz_verify.mjs`: modelo finito independiente de aceptación/origen, 2,000 tramas por semilla. Semillas 1701126, 42 y 90210: 6,000 combinaciones de alfabeto, largo, foco, modal, habilitación, sucursal y cajero/corte.
- Se conservan las tres suites anteriores de navegador: alta/edición/colisión, PNG/PDF, ráfagas, precio, pago, etiquetas antiguas y cambios de contexto. La prueba de impresión usa el mismo CSS térmico de recibos a 58/80 mm; la nativa ejercita la cola/conexión/avance/corte/desconexión reales con doble sólo del plugin de dispositivo.
- `scripts/barcodes_decode_verify.py`: ZXing independiente decodifica PNG de 1000/384/576 px y las 14 etiquetas de dos páginas carta. La etiqueta Unicode corregida también conserva `CF00000001` al decodificar su PDF rasterizado.
- `npm run build`: lint, cero diagnósticos TypeScript nuevos contra 597 históricos, pruebas de dinero/operación/autoridad/evidencia/historial y códigos, más Vite. No se modifica la línea base de tipos para aprobar.

Para navegador instalar Playwright y Chromium fuera del proyecto; indicar `CONFETTI_QA_MODULES` (directorio del package.json de esas herramientas) y `CONFETTI_QA_EXECUTABLE`. Ejecutar servidores y navegadores desde el mismo proceso/entorno. Los documentos visuales de QA son temporales, no etiquetas del cliente.

## Contratos conservados y límites concretos

La impresión de códigos sigue el mismo transporte/configuración/lifecycle de tickets de ventas; el gráfico es necesario para conservar las barras. Ningún layout de ticket de venta ni candado de Caja ni fórmula de dinero se cambió. El PDF de varias etiquetas sigue siendo carta, distinto del botón de impresión térmica individual.

Recuperar usa `crear_venta_directa_tx` y la intención persistente existentes; no inventa otro pago ni altera su matemática. Un intento recuperado no ejecuta efectos de inventario/cocina usando el carrito nuevo. Esas tablas auxiliares del legado restaurante no existen en el esquema público Confetti inspeccionado; no se certifica aquí portar la recuperación a un restaurante con efectos auxiliares activos. Un registro local malformado se conserva y bloquea otro cobro hasta revisión; no se borra para aparentar éxito.

El lector físico necesita F9 + Enter para aislarlo de campos de pago. Sin prefijo sigue siendo un teclado indistinguible del humano. Probar en sitio lector, reconexión, impresora, papel, corte y recarga en cada tablet. El puente Java ConfettiFiles para guardar archivos continúa pendiente de compilar, firmar e instalar; desplegar la web no instala ese plugin en APK antiguos. Pueden descargar desde Chrome/computadora. Las fuentes Unicode dependen de las fuentes disponibles en el navegador/dispositivo.

La deuda histórica de tipos y los riesgos generales documentados en BUGS_PENDING no se declaran reparados por esta entrega. Escanear agiliza registrar; no impide físicamente que una empleada venda fuera del sistema.

## Registro de publicación y trazabilidad

La vista previa de la reparación `9bbf52ebf1049a61f17a898733512a8e17598263` terminó READY y respondió HTTP 200. Sus 26 archivos publicados se compararon exactamente contra el workspace probado. Después se aplicó la migración con el SQL ya persistido en GitHub. Supabase registró `20261102062408_codigo_canonico.sql`: cuerpo de 584 bytes, MD5 `dccd674e7530fe7677519bf54a34bf32`, idéntico al archivo. Se ajustó sólo el nombre del archivo a la versión real, sin cambiar el SQL. Consulta viva devolvió `00 12345` intacto y recortó sólo el relleno externo del ejemplo de control; el catálogo conservó sus 43 productos y cero códigos asignados, sin altas de prueba.

La verificación de versión operativa exige consultar ambos refs y deployments (producción y alias apk/capacitor) y descargar sus bundles. Los hashes vivos no se fijan en documentos de traspaso. La respuesta de cierre informa la comprobación posterior a publicación.

La revisión visual se contrastó con Poppler y MuPDF. Una sustitución de fuente local de Poppler distorsionaba espaciados de Helvetica estándar; MuPDF mostró los nombres latinos correctos. Se distinguió esa limitación del renderizador del problema real de codificación Unicode R08 para evitar atribuir otro fallo inexistente a la aplicación.

# Implementación de códigos de barras — 2026-11-01

## Alcance entregable

Generación CF + ocho cifras y asignación de códigos existentes al final de tarjetas/editar producto. Unicidad y reserva permanente incluso tras desactivar, reemplazar o borrar. Los códigos se conservan al editar precio/nombre, imprimir o descargar. Una reasignación advierte que invalida etiquetas; caja no reasigna automáticamente ni cobra al escanear.

Vista grande, PNG, impresión gráfica (58/80 mm) y PDF vectorial carta por lotes con selección y copias. En el APK, la previsualización de etiquetas usa SVG porque Android WebView no garantiza un visor PDF. El mismo archivo generado se conserva para descargar. Para etiquetas muy largas se muestra error de tamaño antes de imprimir, preservando márgenes y resolución.

En nueva venta, HID + Enter agrega directamente al carrito. Consultas actuales por sucursal, cola en orden, aumento funcional/inmutable de cantidades, error visible para código desconocido o red y espera máxima de 15 s por consulta. Cobrar espera los escaneos pendientes. Pago/ticket/diálogos pausan el lector; el Enter de la trama no activa botones. Búsqueda y campos de edición siguen como teclado normal. Este mecanismo agiliza registrar; no puede impedir físicamente una entrega que se haga fuera del POS.

## Verificación

- `npm run build`: lint, control de nuevos tipos y todas las suites operativas/financieras del proyecto, más SQL/cliente de códigos. La deuda histórica de tipos permanece; no se amplía la línea base.
- SQL PGlite ejecuta la migración real con helpers de identidad/RLS publicados: generación idempotente, reserva de duplicados/códigos retirados, origen, ceros iniciales, permisos de terminal/administrador/dueño, sucursal ajena, producto inactivo, rollback y denegación a anónimo/registro privado. El bloqueo y la secuencia se revisaron; esto no simula conexiones concurrentes de un servidor PostgreSQL real.
- Cliente: tramas completas/incompletas, no aceptar un sufijo, repetición deliberada, autorepeat, 30 incrementos inmutables, orden, fallos y cancelación de respuestas anteriores.
- Navegador Chromium con componentes reales y fixtures aislados: catálogo/editar, colisión rechazada, conservación de visibilidad web, PNG/PDF, tres escaneos iguales, Enter sobre Cobrar, búsqueda, producto ajeno, bloqueo durante consulta, pago pausado, cambio de sucursal, tablet/360 px y cero errores JS.
- Decoder independiente ZXing: PNG de 1000, 384 y 576 px; PDF carta de 14 etiquetas en 2 páginas, todas decodificadas individualmente después de rasterizar a 300 dpi. No equivale a prueba de papel/lector reales.
- Auditoría preserva checkout, idempotencia financiera, fórmulas, caja y comprobantes. No se crean ventas, pedidos, abonos ni cortes ficticios en producción.

## Reproducir QA opcional

Instalar Playwright/Chromium en un entorno de pruebas y ejecutar `node scripts/barcodes_browser_verify.mjs`. Para dependencias externas al repo: `CONFETTI_QA_MODULES` apunta al paquete que contiene Playwright y `CONFETTI_QA_EXECUTABLE` al Chromium disponible. La prueba levanta su propio servidor sintético y no recibe credenciales. Genera archivos temporales `/tmp/confetti-label*.png/pdf`. Después: `pdftoppm -r 300 -png /tmp/confetti-labels.pdf /tmp/confetti-sheet` y `python scripts/barcodes_decode_verify.py` con zxing-cpp/Pillow/pypdf instalados.

## Publicación y reversión

La migración es aditiva y las versiones anteriores siguen funcionando; no necesita rellenar códigos ni tocar catálogo existente. Publicar en rama de preview, comprobar build, aplicar SQL versionado y sólo después avanzar ambos canales al mismo commit sin force. Consultar refs y despliegues en vivo para la versión actual.

Ante fallo del cliente, volver ambos canales a un nuevo commit que revierta sólo la interfaz/lector, conservando columnas, códigos y reservas. No borrar la migración ni reciclar códigos impresos. Si se conserva un producto con etiqueta retirada, administración decide la nueva etiqueta; no cambiar referencias durante un cobro.

## APK y comprobación en sitio

Fuente del APK 1.2.0 (versionCode 4): ConfettiFiles usa el selector Android ACTION_CREATE_DOCUMENT para PNG/PDF, sin permisos generales de almacenamiento. Las versiones antiguas muestran un límite explícito y permiten descargar desde Chrome/computadora; escaneo y catálogo web se actualizan al recargar el alias.

No se entregó un binario firmado ni se afirma que esté instalado. El intento `bash gradlew :app:compileDebugJavaWithJavac --no-daemon` quedó bloqueado al descargar Gradle 8.14.3 (`Network is unreachable`); el entorno tampoco dispone de SDK Android/JDK 21 ni de la firma de publicación. Compilar/verificar el APK, firmarlo con la clave existente e instalarlo es pendiente separado del despliegue web. Falta validar en Higole lector real, reconexión, una trama por disparo y papel 58/80 mm.

# Reauditoría de códigos de barras — 1 de noviembre de 2026

Miguel autorizó revisar todo lo implementado y corregir los hallazgos uno por uno hasta terminar. Se continúa la autorización previa de probar y publicar ambos canales. Base revisada: revisión `5a1545e5300fbfcf938374a76c29afc5b3606d74`; código, esquema vivo y las rutas reales de tickets, no sólo el informe anterior. No se crearon operaciones financieras de prueba en producción.

## Lista de hallazgos y resolución

| ID | Hallazgo | Resolución y evidencia |
|---|---|---|
| B01 · crítico | Etiqueta encolada y luego `conImpresora`, que vuelve a encolar: el trabajo espera a sí mismo y bloquea los siguientes tickets. | Una sola entrada a la cola real; prueba de etiqueta seguida de ticket. La versión anterior falla con `TIMEOUT_COLA`; la corrección pasa. |
| B02 · alto | Etiquetas duplicaban avance/corte y no garantizaban intentar cortar/desconectar tras error. | Reutilizan `usarConexion` y `ejecutarYcortarSiempre` del dispatcher de tickets; fallos inyectados de render, USB, TCP, raster, avance y corte, con recuperación de la cola. |
| B03 · alto | Navegador imprimía etiqueta de 90 mm en hoja carta, distinta de tickets 58/80 mm. | `printDocument` térmico y mismo CSS/iframe/configuración que ventas. SVG evita el límite de 28 mm reservado al logo del ticket. Prueba DOM real compara CSS de etiqueta y ticket en ambos anchos. PDF por lotes sigue siendo carta deliberadamente. |
| B04 · alto | Al escanear un producto ya presente con otro precio, se conservaba el precio viejo. | Se agrupa sólo cuando coincide el precio; las piezas anteriores conservan su snapshot y la nueva usa el precio actual. Pruebas de núcleo y carrito real. |
| B05 · alto | Campo de asignación `maxLength=64` recortaba un código mayor, pudiendo asignar su prefijo como si fuera completo. | Se valida el código completo y se rechaza sin petición de escritura. Regresión en navegador; con el panel anterior falla. |
| B06 · alto | Al comprobar sólo la sucursal nueva, se podía mover un producto ajeno y asignar código en la misma petición; un NULL en el arreglo también eludía un `NOT ANY`. | Trigger verifica sucursal original y nueva; trigger/RPC usan comparación que trata NULL como no autorizado. SQL real con helpers de identidad y RLS; versión anterior falla. Migración adicional, sin modificar la ya aplicada. |
| B07 · alto | Un segundo Enter vacío de un lector CR/LF podía activar Cobrar. | Se consume sólo el terminador vacío inmediato; nunca se descarta una trama nueva completa por repetirse rápido. Prueba con botón Cobrar enfocado y escaneos seguidos. |
| B08 · medio | PDF validaba copias después de asignar códigos; un intento fallido podía dejar una previsualización anterior. | Validación antes de cualquier RPC, vista anterior retirada al regenerar, selección explícita incluso con copias 0/vacías y descarte de resultados de un diálogo/sucursal anteriores. Prueba: copias fraccionarias no escriben catálogo. |
| B09 · alto | Cambiar cajero/corte en la misma sucursal no invalidaba una consulta pendiente; limpiar carrito no limpiaba la trama parcial. | Contexto incluye identidad y corte, cola descartada y lector reiniciado al limpiar. Prueba de respuesta tardía con cambio de identidad en la misma sucursal. |
| B10 · medio | Trama demasiado larga seguía creciendo en memoria aunque estuviera rechazada. | Buffer máximo de 65 caracteres hasta Enter; prueba de 10,000 teclas. |
| B11 · alto | Se aceptaban filas RPC malformadas: código equivocado, precio NULL/NaN/negativo, producto oculto/inactivo o sucursal ajena. | Validación de la respuesta antes de tocar el carrito. Pruebas con valores crudos y formatos singular/una fila. |
| B12 · medio | Doble toque y respuestas tardías podían cambiar un panel distinto o mantener estados de otra exportación. | Bloqueo síncrono, identidad/época de operación y limpieza al cerrar/cambiar contexto; cantidades/removidos del carrito usan actualización funcional. |
| B13 · medio | Guardado Java permitía dos selectores simultáneos y confirmaba antes de cerrar el archivo, cuando el cierre aún podía fallar. | Exclusión de guardados y éxito después de cerrar el stream; cancelación/error liberan el bloqueo. Fuente revisada; compilación, firma e instalación del APK siguen pendientes. No se autocertifica Java ejecutado. |
| B14 · configuración física | Un lector HID sin prefijo es indistinguible de escribir con teclado en un campo de pago/búsqueda. Pausar consultas no impide que el SO escriba las teclas. | Soporte de prefijo F9 + Enter, consumido incluso sobre el formulario de cobro real. Prueba mantiene intacto el monto recibido. Debe configurarse/verificarse en el lector físico para garantizar aislamiento de campos; el modo legado sin prefijo sigue funcionando en la zona de venta y no ofrece esa garantía. |

## Contrato de impresión

Etiqueta y tickets comparten impresora USB elegida o IP/puerto TCP locales, cola completa y ciclo conectar → enviar → avanzar → cortar → desconectar. El código de barras se envía como gráfico, incluso si el ticket usa la opción texto: convertir las barras en texto plano las destruiría. No se rediseñaron los tickets ni se alteraron sus importes. Ancho 58 → 384 puntos; 80 → 576. En navegador se usa el mismo dispatcher térmico de tickets. Si un código no cabe con márgenes/resolución suficientes, se rechaza la impresión térmica y se indica PDF carta.

Estos cambios de impresión son JavaScript y usan el puente ConfettiPrinter ya existente en el APK. No dependen de instalar ConfettiFiles, que sólo sirve para guardar archivos.

## Pruebas y reproducción

`npm run build` ejecuta lint, comparación de tipos sin nuevos diagnósticos, suites de operaciones/autoridad/pedidos/evidencia/historial y cuatro suites de códigos. La deuda TypeScript histórica se conserva identificada; no se movió la línea base.

- `node scripts/barcodes_impresion_verify.mjs`: cola y lifecycle reales; sólo se simula el borde del hardware. `--baseline` carga el exportador publicado anterior y falla por interbloqueo.
- `node scripts/barcodes_sql_verify.mjs`: ambas migraciones reales con helpers de identidad/RLS; reservas, idempotencia, borrado, permisos, rama ajena, NULL en alcance, rollback. `--baseline` omite el endurecimiento y falla en el permiso.
- `node scripts/barcodes_reauditoria_verify.mjs`: precio/snapshots, memoria acotada y validación RPC. `--baseline` carga el núcleo anterior y falla con el precio viejo.
- `scripts/barcodes_browser_verify.mjs`: regresión de la primera entrega.
- `scripts/barcodes_reauditoria_browser.mjs`: asignación completa, PDF sin escrituras inválidas, impresión térmica real del navegador con sólo diálogo del SO simulado, repetición rápida, doble Enter, foco F9, formulario de cobro real y cambio de identidad. Con `CONFETTI_QA_BASELINE=1` usa el panel anterior y reproduce el recorte.
- PNG/PDF se vuelven a leer con decoder independiente ZXing; no se presenta esa lectura digital como papel escaneado físicamente.

Los scripts de navegador aceptan `CONFETTI_QA_MODULES` y `CONFETTI_QA_EXECUTABLE`, levantan servidor sintético propio y no reciben credenciales del negocio. No ejecutan cobros reales. La prueba SQL PGlite no se presenta como prueba de carga de conexiones concurrentes PostgreSQL.

## Publicación y límites

Versionar SQL probado antes de aplicarlo, comprobar MD5 del cuerpo aplicado, y avanzar producción y apk/capacitor al mismo commit sin force. Verificar READY, alias y bundles servidos. No repuntar `server.url`. Una tablet abierta necesita recargar; si quedó bloqueada en la cola anterior, reiniciar la app descarga ese estado de memoria.

Falta la comprobación física de lector, prefijo, USB/Bluetooth, impresora/papel/avance/corte. Para guardar dentro del APK falta compilar, firmar con la firma existente e instalar el binario; las descargas web funcionan sin ese plugin. No se promete “cero errores” ni “perfecto”: se documenta qué se reprodujo, corrigió y probó, y qué no pudo ejecutarse físicamente.

## Evidencia de cierre de software

Build local completo finalizó con salida 0; las dos pruebas de navegador (regresión inicial y reauditoría con PaymentModal real) pasaron sin errores JS; ZXing volvió a leer todos los PNG y las 14 etiquetas de las dos páginas carta. Pruebas previas negativas documentadas: interbloqueo, precio viejo, permiso con NULL y truncación del campo fallan al cargar la revisión anterior.

La migración probada se versionó antes de aplicar; Supabase la registró como `20261101204019_endurecer_codigos_barras`. Su cuerpo MD5 `dbab7155cf620d8cc5d66548a39272a6` coincide con el archivo renombrado a esa versión sin cambiar SQL. Comprobación viva: guardia de alcance original y de NULL presentes; anon no ejecuta asignación, authenticated conserva el permiso con autorización dentro de la función.

Advisor conserva los avisos preexistentes (incluidas tres vistas SECURITY DEFINER); no se declaran resueltos por esta reauditoría. El único aviso asociado al registro de códigos es informativo: [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), deliberado para impedir acceso directo al registro privado. No ampliar permisos para silenciarlo. La deuda de tipos del POS sigue en 597 diagnósticos históricos; la puerta impide añadir otros.

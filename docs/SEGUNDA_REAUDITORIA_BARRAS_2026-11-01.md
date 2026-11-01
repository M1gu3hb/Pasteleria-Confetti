# Segunda reauditoría de códigos de barras — 1 de noviembre de 2026

Miguel solicitó otra revisión completa y corrección de los errores restantes. Base publicada comprobada en ambas ramas: `02c6ba042aae1fec3ea43dfe258b050377ffeb6d`. Se conserva la autorización de terminar pruebas y publicación de los arreglos. Se revisaron también las correcciones de la primera reauditoría; no se hicieron operaciones financieras ficticias ni cambios de esquema en producción.

## Hallazgos nuevos

| ID | Error reproducido | Corrección |
|---|---|---|
| C01 · alto | Cobrar esperaba consultas pendientes, pero no una lectura a medio terminar. Era posible abrir pago después de F9 y algunos caracteres, antes de que llegara Enter. | Estado de lectura explícito y guardia síncrona para cobrar, abrir orden móvil o venta libre. El flujo sigue agregando cada lectura completa sin confirmación por producto. Escape cancela una lectura interrumpida. |
| C02 · alto | El listener se reconstruía al cambiar sucursal, cajero, corte o modo. Se perdía el origen de una lectura parcial y su final podía coincidir con otro código válido en el contexto nuevo. | Listener/parser estables durante la pantalla; cada trama conserva el contexto donde comenzó. Al cambiarlo, se descartan sus caracteres restantes hasta el terminador. Una F9 nueva o Escape permite recuperar. Cambios de foco/modal/pago no convierten un sufijo en otro producto. |
| C03 · medio | El PDF guardado en previsualización no volvía a comprobar códigos/nombres al descargar. Una reasignación desde otro dispositivo permitía descargar etiquetas antiguas. | Lectura actual del catálogo antes de exportar, sin asignaciones. Si cambia código/nombre o desaparece un producto, se retira la vista anterior y se pide regenerar. No se garantiza vigencia eterna después de descargar/imprimir: reasignar invalida etiquetas ya emitidas. |
| C04 · alto | Un lector F9 usado para asignar podía concatenarse con contenido que permaneciera en el campo: `OLD` + `0012345` se guardaba como `OLD0012345`. | F9 inicia una asignación nueva y vacía el campo antes de recibir sus caracteres. El teclado manual conserva su comportamiento. |
| C05 · alto | Validación parcial de respuesta: precio vacío/espacios/booleano podía convertirse en 0/1; sucursal_ids como string se aceptaba por `.includes`. Al asignar, se verificaba el ID sin comprobar código/origen. | Precio exige número o string numérico no vacío; alcance exige arreglo o NULL. Asignación verifica código esperado y origen válido. Datos incoherentes fallan antes de entrar al carrito o mostrarse como guardados. |

## Pruebas negativas y positivas

Cada una de las cuatro regresiones de interfaz se ejecutó por separado contra el código publicado anterior, mediante `CONFETTI_QA_REVIEW2_BASELINE=1` y `CASE=partial_checkout`, `partial_branch`, `pdf_snapshot` o `assignment_prefix`. Fallaron respectivamente con cobro habilitado, consulta de un sufijo en sucursal nueva, descarga de PDF antiguo y código concatenado. Las cuatro pasan con la corrección. Sólo se simulan datos y el servicio de impresión del SO; las páginas y componentes React son reales.

`node scripts/barcodes_reauditoria_verify.mjs --review2-rpc-baseline` carga el servicio anterior y falla por aceptar un dato inválido. La versión corregida rechaza valores crudos vacíos, booleanos, NULL, NaN, negativos, código incorrecto y alcance ajeno/malformado, además de verificar la respuesta de asignación.

`node scripts/barcodes_frames_verify.mjs` ejercita el motor real extraído: lecturas repetidas rápidas, CRLF, Enter sostenido, lectura parcial, cambio de sucursal, modal que abre/cierra dentro de una lectura, foco en pago, limpieza/blur, recuperación con Tab/Escape, prefijo vacío y Enter legado dentro de formulario pausado. El motor se comparte con el hook; no es un lector alternativo construido sólo para el test.

Se mantienen la regresión original de navegador y la primera reauditoría con PaymentModal real. Build exige lint, puerta de tipos sin nuevos diagnósticos y suites financieras/operativas/autoridad/historial más pruebas SQL, lector, impresión y tramas. No se cambia la línea base de tipos para aprobar esta ronda.

## Impresión y datos revisados

Se conserva la corrección de cola y el mismo dispatcher térmico/configuración de los tickets de venta. La suite real de cola/conexión/avance/corte/desconexión se ejecuta también en esta ronda. Generación, reservas e idempotencia del código siguen verificadas por las dos migraciones reales en PGlite; no se agrega migración. PNG/PDF mantienen su encoder, formatos y códigos persistidos. Se vuelve a comprobar la lectura digital independiente de sus etiquetas.

## Alcance que todavía requiere dispositivo

El prefijo F9 + Enter necesita configurarse y verificarse en el lector real para impedir escritura HID en campos de pago. El modo sin prefijo sigue siendo un teclado normal; no se atribuye al software una capacidad que ese modo no permite distinguir. Debe probarse papel/escáner/avance/corte en Higole. El puente de guardado de archivos del APK sigue pendiente de compilación, firma e instalación; escaneo e impresión usan la actualización web y el puente de impresora existente.

Los avisos previos del proyecto y la deuda de tipos documentados en la primera reauditoría no se presentan como reparados por estos cambios. Esta revisión demuestra los casos probados; no certifica ausencia absoluta de errores ni operación física no observada.

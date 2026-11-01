# Códigos de barras Confetti — plan y criterios de entrega

Autorización de Miguel del 1 de noviembre: implementar, probar, auditar y publicar el alcance completo en ambos canales, avanzando las fases sin nuevas pausas de aprobación. No crear operaciones de negocio ficticias en producción.

## Flujo acordado

Productos → Editar → sección final Código de barras → Generar o Asignar con lector. Un código estable por producto; formato interno CF + ocho cifras, Code 128. La generación se guarda en servidor y no se repite al descargar/imprimir. En cada tarjeta: vista completa, PNG, impresión y PDF. PDF carta con selección de productos, copias y vista previa. Nueva venta agrega cada lectura completa una sola vez, sin confirmación por producto; dos lecturas deliberadas suman dos unidades. Desconocidos/ambigüedad tienen respuesta visible. No reasignar etiquetas silenciosamente durante una venta.

## Partes y puertas de calidad

1. **Datos y autoridad:** migración aditiva; generación serializada/idempotente por producto; unicidad global, reserva permanente de códigos retirados y control de sesión/rol/sucursal. Pruebas SQL aisladas de duplicados, permisos, códigos retirados, cambios simultáneos y borrado sin perder reservas. Aplicar sólo después de versionar SQL probado.
2. **Catálogo:** servicio único y sección al final de editar/tarjetas; cambios sólo del código sin sobrescribir nombre/precio ni visibilidad. No reasignar códigos desde caja. Nuevos productos requieren guardarse antes. Pruebas de estado, error y doble toque.
3. **Etiquetas:** encoder probado; SVG de pantalla, PNG nítido y PDF vectorial carta; código y nombre, márgenes blancos, copias, paginación y selección. Impresión térmica siempre gráfica, aunque el dispositivo prefiera texto. Exportación Android con detección de capacidades y alternativa explícita para APK antiguo; el código web no instala nuevas capacidades nativas.
4. **Venta:** lectura física por teclado con terminador, un solo manejador, sin deduplicar por valor/ventana; foco y diálogos protegidos, carrito funcional/inmutable, validación actual de producto/sucursal. Cola respeta orden de escaneos. Mantener caja, pago, tickets y recuperación de intenciones existentes.
5. **Integración/publicación:** lint y tipos sin errores nuevos, suites del proyecto, pruebas de interfaz aislada con teclado real, lectura de PNG/PDF por decoder independiente, build. Publicar preview, migración, producción y apk/capacitor sin force; comprobar SHA, READY y contenido servido. Actualizar documentación y registrar evidencia.

## Matriz de aceptación

- Generar dos veces o desde dos solicitudes conserva un solo código del producto.
- Dos productos no pueden compartir código, incluidos inactivos; código retirado/eliminado no pasa a otro producto.
- Reasignar exige advertir que las etiquetas anteriores dejan de ser válidas; conservar reserva, no reciclar.
- Un producto sin código mantiene venta táctil normal. Otro de sucursal ajena/inactivo no entra por escaneo.
- Tres escaneos iguales agregan tres piezas; lectura incompleta no se acepta como sufijo de otra.
- Enter no dispara Cobrar ni Guardar. No hay doble escucha input/documento.
- Pago, ticket o modal abierto suspenden capturas de venta. Reconectar no cobra ni reproduce lecturas antiguas.
- PDF de uno/varios productos y múltiples páginas conserva identificadores/nombres, no corta etiquetas ni encoge barras indiscriminadamente.
- PNG/PDF usan códigos ya persistidos; exportar no genera asignaciones nuevas sin acción explícita.
- Ningún test realiza ventas/pedidos/abonos/cortes ficticios en producción.

## Límites físicos

El lector debe configurarse como teclado con Enter al terminar y una lectura por disparo. Dos tramas idénticas emitidas por el hardware no pueden distinguirse de dos disparos deliberados sólo por su contenido. Compatibilidad, papel/impresora y versión realmente cargada se prueban en sitio. Guardar/compartir archivos en un APK sin puente nativo puede requerir APK actualizado y firma del propietario; no se presenta el deploy web como instalación de un binario nuevo.

## Registro

Estado inicial: repositorios y servicios consultados antes de editar; esquema sin códigos de barras. Las pruebas y el resultado de publicación se consignan en el informe de entrega fechado, sin congelar hashes en los documentos de contratos.

Implementación completada por partes; revisar informe de entrega para evidencia y publicación. El modelo de bloqueo/unicidad se auditó en SQL y las pruebas PGlite validan regresiones funcionales; no se presenta PGlite como una prueba de carga de varias conexiones PostgreSQL simultáneas.

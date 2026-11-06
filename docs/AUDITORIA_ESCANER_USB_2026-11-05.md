# Auditoría de escáner USB e impresión — Confetti
Fecha: 5 de noviembre de 2026, hora de CDMX.

## Dictamen
**La implementación web del escáner está integrada y supera las pruebas ejecutadas. No se puede declarar la instalación de Abel lista para operar todavía.** Los 43 productos activos del catálogo consultado carecen de código de barras; falta configurar el lector físico, identificar la tablet y comprobar lectura e impresión simultáneas en su APK.

Auditoría de la rama `apk/capacitor`, commit `4ad94b82af1630106085cd8cc691445784d927e5`, repositorio M1gu3hb/Pasteleria-Confetti. Este informe documenta el estado encontrado; no modifica lógica del POS, datos comerciales, permisos ni configuración de terminales. Las pruebas usan servicios sintéticos o bases locales; las consultas a Supabase real fueron de lectura.

## Evidencia de publicación y base de datos
- Vercel: deployment `dpl_G9FM8ov3NXA2znTSGvjrwa9uwkqa`, READY, rama apk/capacitor y SHA anterior.
- Alias del APK: https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app
- `capacitor.config.ts` apunta a ese alias: el APK carga la web remota. Los cambios web pueden llegar sin reinstalar; esto no acredita la URL ni versión del binario realmente instalado.
- Ruta /configuracion?seccion=escaner: HTTP 200 mediante el acceso autorizado de Vercel; HTML referencia /assets/index-BGbsF4fB.js.
- Supabase: proyecto ivqcxdpqxwjxfohiswqb, ACTIVE_HEALTHY. Health advisors sin avisos.
- Aplicadas las migraciones 20261101195452, 20261101204019 y 20261102062408.
- Verificados en vivo: RPC de asignación y búsqueda, índice único de codigo_barras y trigger de protección/reserva.
- Catálogo: **43 productos, 43 activos y visibles en POS, 0 con código, 43 activos sin código**. Cero duplicados e inválidos, pero no demuestra uso del escáner: aún no existen códigos cargados.
- La búsqueda valida sesión y sucursal, producto activo y visible. La asignación exige rol de administración; reserva los códigos y protege el prefijo CF. No se asignó ningún código durante esta auditoría.

## Pendientes y riesgos concretos
| Prioridad | Hallazgo | Consecuencia y acción |
|---|---|---|
| Alta, operación | Catálogo sin códigos | Conectar un lector no identifica productos por sí solo. Asignar el código real de cada producto comercial; para productos propios sin código, generar uno en el POS e imprimir su etiqueta. |
| Alta, validación | Sin tablet ni lector físico disponibles | No está probado que F9 y Enter lleguen al WebView de ese equipo, ni su alimentación con la impresora. Registrar modelo de tablet, Android, conexión USB y versión/URL efectiva del APK; realizar prueba de aceptación. |
| Media, configuración | El POS no detecta ni programa físicamente el escáner | Configuración → Escáner prueba eventos de teclado; no enumera lectores ni informa desconexión. No prometer “conéctelo y pulse detectar”. |
| Media, captura | El perfil compatible sin F9 permite escribir en campos enfocados | Una lectura puede terminar dentro de búsqueda o importe. Configurar F9 + código + Enter en el hardware y seleccionar el perfil recomendado en el POS. |
| Media, impresora | “Detectar impresoras USB” enumera todos los dispositivos y deja seleccionarlos | Un lector conectado puede aparecer y ser elegido por error como impresora. Conservar la impresora correcta; no seleccionar el escáner allí. Es un riesgo observable en el código, no una interferencia física reproducida. |
| Media, exportación | Descargar PNG/PDF en Android requiere ConfettiFiles | Si el APK instalado es anterior al plugin, la descarga falla con un mensaje de actualización. Lectura e impresión son rutas distintas; comprobar descarga si forma parte de la entrega. |
| Condición de uso | Búsqueda del código depende de Supabase | Requiere conexión y sesión activa; hay tiempo límite de 15 s con error visible. No es un lector con catálogo offline. |

Referencias de código:
- src/lib/barcodeFrame.js: separación por F9, Enter, controles, tiempos y descarte de fragmentos.
- src/lib/scannerCapture.js: propietario único, foco, navegación y diálogos.
- src/components/barcodes/useBarcodeScanner.js y src/lib/barcodeCore.js: cola ordenada, consultas obsoletas, cantidades.
- src/components/configuracion/EscanerCodigosSection.jsx: perfiles, prueba y límites explícitos.
- src/components/configuracion/ImpresoraCajonAppSection.jsx:65–71,153–166 y ConfettiPrinterPlugin.java: listarDispositivosUSB/dispositivoElegido, selección USB sin excluir HID.
- src/lib/barcodeExport.js: impresión y descarga nativa separadas.

## Pruebas repetidas en esta auditoría
| Prueba | Resultado | Qué acredita |
|---|---|---|
| npm ci y npm run build | Exit 0 | Instalación, quality y bundle web; no compilación Android. |
| Puerta quality / test:barcodes | Aprobada | SQL local, unicidad/reservas, RPC simuladas, parser, cola y configuración. Incluye 2,000 secuencias del modelo. |
| scanner_config_browser | 11 casos, 0 fallos | Foco entre productos, trama parcial, navegación, persistencia, diagnóstico, desactivación, consultas demoradas y protección de importes. |
| scanner_config_visibility_browser | Aprobada | Pestaña visible, enlace directo, tres lecturas, un solo panel y acceso de dueño. |
| barcodes_browser_verify | Aprobada | Catálogo, asignación, exportación, lecturas repetidas, cobro bloqueado mientras hay lecturas y diseño tablet/móvil. |
| barcodes_reauditoria_browser | Aprobada | Validación, impresión web 58/80, F9, precios y cambio de identidad. |
| barcodes_segunda_auditoria_browser | 4 casos aprobados | Cobro/sucursal con lectura parcial, PDF y asignación. |
| barcodes_auditoria_profunda_browser | 15 casos, 0 hallazgos del arnés | Recuperación de cobros ante respuestas perdidas, recarga, caja cerrada, borradores distintos y errores. |
| ticket_abonado_verify | 40 PASS, 0 FAIL | Regresiones de importes de anticipo/abonos en ticket. |
| ticket_pastel_base_limpia_verify | 21 PASS, 0 FAIL | Regresiones de información del ticket de pastel. |
| impresion_avance_corte_verify | 25 PASS, 0 FAIL | Avance antes del corte y configuración. |
| impresion_banco | 44 PASS, 0 FAIL | Emulación de binarización/framing ESC/POS; no firmware físico. |
| fase4_raster_bandas_sim | Aprobada | Reconstrucción de bandas y orden de corte en simulación. |
| ZXing independiente | Aprobada | Decodifica PNG de 1000/384/576 px y las 14 etiquetas de las dos páginas PDF carta. |

**Límites de estas pruebas:** Chromium de escritorio con eventos de teclado automatizados y datos sintéticos no equivale a Android físico. Las pruebas del transporte simulan el puente nativo. No se compiló, firmó ni instaló un APK; no hubo venta real, impresión en papel ni acceso remoto a la tablet. No se certifica ausencia universal de errores.

La puerta de tipos admite **557 diagnósticos históricos**: el build pasa con su línea base, pero no significa TypeScript limpio. No se modificó esa línea base.

## Tickets e impresión
Se comparó el código actual con el padre de la primera implementación de códigos de barras (`33809cb6c35829a50cf158b511b6b82b683ae11f`):
- Sin diferencias en src/components/tickets, TicketPastelConfetti.jsx, ConfettiPrinterPlugin.java, print.js, confettiPrinter.js ni colaImpresion.js.
- printTicket.js agrega una función para que las etiquetas usen la cola y transporte existentes; no rediseña los tickets.
- El modo **Imagen** reutiliza el nodo del ticket, conserva logo/diseño y usa raster de 576 puntos para 80 mm o 384 para 58 mm. El modo Texto es un fallback y no conserva el diseño visual.
- Etiquetas y tickets se serializan en la misma cola. Las pruebas cubren recuperación después de fallo de raster, avance, corte y conexión.
- El avance antes del corte existe; el default es 150 puntos. La configuración real de cada tablet puede ser diferente.
- Conservar modo Imagen, ancho de papel e impresora elegida. Aún debe compararse una impresión física de venta y otra de pastel, incluidos total, abonos, saldo, logo y final de papel.

## Escáner recomendado y alternativa
**Recomendación técnica condicionada: Zebra DS2208, alámbrico, con cable USB para datos.** Es lector 1D/2D y permite modo USB Keyboard HID y prefijos/sufijos programables. Shopify documenta conexión USB HID directa con tablets Android compatibles; esto es evidencia del método, no certificación de Confetti en la tablet de Abel.

Mercado Libre:
https://www.mercadolibre.com.mx/lector-de-codigo-de-barras-zebra-ds2200-ds2208-usb-2d-negro/p/MLM44565344

La ficha indexada mostraba aproximadamente $3,101 MXN. No se pudo abrir directamente (403): precio, existencia, vendedor, variante y entrega **no confirmados al momento de compra**. Contiene campos incoherentes de batería/voltaje: no usarlos como especificación técnica. Confirmar DS2208 original alámbrico y cable USB incluidos, garantía y devolución. No confundir DS2208 con DS2278 inalámbrico.

**Alternativa: Zebra Symbol LS2208 USB 1D**, suficiente para Code 128 de Confetti y códigos comerciales 1D; no para QR.
https://www.mercadolibre.com.mx/lector-de-codigo-de-barras-con-soporte-zebra-symbol-ls2208-usb-1d-twilight-black/p/MLM9239130

Su manual documenta USB HID y F9. Precio/stock actuales no verificados. Elegir kit USB, no variante RS-232. La compatibilidad de ambos es una inferencia por su protocolo y requisitos del POS, pendiente de la prueba del equipo real.

### Configuración prevista del DS2208
1. Modo USB Keyboard HID; no SNAPI, CDC/COM, OPOS ni HID POS.
2. Programar formato Prefix + Data + Suffix 1, prefijo F9 (5009), sufijo Enter (7013), mediante los códigos del manual/123Scan. Son valores de programación del manual; no texto a escribir en el POS.
3. Idioma del teclado coincidente con Android; evitar emulación por secuencias Alt, que el parser rechaza. Desactivar Keypad Emulation si produce esas secuencias.
4. Una lectura completa por disparo. Si la tablet pierde teclas, ajustar el ritmo según manual (por ejemplo 20 ms, menor que los 250 ms del POS) y repetir pruebas; no asumir que Fast HID funciona en cualquier equipo.
5. Configuración → Escáner → Restaurar configuración recomendada → Guardar → Probar escáner.
6. Hacer tres disparos: tres lecturas idénticas, F9 y Enter presentes. No se crea una venta en ese diagnóstico.
7. No cambiar la selección de impresora para configurar el lector.

El DS2208 especifica 250 mA típicos a 5 V. Si faltan puertos o alimentación, hace falta un hub/adaptador de datos compatible con USB host de la tablet, eventualmente alimentado. Tener una impresora USB funcionando es buena evidencia del puerto host, pero no acredita el presupuesto eléctrico ni el paso de F9. No se prescribe un hub concreto sin identificar tablet y conexiones.

## Criterio de aceptación en sitio
Miguel debe realizar la puesta en marcha antes de darla por entregada.
1. Confirmar tablet/modelo/Android y APK cargando el canal correcto, sin borrar almacenamiento ni intenciones de cobro.
2. Conectar impresora y lector simultáneamente; mantener seleccionada la impresora real.
3. Configurar F9 + Enter y registrar tres lecturas diagnósticas; desconectar/reconectar lector y repetir.
4. Cargar los códigos correctos en el catálogo. Generar etiquetas sólo para productos que lo requieran.
5. Probar una pieza, tres disparos del mismo producto y mezcla de productos: cantidades 1, 3 y suma correcta.
6. Probar código desconocido, producto inactivo/de otra sucursal, lectura incompleta y escaneo con pago abierto: no agregar producto incorrecto ni alterar importe/cobrar.
7. Verificar etiquetas impresas con lector físico; imprimir después ticket de venta y de pastel y comparar datos/diseño/final de papel.
8. Reiniciar app y repetir lectura e impresión. Descargar PNG/PDF si se ofrecerá esa función.
Una prueba que falle mantiene la entrega pendiente. No anunciar “sin errores” ni compatibilidad universal.

## Observaciones adicionales, fuera del núcleo del escáner
- Seguridad Supabase: tres vistas SECURITY DEFINER (config_publica, catalogo_publico, usuarios_login), funciones SECURITY DEFINER ejecutables por roles públicos/autenticados y protección de contraseñas filtradas desactivada. Son avisos que requieren evaluación de intención/permisos; no se demostró explotación. RLS sin políticas en tablas app_private puede ser deliberado.
- Remediación oficial: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view y https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Logs de la ventana móvil de 24 h: 124 errores P0001 en listar_pedidos_pastel_pos, línea 13 (rechazo de sucursal ajena en la definición vigente), y dos errores 42501 sin contexto. No se atribuyen al escáner; requieren revisar sesión/alcance de los clientes que los originan. No se consultaron credenciales ni se corrigieron permisos para evitar estos rechazos.

## Mensaje para Abel, acorde con la evidencia
Hola Abel, buenas noches. Le ofrezco una disculpa por la demora con el escáner. Esta función no estaba contemplada en la versión inicial y tuvimos que desarrollar la integración de los códigos, las etiquetas y la lectura en las ventas, además de revisar que se conservara la impresión de los tickets.

La función ya está integrada y revisada en el sistema. El modelo que le propongo es el Zebra DS2208 con cable USB:
https://www.mercadolibre.com.mx/lector-de-codigo-de-barras-zebra-ds2200-ds2208-usb-2d-negro/p/MLM44565344

Antes de que lo compre, quiero confirmar el modelo de su tablet para revisar la conexión. Después le apoyo con la configuración del lector, los códigos de sus productos y la prueba junto con su impresora, para dejarlo listo para usar. Muchas gracias por su paciencia y nuevamente una disculpa por el tiempo que tomó.

## Fuentes técnicas consultadas
- Zebra DS2208 Product Reference Guide, revisión A, octubre 2025: https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/product/ds2208-prg-en.pdf — USB 7-5, prefijos/sufijos 5-31 a 5-33, F9 I-10, Enter I-6.
- Zebra LS2208 Product Reference Guide, agosto 2025: https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/product/ls2208-prg-en.pdf — USB HID y tabla USB F Keys 3-24.
- Android USB host: https://developer.android.com/develop/connectivity/usb/host
- Shopify DS2208, sección conexión directa HID: https://help.shopify.com/es/manual/sell-in-person/hardware/barcode-scanners/zebra-ds2208-usb-barcode-scanner
- Zebra DS2200 ficha técnica: https://www.zebra.com/content/dam/zebra_dam/en/spec-sheets/ds2200-series-spec-sheet-en-us.pdf


## Seguimiento (2026-11-06)
Los pendientes de captura, desconexión, selector de impresora y ConfettiFiles se atendieron en el APK 1.3.0: ver docs/LECTOR_NATIVO_ESCANER_2026-11-06.md. Este informe se conserva como registro de la auditoría.

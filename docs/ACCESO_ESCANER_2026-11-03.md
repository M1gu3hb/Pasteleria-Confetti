# Acceso visible al escáner — 3 de noviembre de 2026

Miguel informó que no encontraba la sección ni veía cambios. Se volvieron a comprobar los refs y deployments, sin inferir que la tablet hubiera recargado. Producción y apk/capacitor conservaban dade1cc; ambos READY y ambos servían index-DHf-byyP.js con SHA256 00dff5d6b0c279e8d1d7b60db332421f56a1dd362be9b33ec53984578651a71e, que contiene Guardar ajustes del escáner. No se encontró ausencia de la implementación en esos dos aliases. No se obtuvo URL/dispositivo de la pantalla reportada, por lo que no se afirma haber diagnosticado su caché o instalación. El navegador conectado del usuario no estuvo disponible.

## Hallazgo de acceso

La sección estaba al final de Operación, después de la impresora, y Configuración abre Identidad por defecto. No existía una pestaña Escáner. La ruta sigue siendo sólo para dueño mediante AdminRoute; no se amplían permisos para resolver visibilidad. Las pruebas anteriores montaban el componente de escáner directamente y no verificaban que se encontrara en la pantalla Configuración completa.

## Cambio

Escáner tiene pestaña visible junto a Operación y un solo montaje del panel. El enlace /configuracion?seccion=escaner abre esa pestaña directamente. La selección de otras pestañas también se conserva en el parámetro seccion; valores desconocidos vuelven a Identidad. La ruta de dueño sigue validándose antes de mostrar Configuración. El lector, ajustes locales, diagnóstico, precios, cobros, SQL y transporte de impresión no se modifican.

## Evidencia

scanner_config_visibility_browser.mjs monta Configuracion, Radix Tabs, AdminRoute y el escáner reales. Sólo simula datos/contextos y sustituye secciones ajenas a la revisión por placeholders. BASELINE=1 carga Configuracion de dade1cc y falla esperando la pestaña Escáner. La versión corregida comprueba pestaña visible al abrir Configuración, enlace directo, un solo panel, tres tramas en diagnóstico sin escrituras, ancho de 360 px y rechazo de roles administrador/caja/pastelero por la ruta existente. Se revisa además build completo con sus puertas de lint/tipos/regresiones; no se altera la deuda histórica para aprobar.

## Comprobación en el equipo

Abrir el POS correcto, acceder al modo dueño con su PIN y seleccionar Configuración → Escáner. Verificar ambos aliases en Vercel y los bytes servidos después de publicar. Un deploy no prueba que una instancia abierta de la tablet ya cargó el cliente. No borrar almacenamiento, intenciones de cobro ni configuración de terminal para actualizar la pantalla. Si persiste la ausencia después de cargar la nueva versión, obtener el enlace y la pantalla realmente utilizados antes de atribuir otra causa.

La puerta de tipos detectó que los wrappers TabsTrigger/TabsContent no declaraban sus props y rechazaban las nuevas instancias. Se tiparon sus props/ref con las definiciones reales de Radix, sin cambiar el comportamiento de ejecución ni la línea base de deuda. El diagnóstico actual baja de 597 a 557 errores históricos y no añade nuevos.

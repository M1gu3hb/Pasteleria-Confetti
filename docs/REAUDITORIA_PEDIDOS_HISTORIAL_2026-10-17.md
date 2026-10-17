# Reauditoría de integración de pedidos e historial — 17 de octubre de 2026

## Alcance

Revisión solicitada por Miguel de todos los cambios de 67b7eba a 00134fa: 32 archivos de implementación, migración, documentación y pruebas. Se contrastaron los consumidores compartidos: Sidebar, Caja, Dashboard, detalle, pago, creación/edición, tickets, exportación y reportes. Las ramas operativas y el alias APK se inspeccionaron en vivo antes de corregir. No se delegó la revisión ni se crearon operaciones ficticias del negocio.

## Hallazgos corregidos

1. **Contador del menú desfasado respecto de Actuales.** Sidebar seguía leyendo todos los pedidos por estado, por lo que los antiguos pagados seguían contando. Lectura viva: Xochimilco 306 frente a 192 Actuales; Topilejo 60 frente a 42; San Gregorio 4 frente a 2. Ahora usa la misma RPC/clasificación con límite de una fila y total completo; incluye sucursal en cache y comparte prefijo de invalidación con pagos/ediciones. No necesita descargar el historial para contar.
2. **Recarga repetida de historial largo.** useInfiniteQuery volvía a leer cada página cargada cada quince segundos, también en Historial completo. Se desactiva sólo ese polling histórico; Actuales y Anteriores siguen actualizándose cada quince segundos. Se mantienen consulta al entrar, invalidación y reconexión. Cargar más conserva su cursor y la consulta de detalle conserva verificación fresca antes de cobrar/imprimir.
3. **Gastos anteriores en caché al cambiar de sucursal, condición preexistente en Registros.** La consulta tenía placeholderData previo y sus gastos podían pasar a ResumenPeriodo/exportación durante el cambio. Se retira ese placeholder y se añade filtro local estricto por sucursal antes de ambos consumidores. La guarda también rechaza una respuesta tardía/mezclada de otro alcance.
4. **Documentación vigente desfasada.** Se corrigen referencias a la cuarta fila de filtros y a 677 diagnósticos de tipos: actualmente son 597 conocidos, sin diagnósticos nuevos aceptados. Se registran el contador compartido y la actualización selectiva del historial. Los informes fechados anteriores permanecen como evidencia histórica.

5. **Prueba de cuotas sensible al reloj.** El build APK dpl_DBXzC86GgT2MzWymfVhUwFPpk6YM preparó una cuota al final de 19:06:59 UTC y comprobó el rechazo a las 19:07:00.003: el reinicio legítimo de minuto produjo un falso fallo. Se fijan las ventanas de minuto/hora mediante transacciones de la base aislada; los rechazos esperados usan rollback/savepoints. Se conservan todos los casos de rechazo, reintento y reinicio de cuota, sin cambiar funciones del servidor. El fallo de build dejó el alias APK en su versión anterior; se publica un commit posterior en ambos canales y se verifica su convergencia.

## Pruebas de regresión y contraste

- historial_integracion_verify ejecuta el bloque real de Sidebar: contador 1 frente a 2 filas antiguas, total de servidor con página 1, invalidación y cambio de sucursal. También renderiza Registros real con gastos de A/B y comprueba que sólo A llega al reporte de A.
- pedidos_horario_whatsapp_verify ejecuta pantalla/callbacks reales y exige polling 15 s en Actuales y ausencia de polling periódico al buscar en Historial.
- Las tres regresiones se ejecutaron con código de 00134fa mediante un worktree aislado: fallaron respectivamente por contador 2≠1, inclusión de gasto ajeno y polling 15000≠false. Pasan con la corrección. Integradas en quality/build, sin alterar la línea base de tipos ni silenciar errores.
- Se repite build con lint, puerta de tipos, operación/consultas, autoridad, recuperación, protección de ventas, entrada web de ambas clases en tres sucursales, voz, evidencia financiera y cancelaciones, nativo, horarios, SQL de clasificación y paginación. La suite de historial recorre 1,212 filas y la lista de cortes 205 bajo cap de 73 por página.
- Verificaciones adicionales de tickets: ticket_abonado_verify 40/40 y ticket_pastel_base_limpia_verify 21/21. cierre_caja_verify: 24/24 pruebas locales; su integración remota por credenciales se omitió explícitamente. La conciliación remota se consultó por el conector autorizado en lugar de usar credenciales de terminal.

## Contratos revisados y conservados

- No hay nueva migración ni cambio de SQL, RLS, tablas o datos operativos en esta reauditoría. listar_pedidos_pastel_pos viva sigue con hash 21010163d656c9f447171c441b600d17, STABLE SECURITY INVOKER y sin execute anónimo. Sin created_at nulo en pedidos y sin cierres cerrados/registrados que carezcan de fecha.
- Personalizados no tiene acción manual Entregado ni pregunta al liquidar. Catálogo conserva su botón específico. La agrupación por fecha/saldo no marca una entrega física: la sección informativa de entregas en cortes sigue leyendo sólo entregas realmente registradas e históricas, nunca las infiere por antigüedad. Esa sección no suma al dinero del corte.
- Sucursal en servidor, RLS, cache y guardias locales. Dueño/pastelero mantienen alcance global deliberado; administrador/terminal permanecen limitados a su sucursal. Detalles y PDF previos se ocultan al cambiar de alcance.
- Caja y Dashboard comparten paginación de cortes con avance por filas recibidas. El detalle usa datos_corte_pos y verifica ID/sucursal, incluyendo sus ventas, abonos y gastos. Registros permite cargar más aunque la búsqueda actual no encuentre coincidencias. Exportaciones parciales siguen identificadas. Ventas conserva totales completos y sólo dosifica tarjetas.
- La RPC devuelve created_at; las tarjetas no imprimen directamente esa instantánea. El detalle exige lectura fresca a través del adapter, que conserva created_date para el ticket. No se cambia fecha, contenido ni aritmética del comprobante.
- Input sólo recibió tipado JSDoc, sin cambios de comportamiento. La consulta nueva no reemplaza historial_operativo_pos ni el snapshot financiero. No se tocaron los tres candados de Caja, efectivoEsperado, componentes de ticket ni módulos/configuración nativa.
- Conciliación viva: cero abonos de caja sin venta, saldos inconsistentes, enlaces inconsistentes y ventas con corte de otra sucursal. Permanecen cuatro cancelaciones previamente documentadas; no se corrigió dinero histórico por inferencia. Los conteos de ventas/abonos cambian por operación normal mientras se audita; esta revisión no ejecuta DML.

## Publicación y límites

Correcciones destinadas al mismo proyecto/team verificados, con avance sin force de migracion/supabase y apk/capacitor al mismo commit. Después del build se verifican ambos aliases en READY y el bundle servido, incluidos contador compartido, polling histórico desactivado y guarda de gastos. No se incluye el HTML de pruebas sintéticas en producción.

Esta auditoría certifica las comprobaciones descritas, no perfección absoluta ni entrega a dispositivos físicos. Sigue pendiente comprobar en cada tablet la recarga y su impresora. La retención de varios años depende también de capacidad, respaldo y restauración; no se borra historial por estas clasificaciones. El mensaje para Abel pide reabrir la app o reiniciar la tablet y revisar los cambios.

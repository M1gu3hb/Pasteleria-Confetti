# FILE_MAP — contratos vigentes

## Pedidos anteriores y paginación

src/pages/PedidosPastel.jsx: vistas y navegación obvia; src/lib/pedidosAnteriores.js: lector validado y contador Actuales de Sidebar; src/utils/situacionPedido.js: etiquetas; PedidoPastelCard/DetalleDialog/RegistrarPagoDialog: tarjetas y retiro de entrega manual de personalizados. CorteHistorialList/CortesRecientesDashboard: historial compartido; Registros/useListaPaginada/Ventas: cargar más y alcance. Nueva migración listar_pedidos_pastel_pos. scripts/pedidos_anteriores_sql_verify.mjs, pedidos_historial_cliente_verify.mjs e historial_integracion_verify.mjs integran quality/build. historial_browser_fixture.mjs genera sólo una prueba aislada con datos sintéticos y sin conexión al negocio; no se incorpora al build.

Revisado el 2026-10-17.

Evidencia: evidenciaFinanciera.js, EvidenciaPagoDialog.jsx, migración evidencia_financiera_pos y suites evidencia_financiera/evidencia_cliente. Dinero: operacion_pedido_tx y migraciones operativas; historial: historial_operativo_pos; reimpresión: cargarTicketVenta/TicketViewerDialog; impresión: colaImpresion/printTicket; importación: importacionesDisponibles/importExecutors; conciliación: EstadoConciliacion; web: envioPedidoWeb y ambos formularios. Suites: operacion_*, autoridad_*, recuperacion_auth, pendientes_sql, pendientes_cliente, voz_edge; puerta de build: calidad_types_verify con fixtures/typecheck_deuda_conocida.json.

## Evidencia financiera y cancelaciones

Bitácora automática privada de las seis tablas financieras, guardada en la misma transacción; observación inicial distinguida de eventos reales. Evidencia y reconstrucción de cancelaciones en [REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md](REAUDITORIA_EVIDENCIA_FINANCIERA_2026-10-02.md). Los pedidos con abono ligado a venta cancelada requieren conciliación interna antes de nuevos cobros, devoluciones o entrega; reintentos confirmados siguen recuperables. Nunca recrear dinero antiguo ni exigir otro POS/comprobante externo como requisito.

## Contratos que se deben conservar

- Dinero: intención persistente, RPC transaccional, abono↔venta explícitos, saldo derivado en servidor; reintentar recupera el comprobante original. No simular pagos en producción.
- Sucursal/corte: alcance de sesión y consulta canónica; operación y cierre comparten bloqueo. Un corte cerrado no recibe modificaciones silenciosas de cliente.
- Histórico: snapshot financiero con RLS del solicitante y fallo visible. No sustituirlo por un `.limit()` ni presentar exportación parcial como completa.
- Autoridad: dueño activo protegido, administrador con Auth propia/sucursal, sólo terminales técnicas enroladas en registro privado; perfil técnico inactivo no significa dispositivo desautorizado. PIN público pasa por Edge y cuota durable.
- Canales: consultar Git, migraciones y Vercel en vivo; avanzar `migracion/supabase` y `apk/capacitor` al mismo commit sin force. Una tablet abierta debe recargar para recibir el cliente nuevo.

## Evidencia y riesgos abiertos

Consultar [reauditoría](REAUDITORIA_CIERRE_PENDIENTES_2026-10-02.md) para pruebas y límites, y [contexto histórico](FILE_MAP_HISTORICO_2026-10-02.md) para decisiones anteriores. Las afirmaciones antiguas de auth pendiente, rama congelada o importaciones disponibles no definen el contrato actual.

## Códigos de barras de catálogo

Productos permite generar un código interno CF + ocho cifras o asignar uno existente; la misma sección aparece al final de la tarjeta y de Editar. Código estable, único incluso entre productos inactivos y reservado después de cambiarlo/eliminar el producto. Cambiarlo advierte que las etiquetas anteriores dejan de funcionar; caja nunca lo reasigna. La RPC comprueba administrador/dueño y sucursal.

Nueva venta agrega una pieza por trama completa del lector HID + Enter; repetir deliberadamente suma piezas. Consulta el catálogo vigente por sucursal, serializa lecturas, bloquea cobrar mientras hay pendientes y descarta respuestas de otra venta/sucursal. Pausa en pago/ticket/diálogos y consume el Enter del lector para no activar botones. Los campos de edición reciben teclado normal; el lector de venta no captura búsquedas. PNG, vista grande, impresión gráfica y PDF carta por lotes usan Code128 y códigos persistidos.

El cliente web también llega al alias de apk/capacitor al recargar. Guardado Android de PNG/PDF necesita ConfettiFiles del APK nuevo; versiones antiguas indican el límite y permiten descargar desde Chrome/computadora. El código nativo 1.2.0 requiere compilar, firmar e instalar con la firma del propietario; un deploy web no instala plugins. Pruebas: npm run test:barcodes y scripts/barcodes_browser_verify.mjs; plan y evidencia en docs/PLAN_CODIGOS_BARRAS_2026-11-01.md y docs/ENTREGA_CODIGOS_BARRAS_2026-11-01.md.

- src/lib/barcodeCore.js: tramas, cola y carrito inmutable.
- src/lib/barcodes.js: límite RPC, errores y timeout de consulta.
- src/lib/barcodeLabels.js / barcodeExport.js: Code128 vectorial, PNG, PDF carta e impresión/exportación.
- src/components/barcodes/: panel, imagen, PDF y hook de teclado.
- android/app/src/main/java/com/mhastral/confettipos/ConfettiFilesPlugin.java: ACTION_CREATE_DOCUMENT sólo PNG/PDF.

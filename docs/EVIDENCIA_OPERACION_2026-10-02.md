# Evidencia resumida de validación

- PostgreSQL 17: carrera cobro/cierre probada en ambos órdenes; resumen obsoleto rechazado; cierre correcto confirmado.
- Dos abonos distintos de 190 contra saldo de 200: uno confirmado, otro MONTO_EXCEDE_SALDO. Anticipo previo 100 + pago 190, devolución neta 290 una vez, saldo neto del libro 0.
- Misma intención simultánea: una venta/un pedido. Devolución simultánea: mismo resultado, una negativa.
- Sucursales A y B con fechas superpuestas: comprobantes contienen únicamente sus ventas/corte/sucursal.
- Payload de venta diferente con misma clave: INTENCION_NO_COINCIDE.
- Fixture temporal revocado, no expuesto al API, eliminado; ninguna operación ficticia persistió en tablas public.
- Fallos después de pedido/venta/detalle/abono/update/registro de intención: rollback completo y reintento único.
- Histórico reconocido conservado, folios sin truncar, agregados y comprobantes incluyen 60001 filas.
- Cliente real: API caps 73 y 1000, todos los umbrales hasta 10001; mutación del conjunto señalada como error, offset global/sucursal correcto.
- Intención: respuesta perdida después de COMMIT, recarga y cambio de monto recuperan el original; doble toque comparte solicitud.
- Fechas de CDMX en cuatro zonas de dispositivo; PDF y térmico reales muestran devolución/método.
- Calidad: build PASS; lint 38 errores previos; typecheck 1134 frente a 1253, sin diagnósticos nuevos normalizados.

Reproducir: npm ci && npm run test:operacion. El harness local de PostgreSQL no es una base de producción y carece de datos de clientes/credenciales. La validación de hardware físico sigue pendiente.

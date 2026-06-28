# BITÁCORA — Run nocturno (una línea por evento, en orden, con hora)

> Llena esto en orden cronológico. Cada cambio grande, migración, bug, decisión, fase
> cerrada o flag = una línea aquí + su reporte detallado en este mismo folder.

| Hora | Fase | Evento | Veredicto | Reporte / Commit |
|------|------|--------|-----------|------------------|
| — | — | (inicio del run) | — | — |
| 02:10 | — | Leídos MDs NOCHE 00-05; commit de plan + carpeta REPORTES | — | 31e505e |
| 02:35 | 3 #5 | Cancelación de pedido con tipo/motivo/sello (mig 0026 + CancelarPedidoDialog + 2 wirings). Verificado en vivo (BD/cola/build). | 🟢 | 01_fase3-5_… |
| 03:30 | 3 #4 | ⚠️DINERO Devolución de anticipo = abono compensatorio negativo en corte abierto (util devolucionAnticipo). 5 escenarios en vivo (cross-corte, mixto, regresión, sin anticipo, sin caja). Corte viejo intacto. | 🟢 | 02_fase3-4_… |
| 04:10 | 3 #6 | Entregas de pastel en el corte (util entregasCorte + ResumenDelDia + CorteTicket + 3 sitios). Línea informativa, no toca totales. Verificado en vivo (Resumen + PDF). #3 COMPLETO. | 🟢 | 03_fase3-6_… |
| 05:00 | 4 | Nota de voz (mig 0027 bucket notas-voz + 2 cols; NotaVozRecorder MediaRecorder+SpeechRecognition; form + detalle). Subida de blob 200 + read 200; campos persisten; placeholder reemplazado. ⚠️FLAG: grabación con micrófono real = verificación manual de Miguel. | 🟢 | 04_fase4_… |

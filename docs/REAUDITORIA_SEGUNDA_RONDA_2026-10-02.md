# Reauditoría y segunda reparación — 2026-10-02

Miguel autorizó auditar la entrega anterior y continuar críticos/altos, priorizando dinero, clientes, ventas, historial y sucursales. No se certifica la auditoría completa ni la operación física de las tablets.

## Reauditoría de F05–F14

Las migraciones originales y ambos canales se comprobaron antes de editar. La lectura de producción dio cero saldos activos discrepantes con el libro y cero enlaces abono/venta con otro importe, corte o sucursal. Los cinco ajustes históricos permanecen respaldados. Los cuatro pares cancelados por $1700 siguen pendientes de conciliación documental; no se recrea ningún ingreso.

La revisión encontró huecos adicionales, por lo que la entrega anterior no se aceptó sin cambios:

- Un pago confirmado con respuesta perdida podía quedar inaccesible desde la pantalla al aparecer saldo cero o cerrarse caja. Recuperación explícita del intento original, también para creación/devolución; no requiere otro cobro ni el corte actual abierto. El detalle espera lectura actual antes de cobrar/imprimir y refresca cada 15 segundos.
- Historial del pedido mostraba solo 20 abonos: ahora carga todos o comunica error.
- Un precio nulo/NaN o un cambio directo a pagado podía ocultar deuda. Se rechazan totales inválidos, se derivan saldos incluso al cambiar estado y no se entrega un pedido con deuda.
- Los detalles de ventas pagadas/cortes cerrados aún admitían alteraciones independientes: se protegen cantidades/precios/importes y detalles históricos. No se elimina un corte desde el navegador.

Los contratos atómicos, reintento, folios, exclusión de cierre, consultas por sucursal y calendario se conservaron y se vuelven a ejecutar las pruebas sobre 60001 ventas aisladas. Los tres candados de Caja y efectivoEsperado permanecen sin cambios.

## Críticos y altos siguientes

| Hallazgo | Reparación y criterio |
|---|---|
| F01 | Gestión de identidad únicamente por RPC del dueño activo; no hay escritura directa ni lectura de hashes/auth_user_id. Configuración/sucursales solo dueño; catálogo dueño/administrador real. Administrador tiene identidad propia y alcance financiero de su sucursal. |
| F02 | Se retira contraseña compartida del cliente; autorización de terminal nueva/restablecida por dueño y sesión Auth revocable por dispositivo. Sesión técnica ya abierta se conserva y se guarda antes de entrar como administrador. Contraseñas compartidas/derivadas antiguas se retiran después de verificar los canales nuevos. |
| F03 | Única ruta de PIN: Edge con contador persistente y bloqueo por cuenta/selector e IP; funciones de comprobación antiguas no ejecutables por anon/authenticated. PIN continúa de cuatro dígitos. No hay signInWithPassword en el cliente ni contraseña POS-PIN funcional tras la rotación. |
| F04 | Protección del último dueño en servidor, bloqueo común para cambios simultáneos y auditoría de actor/motivo/antes/después sin hashes. Helpers consultan actividad actual; cuentas técnicas inactivas se reconocen por registro privado separado. |
| F16 | Se retira INSERT anónimo. RPC pública mantiene folio/estado/origen/crédito controlados, rechaza pagos/autoridad adicionales, totales inválidos, sucursal inactiva, cliente/fecha inválidos. |
| F15 | Mínimo de entrega con calendario CDMX en ambos formularios y validación equivalente de servidor. |

## Verificación reproducible y límites

`npm run test:operacion` y `npm run test:autoridad`. Fixture sin usuarios/clientes de producción; criptografía y funciones SQL reales. Verificar último dueño concurrente en un esquema privado no expuesto, eliminado al terminar. No crear operaciones ficticias en public.

El inicio por PIN usa generateLink sin correo y verifyOtp de un solo uso. El endpoint de prueba magiclink queda retirado. Una terminal nueva o cuyos datos se borraron necesita autorización inicial del dueño; la operación diaria de terminales con sesión válida permanece automática. No borrar almacenamiento con intenciones financieras inciertas.

La rotación de contraseñas conserva sesiones Auth existentes para evitar sacar a las cajas de operación. No demuestra que las sesiones anteriores hayan sido todas legítimas: revisar dispositivos/sesiones históricas y revocar los desconocidos por identificación verificable; cerrar todas a ciegas interrumpiría sucursales. Código/canal verificado no demuestra que cada tablet abierta haya recargado. Impresora/cajón requieren prueba física. F17/F18/F19/F20/F22–F26 no se declaran cerrados; controles generales de calidad continúan con deuda previa.

## Despliegue

Migraciones nuevas se versionan antes de aplicar; ninguna migración anterior se modifica. Publicar producción y apk/capacitor al mismo commit y confirmar ambos READY, además del sitio público si cambió el calendario. Rotar contraseñas al final de esa comprobación. Ante problema, corrección hacia adelante; no restaurar cliente que escribe pagos separados o credenciales compartidas.

## Evidencia antes de publicar

Pruebas operativas y de autoridad PASS; criptografía pgcrypto real en fixture. Dos sesiones PostgreSQL 17 intentaron desactivar simultáneamente dos dueños de prueba: una confirmó y otra recibió ULTIMO_DUENO; quedó uno activo. El esquema privado de prueba se eliminó. Builds POS/web exit 0. Typecheck POS 843 frente a 1134 en la entrega anterior, sin diagnósticos nuevos normalizados; se tiparon props reales de Button/Dialog, sin ignorar errores. WEB conserva 23 diagnósticos y un error lint previo; POS conserva 38 errores lint previos. No se declara saneamiento completo.

# Guía corta: lector de códigos de barras (Confetti POS 1.3.0)

Esta guía es para usar el lector en la terminal de la pastelería. Miguel instala la app 1.3.0 y hace la primera prueba con usted.

## 1. Conectar
Conecte el lector a un puerto USB de la terminal. No hace falta configurar nada en el lector.

## 2. Vincular (una sola vez)
1. Abra **Configuración** → pestaña **Escáner**.
2. En el recuadro **Lector USB de esta terminal**, toque **Vincular lector**.
3. Escanee **el mismo código impreso tres veces**, soltando el gatillo entre cada lectura. Sirve la etiqueta de prueba (botón **Imprimir etiqueta de prueba**) o el código de cualquier empaque. El lector no lee códigos en la pantalla.
4. Verá **Lecturas correctas seguidas: 3 de 3** y luego **Lector vinculado y guardado en esta terminal**. Listo.

Si aparece **Hay otro dispositivo idéntico conectado**, desconecte el que no sea el lector y repita.

## 3. Probar sin vender
Toque **Probar escáner** y escanee un producto. Debajo de cada lectura toque **Buscar producto (sólo consulta)**:
- **Producto encontrado: …** → ya puede venderlo con el lector.
- **Este código no está registrado en el catálogo** → el lector funciona; falta registrar ese código (punto 5).
Toque **Terminar prueba** al acabar. Esta prueba no hace ventas ni cambia productos.

## 4. Vender
En **Nueva venta**, escanee el producto: se agrega una pieza. Escanee tres veces y serán tres piezas. Debajo del lector verá **Lector vinculado conectado.**
- Mientras está abierto el cobro, el lector no escribe en el importe ni cobra.
- Si ve **Lector vinculado desconectado: revise el cable USB.**, conéctelo de nuevo; vuelve a funcionar solo.

## 5. Registrar códigos de sus productos
Hoy sus productos todavía no tienen código; por eso, al principio, el lector no los encuentra.
- **Productos con código en el empaque** (refrescos, velas…): **Productos** → abra el producto → **Código de barras** → **Asignar o detectar** → escanee el empaque.
- **Productos propios** (pasteles, gelatinas…): **Productos** → **Código de barras** → **Generar código** → **Imprimir**. Pegue la etiqueta en el producto o en una hoja junto a la caja. Para muchos a la vez: **Generar PDF**.

## Si algo no funciona
Avise a Miguel con una foto de la pantalla **Configuración → Escáner**. No desinstale la app ni borre sus datos.

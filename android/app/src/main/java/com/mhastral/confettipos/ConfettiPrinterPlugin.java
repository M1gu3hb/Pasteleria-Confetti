package com.mhastral.confettipos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.dantsu.escposprinter.EscPosPrinterCommands;
import com.dantsu.escposprinter.connection.DeviceConnection;
import com.dantsu.escposprinter.connection.tcp.TcpConnection;
import com.dantsu.escposprinter.connection.usb.UsbConnection;
import com.dantsu.escposprinter.connection.usb.UsbPrintersConnections;

import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;

import com.mhastral.confettipos.scanner.UsbClasificacion;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ConfettiPrinter — plugin nativo DELGADO de impresión (Fase 3).
 *
 * Es un "tubo" tonto a propósito: SOLO conecta y manda bytes/imagen/comandos a la
 * impresora. NO tiene lógica de ticket (esa vive en JS y se actualiza por Vercel).
 * Envuelve la librería ESC/POS de DantSu para el encoding (USB/TCP, raster de
 * imagen, corte y patada de cajón). Toda I/O corre en un hilo de fondo (evita
 * NetworkOnMainThreadException / ANR) y cada método devuelve un error VISIBLE.
 *
 * API expuesta a JS (registrada en MainActivity):
 *   conectarUSB(), conectarTCP({ip,puerto}), enviarBytes({bytesBase64}),
 *   imprimirImagenRaster({imagenBase64}), cortar(), abrirCajonPorImpresora(),
 *   desconectar().
 */
@CapacitorPlugin(name = "ConfettiPrinter")
public class ConfettiPrinterPlugin extends Plugin {

    private static final String ACTION_USB_PERMISSION = "com.mhastral.confettipos.USB_PERMISSION";
    private static final int MAX_RASTER_WIDTH = 576; // 80mm @ 203dpi = 576 puntos
    // FASE 4: filas por BANDA de raster. Cada banda se manda como su PROPIO GS v 0
    // para que quepa en el buffer de imagen del cabezal (la Easytime desborda con un
    // raster monolítico alto → ticket incompleto + sin corte). 255 es el valor más
    // conservador: la altura cabe en un solo byte (yL, sin el borde yL=0 de 256) y se
    // mantiene <=256 (límite empírico de impresoras sensibles). Confirmable EN SITIO
    // (Fase 5): subir a 256/257 es cambiar solo esta constante. En simulación 255/256/257
    // reconstruyen idéntico (ver scripts/fase4_raster_bandas_sim.mjs).
    private static final int BAND_HEIGHT_DOTS = 255;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private DeviceConnection connection; // conexión activa (USB o TCP)

    // ---------------------------------------------------------------- USB ----
    // FIX B (selección): conectarUSB honra la impresora ELEGIDA (vendorId/productId de la config
    // local). Si se eligió una específica y YA NO está conectada, cae a la conectada pero DEVUELVE
    // un aviso (fallback=true) — NUNCA en silencio (hallazgo medio de Codex). Sin elección → primera.
    // 1.3.0: si la elección guardada NO es una impresora (lector/teclado HID u otro dispositivo),
    // tampoco se abre: mismo fallback con aviso explícito. Una impresora de clase propietaria (0xFF)
    // usa UsbBulkConnection; la de clase Printer (7) sigue por UsbConnection de DantSu, sin cambios.
    @PluginMethod
    public void conectarUSB(final PluginCall call) {
        final Integer vendorId  = call.getInt("vendorId");
        final Integer productId = call.getInt("productId");
        io.execute(() -> {
            try {
                Context ctx = getContext();
                UsbManager usbManager = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
                if (usbManager == null) { call.reject("No se encontró ninguna impresora USB conectada."); return; }

                Seleccion sel = seleccionar(ctx, usbManager, vendorId, productId);
                if (sel == null) { call.reject("No se encontró ninguna impresora USB conectada."); return; }

                if (usbManager.hasPermission(sel.device)) {
                    abrirUsb(call, sel);
                } else {
                    solicitarPermisoUsb(call, usbManager, sel.device, vendorId, productId);
                }
            } catch (Exception e) {
                call.reject("Error al conectar por USB: " + mensaje(e));
            }
        });
    }

    /** Resultado de elegir qué abrir: conexión, dispositivo y aviso (si se usó otra que la elegida). */
    private static final class Seleccion {
        final DeviceConnection conexion;
        final UsbDevice device;
        final boolean fallback;
        final String aviso;
        Seleccion(DeviceConnection conexion, UsbDevice device, boolean fallback, String aviso) {
            this.conexion = conexion; this.device = device; this.fallback = fallback; this.aviso = aviso;
        }
    }

    private Seleccion seleccionar(Context ctx, UsbManager usbManager, Integer vendorId, Integer productId) {
        boolean pidioEspecifica = (vendorId != null && productId != null);
        String aviso = null;
        if (pidioEspecifica) {
            UsbDevice d = buscarDispositivo(usbManager, vendorId, productId);
            if (d != null) {
                String tipo = tipoDispositivo(d);
                if (UsbClasificacion.IMPRESORA.equals(tipo)) {
                    return new Seleccion(new UsbConnection(usbManager, d), d, false, null);
                }
                if (UsbClasificacion.PROPIETARIA.equals(tipo)) {
                    return new Seleccion(new UsbBulkConnection(usbManager, d), d, false, null);
                }
                aviso = "La elección guardada (" + nombreDispositivo(d) + ") no es una impresora; parece un lector o teclado. "
                    + "Se usó la impresora conectada. Elige la impresora en Configuración.";
            } else {
                aviso = "La impresora elegida no está conectada; se usó la impresora conectada. Revisa la selección en Configuración.";
            }
        }
        // Sin elección (o elección inválida): primera impresora de clase Printer, como siempre.
        UsbConnection primera = UsbPrintersConnections.selectFirstConnected(ctx);
        if (primera == null) return null;
        return new Seleccion(primera, primera.getDevice(), pidioEspecifica, aviso);
    }

    // FIX B: enumera los dispositivos USB conectados para que el usuario ELIJA la impresora en Config.
    // 1.3.0: cada dispositivo trae `tipo` y `seleccionable`. Un lector/teclado HID (o algo que Android
    // ya usa como teclado) NO es seleccionable; una térmica de clase propietaria con salida bulk sí.
    @PluginMethod
    public void listarDispositivosUSB(final PluginCall call) {
        io.execute(() -> {
            try {
                Context ctx = getContext();
                UsbManager usbManager = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
                JSArray dispositivos = new JSArray();
                if (usbManager != null) {
                    for (UsbDevice d : usbManager.getDeviceList().values()) {
                        JSObject o = new JSObject();
                        o.put("nombre", nombreDispositivo(d));
                        o.put("vendorId", d.getVendorId());
                        o.put("productId", d.getProductId());
                        o.put("deviceName", d.getDeviceName());
                        // esImpresora = tiene una interfaz clase PRINTER (campo histórico, se conserva).
                        o.put("esImpresora", esImpresora(d));
                        String tipo = tipoDispositivo(d);
                        o.put("tipo", tipo);
                        o.put("seleccionable", UsbClasificacion.seleccionable(tipo));
                        JSArray clases = new JSArray();
                        for (int i = 0; i < d.getInterfaceCount(); i++) clases.put(d.getInterface(i).getInterfaceClass());
                        o.put("clases", clases);
                        dispositivos.put(o);
                    }
                }
                JSObject res = new JSObject();
                res.put("dispositivos", dispositivos);
                res.put("clasificado", true);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("No se pudieron listar los dispositivos USB: " + mensaje(e));
            }
        });
    }

    private UsbDevice buscarDispositivo(UsbManager usbManager, Integer vendorId, Integer productId) {
        if (usbManager != null && vendorId != null && productId != null) {
            for (UsbDevice d : usbManager.getDeviceList().values()) {
                if (d.getVendorId() == vendorId && d.getProductId() == productId) return d;
            }
        }
        return null;
    }

    /** Clasificación pura (UsbClasificacion) + cruce con los teclados que Android ya reconoce. */
    private String tipoDispositivo(UsbDevice d) {
        List<UsbClasificacion.Interfaz> interfaces = new ArrayList<>();
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface intf = d.getInterface(i);
            boolean bulkOut = false;
            for (int e = 0; e < intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) bulkOut = true;
            }
            interfaces.add(new UsbClasificacion.Interfaz(intf.getInterfaceClass(), bulkOut));
        }
        boolean entrada = ConfettiScannerPlugin.esDispositivoDeEntrada(d.getVendorId(), d.getProductId());
        return UsbClasificacion.tipo(interfaces, entrada);
    }

    private String nombreDispositivo(UsbDevice d) {
        String n = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try { n = d.getProductName(); } catch (Exception ignored) {}
        }
        if (n == null || n.trim().isEmpty()) {
            n = String.format("USB %04X:%04X", d.getVendorId(), d.getProductId());
        }
        return n;
    }

    // ¿el dispositivo expone una interfaz de clase impresora? (para ordenar/etiquetar en la UI).
    private boolean esImpresora(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        }
        return false;
    }

    private void solicitarPermisoUsb(final PluginCall call, final UsbManager usbManager, final UsbDevice device,
                                     final Integer vendorId, final Integer productId) {
        final Context ctx = getContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (!granted) { call.reject("Permiso de USB denegado por el usuario."); return; }
                Seleccion sel = seleccionar(c, usbManager, vendorId, productId);
                if (sel == null) { call.reject("La impresora USB se desconectó."); return; }
                abrirUsb(call, sel);
            }
        };
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        Intent intent = new Intent(ACTION_USB_PERMISSION).setPackage(ctx.getPackageName());
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, intent, flags);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, filter);
        }
        usbManager.requestPermission(device, pi);
    }

    // fallback=true → la impresora ELEGIDA no estaba conectada (o no era una impresora) y se usó la
    // conectada: se DEVUELVE un aviso claro (no silencioso). El JS lo muestra para que se re-elija.
    private void abrirUsb(final PluginCall call, final Seleccion sel) {
        try {
            cerrarConexionActual(); // FIX A: cierra cualquier conexión previa antes de abrir otra (evita fuga)
            sel.conexion.connect();
            this.connection = sel.conexion;
            JSObject r = ok(sel.fallback
                ? (sel.aviso != null ? sel.aviso : "La impresora elegida no está conectada; se usó la impresora conectada. Revisa la selección en Configuración.")
                : "Impresora USB conectada.");
            r.put("fallback", sel.fallback);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudo abrir la impresora USB: " + mensaje(e));
        }
    }

    // ---------------------------------------------------------------- TCP ----
    @PluginMethod
    public void conectarTCP(final PluginCall call) {
        final String ip = call.getString("ip");
        final int puerto = call.getInt("puerto", 9100);
        if (ip == null || ip.trim().isEmpty()) {
            call.reject("Falta la IP de la impresora.");
            return;
        }
        io.execute(() -> {
            try {
                cerrarConexionActual(); // FIX A: cierra cualquier conexión previa antes de abrir otra (evita fuga)
                TcpConnection tcp = new TcpConnection(ip.trim(), puerto, 5000); // timeout 5s
                tcp.connect();
                this.connection = tcp;
                call.resolve(ok("Conectada por red a " + ip.trim() + ":" + puerto + "."));
            } catch (Exception e) {
                call.reject("La impresora no responde en " + ip.trim() + ":" + puerto + " (" + mensaje(e) + ").");
            }
        });
    }

    // ------------------------------------------------------- BYTES CRUDOS ----
    @PluginMethod
    public void enviarBytes(final PluginCall call) {
        final String b64 = call.getString("bytesBase64");
        if (b64 == null) { call.reject("Faltan los bytes (bytesBase64)."); return; }
        io.execute(() -> {
            DeviceConnection c = this.connection;
            if (c == null || !c.isConnected()) { call.reject("No hay impresora conectada."); return; }
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                c.write(bytes);
                c.send();
                call.resolve(ok("Bytes enviados (" + bytes.length + ")."));
            } catch (Exception e) {
                call.reject("No se pudieron enviar los bytes: " + mensaje(e));
            }
        });
    }

    // ---------------------------------------- IMAGEN RASTER (576 puntos) ----
    // Lo usa la Fase 4 (modo IMAGEN): recibe el ticket ya renderizado como PNG/JPEG
    // en base64 y lo manda como raster ESC/POS. NO rediseña nada: solo rasteriza.
    //
    // FASE 4 — TROCEO EN BANDAS (fix del ticket de pastel incompleto + sin corte):
    // antes se mandaba TODA la imagen como UN SOLO GS v 0 monolítico; en un ticket
    // ALTO (pastel ~1031px) el buffer de imagen de la Easytime se DESBORDA → imprime
    // incompleto y el corte se descarta. Ahora se parte el bitmap en bandas verticales
    // de <=BAND_HEIGHT_DOTS filas y cada banda se manda como su PROPIO GS v 0, con
    // flush (send) por banda para que el cabezal la imprima antes de la siguiente
    // (DantSu 3.4.0 NO auto-trocea con printImage → el troceo es MANUAL). El resultado
    // impreso es IDÉNTICO: bandas contiguas, sin gap ni línea extra. Tras esto, el JS
    // llama cortar() SIEMPRE (garantía de corte), ya no condicionado a un raster gigante.
    @PluginMethod
    public void imprimirImagenRaster(final PluginCall call) {
        final String b64 = call.getString("imagenBase64");
        if (b64 == null) { call.reject("Falta la imagen (imagenBase64)."); return; }
        io.execute(() -> {
            DeviceConnection c = this.connection;
            if (c == null || !c.isConnected()) { call.reject("No hay impresora conectada."); return; }
            Bitmap bmp = null;
            try {
                byte[] img = Base64.decode(quitarPrefijoDataUri(b64), Base64.DEFAULT);
                bmp = BitmapFactory.decodeByteArray(img, 0, img.length);
                if (bmp == null) { call.reject("La imagen no se pudo decodificar."); return; }
                bmp = escalarAAncho(bmp, MAX_RASTER_WIDTH);

                EscPosPrinterCommands cmd = new EscPosPrinterCommands(c);
                cmd.connect();
                cmd.reset();

                final int ancho = bmp.getWidth();
                final int alto = bmp.getHeight();
                int bandas = 0;
                // Cada banda: <=BAND_HEIGHT_DOTS filas → su propio GS v 0 (cabe en el
                // buffer del cabezal). Se rasteriza con el MISMO bitmapToBytes(false),
                // así cada banda es byte-idéntica a como se mandaría suelta.
                for (int y = 0; y < alto; y += BAND_HEIGHT_DOTS) {
                    int bh = Math.min(BAND_HEIGHT_DOTS, alto - y);
                    Bitmap banda = Bitmap.createBitmap(bmp, 0, y, ancho, bh);
                    try {
                        cmd.printImage(EscPosPrinterCommands.bitmapToBytes(banda, false));
                        c.send(); // flush por banda: la impresora imprime cada banda antes de la siguiente
                    } finally {
                        if (banda != bmp) banda.recycle(); // libera la banda (memoria acotada en RK3399)
                    }
                    bandas++;
                }
                call.resolve(ok("Imagen enviada (" + ancho + "x" + alto + ", " + bandas + " bandas)."));
            } catch (Exception e) {
                call.reject("No se pudo imprimir la imagen: " + mensaje(e));
            } finally {
                if (bmp != null && !bmp.isRecycled()) bmp.recycle();
            }
        });
    }

    // -------------------------------------------------------------- CORTE ----
    @PluginMethod
    public void cortar(final PluginCall call) {
        io.execute(() -> {
            DeviceConnection c = this.connection;
            if (c == null || !c.isConnected()) { call.reject("No hay impresora conectada."); return; }
            try {
                new EscPosPrinterCommands(c).connect().cutPaper();
                call.resolve(ok("Corte enviado."));
            } catch (Exception e) {
                call.reject("No se pudo cortar el papel: " + mensaje(e));
            }
        });
    }

    // ------------------------------------------- CAJÓN (patada ESC/POS) ----
    @PluginMethod
    public void abrirCajonPorImpresora(final PluginCall call) {
        io.execute(() -> {
            DeviceConnection c = this.connection;
            if (c == null || !c.isConnected()) { call.reject("No hay impresora conectada."); return; }
            try {
                new EscPosPrinterCommands(c).connect().openCashBox();
                call.resolve(ok("Comando de cajón enviado."));
            } catch (Exception e) {
                call.reject("No se pudo abrir el cajón: " + mensaje(e));
            }
        });
    }

    // ---------------------------- CAJÓN por DISPARADOR USB-SERIAL ----
    // Para un disparador de cajón que se conecta por USB (NO por la impresora):
    // abre el primer dispositivo USB-serial, escribe los bytes de apertura y cierra.
    // Permiso USB propio (no toca el flujo de la impresora).
    @PluginMethod
    public void abrirCajonUsbSerial(final PluginCall call) {
        final String b64 = call.getString("bytesBase64");
        final int baud = call.getInt("baudRate", 9600);
        io.execute(() -> {
            try {
                Context ctx = getContext();
                UsbManager usbManager = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
                List<UsbSerialDriver> drivers = (usbManager != null)
                    ? UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
                    : null;
                if (drivers == null || drivers.isEmpty()) {
                    call.reject("No se encontró un disparador USB-serial de cajón.");
                    return;
                }
                final UsbSerialDriver driver = drivers.get(0);
                final UsbDevice device = driver.getDevice();
                if (usbManager.hasPermission(device)) {
                    escribirSerial(call, usbManager, driver, baud, b64);
                } else {
                    solicitarPermisoSerial(call, usbManager, driver, baud, b64, device);
                }
            } catch (Exception e) {
                call.reject("Error al abrir el cajón por USB-serial: " + mensaje(e));
            }
        });
    }

    private void solicitarPermisoSerial(final PluginCall call, final UsbManager usbManager,
                                        final UsbSerialDriver driver, final int baud,
                                        final String b64, final UsbDevice device) {
        final Context ctx = getContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                if (!intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                    call.reject("Permiso de USB (cajón) denegado por el usuario.");
                    return;
                }
                escribirSerial(call, usbManager, driver, baud, b64);
            }
        };
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        Intent intent = new Intent(ACTION_USB_PERMISSION).setPackage(ctx.getPackageName());
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 1, intent, flags);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, filter);
        }
        usbManager.requestPermission(device, pi);
    }

    private void escribirSerial(final PluginCall call, final UsbManager usbManager,
                                final UsbSerialDriver driver, final int baud, final String b64) {
        UsbSerialPort port = null;
        try {
            UsbDeviceConnection conn = usbManager.openDevice(driver.getDevice());
            if (conn == null) { call.reject("No se pudo abrir el disparador USB (sin permiso)."); return; }
            port = driver.getPorts().get(0);
            port.open(conn);
            port.setParameters(baud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            // Bytes de apertura: los que manden desde JS, o la patada ESC/POS por defecto.
            byte[] bytes = (b64 != null && !b64.isEmpty())
                ? Base64.decode(b64, Base64.DEFAULT)
                : new byte[]{0x1B, 0x70, 0x00, 0x19, (byte) 0xFA};
            port.write(bytes, 1000);
            call.resolve(ok("Comando de cajón enviado por USB-serial (" + bytes.length + " bytes)."));
        } catch (Exception e) {
            call.reject("No se pudo enviar al disparador USB-serial: " + mensaje(e));
        } finally {
            try { if (port != null) port.close(); } catch (Exception ignored) {}
        }
    }

    // -------------------------------------------------------- DESCONECTAR ----
    @PluginMethod
    public void desconectar(final PluginCall call) {
        io.execute(() -> {
            try {
                cerrarConexionActual();
                call.resolve(ok("Desconectada."));
            } catch (Exception e) {
                call.reject("Error al desconectar: " + mensaje(e));
            }
        });
    }

    // FIX A: cierra y libera la conexión activa (USB/TCP) de forma segura. Idempotente. La llaman
    // conectarUSB/conectarTCP (antes de abrir otra) y desconectar → nunca se acumulan conexiones.
    private void cerrarConexionActual() {
        DeviceConnection old = this.connection;
        this.connection = null;
        if (old != null) {
            try { old.disconnect(); } catch (Exception ignored) {}
        }
    }

    // ------------------------------------------------------------ helpers ----
    private JSObject ok(String mensaje) {
        JSObject o = new JSObject();
        o.put("ok", true);
        o.put("mensaje", mensaje);
        return o;
    }

    private String mensaje(Exception e) {
        String m = e.getMessage();
        return (m == null || m.isEmpty()) ? e.getClass().getSimpleName() : m;
    }

    private String quitarPrefijoDataUri(String s) {
        int i = s.indexOf("base64,");
        return i >= 0 ? s.substring(i + 7) : s;
    }

    private Bitmap escalarAAncho(Bitmap src, int ancho) {
        if (src.getWidth() <= ancho) return src;
        int alto = Math.round(src.getHeight() * (ancho / (float) src.getWidth()));
        return Bitmap.createScaledBitmap(src, ancho, alto, true);
    }
}

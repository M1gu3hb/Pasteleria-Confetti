package com.mhastral.confettipos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

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

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private DeviceConnection connection; // conexión activa (USB o TCP)

    // ---------------------------------------------------------------- USB ----
    @PluginMethod
    public void conectarUSB(final PluginCall call) {
        io.execute(() -> {
            try {
                Context ctx = getContext();
                UsbManager usbManager = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
                UsbConnection usb = UsbPrintersConnections.selectFirstConnected(ctx);
                if (usb == null || usbManager == null) {
                    call.reject("No se encontró ninguna impresora USB conectada.");
                    return;
                }
                UsbDevice device = usb.getDevice();
                if (usbManager.hasPermission(device)) {
                    abrirUsb(call, usb);
                } else {
                    solicitarPermisoUsb(call, usbManager, device);
                }
            } catch (Exception e) {
                call.reject("Error al conectar por USB: " + mensaje(e));
            }
        });
    }

    private void solicitarPermisoUsb(final PluginCall call, final UsbManager usbManager, final UsbDevice device) {
        final Context ctx = getContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (!granted) { call.reject("Permiso de USB denegado por el usuario."); return; }
                UsbConnection usb = UsbPrintersConnections.selectFirstConnected(c);
                if (usb == null) { call.reject("La impresora USB se desconectó."); return; }
                abrirUsb(call, usb);
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

    private void abrirUsb(final PluginCall call, final UsbConnection usb) {
        try {
            usb.connect();
            this.connection = usb;
            call.resolve(ok("Impresora USB conectada."));
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
    @PluginMethod
    public void imprimirImagenRaster(final PluginCall call) {
        final String b64 = call.getString("imagenBase64");
        if (b64 == null) { call.reject("Falta la imagen (imagenBase64)."); return; }
        io.execute(() -> {
            DeviceConnection c = this.connection;
            if (c == null || !c.isConnected()) { call.reject("No hay impresora conectada."); return; }
            try {
                byte[] img = Base64.decode(quitarPrefijoDataUri(b64), Base64.DEFAULT);
                Bitmap bmp = BitmapFactory.decodeByteArray(img, 0, img.length);
                if (bmp == null) { call.reject("La imagen no se pudo decodificar."); return; }
                bmp = escalarAAncho(bmp, MAX_RASTER_WIDTH);
                EscPosPrinterCommands cmd = new EscPosPrinterCommands(c);
                cmd.connect();
                cmd.reset();
                cmd.printImage(EscPosPrinterCommands.bitmapToBytes(bmp, false));
                c.send();
                call.resolve(ok("Imagen enviada (" + bmp.getWidth() + "x" + bmp.getHeight() + ")."));
            } catch (Exception e) {
                call.reject("No se pudo imprimir la imagen: " + mensaje(e));
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
                if (this.connection != null) {
                    this.connection.disconnect();
                    this.connection = null;
                }
                call.resolve(ok("Desconectada."));
            } catch (Exception e) {
                call.reject("Error al desconectar: " + mensaje(e));
            }
        });
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

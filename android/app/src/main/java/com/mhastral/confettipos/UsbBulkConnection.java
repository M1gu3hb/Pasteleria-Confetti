package com.mhastral.confettipos;

import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

import com.dantsu.escposprinter.connection.DeviceConnection;
import com.dantsu.escposprinter.exceptions.EscPosConnectionException;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Transporte USB para impresoras ESC/POS de CLASE PROPIETARIA (interfaz 0xFF con salida bulk).
 *
 * DantSu 3.4.0 sólo abre interfaces de clase Printer (7): UsbDeviceHelper.findPrinterInterface
 * devuelve null para cualquier otra, así que una térmica que se enumera como "vendor specific"
 * nunca pudo imprimir por la ruta anterior. Esta clase se usa EXCLUSIVAMENTE cuando la persona
 * eligió un dispositivo así; la impresora de clase 7 sigue por UsbConnection de DantSu, sin cambios.
 *
 * Nunca toca interfaces HID (clase 3): un lector/teclado no puede reclamarse por aquí.
 */
public class UsbBulkConnection extends DeviceConnection {

    private final UsbManager usbManager;
    private final UsbDevice usbDevice;

    public UsbBulkConnection(UsbManager usbManager, UsbDevice usbDevice) {
        super();
        this.usbManager = usbManager;
        this.usbDevice = usbDevice;
    }

    public UsbDevice getDevice() {
        return usbDevice;
    }

    /** Primera interfaz de fabricante con endpoint bulk OUT; null si no hay (o si es HID). */
    static UsbInterface interfazFabricante(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface intf = d.getInterface(i);
            if (intf.getInterfaceClass() != UsbConstants.USB_CLASS_VENDOR_SPEC) continue;
            if (salidaBulk(intf) != null) return intf;
        }
        return null;
    }

    static UsbEndpoint salidaBulk(UsbInterface intf) {
        for (int e = 0; e < intf.getEndpointCount(); e++) {
            UsbEndpoint ep = intf.getEndpoint(e);
            if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) return ep;
        }
        return null;
    }

    @Override
    public UsbBulkConnection connect() throws EscPosConnectionException {
        if (isConnected()) return this;
        UsbInterface intf = interfazFabricante(usbDevice);
        if (intf == null) throw new EscPosConnectionException("La impresora elegida no tiene una salida USB compatible.");
        UsbEndpoint ep = salidaBulk(intf);
        UsbDeviceConnection conn = usbManager.openDevice(usbDevice);
        if (conn == null) throw new EscPosConnectionException("No se pudo abrir la impresora USB (permiso).");
        if (!conn.claimInterface(intf, true)) {
            conn.close();
            throw new EscPosConnectionException("No se pudo reservar la interfaz USB de la impresora.");
        }
        this.outputStream = new BulkOutputStream(conn, intf, ep);
        this.data = new byte[0];
        return this;
    }

    @Override
    public UsbBulkConnection disconnect() {
        this.data = new byte[0];
        if (isConnected()) {
            try { this.outputStream.close(); } catch (IOException ignored) {}
            this.outputStream = null;
        }
        return this;
    }

    private static final class BulkOutputStream extends OutputStream {
        private static final int BLOQUE = 16 * 1024;
        private static final int TIMEOUT_MS = 5000;
        private UsbDeviceConnection conn;
        private final UsbInterface intf;
        private final UsbEndpoint ep;

        BulkOutputStream(UsbDeviceConnection conn, UsbInterface intf, UsbEndpoint ep) {
            this.conn = conn;
            this.intf = intf;
            this.ep = ep;
        }

        @Override
        public void write(int b) throws IOException {
            write(new byte[] { (byte) b }, 0, 1);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            if (conn == null) throw new IOException("Impresora USB desconectada.");
            int pos = off;
            int fin = off + len;
            while (pos < fin) {
                int n = Math.min(BLOQUE, fin - pos);
                int escritos = conn.bulkTransfer(ep, b, pos, n, TIMEOUT_MS);
                if (escritos <= 0) throw new IOException("La impresora USB no aceptó los datos.");
                pos += escritos;
            }
        }

        @Override
        public void close() {
            if (conn != null) {
                try { conn.releaseInterface(intf); } catch (Exception ignored) {}
                try { conn.close(); } catch (Exception ignored) {}
                conn = null;
            }
        }
    }
}

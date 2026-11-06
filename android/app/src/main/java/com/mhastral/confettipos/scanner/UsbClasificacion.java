package com.mhastral.confettipos.scanner;

import java.util.List;

/**
 * Clasifica un dispositivo USB para el selector de impresora (Java puro, probado con JUnit).
 *
 * Motivo: "Detectar impresoras USB" listaba TODO lo conectado y dejaba elegir cualquier cosa;
 * un lector de códigos (HID) podía quedar guardado como "impresora". Reglas:
 *   - impresora:      interfaz clase 7 (Printer) con salida bulk. Ruta DantSu de siempre.
 *   - lector_teclado: interfaz HID (clase 3) o el sistema lo expone como teclado. NUNCA seleccionable.
 *   - propietaria:    interfaz de fabricante (0xFF) con salida bulk y sin HID. Muchas térmicas
 *                     ESC/POS se enumeran así; se conservan elegibles (transporte bulk propio).
 *   - otro:           almacenamiento, hubs, audio, etc. No seleccionable.
 */
public final class UsbClasificacion {

    public static final int CLASE_HID = 3;
    public static final int CLASE_IMPRESORA = 7;
    public static final int CLASE_FABRICANTE = 0xFF;

    public static final String IMPRESORA = "impresora";
    public static final String PROPIETARIA = "propietaria";
    public static final String LECTOR_TECLADO = "lector_teclado";
    public static final String OTRO = "otro";

    private UsbClasificacion() {}

    public static final class Interfaz {
        public final int clase;
        public final boolean salidaBulk;

        public Interfaz(int clase, boolean salidaBulk) {
            this.clase = clase;
            this.salidaBulk = salidaBulk;
        }
    }

    public static String tipo(List<Interfaz> interfaces, boolean dispositivoDeEntrada) {
        boolean hid = false;
        boolean impresora = false;
        boolean fabricante = false;
        if (interfaces != null) {
            for (Interfaz i : interfaces) {
                if (i == null) continue;
                if (i.clase == CLASE_HID) hid = true;
                if (i.clase == CLASE_IMPRESORA && i.salidaBulk) impresora = true;
                if (i.clase == CLASE_FABRICANTE && i.salidaBulk) fabricante = true;
            }
        }
        // Un lector nunca expone la clase Printer: si existe, es impresora aunque tenga extras.
        if (impresora) return IMPRESORA;
        if (hid || dispositivoDeEntrada) return LECTOR_TECLADO;
        if (fabricante) return PROPIETARIA;
        return OTRO;
    }

    public static boolean seleccionable(String tipo) {
        return IMPRESORA.equals(tipo) || PROPIETARIA.equals(tipo);
    }
}

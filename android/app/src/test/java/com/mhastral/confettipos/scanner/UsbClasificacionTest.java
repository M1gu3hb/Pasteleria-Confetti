package com.mhastral.confettipos.scanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

public class UsbClasificacionTest {

    private static UsbClasificacion.Interfaz i(int clase, boolean bulkOut) { return new UsbClasificacion.Interfaz(clase, bulkOut); }

    @Test
    public void impresoraClasePrinterEsSeleccionable() {
        String tipo = UsbClasificacion.tipo(Collections.singletonList(i(7, true)), false);
        assertEquals(UsbClasificacion.IMPRESORA, tipo);
        assertTrue(UsbClasificacion.seleccionable(tipo));
    }

    @Test
    public void lectorHidNoEsSeleccionable() {
        String tipo = UsbClasificacion.tipo(Collections.singletonList(i(3, false)), false);
        assertEquals(UsbClasificacion.LECTOR_TECLADO, tipo);
        assertFalse(UsbClasificacion.seleccionable(tipo));
    }

    @Test
    public void lectorConInterfazDeConfiguracionDelFabricanteSigueSiendoLector() {
        // p.ej. lector con HID + interfaz 0xFF bulk para programarlo: nunca debe tomarse como impresora.
        String tipo = UsbClasificacion.tipo(Arrays.asList(i(3, false), i(0xFF, true)), false);
        assertEquals(UsbClasificacion.LECTOR_TECLADO, tipo);
    }

    @Test
    public void dispositivoQueAndroidUsaComoTecladoNoEsSeleccionableAunqueParezcaPropietario() {
        String tipo = UsbClasificacion.tipo(Collections.singletonList(i(0xFF, true)), true);
        assertEquals(UsbClasificacion.LECTOR_TECLADO, tipo);
    }

    @Test
    public void termicaDeClasePropietariaSeConservaSeleccionable() {
        String tipo = UsbClasificacion.tipo(Collections.singletonList(i(0xFF, true)), false);
        assertEquals(UsbClasificacion.PROPIETARIA, tipo);
        assertTrue(UsbClasificacion.seleccionable(tipo));
    }

    @Test
    public void impresoraCompuestaConHidSigueSiendoImpresora() {
        assertEquals(UsbClasificacion.IMPRESORA, UsbClasificacion.tipo(Arrays.asList(i(3, false), i(7, true)), false));
    }

    @Test
    public void almacenamientoHubOClaseSinSalidaNoSonSeleccionables() {
        assertEquals(UsbClasificacion.OTRO, UsbClasificacion.tipo(Collections.singletonList(i(8, true)), false));
        assertEquals(UsbClasificacion.OTRO, UsbClasificacion.tipo(Collections.singletonList(i(9, false)), false));
        assertEquals(UsbClasificacion.OTRO, UsbClasificacion.tipo(Collections.singletonList(i(7, false)), false));
        assertEquals(UsbClasificacion.OTRO, UsbClasificacion.tipo(null, false));
    }
}

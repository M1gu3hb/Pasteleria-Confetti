package com.mhastral.confettipos.scanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Núcleo del lector nativo: identidad, captura sólo del vinculado, agrupación y cortes. */
public class ScannerCoreTest {

    private final List<ScannerCore.Lote> lotes = new ArrayList<>();
    private int cambios;
    private ScannerCore core;

    // Lector Steren/Vorago/Zebra en modo HID: externo, físico, teclado.
    private static ScannerCore.Dispositivo lector(int id) {
        return new ScannerCore.Dispositivo(id, "desc-lector", 0x05e0, 0x1200, "Symbol Bar Code Scanner", true, false, true);
    }
    private static ScannerCore.Dispositivo tecladoHumano(int id) {
        return new ScannerCore.Dispositivo(id, "desc-teclado", 0x046d, 0xc31c, "Logitech USB Keyboard", true, false, true);
    }
    private static ScannerCore.Dispositivo tecladoVirtual() {
        return new ScannerCore.Dispositivo(-1, "virtual", 0, 0, "Virtual", false, true, true);
    }
    private static ScannerCore.Dispositivo botonesInternos() {
        return new ScannerCore.Dispositivo(2, "gpio", 0, 0, "gpio-keys", false, false, true);
    }

    private static ScannerCore.Tecla t(String k, long ms) { return new ScannerCore.Tecla(k, ms, 0, false, false, false); }

    private boolean abajo(ScannerCore.Dispositivo d, String k, long ms) {
        return core.teclaAbajo(d, Collections.singletonList(t(k, ms)), false, ms);
    }

    private void escanear(ScannerCore.Dispositivo d, String codigo, long inicio) {
        long ms = inicio;
        for (char c : codigo.toCharArray()) { assertTrue(abajo(d, String.valueOf(c), ms)); ms += 3; }
        assertTrue(abajo(d, "Enter", ms));
    }

    private static String texto(ScannerCore.Lote l) {
        StringBuilder sb = new StringBuilder();
        for (ScannerCore.Tecla x : l.teclas) if (x.k.length() == 1) sb.append(x.k);
        return sb.toString();
    }

    @Before
    public void preparar() {
        core = new ScannerCore(new ScannerCore.Salida() {
            @Override public void lote(ScannerCore.Lote lote) { lotes.add(lote); }
            @Override public void estadoCambio() { cambios++; }
        });
        core.dispositivos(Arrays.asList(lector(7), tecladoHumano(8), tecladoVirtual(), botonesInternos()), 0);
    }

    private void vincularLector() {
        Object[] r = core.validarVinculo("desc-lector", 0x05e0, 0x1200, "Symbol Bar Code Scanner");
        assertEquals(ScannerCore.Resultado.OK, r[0]);
        core.establecerVinculo((ScannerCore.Vinculo) r[1], 0);
    }

    @Test
    public void sinVinculoNadaSeCaptura() {
        core.iniciarCliente(1, 250, 0);
        assertFalse(abajo(lector(7), "1", 10));
        assertTrue(lotes.isEmpty());
        assertEquals(ScannerCore.Estado.SIN_VINCULAR, core.resolver().estado);
    }

    @Test
    public void sinClienteJsCompatibleNoSeCapturaAunqueHayaVinculo() {
        vincularLector();
        // La web publicada no llamó iniciar(): el lector debe seguir siendo un teclado normal.
        assertFalse(abajo(lector(7), "1", 10));
        assertTrue(lotes.isEmpty());
        assertFalse(core.capturando());
    }

    @Test
    public void hidSinPrefijoMasEnterSeCapturaYSeEntregaUnLote() {
        vincularLector();
        core.iniciarCliente(3, 250, 0);
        assertTrue(core.capturando());
        escanear(lector(7), "0075012345678", 100);
        assertEquals(1, lotes.size());
        ScannerCore.Lote l = lotes.get(0);
        assertEquals("0075012345678", texto(l)); // ceros iniciales intactos
        assertEquals("enter", l.fin);
        assertEquals(3, l.gen);
        assertEquals(ScannerCore.ORIGEN_VINCULADO, l.origen);
        assertEquals("Enter", l.teclas.get(l.teclas.size() - 1).k);
        assertEquals(100L, l.teclas.get(0).t); // tiempos del evento original, no de llegada
    }

    @Test
    public void tresDisparosSonTresLotesSinDeduplicar() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        escanear(lector(7), "CF00000001", 100);
        escanear(lector(7), "CF00000001", 400);
        escanear(lector(7), "CF00000001", 700);
        assertEquals(3, lotes.size());
        for (ScannerCore.Lote l : lotes) assertEquals("CF00000001", texto(l));
        assertTrue(lotes.get(0).seq < lotes.get(1).seq && lotes.get(1).seq < lotes.get(2).seq);
    }

    @Test
    public void tecladoHumanoTecladoVirtualYBotonesNoSeCapturan() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        assertFalse(abajo(tecladoHumano(8), "5", 10));
        assertFalse(abajo(tecladoVirtual(), "5", 11));
        assertFalse(abajo(botonesInternos(), "5", 12));
        assertFalse(core.teclaArriba(tecladoHumano(8), false, 13));
        assertTrue(lotes.isEmpty());
    }

    @Test
    public void teclasDeSistemaDelLectorNoSeConsumen() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        assertFalse(core.teclaAbajo(lector(7), Collections.singletonList(t("Unidentified", 5)), true, 5));
        assertFalse(core.teclaArriba(lector(7), true, 6));
        assertTrue(core.teclaArriba(lector(7), false, 7));
    }

    @Test
    public void reconexionConOtroIdSigueCapturandoPorIdentidad() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        core.dispositivos(Arrays.asList(tecladoHumano(8)), 50);
        assertEquals(ScannerCore.Estado.DESCONECTADO, core.resolver().estado);
        assertFalse(abajo(lector(7), "1", 60)); // id viejo ya no existe
        core.dispositivos(Arrays.asList(lector(23), tecladoHumano(8)), 100); // Android asigna otro deviceId
        assertEquals(ScannerCore.Estado.CONECTADO, core.resolver().estado);
        escanear(lector(23), "123", 200);
        assertEquals(1, lotes.size());
        assertEquals("123", texto(lotes.get(0)));
    }

    @Test
    public void desconexionDuranteLecturaCortaElGrupoComoIncompleto() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        abajo(lector(7), "7", 10);
        abajo(lector(7), "5", 13);
        core.dispositivos(Arrays.asList(tecladoHumano(8)), 20);
        assertEquals(1, lotes.size());
        assertEquals("desconexion", lotes.get(0).fin);
        assertEquals("75", texto(lotes.get(0)));
    }

    @Test
    public void idReutilizadoPorOtroDispositivoNoHeredaElGrupo() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        abajo(lector(7), "7", 10);
        core.dispositivos(Arrays.asList(tecladoHumano(7)), 20); // mismo id, otro aparato
        assertEquals("desconexion", lotes.get(0).fin);
        assertFalse(abajo(tecladoHumano(7), "8", 30));
    }

    @Test
    public void dosDispositivosIdenticosSonAmbiguosYNoSeCapturaNinguno() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        ScannerCore.Dispositivo gemelo = new ScannerCore.Dispositivo(30, "desc-lector-nonce1", 0x05e0, 0x1200, "Symbol Bar Code Scanner", true, false, true);
        core.dispositivos(Arrays.asList(lector(7), gemelo), 10);
        assertEquals(ScannerCore.Estado.AMBIGUO, core.resolver().estado);
        assertEquals(2, core.resolver().iguales);
        assertFalse(abajo(lector(7), "1", 20));
        assertFalse(abajo(gemelo, "1", 21));
        assertFalse(core.capturando());
    }

    @Test
    public void vincularRechazaIdentidadesAmbiguasOInsuficientes() {
        ScannerCore.Dispositivo gemelo = new ScannerCore.Dispositivo(30, "desc-lector-nonce1", 0x05e0, 0x1200, "Symbol Bar Code Scanner", true, false, true);
        core.dispositivos(Arrays.asList(lector(7), gemelo), 0);
        assertEquals(ScannerCore.Resultado.AMBIGUO, core.validarVinculo("desc-lector", 0x05e0, 0x1200, "Symbol Bar Code Scanner")[0]);
        ScannerCore.Dispositivo sinId = new ScannerCore.Dispositivo(40, "x", 0, 0, "HID Keyboard", true, false, true);
        core.dispositivos(Arrays.asList(sinId), 0);
        assertEquals(ScannerCore.Resultado.IDENTIDAD_INSUFICIENTE, core.validarVinculo("x", 0, 0, "HID Keyboard")[0]);
        core.dispositivos(Arrays.asList(lector(7)), 0);
        assertEquals(ScannerCore.Resultado.CAMBIO, core.validarVinculo("otro-descriptor", 0x05e0, 0x1200, "Symbol Bar Code Scanner")[0]);
        core.dispositivos(Collections.emptyList(), 0);
        assertEquals(ScannerCore.Resultado.NO_CONECTADO, core.validarVinculo("desc-lector", 0x05e0, 0x1200, "Symbol Bar Code Scanner")[0]);
        assertNull(core.getVinculo());
    }

    @Test
    public void cambioDeContextoMarcaLoteObsoletoConSuGenOriginal() {
        vincularLector();
        core.iniciarCliente(5, 250, 0);
        abajo(lector(7), "1", 10);
        abajo(lector(7), "2", 13);
        core.invalidar(6, 15); // p.ej. cambio de caja/sucursal/usuario en el JS
        assertEquals(1, lotes.size());
        assertEquals("invalidado", lotes.get(0).fin);
        assertEquals(5, lotes.get(0).gen);
        abajo(lector(7), "3", 16);
        abajo(lector(7), "Enter", 19);
        assertEquals(2, lotes.size());
        assertEquals(6, lotes.get(1).gen); // el resto ya pertenece a la nueva gen; el JS lo pone en cuarentena
    }

    @Test
    public void inactividadCortaElGrupoYElSiguienteEsOtroLote() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        abajo(lector(7), "1", 10);
        assertEquals(10 + 350, core.proximoVencimiento());
        core.tick(200);
        assertTrue(lotes.isEmpty());
        core.tick(360);
        assertEquals(1, lotes.size());
        assertEquals("tiempo", lotes.get(0).fin);
        assertEquals(-1, core.proximoVencimiento());
    }

    @Test
    public void enterDuplicadoYTeclaSostenidaLleganMarcadosAlParser() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        escanear(lector(7), "12", 10);
        assertTrue(core.teclaAbajo(lector(7), Collections.singletonList(new ScannerCore.Tecla("Enter", 30, 0, false, false, false)), false, 30));
        assertEquals(2, lotes.size());
        assertEquals(1, lotes.get(1).teclas.size()); // Enter aislado: el JS lo descarta como terminador doble
        assertTrue(core.teclaAbajo(lector(7), Collections.singletonList(new ScannerCore.Tecla("4", 40, 1, false, false, false)), false, 40));
        abajo(lector(7), "Enter", 45);
        assertEquals(1, lotes.get(2).teclas.get(0).r); // repetición visible para el parser
    }

    @Test
    public void limiteDeTeclasCortaUnGrupoDesbocado() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        for (int i = 0; i < ScannerCore.MAX_TECLAS; i++) abajo(lector(7), "9", i);
        assertEquals(1, lotes.size());
        assertEquals("limite", lotes.get(0).fin);
    }

    @Test
    public void vinculacionCapturaCualquierTecladoExternoSoloDuranteElPaso() {
        core.iniciarCliente(1, 250, 0);
        core.iniciarVinculacion(0, 60_000);
        escanear(tecladoHumano(8), "AB", 10);
        escanear(lector(7), "CF1", 20);
        assertFalse(abajo(tecladoVirtual(), "x", 30));
        assertEquals(2, lotes.size());
        assertEquals(ScannerCore.ORIGEN_VINCULACION, lotes.get(1).origen);
        assertEquals(1, lotes.get(1).iguales);
        core.tick(60_001);
        assertFalse(core.isVinculando());
        assertFalse(abajo(lector(7), "1", 60_010)); // terminó el paso y no hay vínculo
    }

    @Test
    public void vinculacionNoEntregaLecturasAlPosAunqueHayaVinculo() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        core.iniciarVinculacion(0, 60_000);
        assertFalse(core.capturando());
        escanear(lector(7), "99", 10);
        assertEquals(ScannerCore.ORIGEN_VINCULACION, lotes.get(0).origen);
        core.cancelarVinculacion(100);
        escanear(lector(7), "99", 200);
        assertEquals(ScannerCore.ORIGEN_VINCULADO, lotes.get(1).origen);
    }

    @Test
    public void recargaDelWebViewDesactivaCapturaHastaNuevoIniciar() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        abajo(lector(7), "1", 10);
        core.clienteInactivo(20);
        assertEquals("pausa", lotes.get(0).fin);
        assertFalse(abajo(lector(7), "2", 30));
        core.iniciarCliente(2, 250, 40);
        assertTrue(abajo(lector(7), "3", 50));
    }

    @Test
    public void desvincularDevuelveElLectorAlTecladoNormal() {
        vincularLector();
        core.iniciarCliente(1, 250, 0);
        core.desvincular(5);
        assertFalse(abajo(lector(7), "1", 10));
        assertEquals(ScannerCore.Estado.SIN_VINCULAR, core.resolver().estado);
    }

    @Test
    public void tiempoEntreTeclasSeAcotaParaLaHolguraNativa() {
        core.configurar(10);
        assertEquals(ScannerCore.INACTIVIDAD_MIN_MS, core.getInactividadMs());
        core.configurar(5000);
        assertEquals(ScannerCore.INACTIVIDAD_MAX_MS, core.getInactividadMs());
        core.configurar(250);
        assertEquals(350, core.getInactividadMs());
    }
}

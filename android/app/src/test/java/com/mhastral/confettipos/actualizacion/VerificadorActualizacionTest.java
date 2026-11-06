package com.mhastral.confettipos.actualizacion;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class VerificadorActualizacionTest {

    private static final String SHA = "e347e050b2d9050f8fa52414fefc5ed35cfad17d5b0cd3392b41d9ed3ab6c29d";
    private static final String CERT = "5074a110f20482e83c28d294af78b420415181250a4e8177be3f1096f9ebf610";
    private static final String PKG = "com.mhastral.confettipos";
    private static Set<String> s(String... x) { return new HashSet<>(Arrays.asList(x)); }

    private static VerificadorActualizacion.Resultado v(String shaReal, String pkgApk, long vcApk, long vcInstalada, Set<String> certApk) {
        return VerificadorActualizacion.verificar(SHA, shaReal, PKG, pkgApk, 5, vcApk, vcInstalada, s(CERT), certApk);
    }

    @Test
    public void actualizacionCorrectaSeAcepta() {
        assertEquals(VerificadorActualizacion.Resultado.OK, v(SHA.toUpperCase(), PKG, 5, 3, s(CERT)));
    }

    @Test
    public void huellaDistintaOInvalidaSeRechaza() {
        assertEquals(VerificadorActualizacion.Resultado.HASH, v(SHA.replace('e', 'f'), PKG, 5, 3, s(CERT)));
        assertEquals(VerificadorActualizacion.Resultado.HASH, v("", PKG, 5, 3, s(CERT)));
        assertEquals(VerificadorActualizacion.Resultado.HASH, VerificadorActualizacion.verificar(null, SHA, PKG, PKG, 5, 5, 3, s(CERT), s(CERT)));
    }

    @Test
    public void otroPaqueteSeRechaza() {
        assertEquals(VerificadorActualizacion.Resultado.PAQUETE, v(SHA, "com.otra.app", 5, 3, s(CERT)));
        assertEquals(VerificadorActualizacion.Resultado.PAQUETE, v(SHA, null, 5, 3, s(CERT)));
    }

    @Test
    public void versionNoAnunciadaOIgualOMenorSeRechaza() {
        assertEquals(VerificadorActualizacion.Resultado.VERSION, v(SHA, PKG, 4, 3, s(CERT)));
        assertEquals(VerificadorActualizacion.Resultado.VERSION, v(SHA, PKG, 5, 5, s(CERT)));
        assertEquals(VerificadorActualizacion.Resultado.VERSION, v(SHA, PKG, 5, 6, s(CERT)));
    }

    @Test
    public void otraFirmaOFirmaIlegibleSeRechaza() {
        assertEquals(VerificadorActualizacion.Resultado.FIRMA, v(SHA, PKG, 5, 3, s("00".repeat(32))));
        assertEquals(VerificadorActualizacion.Resultado.FIRMA, v(SHA, PKG, 5, 3, Collections.emptySet()));
        assertEquals(VerificadorActualizacion.Resultado.FIRMA, v(SHA, PKG, 5, 3, null));
        assertEquals(VerificadorActualizacion.Resultado.FIRMA, v(SHA, PKG, 5, 3, s(CERT, "11".repeat(32))));
    }

    @Test
    public void urlsYHuellas() {
        assertTrue(VerificadorActualizacion.urlSegura("https://raw.githubusercontent.com/x/y/z.apk"));
        assertFalse(VerificadorActualizacion.urlSegura("http://ejemplo.com/a.apk"));
        assertFalse(VerificadorActualizacion.urlSegura("javascript:alert(1)"));
        assertFalse(VerificadorActualizacion.urlSegura("file:///sdcard/a.apk"));
        assertFalse(VerificadorActualizacion.urlSegura(null));
        assertTrue(VerificadorActualizacion.esSha256(SHA));
        assertFalse(VerificadorActualizacion.esSha256(SHA.substring(1)));
        assertEquals("00ff10", VerificadorActualizacion.hex(new byte[] { 0, (byte) 0xff, 0x10 }));
    }
}

package com.mhastral.confettipos.actualizacion;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * Reglas puras (sin android.*) para aceptar un APK descargado como actualización. Probadas con JUnit.
 *
 * Un APK sólo se ofrece al instalador de Android si TODO coincide: huella SHA-256 anunciada,
 * mismo paquete, versionCode anunciado y mayor que el instalado, y el MISMO certificado de firma
 * que la app instalada. Si algo no se puede comprobar, se rechaza (falla cerrada).
 */
public final class VerificadorActualizacion {

    public enum Resultado { OK, URL, HASH, PAQUETE, VERSION, FIRMA }

    private VerificadorActualizacion() {}

    /** Sólo https, con host. */
    public static boolean urlSegura(String url) {
        if (url == null) return false;
        try {
            URI u = new URI(url.trim());
            return "https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null && !u.getHost().isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean esSha256(String hex) {
        return hex != null && hex.matches("(?i)[0-9a-f]{64}");
    }

    public static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return sb.toString();
    }

    public static Resultado verificar(String shaEsperado, String shaReal,
                                      String paqueteInstalado, String paqueteApk,
                                      long versionAnunciada, long versionApk, long versionInstalada,
                                      Set<String> certsInstalados, Set<String> certsApk) {
        if (!esSha256(shaEsperado) || !esSha256(shaReal) || !shaEsperado.equalsIgnoreCase(shaReal)) return Resultado.HASH;
        if (paqueteInstalado == null || !paqueteInstalado.equals(paqueteApk)) return Resultado.PAQUETE;
        if (versionApk != versionAnunciada || versionApk <= versionInstalada) return Resultado.VERSION;
        if (certsInstalados == null || certsApk == null || certsInstalados.isEmpty() || !certsInstalados.equals(certsApk)) return Resultado.FIRMA;
        return Resultado.OK;
    }
}

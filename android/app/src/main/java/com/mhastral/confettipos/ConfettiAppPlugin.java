package com.mhastral.confettipos;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.mhastral.confettipos.actualizacion.VerificadorActualizacion;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ConfettiApp — versión instalada y actualización de la propia app desde el POS (APK 1.3.0+).
 *
 *  - info(): versionName/versionCode instalados (la web decide si mostrar "Actualización pendiente").
 *  - abrirEnNavegador({url}): abre una página https en el navegador del sistema.
 *  - descargarEInstalar({url, sha256, versionCode}): descarga el APK anunciado, comprueba huella,
 *    paquete, versión y que lo firmó la MISMA llave que la app instalada, y sólo entonces abre el
 *    instalador de Android (la persona confirma "Actualizar"). Android conserva los datos de la app.
 *
 * No toca dinero, sesión ni datos del POS. Nada en load(): el plugin no puede fallar al cargar.
 */
@CapacitorPlugin(name = "ConfettiApp")
public class ConfettiAppPlugin extends Plugin {

    static final String MIME_APK = "application/vnd.android.package-archive";
    private static final long MAX_BYTES = 150L * 1024 * 1024;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean ocupado;

    // ---------------------------------------------------------------- info ----

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo pi = paqueteInstalado(0);
            JSObject o = new JSObject();
            o.put("paquete", pi.packageName);
            o.put("versionName", pi.versionName);
            o.put("versionCode", versionCode(pi));
            o.put("puedeInstalar", puedeInstalar());
            o.put("actualizadorNativo", true);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("No se pudo leer la versión instalada.", "INFO");
        }
    }

    // ------------------------------------------------------ abrir navegador ----

    @PluginMethod
    public void abrirEnNavegador(PluginCall call) {
        String url = call.getString("url", "");
        if (!VerificadorActualizacion.urlSegura(url)) { call.reject("Dirección no válida.", "URL"); return; }
        main.post(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve(new JSObject().put("abierto", true));
            } catch (ActivityNotFoundException e) {
                call.reject("No hay navegador disponible en esta tablet.", "NAVEGADOR");
            }
        });
    }

    // ------------------------------------------------- descargar e instalar ----

    @PluginMethod
    public void descargarEInstalar(PluginCall call) {
        final String url = call.getString("url", "");
        final String sha = call.getString("sha256", "");
        final Integer anunciada = call.getInt("versionCode");
        if (!VerificadorActualizacion.urlSegura(url) || !VerificadorActualizacion.esSha256(sha) || anunciada == null || anunciada <= 0) {
            call.reject("Datos de la actualización incompletos.", "DATOS");
            return;
        }
        synchronized (this) {
            if (ocupado) { call.reject("Ya se está descargando la actualización.", "OCUPADO"); return; }
            ocupado = true;
        }
        if (!puedeInstalar()) {
            liberar();
            main.post(this::abrirPermisoInstalacion);
            call.reject("Android necesita permiso para instalar la actualización. Active «Permitir de esta fuente», regrese y toque Actualizar otra vez.", "PERMISO");
            return;
        }
        io.execute(() -> {
            File apk = null;
            try {
                File dir = new File(getContext().getCacheDir(), "actualizaciones");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Sin espacio para descargar.");
                for (File viejo : listar(dir)) //noinspection ResultOfMethodCallIgnored
                    viejo.delete();
                apk = new File(dir, "ConfettiPOS-" + anunciada + ".apk");
                String shaReal = descargar(url.trim(), apk);

                PackageManager pm = getContext().getPackageManager();
                PackageInfo instalado = paqueteInstalado(firmasFlag());
                PackageInfo archivo = pm.getPackageArchiveInfo(apk.getAbsolutePath(), firmasFlag());
                if (archivo == null) throw new CodigoException("El archivo descargado no es una app válida.", "PAQUETE");
                VerificadorActualizacion.Resultado r = VerificadorActualizacion.verificar(
                    sha, shaReal, instalado.packageName, archivo.packageName,
                    anunciada, versionCode(archivo), versionCode(instalado),
                    certificados(instalado), certificados(archivo));
                if (r != VerificadorActualizacion.Resultado.OK) throw new CodigoException(mensaje(r), r.name());

                final Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                main.post(() -> {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(uri, MIME_APK);
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(i);
                        call.resolve(new JSObject().put("instalador", true));
                    } catch (Exception e) {
                        call.reject("No se pudo abrir el instalador de Android.", "INSTALADOR");
                    } finally {
                        liberar();
                    }
                });
            } catch (CodigoException e) {
                borrar(apk);
                liberar();
                call.reject(e.getMessage(), e.codigo);
            } catch (Exception e) {
                borrar(apk);
                liberar();
                Logger.error("ConfettiApp", "Descarga de actualización fallida", e);
                call.reject("No se pudo descargar la actualización. Revise el internet e inténtelo de nuevo.", "RED");
            }
        });
    }

    // ------------------------------------------------------------- helpers ----

    static final class CodigoException extends Exception {
        final String codigo;
        CodigoException(String m, String codigo) { super(m); this.codigo = codigo; }
    }

    static String mensaje(VerificadorActualizacion.Resultado r) {
        switch (r) {
            case HASH: return "El archivo descargado no coincide con la actualización anunciada. No se instaló.";
            case PAQUETE: return "El archivo descargado no es Confetti POS. No se instaló.";
            case VERSION: return "El archivo descargado no es la versión anunciada o no es más nueva. No se instaló.";
            case FIRMA: return "El archivo no está firmado con la llave de Confetti POS. No se instaló.";
            default: return "Actualización no válida.";
        }
    }

    private synchronized void liberar() { ocupado = false; }

    private static File[] listar(File dir) {
        File[] f = dir.listFiles();
        return f == null ? new File[0] : f;
    }

    private static void borrar(File f) {
        if (f != null) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    private String descargar(String url, File destino) throws Exception {
        File tmp = new File(destino.getParentFile(), destino.getName() + ".parte");
        HttpURLConnection c = null;
        try {
            URL u = new URL(url);
            int saltos = 0;
            while (true) {
                c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setInstanceFollowRedirects(false);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && saltos < 5) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    URL sig = new URL(u, loc);
                    if (!"https".equalsIgnoreCase(sig.getProtocol())) throw new CodigoException("Redirección insegura.", "URL");
                    u = sig;
                    saltos++;
                    continue;
                }
                if (code != 200) throw new IllegalStateException("HTTP " + code);
                break;
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_BYTES) throw new CodigoException("Archivo demasiado grande.", "PAQUETE");
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                }
                out.getFD().sync();
            }
            if (!tmp.renameTo(destino)) throw new IllegalStateException("No se pudo guardar la descarga.");
            return VerificadorActualizacion.hex(md.digest());
        } finally {
            if (c != null) c.disconnect();
            borrar(tmp);
        }
    }

    private boolean puedeInstalar() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        try {
            return getContext().getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            return false;
        }
    }

    private void abrirPermisoInstalacion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {
            // Sin pantalla de permiso: la web muestra cómo descargar con el navegador.
        }
    }

    private PackageInfo paqueteInstalado(int flags) throws PackageManager.NameNotFoundException {
        Context ctx = getContext();
        return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), flags);
    }

    @SuppressWarnings("deprecation")
    private static int firmasFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    @SuppressWarnings("deprecation")
    static long versionCode(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
    }

    /** SHA-256 de los certificados que firman el APK (vacío si no se pudieron leer: la verificación falla). */
    @SuppressWarnings("deprecation")
    static Set<String> certificados(PackageInfo pi) throws Exception {
        Signature[] firmas = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo si = pi.signingInfo;
            if (si != null) firmas = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
            if (firmas != null && !si.hasMultipleSigners() && firmas.length > 0) {
                // Historial de rotación: se compara el certificado ACTUAL (último), no los anteriores.
                firmas = new Signature[] { firmas[firmas.length - 1] };
            }
        }
        if (firmas == null) firmas = pi.signatures;
        Set<String> out = new HashSet<>();
        if (firmas == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : firmas) out.add(VerificadorActualizacion.hex(md.digest(s.toByteArray())));
        return out;
    }
}

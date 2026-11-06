package com.mhastral.confettipos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.content.Intent;
import android.os.Looper;
import android.provider.Settings;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginResult;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

import java.util.ArrayList;
import java.util.List;

/** MainActivity real (API 31): ConfettiApp carga, informa la versión y protege la instalación. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 31, shadows = { ShadowServiceWorkerControllerPrueba.class, ShadowInputManagerPrueba.class })
@LooperMode(LooperMode.Mode.PAUSED)
public class ConfettiAppActivityTest {

    static final class Captura extends MessageHandler {
        final List<Object[]> r = new ArrayList<>();
        Captura(Bridge b) { super(b, b.getWebView(), null); }
        @Override public void sendResponseMessage(PluginCall call, PluginResult ok, PluginResult err) { r.add(new Object[] { call.getCallbackId(), ok, err }); }
        JSONObject ok(String id) throws Exception { for (Object[] x : r) if (id.equals(x[0]) && x[1] != null) return new JSONObject(x[1].toString()); return null; }
        String err(String id) { for (Object[] x : r) if (id.equals(x[0]) && x[2] != null) return x[2].toString(); return null; }
    }

    private ActivityController<MainActivity> ctl;
    private ConfettiAppPlugin plugin;
    private Captura cap;

    @Before
    public void preparar() {
        android.content.pm.PackageInfo wv = new android.content.pm.PackageInfo();
        wv.packageName = "com.google.android.webview";
        wv.versionName = "120.0.6099.230";
        org.robolectric.shadows.ShadowWebView.setCurrentWebViewPackage(wv);
        ctl = Robolectric.buildActivity(MainActivity.class).setup();
        shadowOf(Looper.getMainLooper()).idle();
        assertNotNull("ConfettiApp registrado (load no falla)", ctl.get().getBridge().getPlugin("ConfettiApp"));
        plugin = (ConfettiAppPlugin) ctl.get().getBridge().getPlugin("ConfettiApp").getInstance();
        cap = new Captura(ctl.get().getBridge());
    }

    @After
    public void cerrar() { if (ctl != null) ctl.pause().stop().destroy(); }

    private PluginCall call(String id, String metodo, JSObject datos) { return new PluginCall(cap, "ConfettiApp", id, metodo, datos); }

    @Test
    public void infoDevuelveLaVersionInstalada() throws Exception {
        plugin.info(call("i", "info", new JSObject()));
        JSONObject o = cap.ok("i");
        // Deben coincidir con android/app/build.gradle (versionCode 5 / versionName 1.3.0).
        assertEquals(5, o.getInt("versionCode"));
        assertEquals("1.3.0", o.getString("versionName"));
        assertEquals("com.mhastral.confettipos", o.getString("paquete"));
        assertTrue(o.getBoolean("actualizadorNativo"));
    }

    @Test
    public void abrirEnNavegadorSoloHttps() {
        plugin.abrirEnNavegador(call("a", "abrirEnNavegador", new JSObject().put("url", "http://inseguro.com/a.apk")));
        assertTrue(cap.err("a").contains("URL"));
        plugin.abrirEnNavegador(call("b", "abrirEnNavegador", new JSObject().put("url", "https://raw.githubusercontent.com/M1gu3hb/x/a.apk")));
        shadowOf(Looper.getMainLooper()).idle();
        Intent i = shadowOf((Application) ApplicationProvider.getApplicationContext()).getNextStartedActivity();
        assertEquals(Intent.ACTION_VIEW, i.getAction());
        assertEquals("https://raw.githubusercontent.com/M1gu3hb/x/a.apk", i.getDataString());
    }

    @Test
    public void datosIncompletosNoDescarganNada() {
        plugin.descargarEInstalar(call("d", "descargarEInstalar", new JSObject().put("url", "https://x.com/a.apk").put("sha256", "abc").put("versionCode", 5)));
        assertTrue(cap.err("d").contains("DATOS"));
        plugin.descargarEInstalar(call("e", "descargarEInstalar", new JSObject().put("url", "http://x.com/a.apk").put("sha256", "e347e050b2d9050f8fa52414fefc5ed35cfad17d5b0cd3392b41d9ed3ab6c29d").put("versionCode", 5)));
        assertTrue(cap.err("e").contains("DATOS"));
    }

    @Test
    public void sinPermisoDeInstalarAbreAjustesYNoDescarga() {
        shadowOf(ApplicationProvider.getApplicationContext().getPackageManager()).setCanRequestPackageInstalls(false);
        plugin.descargarEInstalar(call("p", "descargarEInstalar", new JSObject().put("url", "https://x.com/a.apk")
            .put("sha256", "e347e050b2d9050f8fa52414fefc5ed35cfad17d5b0cd3392b41d9ed3ab6c29d").put("versionCode", 99)));
        shadowOf(Looper.getMainLooper()).idle();
        assertTrue(cap.err("p").contains("PERMISO"));
        Intent i = shadowOf((Application) ApplicationProvider.getApplicationContext()).getNextStartedActivity();
        assertEquals(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, i.getAction());
        assertEquals("package:com.mhastral.confettipos", i.getDataString());
    }
}

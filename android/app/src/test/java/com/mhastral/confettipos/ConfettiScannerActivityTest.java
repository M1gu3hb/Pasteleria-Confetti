package com.mhastral.confettipos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginResult;

import org.json.JSONArray;
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
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowInputDevice;
import org.robolectric.util.ReflectionHelpers;

import java.util.ArrayList;
import java.util.List;

/**
 * MainActivity REAL (Capacitor Bridge, plugins registrados, layout sustituido) sobre el framework
 * Android 12 (API 31) de Robolectric, con un lector USB-HID y un teclado externo simulados como
 * InputDevice. Las teclas entran por Activity.dispatchKeyEvent y por el gancho pre-IME del WebView,
 * igual que en la terminal. Es emulación del framework: NO prueba el hardware ni el WebView real.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 31, shadows = { ShadowServiceWorkerControllerPrueba.class, ShadowInputManagerPrueba.class })
@LooperMode(LooperMode.Mode.PAUSED)
public class ConfettiScannerActivityTest {

    private static final int LECTOR = 7, TECLADO = 8;
    private static final int VID = 0x05e0, PID = 0x1200;

    /** Captura las respuestas que el plugin envía al JS (resolve/reject y eventos). */
    static final class Captura extends MessageHandler {
        final List<Object[]> r = new ArrayList<>();
        Captura(Bridge b) { super(b, b.getWebView(), null); }
        @Override
        public void sendResponseMessage(PluginCall call, PluginResult ok, PluginResult err) {
            r.add(new Object[] { call.getCallbackId(), ok, err });
        }
        List<JSONObject> de(String callbackId) {
            List<JSONObject> out = new ArrayList<>();
            for (Object[] x : r) {
                if (!callbackId.equals(x[0]) || x[1] == null) continue;
                try { out.add(new JSONObject(x[1].toString())); } catch (Exception e) { throw new AssertionError(e); }
            }
            return out;
        }
        String error(String callbackId) {
            for (Object[] x : r) if (callbackId.equals(x[0]) && x[2] != null) return x[2].toString();
            return null;
        }
    }

    private ActivityController<MainActivity> ctl;
    private ConfettiScannerPlugin plugin;
    private Captura cap;
    private int n;
    private long t = 1000;

    private static InputDevice dispositivo(int id, String nombre, int vid, int pid, String descriptor, boolean externo) {
        InputDevice d = ShadowInputDevice.makeInputDeviceNamed(nombre);
        ShadowInputDevice sd = Shadow.extract(d);
        sd.setVendorId(vid);
        sd.setProductId(pid);
        ReflectionHelpers.setField(d, "mId", id);
        ReflectionHelpers.setField(d, "mDescriptor", descriptor);
        ReflectionHelpers.setField(d, "mIsExternal", externo);
        ReflectionHelpers.setField(d, "mSources", InputDevice.SOURCE_KEYBOARD);
        ReflectionHelpers.setField(d, "mKeyboardType", InputDevice.KEYBOARD_TYPE_ALPHABETIC);
        return d;
    }

    private static void conectar(InputDevice... ds) {
        ShadowInputManagerPrueba.DISPOSITIVOS.clear();
        for (InputDevice d : ds) ShadowInputManagerPrueba.DISPOSITIVOS.put(d.getId(), d);
    }

    private static InputDevice lector(int id) { return dispositivo(id, "Symbol Bar Code Scanner", VID, PID, "desc-lector", true); }
    private static InputDevice teclado() { return dispositivo(TECLADO, "Logitech USB Keyboard", 0x046d, 0xc31c, "desc-kb", true); }

    private void idle() { shadowOf(Looper.getMainLooper()).idle(); }

    private void iniciarActividad() {
        ctl = Robolectric.buildActivity(MainActivity.class).setup();
        idle();
        Bridge bridge = ctl.get().getBridge();
        assertNotNull("Bridge de Capacitor creado con el layout sustituido", bridge);
        assertTrue(bridge.getWebView() instanceof ConfettiWebView);
        plugin = (ConfettiScannerPlugin) bridge.getPlugin("ConfettiScanner").getInstance();
        cap = new Captura(bridge);
        escuchar("lectura");
        escuchar("estado");
    }

    private void escuchar(String evento) {
        plugin.addListener(new PluginCall(cap, "ConfettiScanner", "ev-" + evento, "addListener", jo("eventName", evento)));
    }

    private static JSObject jo(Object... kv) {
        JSObject o = new JSObject();
        for (int i = 0; i < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
        return o;
    }

    private String llamar(String metodo, JSObject datos) {
        String id = "c" + (++n);
        PluginCall call = new PluginCall(cap, "ConfettiScanner", id, metodo, datos);
        switch (metodo) {
            case "iniciar": plugin.iniciar(call); break;
            case "iniciarVinculacion": plugin.iniciarVinculacion(call); break;
            case "vincular": plugin.vincular(call); break;
            case "invalidar": plugin.invalidar(call); break;
            case "desvincular": plugin.desvincular(call); break;
            default: plugin.estado(call);
        }
        idle();
        return id;
    }

    private JSONObject ultimo(String callbackId) {
        List<JSONObject> l = cap.de(callbackId);
        return l.isEmpty() ? null : l.get(l.size() - 1);
    }

    /** Envía una pulsación (DOWN+UP) del dispositivo indicado por la ruta elegida. */
    private boolean[] pulsar(int dev, int keyCode, int meta, boolean preIme) {
        t += 3;
        KeyEvent d = new KeyEvent(t, t, KeyEvent.ACTION_DOWN, keyCode, 0, meta, dev, 0);
        KeyEvent u = new KeyEvent(t, t + 1, KeyEvent.ACTION_UP, keyCode, 0, meta, dev, 0);
        boolean a = preIme ? ctl.get().getBridge().getWebView().dispatchKeyEventPreIme(d) : ctl.get().dispatchKeyEvent(d);
        boolean b = preIme ? ctl.get().getBridge().getWebView().dispatchKeyEventPreIme(u) : ctl.get().dispatchKeyEvent(u);
        return new boolean[] { a, b };
    }

    private boolean escanear(int dev, String digitos, boolean preIme) {
        boolean todas = true;
        for (char c : digitos.toCharArray()) {
            boolean[] r = pulsar(dev, KeyEvent.KEYCODE_0 + (c - '0'), 0, preIme);
            todas &= r[0] && r[1];
        }
        boolean[] e = pulsar(dev, KeyEvent.KEYCODE_ENTER, 0, preIme);
        idle();
        return todas && e[0] && e[1];
    }

    private static String texto(JSONObject lote) throws Exception {
        StringBuilder sb = new StringBuilder();
        JSONArray ks = lote.getJSONArray("teclas");
        for (int i = 0; i < ks.length(); i++) {
            String k = ks.getJSONObject(i).getString("k");
            if (k.length() == 1) sb.append(k);
        }
        return sb.toString();
    }

    @Before
    public void preparar() {
        org.robolectric.shadows.ShadowLog.stream = System.out;
        ApplicationProvider.getApplicationContext().getSharedPreferences("confetti_scanner_nativo", Context.MODE_PRIVATE).edit().clear().commit();
        conectar(lector(LECTOR), teclado());
        android.content.pm.PackageInfo wv = new android.content.pm.PackageInfo();
        wv.packageName = "com.google.android.webview";
        wv.versionName = "120.0.6099.230";
        org.robolectric.shadows.ShadowWebView.setCurrentWebViewPackage(wv);
        iniciarActividad();
    }

    @After
    public void cerrar() {
        if (ctl != null) ctl.pause().stop().destroy();
    }

    @Test
    public void flujoCompletoVinculacionCapturaReconexionYReinicio() throws Exception {
        // Sin cliente JS compatible: nada se consume (la web anterior seguiría funcionando igual).
        assertFalse(pulsar(LECTOR, KeyEvent.KEYCODE_1, 0, false)[0]);

        String ini = llamar("iniciar", jo("protocolo", 1, "gen", 1, "maxGap", 250));
        JSONObject e0 = ultimo(ini);
        assertEquals("sin_vincular", e0.getString("estado"));
        assertEquals(2, e0.getJSONArray("teclados").length());
        // Sin vínculo: el lector sigue siendo un teclado normal.
        assertFalse(pulsar(LECTOR, KeyEvent.KEYCODE_1, 0, false)[0]);

        // Paso explícito de vinculación: se captura cualquier teclado externo, nunca el táctil.
        llamar("iniciarVinculacion", jo("segundos", 60));
        assertTrue(escanear(LECTOR, "123", false));
        JSONObject lv = ultimo("ev-lectura");
        assertEquals("vinculacion", lv.getString("origen"));
        assertEquals("123", texto(lv));
        JSONObject dv = lv.getJSONObject("dispositivo");
        assertEquals(VID, dv.getInt("vendorId"));
        assertEquals(1, lv.getInt("iguales"));
        assertFalse("teclado táctil (id -1) nunca se captura", pulsar(-1, KeyEvent.KEYCODE_1, 0, false)[0]);

        String vin = llamar("vincular", jo("descriptor", dv.getString("descriptor"), "vendorId", dv.getInt("vendorId"),
            "productId", dv.getInt("productId"), "nombre", dv.getString("nombre")));
        assertNull(cap.error(vin));
        JSONObject e1 = ultimo(vin);
        assertEquals("conectado", e1.getString("estado"));
        assertTrue(e1.getBoolean("capturando"));
        String guardado = ApplicationProvider.getApplicationContext().getSharedPreferences("confetti_scanner_nativo", Context.MODE_PRIVATE).getString("vinculo_v1", null);
        assertNotNull("el vínculo se persiste antes de informar éxito", guardado);

        // Lector vinculado: consumido por el gancho pre-IME (antes del teclado en pantalla).
        int antes = cap.de("ev-lectura").size();
        assertTrue(escanear(LECTOR, "0012345", true));
        JSONObject l1 = ultimo("ev-lectura");
        assertEquals(antes + 1, cap.de("ev-lectura").size());
        assertEquals("vinculado", l1.getString("origen"));
        assertEquals("0012345", texto(l1));
        assertEquals("enter", l1.getString("fin"));
        assertEquals(1, l1.getInt("gen"));

        // Teclado humano y teclas de sistema del lector: NO se consumen.
        assertFalse(pulsar(TECLADO, KeyEvent.KEYCODE_5, 0, false)[0]);
        assertFalse(pulsar(TECLADO, KeyEvent.KEYCODE_ENTER, 0, true)[0]);
        // (Se pregunta al plugin directamente: Android puede manejar estas teclas por su cuenta.)
        for (int sys : new int[] { KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_HOME, KeyEvent.KEYCODE_POWER }) {
            t += 3;
            assertFalse(ConfettiScannerPlugin.interceptar(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, sys, 0, 0, LECTOR, 0)));
            assertFalse(ConfettiScannerPlugin.interceptar(new KeyEvent(t, t + 1, KeyEvent.ACTION_UP, sys, 0, 0, LECTOR, 0)));
        }

        // Mayúsculas con Shift llegan como el carácter final.
        pulsar(LECTOR, KeyEvent.KEYCODE_SHIFT_LEFT, KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON, false);
        pulsar(LECTOR, KeyEvent.KEYCODE_C, KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON, false);
        pulsar(LECTOR, KeyEvent.KEYCODE_F, KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON, false);
        escanear(LECTOR, "01", false);
        assertEquals("CF01", texto(ultimo("ev-lectura")));

        // Cambio de contexto en JS a mitad de lectura: el grupo sale con su gen original.
        pulsar(LECTOR, KeyEvent.KEYCODE_7, 0, false);
        llamar("invalidar", jo("gen", 2));
        JSONObject inv = ultimo("ev-lectura");
        assertEquals("invalidado", inv.getString("fin"));
        assertEquals(1, inv.getInt("gen"));

        // Desconexión con evidencia del sistema (InputManager) y reconexión con OTRO deviceId.
        pulsar(LECTOR, KeyEvent.KEYCODE_9, 0, false);
        conectar(teclado());
        plugin.onInputDeviceRemoved(LECTOR);
        idle();
        assertEquals("desconexion", ultimo("ev-lectura").getString("fin"));
        assertEquals("desconectado", ultimo("ev-estado").getString("estado"));
        conectar(lector(23), teclado());
        plugin.onInputDeviceAdded(23);
        idle();
        assertEquals("conectado", ultimo("ev-estado").getString("estado"));
        assertTrue(escanear(23, "42", false));
        assertEquals("42", texto(ultimo("ev-lectura")));
        assertEquals(2, ultimo("ev-lectura").getInt("gen"));

        // Dos dispositivos idénticos: ambiguo, no se captura ninguno.
        conectar(lector(23), dispositivo(30, "Symbol Bar Code Scanner", VID, PID, "desc-lector-2", true), teclado());
        plugin.onInputDeviceAdded(30);
        idle();
        assertEquals("ambiguo", ultimo("ev-estado").getString("estado"));
        assertFalse(pulsar(23, KeyEvent.KEYCODE_1, 0, false)[0]);
        assertFalse(pulsar(30, KeyEvent.KEYCODE_1, 0, false)[0]);

        // Reinicio de la app: el vínculo persiste y la captura vuelve tras iniciar() del JS.
        conectar(lector(41), teclado());
        ctl.pause().stop().destroy();
        iniciarActividad();
        String ini2 = llamar("iniciar", jo("protocolo", 1, "gen", 5, "maxGap", 250));
        JSONObject e2 = ultimo(ini2);
        assertEquals("conectado", e2.getString("estado"));
        assertTrue(e2.getBoolean("capturando"));
        assertTrue(escanear(41, "77", false));
        assertEquals("77", texto(ultimo("ev-lectura")));

        // Recarga del WebView (p.ej. nueva versión web): sin iniciar() del nuevo JS no se captura.
        // Verifica que el listener sobrevive al reemplazo de la lista que hace Bridge.Builder.create().
        @SuppressWarnings("unchecked")
        List<com.getcapacitor.WebViewListener> ls = (List<com.getcapacitor.WebViewListener>) ReflectionHelpers.callInstanceMethod(ctl.get().getBridge(), "getWebViewListeners");
        assertFalse("el plugin registró su listener de recarga", ls.isEmpty());
        for (com.getcapacitor.WebViewListener l : ls) l.onPageStarted(ctl.get().getBridge().getWebView());
        idle();
        assertFalse(pulsar(41, KeyEvent.KEYCODE_1, 0, false)[0]);
        llamar("iniciar", jo("protocolo", 1, "gen", 6, "maxGap", 250));
        assertTrue(escanear(41, "88", false));

        // Desvincular: el lector vuelve a ser un teclado normal.
        llamar("desvincular", new JSObject());
        assertFalse(pulsar(41, KeyEvent.KEYCODE_1, 0, false)[0]);
    }

    @Test
    public void protocoloIncompatibleSeRechazaYNoCaptura() {
        String id = llamar("iniciar", jo("protocolo", 99, "gen", 1, "maxGap", 250));
        assertNotNull(cap.error(id));
        assertFalse(pulsar(LECTOR, KeyEvent.KEYCODE_1, 0, false)[0]);
    }

    @Test
    public void vincularConIdentidadAmbiguaOInexistenteSeRechazaSinPersistir() {
        llamar("iniciar", jo("protocolo", 1, "gen", 1, "maxGap", 250));
        conectar(lector(LECTOR), dispositivo(31, "Symbol Bar Code Scanner", VID, PID, "desc-lector-2", true));
        plugin.onInputDeviceAdded(31);
        idle();
        String a = llamar("vincular", jo("descriptor", "desc-lector", "vendorId", VID, "productId", PID, "nombre", "Symbol Bar Code Scanner"));
        assertTrue(cap.error(a).contains("AMBIGUO"));
        String b = llamar("vincular", jo("descriptor", "x", "vendorId", 1, "productId", 2, "nombre", "No existe"));
        assertTrue(cap.error(b).contains("NO_CONECTADO"));
        assertNull(ApplicationProvider.getApplicationContext().getSharedPreferences("confetti_scanner_nativo", Context.MODE_PRIVATE).getString("vinculo_v1", null));
        assertFalse(pulsar(LECTOR, KeyEvent.KEYCODE_1, 0, false)[0]);
    }

    @Test
    public void inactividadCortaLaLecturaIncompleta() throws Exception {
        llamar("iniciar", jo("protocolo", 1, "gen", 1, "maxGap", 250));
        llamar("iniciarVinculacion", jo("segundos", 60));
        llamar("vincular", jo("descriptor", "desc-lector", "vendorId", VID, "productId", PID, "nombre", "Symbol Bar Code Scanner"));
        t = SystemClock.uptimeMillis();
        pulsar(LECTOR, KeyEvent.KEYCODE_1, 0, false);
        pulsar(LECTOR, KeyEvent.KEYCODE_2, 0, false);
        int antes = cap.de("ev-lectura").size();
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(800));
        assertEquals(antes + 1, cap.de("ev-lectura").size());
        JSONObject l = ultimo("ev-lectura");
        assertEquals("tiempo", l.getString("fin"));
        assertEquals("12", texto(l));
    }
}

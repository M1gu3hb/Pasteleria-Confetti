package com.mhastral.confettipos;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.webkit.WebView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.mhastral.confettipos.scanner.ScannerCore;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * ConfettiScanner — captura NATIVA del lector de códigos USB-HID vinculado (APK 1.3.0).
 *
 * Por qué nativo: en la web sólo llegan "teclas"; no se sabe qué dispositivo las envía ni si se
 * desconectó, y un lector sin prefijo escribe en el campo enfocado. Aquí cada KeyEvent trae su
 * InputDevice: las teclas del lector VINCULADO se consumen ANTES del IME y del WebView
 * (dispatchKeyEventPreIme en ConfettiWebView + dispatchKeyEvent en MainActivity como respaldo) y se
 * entregan al JS agrupadas hasta Enter. El teclado táctil (virtual), los teclados externos no
 * vinculados y las teclas de sistema siguen su camino normal.
 *
 * Es un "tubo": el parser que decide si el grupo es un código válido sigue siendo el JS
 * (barcodeFrame), igual que en la ruta web. No abre ni reclama interfaces USB (no toca la impresora):
 * sólo observa eventos de entrada que Android ya entrega a la app.
 *
 * Seguridad de compatibilidad: sólo se captura mientras un JS compatible llamó iniciar() en esta
 * carga de página. Si la web publicada no conoce este plugin, el lector se comporta como antes.
 */
@CapacitorPlugin(name = "ConfettiScanner")
public class ConfettiScannerPlugin extends Plugin implements ScannerCore.Salida, InputManager.InputDeviceListener {

    private static final String PREFS = "confetti_scanner_nativo";
    private static final String KEY_VINCULO = "vinculo_v1";

    private static volatile ConfettiScannerPlugin activo;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::alVencer;
    private ScannerCore core;
    private InputManager inputManager;

    // Defensa contra doble proceso si el mismo evento pasara por los dos ganchos.
    private long ultimoEventoFirma = Long.MIN_VALUE;
    private int ultimoEventoDev = Integer.MIN_VALUE;
    private boolean ultimoResultado;

    // ------------------------------------------------------------------ ciclo de vida ----

    /**
     * Se ejecuta DENTRO del constructor del Bridge (registerAllPlugins). Nunca debe lanzar: si lo
     * hiciera, Capacitor descartaría el plugin entero y el JS lo vería como "no implementado".
     */
    @Override
    public void load() {
        core = new ScannerCore(this);
        try {
            inputManager = (InputManager) getContext().getSystemService(Context.INPUT_SERVICE);
            if (inputManager != null) inputManager.registerInputDeviceListener(this, main);
        } catch (Exception e) {
            Logger.error("ConfettiScanner", "No se pudo observar la conexión de dispositivos.", e);
        }
        ScannerCore.Vinculo guardado = leerVinculo();
        if (guardado != null) core.establecerVinculo(guardado, SystemClock.uptimeMillis());
        refrescarDispositivos();
        // Bridge.Builder.create() REEMPLAZA la lista de WebViewListener al terminar el constructor:
        // un listener añadido aquí se perdería. Se registra después, ya en el hilo principal.
        main.post(() -> bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                main.post(() -> {
                    if (core != null) core.clienteInactivo(SystemClock.uptimeMillis());
                    programar();
                });
            }
        }));
        activo = this;
    }

    @Override
    protected void handleOnPause() {
        main.post(() -> {
            if (core != null) core.pausa(SystemClock.uptimeMillis());
            programar();
        });
    }

    @Override
    protected void handleOnResume() {
        main.post(this::refrescarDispositivos);
    }

    @Override
    protected void handleOnDestroy() {
        if (inputManager != null) {
            try { inputManager.unregisterInputDeviceListener(this); } catch (Exception ignored) {}
        }
        main.removeCallbacks(tick);
        if (activo == this) activo = null;
    }

    // ------------------------------------------------------------- gancho de teclas ----

    /**
     * Llamado desde ConfettiWebView.dispatchKeyEventPreIme y MainActivity.dispatchKeyEvent.
     * Nunca lanza: ante cualquier fallo el evento sigue su camino normal (teclado intacto).
     */
    public static boolean interceptar(KeyEvent event) {
        ConfettiScannerPlugin p = activo;
        if (p == null || event == null) return false;
        if (Looper.myLooper() != Looper.getMainLooper()) return false;
        try {
            return p.procesar(event);
        } catch (Throwable t) {
            Logger.error("ConfettiScanner", "Error al procesar tecla; se deja pasar.", t);
            return false;
        }
    }

    private boolean procesar(KeyEvent e) {
        long firma = (e.getEventTime() * 31L + e.getDownTime()) * 31L
            + ((long) e.getKeyCode() << 20) + ((long) e.getAction() << 16) + ((long) e.getRepeatCount() << 2) + e.getScanCode();
        if (firma == ultimoEventoFirma && e.getDeviceId() == ultimoEventoDev) return ultimoResultado;
        boolean r = procesarNuevo(e);
        ultimoEventoFirma = firma;
        ultimoEventoDev = e.getDeviceId();
        ultimoResultado = r;
        return r;
    }

    private boolean procesarNuevo(KeyEvent e) {
        if (core == null) return false;
        // Igual que KeyEvent.getDevice(): el InputDevice actual de ese deviceId.
        InputDevice dev = InputDevice.getDevice(e.getDeviceId());
        if (dev == null) return false;
        ScannerCore.Dispositivo d = core.dispositivo(e.getDeviceId());
        if (d == null || !d.descriptor.equals(dev.getDescriptor())) {
            refrescarDispositivos();
            d = core.dispositivo(e.getDeviceId());
            if (d == null) return false;
        }
        boolean sistema = esTeclaDeSistema(e);
        boolean consumir;
        switch (e.getAction()) {
            case KeyEvent.ACTION_DOWN:
                consumir = core.teclaAbajo(d, Collections.singletonList(tecla(e)), sistema, e.getEventTime());
                break;
            case KeyEvent.ACTION_UP:
                consumir = core.teclaArriba(d, sistema, e.getEventTime());
                break;
            case KeyEvent.ACTION_MULTIPLE:
                consumir = core.teclaAbajo(d, teclasMultiples(e), sistema, e.getEventTime());
                break;
            default:
                consumir = false;
        }
        programar();
        return consumir;
    }

    /** Nunca se consumen: navegación y controles del sistema siguen funcionando aunque vengan del lector. */
    static boolean esTeclaDeSistema(KeyEvent e) {
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_HOME:
            case KeyEvent.KEYCODE_APP_SWITCH:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_POWER:
            case KeyEvent.KEYCODE_SLEEP:
            case KeyEvent.KEYCODE_WAKEUP:
            case KeyEvent.KEYCODE_VOLUME_UP:
            case KeyEvent.KEYCODE_VOLUME_DOWN:
            case KeyEvent.KEYCODE_VOLUME_MUTE:
            case KeyEvent.KEYCODE_MUTE:
            case KeyEvent.KEYCODE_CAMERA:
            case KeyEvent.KEYCODE_SEARCH:
            case KeyEvent.KEYCODE_ASSIST:
            case KeyEvent.KEYCODE_NOTIFICATION:
            case KeyEvent.KEYCODE_BRIGHTNESS_UP:
            case KeyEvent.KEYCODE_BRIGHTNESS_DOWN:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_STOP:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return true;
            default:
                return e.isSystem();
        }
    }

    private static ScannerCore.Tecla tecla(KeyEvent e) {
        return new ScannerCore.Tecla(nombreTecla(e), e.getEventTime(), e.getRepeatCount(),
            e.isCtrlPressed(), e.isAltPressed(), e.isMetaPressed());
    }

    @SuppressWarnings("deprecation")
    private static List<ScannerCore.Tecla> teclasMultiples(KeyEvent e) {
        List<ScannerCore.Tecla> out = new ArrayList<>();
        String chars = e.getCharacters();
        if (e.getKeyCode() == KeyEvent.KEYCODE_UNKNOWN && chars != null) {
            int i = 0;
            while (i < chars.length()) {
                int cp = chars.codePointAt(i);
                out.add(new ScannerCore.Tecla(cp == '\n' || cp == '\r' ? "Enter" : new String(Character.toChars(cp)),
                    e.getEventTime(), 0, false, false, false));
                i += Character.charCount(cp);
            }
        } else {
            ScannerCore.Tecla base = tecla(e);
            for (int i = 0; i < Math.max(1, e.getRepeatCount()); i++) {
                out.add(new ScannerCore.Tecla(base.k, base.t, i, base.ctrl, base.alt, base.meta));
            }
        }
        return out;
    }

    /** Nombre al estilo de KeyboardEvent.key, para que el parser JS aplique las mismas reglas. */
    static String nombreTecla(KeyEvent e) {
        int kc = e.getKeyCode();
        switch (kc) {
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                return "Enter";
            case KeyEvent.KEYCODE_TAB: return "Tab";
            case KeyEvent.KEYCODE_ESCAPE: return "Escape";
            case KeyEvent.KEYCODE_SHIFT_LEFT:
            case KeyEvent.KEYCODE_SHIFT_RIGHT: return "Shift";
            case KeyEvent.KEYCODE_CTRL_LEFT:
            case KeyEvent.KEYCODE_CTRL_RIGHT: return "Control";
            case KeyEvent.KEYCODE_ALT_LEFT:
            case KeyEvent.KEYCODE_ALT_RIGHT: return "Alt";
            case KeyEvent.KEYCODE_META_LEFT:
            case KeyEvent.KEYCODE_META_RIGHT: return "Meta";
            case KeyEvent.KEYCODE_CAPS_LOCK: return "CapsLock";
            case KeyEvent.KEYCODE_NUM_LOCK: return "NumLock";
            case KeyEvent.KEYCODE_DEL: return "Backspace";
            case KeyEvent.KEYCODE_FORWARD_DEL: return "Delete";
            default:
                break;
        }
        if (kc >= KeyEvent.KEYCODE_F1 && kc <= KeyEvent.KEYCODE_F12) return "F" + (kc - KeyEvent.KEYCODE_F1 + 1);
        int u = e.getUnicodeChar(e.getMetaState());
        if (u != 0 && (u & KeyCharacterMap.COMBINING_ACCENT) != 0) return "Dead";
        if (u > 0 && !Character.isISOControl(u)) return new String(Character.toChars(u));
        return "Unidentified";
    }

    // ---------------------------------------------------------------- dispositivos ----

    private void refrescarDispositivos() {
        if (core == null) return;
        List<ScannerCore.Dispositivo> lista = new ArrayList<>();
        try {
            for (int id : InputDevice.getDeviceIds()) {
                InputDevice d = InputDevice.getDevice(id);
                if (d != null) lista.add(mapear(d));
            }
        } catch (Exception e) {
            // Sin lista fiable no se inventa nada: se conserva la anterior y no se captura nada nuevo.
            Logger.error("ConfettiScanner", "No se pudo leer la lista de dispositivos de entrada.", e);
            return;
        }
        core.dispositivos(lista, SystemClock.uptimeMillis());
        programar();
    }

    private static ScannerCore.Dispositivo mapear(InputDevice d) {
        boolean teclado = (d.getSources() & InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD;
        return new ScannerCore.Dispositivo(d.getId(), d.getDescriptor(), d.getVendorId(), d.getProductId(),
            d.getName(), esExterno(d), d.isVirtual(), teclado);
    }

    static boolean esExterno(InputDevice d) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return d.isExternal();
        try {
            Object r = InputDevice.class.getMethod("isExternal").invoke(d);
            return Boolean.TRUE.equals(r);
        } catch (Exception ignored) {
            // Sin la API: un dispositivo USB/Bluetooth informa vendorId; los internos suelen ser 0.
            return d.getVendorId() != 0;
        }
    }

    /** Usado también por ConfettiPrinter: ¿algún teclado/lector externo tiene este vendorId/productId? */
    static boolean esDispositivoDeEntrada(int vendorId, int productId) {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (d == null || d.isVirtual()) continue;
            boolean teclado = (d.getSources() & InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD;
            if (teclado && d.getVendorId() == vendorId && d.getProductId() == productId) return true;
        }
        return false;
    }

    @Override
    public void onInputDeviceAdded(int deviceId) { refrescarDispositivos(); }

    @Override
    public void onInputDeviceRemoved(int deviceId) { refrescarDispositivos(); }

    @Override
    public void onInputDeviceChanged(int deviceId) { refrescarDispositivos(); }

    // -------------------------------------------------------------- temporizador ----

    private void programar() {
        main.removeCallbacks(tick);
        if (core == null) return;
        long next = core.proximoVencimiento();
        if (next >= 0) main.postAtTime(tick, next + 1);
    }

    private void alVencer() {
        if (core == null) return;
        core.tick(SystemClock.uptimeMillis());
        programar();
    }

    // -------------------------------------------------------------- salida al JS ----

    @Override
    public void lote(ScannerCore.Lote l) {
        JSObject o = new JSObject();
        o.put("seq", l.seq);
        o.put("gen", l.gen);
        o.put("origen", l.origen);
        o.put("fin", l.fin);
        o.put("tFin", l.tFin);
        o.put("iguales", l.iguales);
        o.put("dispositivo", dispositivoJS(l.dispositivo));
        JSArray teclas = new JSArray();
        for (ScannerCore.Tecla t : l.teclas) {
            JSObject k = new JSObject();
            k.put("k", t.k);
            k.put("t", t.t);
            k.put("r", t.r);
            if (t.ctrl) k.put("ctrl", true);
            if (t.alt) k.put("alt", true);
            if (t.meta) k.put("meta", true);
            teclas.put(k);
        }
        o.put("teclas", teclas);
        notifyListeners("lectura", o);
    }

    @Override
    public void estadoCambio() {
        if (core == null) return;
        notifyListeners("estado", estadoJS());
    }

    private JSObject dispositivoJS(ScannerCore.Dispositivo d) {
        if (d == null) return null;
        JSObject o = new JSObject();
        o.put("id", d.id);
        o.put("descriptor", d.descriptor);
        o.put("vendorId", d.vendorId);
        o.put("productId", d.productId);
        o.put("nombre", d.nombre);
        return o;
    }

    private JSObject estadoJS() {
        JSObject o = new JSObject();
        long ahora = SystemClock.uptimeMillis();
        ScannerCore.Resolucion r = core.resolver();
        ScannerCore.Vinculo v = core.getVinculo();
        o.put("disponible", true);
        o.put("protocolo", ScannerCore.PROTOCOLO);
        o.put("version", versionApp());
        o.put("clienteActivo", core.isClienteActivo());
        o.put("gen", core.getGen());
        o.put("vinculando", core.isVinculando());
        o.put("vinculandoRestanteMs", core.isVinculando() ? Math.max(0, core.getVinculandoHasta() - ahora) : 0);
        o.put("estado", r.estado.name().toLowerCase());
        o.put("iguales", r.iguales);
        o.put("dispositivo", dispositivoJS(r.dispositivo));
        o.put("capturando", core.capturando());
        if (v != null) {
            JSObject vo = new JSObject();
            vo.put("descriptor", v.descriptor);
            vo.put("vendorId", v.vendorId);
            vo.put("productId", v.productId);
            vo.put("nombre", v.nombre);
            o.put("vinculo", vo);
        } else {
            o.put("vinculo", JSONObject.NULL);
        }
        JSArray teclados = new JSArray();
        for (ScannerCore.Dispositivo d : core.elegibles()) {
            JSObject t = dispositivoJS(d);
            t.put("iguales", core.igualesA(d));
            teclados.put(t);
        }
        o.put("teclados", teclados);
        return o;
    }

    private String versionApp() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "";
        }
    }

    // ------------------------------------------------------------ persistencia ----

    private ScannerCore.Vinculo leerVinculo() {
        try {
            String raw = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VINCULO, null);
            if (raw == null) return null;
            JSONObject j = new JSONObject(raw);
            if (j.optInt("v", 0) != 1) return null;
            return new ScannerCore.Vinculo(j.optString("descriptor", ""), j.getInt("vendorId"), j.getInt("productId"), j.optString("nombre", ""));
        } catch (Exception e) {
            Logger.error("ConfettiScanner", "Vínculo guardado ilegible; se ignora.", e);
            return null;
        }
    }

    /** commit() síncrono + relectura: nunca se informa un vínculo que no sobreviviría a un reinicio. */
    private boolean guardarVinculo(ScannerCore.Vinculo v) {
        try {
            SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean ok;
            if (v == null) {
                ok = sp.edit().remove(KEY_VINCULO).commit();
                return ok && sp.getString(KEY_VINCULO, null) == null;
            }
            JSONObject j = new JSONObject();
            j.put("v", 1);
            j.put("descriptor", v.descriptor);
            j.put("vendorId", v.vendorId);
            j.put("productId", v.productId);
            j.put("nombre", v.nombre);
            j.put("fecha", System.currentTimeMillis());
            ok = sp.edit().putString(KEY_VINCULO, j.toString()).commit();
            ScannerCore.Vinculo leido = leerVinculo();
            return ok && v.equals(leido);
        } catch (Exception e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- API para JS ----

    private void enPrincipal(PluginCall call, Runnable r) {
        main.post(() -> {
            try {
                if (core == null) { call.reject("El lector nativo no está disponible.", "NO_DISPONIBLE"); return; }
                r.run();
            } catch (Exception e) {
                call.reject("Error del lector nativo: " + e.getMessage(), "ERROR");
            }
        });
    }

    @PluginMethod
    public void iniciar(final PluginCall call) {
        final int protocolo = call.getInt("protocolo", 0);
        final int gen = call.getInt("gen", 0);
        final int maxGap = call.getInt("maxGap", 250);
        enPrincipal(call, () -> {
            if (protocolo != ScannerCore.PROTOCOLO) {
                call.reject("Versión del lector incompatible entre la web y la app.", "PROTOCOLO");
                return;
            }
            refrescarDispositivos();
            core.iniciarCliente(gen, maxGap, SystemClock.uptimeMillis());
            programar();
            call.resolve(estadoJS());
        });
    }

    @PluginMethod
    public void estado(final PluginCall call) {
        enPrincipal(call, () -> call.resolve(estadoJS()));
    }

    @PluginMethod
    public void invalidar(final PluginCall call) {
        final int gen = call.getInt("gen", 0);
        enPrincipal(call, () -> {
            core.invalidar(gen, SystemClock.uptimeMillis());
            programar();
            JSObject o = new JSObject();
            o.put("gen", core.getGen());
            call.resolve(o);
        });
    }

    @PluginMethod
    public void configurar(final PluginCall call) {
        final int maxGap = call.getInt("maxGap", 250);
        enPrincipal(call, () -> {
            core.configurar(maxGap);
            programar();
            call.resolve(estadoJS());
        });
    }

    @PluginMethod
    public void iniciarVinculacion(final PluginCall call) {
        final int segundos = call.getInt("segundos", 180);
        enPrincipal(call, () -> {
            refrescarDispositivos();
            core.iniciarVinculacion(SystemClock.uptimeMillis(), segundos * 1000L);
            programar();
            call.resolve(estadoJS());
        });
    }

    @PluginMethod
    public void cancelarVinculacion(final PluginCall call) {
        enPrincipal(call, () -> {
            core.cancelarVinculacion(SystemClock.uptimeMillis());
            programar();
            call.resolve(estadoJS());
        });
    }

    @PluginMethod
    public void vincular(final PluginCall call) {
        final String descriptor = call.getString("descriptor", "");
        final Integer vendorId = call.getInt("vendorId");
        final Integer productId = call.getInt("productId");
        final String nombre = call.getString("nombre", "");
        enPrincipal(call, () -> {
            if (vendorId == null || productId == null) {
                call.reject("Faltan los datos del lector leído.", "DATOS");
                return;
            }
            refrescarDispositivos();
            Object[] res = core.validarVinculo(descriptor, vendorId, productId, nombre);
            ScannerCore.Resultado codigo = (ScannerCore.Resultado) res[0];
            switch (codigo) {
                case OK:
                    break;
                case AMBIGUO:
                    call.reject("Hay más de un dispositivo idéntico conectado; no se puede saber cuál es el lector.", "AMBIGUO");
                    return;
                case IDENTIDAD_INSUFICIENTE:
                    call.reject("Este dispositivo no informa una identidad USB suficiente para vincularlo.", "IDENTIDAD_INSUFICIENTE");
                    return;
                case CAMBIO:
                    call.reject("El lector se desconectó o cambió durante la prueba. Repita las lecturas.", "CAMBIO");
                    return;
                default:
                    call.reject("El lector leído ya no está conectado.", "NO_CONECTADO");
                    return;
            }
            ScannerCore.Vinculo v = (ScannerCore.Vinculo) res[1];
            if (!guardarVinculo(v)) {
                call.reject("No se pudo guardar el vínculo en esta tablet. No se activó la captura.", "PERSISTENCIA");
                return;
            }
            core.establecerVinculo(v, SystemClock.uptimeMillis());
            programar();
            call.resolve(estadoJS());
        });
    }

    @PluginMethod
    public void desvincular(final PluginCall call) {
        enPrincipal(call, () -> {
            if (!guardarVinculo(null)) {
                call.reject("No se pudo borrar el vínculo guardado.", "PERSISTENCIA");
                return;
            }
            core.desvincular(SystemClock.uptimeMillis());
            programar();
            call.resolve(estadoJS());
        });
    }
}

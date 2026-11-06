package com.mhastral.confettipos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.CapacitorWebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Framework Android 12 (API 31) emulado por Robolectric. Comprueba lo que, si fallara, rompería el
 * APK al instalarlo: que el layout sustituido infle ConfettiWebView con el id que Capacitor busca,
 * que las teclas reales de Android se traduzcan como las espera el parser JS y que, sin plugin
 * activo, ninguna tecla se consuma (teclado intacto). No sustituye la prueba física.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 31)
public class ConfettiScannerAndroidTest {

    private static KeyEvent down(int keyCode, int meta) {
        return new KeyEvent(0, 0, KeyEvent.ACTION_DOWN, keyCode, 0, meta);
    }

    @Test
    public void layoutSustituidoInflaConfettiWebViewConElIdDeCapacitor() {
        Context ctx = ApplicationProvider.getApplicationContext();
        ctx.setTheme(androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar);
        View root = LayoutInflater.from(ctx).inflate(com.getcapacitor.android.R.layout.capacitor_bridge_layout_main, null);
        View wv = root.findViewById(com.getcapacitor.android.R.id.webview);
        assertTrue("Capacitor busca @id/webview", wv != null);
        assertTrue(wv instanceof ConfettiWebView);
        assertTrue("debe seguir siendo CapacitorWebView para Bridge", wv instanceof CapacitorWebView);
    }

    @Test
    public void sinPluginActivoNingunaTeclaSeConsume() {
        assertFalse(ConfettiScannerPlugin.interceptar(down(KeyEvent.KEYCODE_1, 0)));
        assertFalse(ConfettiScannerPlugin.interceptar(down(KeyEvent.KEYCODE_ENTER, 0)));
        Context ctx = ApplicationProvider.getApplicationContext();
        ConfettiWebView wv = new ConfettiWebView(ctx, null);
        assertFalse(wv.dispatchKeyEventPreIme(down(KeyEvent.KEYCODE_A, 0)));
    }

    @Test
    public void nombresDeTeclaComoKeyboardEventKey() {
        assertEquals("Enter", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_ENTER, 0)));
        assertEquals("Enter", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_NUMPAD_ENTER, 0)));
        assertEquals("F9", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_F9, 0)));
        assertEquals("F7", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_F7, 0)));
        assertEquals("Tab", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_TAB, 0)));
        assertEquals("Escape", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_ESCAPE, 0)));
        assertEquals("Shift", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_SHIFT_LEFT, 0)));
        assertEquals("Backspace", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_DEL, 0)));
        assertEquals("0", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_0, 0)));
        assertEquals("7", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_7, 0)));
        assertEquals("c", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_C, 0)));
        assertEquals("C", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_C, KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON)));
        assertEquals("-", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_MINUS, 0)));
        assertEquals("/", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_SLASH, 0)));
        assertEquals(".", ConfettiScannerPlugin.nombreTecla(down(KeyEvent.KEYCODE_PERIOD, 0)));
    }
}

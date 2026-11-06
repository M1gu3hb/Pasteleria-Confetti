package com.mhastral.confettipos;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin nativo de impresión ANTES de super.onCreate
        // (requisito de Capacitor). Solo expone el "tubo"; NO cambia el flujo
        // de impresión actual (eso es Fase 4).
        registerPlugin(ConfettiPrinterPlugin.class);
        registerPlugin(ConfettiFilesPlugin.class);
        // Lector de códigos USB-HID vinculado (APK 1.3.0). No abre interfaces USB:
        // sólo observa los eventos de teclado que Android ya entrega a la app.
        registerPlugin(ConfettiScannerPlugin.class);
        // Versión instalada y actualización verificada desde el POS (APK 1.3.0).
        registerPlugin(ConfettiAppPlugin.class);
        super.onCreate(savedInstanceState);
        // POS: mantener la pantalla SIEMPRE encendida mientras la app está en
        // primer plano (la tablet del mostrador no debe apagarse sola).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /**
     * Respaldo del gancho pre-IME de ConfettiWebView: si el WebView no tiene el foco, la tecla
     * llega aquí antes que a cualquier vista. Sólo se consume la del lector vinculado (o la del
     * paso explícito de vinculación); todo lo demás sigue igual.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (ConfettiScannerPlugin.interceptar(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        // El botón ATRÁS de Android NO debe CERRAR la app (perdería la sesión
        // del POS). Si el WebView puede retroceder en su historial, retrocede;
        // si no, la app se manda a segundo plano (como Home), no se cierra.
        WebView webView = (this.bridge != null) ? this.bridge.getWebView() : null;
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }
}

package com.mhastral.confettipos;

import android.os.Bundle;
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
        super.onCreate(savedInstanceState);
        // POS: mantener la pantalla SIEMPRE encendida mientras la app está en
        // primer plano (la tablet del mostrador no debe apagarse sola).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
